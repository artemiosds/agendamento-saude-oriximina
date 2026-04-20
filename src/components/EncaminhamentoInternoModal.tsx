import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/integrations/supabase/client';
import { salvarEncaminhamento } from '@/services/encaminhamentoService';

interface PacienteRef {
  id: string;
  nome: string;
  cpf?: string;
  cns?: string;
  data_nascimento?: string;
  cid?: string;
  unidadeId?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  paciente?: PacienteRef;
  onSent?: () => void;
}

const EncaminhamentoInternoModal: React.FC<Props> = ({ open, onOpenChange, paciente, onSent }) => {
  const { user } = useAuth();
  const { funcionarios } = useData();

  const [especialidade, setEspecialidade] = useState<string>('');
  const [profissionalId, setProfissionalId] = useState<string>('');
  const [motivo, setMotivo] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [especialidades, setEspecialidades] = useState<string[]>([]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setEspecialidade('');
      setProfissionalId('');
      setMotivo('');
    }
  }, [open]);

  // Load active especialidades from DB (fallback to derived list)
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from('especialidades' as any).select('nome').eq('ativo', true).order('nome');
      const fromDb = (data || []).map((d: any) => d.nome).filter(Boolean);
      const derived = Array.from(new Set(funcionarios.map((f: any) => f.profissao).filter(Boolean)));
      const list = fromDb.length > 0 ? fromDb : derived;
      if (alive) setEspecialidades(list);
    })();
    return () => { alive = false; };
  }, [funcionarios, open]);

  // Filter destination professionals by specialty + same unit + active
  const profissionaisDestino = useMemo(() => {
    if (!especialidade) return [];
    const norm = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const target = norm(especialidade);
    return funcionarios.filter((f: any) => {
      if (!f.ativo) return false;
      if (f.role !== 'profissional' && f.role !== 'enfermagem' && f.role !== 'master') return false;
      if (user?.unidadeId && f.unidadeId && f.unidadeId !== user.unidadeId) return false;
      // Exclude the author himself
      if (f.id === user?.id) return false;
      const prof = norm(f.profissao);
      return prof === target || prof.startsWith(target.slice(0, 5));
    });
  }, [especialidade, funcionarios, user?.id, user?.unidadeId]);

  const handleSubmit = async () => {
    if (!paciente) {
      toast.error('Paciente não identificado.');
      return;
    }
    if (!especialidade) {
      toast.error('Selecione a especialidade de destino.');
      return;
    }
    if (!motivo.trim() || motivo.trim().length < 10) {
      toast.error('Descreva o motivo do encaminhamento (mín. 10 caracteres).');
      return;
    }
    if (!user) return;

    setSaving(true);
    try {
      const profDestino = profissionaisDestino.find((p: any) => p.id === profissionalId);
      const dataHoje = new Date().toLocaleDateString('pt-BR');

      const conteudo = [
        `ENCAMINHAMENTO INTERNO`,
        ``,
        `Paciente: ${paciente.nome}`,
        `CPF: ${paciente.cpf || '—'}    CNS: ${paciente.cns || '—'}`,
        `Data de Nascimento: ${paciente.data_nascimento || '—'}`,
        ``,
        `Encaminhado de: ${user.nome} (${user.profissao || user.role})`,
        `Encaminhado para: ${profDestino ? `${profDestino.nome} — ` : ''}${especialidade}`,
        ``,
        `Motivo / Justificativa Clínica:`,
        motivo.trim(),
        ``,
        `Emitido em: ${dataHoje}`,
      ].join('\n');

      // 1) Save document snapshot in storage (mirrors existing encaminhamentos pattern)
      const targetProfId = profDestino?.id || `especialidade:${especialidade}`;
      const result = await salvarEncaminhamento({
        paciente_id: paciente.id,
        paciente_nome: paciente.nome,
        paciente_cpf: paciente.cpf || '',
        paciente_cns: paciente.cns || '',
        paciente_data_nascimento: paciente.data_nascimento || '',
        paciente_cid: paciente.cid || '',
        paciente_especialidade_destino: especialidade,
        profissional_origem_id: user.id,
        profissional_origem_nome: user.nome,
        profissional_origem_profissao: user.profissao || user.role || '',
        profissional_origem_conselho: [user.tipoConselho, user.numeroConselho, user.ufConselho].filter(Boolean).join(' '),
        profissional_destino_id: targetProfId,
        especialidade_destino: especialidade,
        conteudo_documento: conteudo,
        observacao: motivo.trim(),
        gerado_por: user.nome,
        gerado_por_perfil: user.role || '',
        unidade: user.unidadeId || '',
        tipo_documento: 'Encaminhamento Interno',
      });

      if (!result.success) throw new Error(result.error || 'Falha ao salvar documento');

      // 2) Create fila_espera entry to signal reception
      const filaId = `fi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const horaAgora = new Date().toTimeString().slice(0, 5);
      const { error: filaErr } = await (supabase as any).from('fila_espera').insert({
        id: filaId,
        paciente_id: paciente.id,
        paciente_nome: paciente.nome,
        unidade_id: user.unidadeId || '',
        especialidade_destino: especialidade,
        profissional_id: profDestino?.id || '',
        descricao_clinica: motivo.trim(),
        observacoes: `Encaminhamento interno por ${user.nome}${profDestino ? ` para ${profDestino.nome}` : ''}.`,
        cid: paciente.cid || '',
        status: 'aguardando_agendamento_interno',
        prioridade: 'normal',
        prioridade_perfil: 'normal',
        origem_cadastro: 'encaminhamento_interno',
        criado_por: user.id,
        hora_chegada: horaAgora,
        data_solicitacao_original: new Date().toISOString().slice(0, 10),
        setor: '',
        posicao: 0,
      });

      if (filaErr) {
        // Document was saved; warn but don't fail
        console.error('Erro ao criar entrada na fila:', filaErr);
        toast.warning('Documento gerado, mas falhou ao sinalizar a recepção. Comunique-os manualmente.');
      } else {
        toast.success('Encaminhamento enviado. A recepção foi notificada.');
      }

      onSent?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Erro ao encaminhar paciente:', err);
      toast.error(err?.message || 'Erro ao gerar encaminhamento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Encaminhar Paciente</DialogTitle>
          <DialogDescription>
            Gera um documento de encaminhamento clínico e sinaliza a recepção para agendar a nova especialidade.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-sm">Paciente</Label>
            <div className="text-sm font-medium text-foreground mt-1">
              {paciente?.nome || '—'}
            </div>
          </div>

          <div>
            <Label className="text-sm">Especialidade de Destino *</Label>
            <Select value={especialidade} onValueChange={(v) => { setEspecialidade(v); setProfissionalId(''); }}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione a especialidade..." />
              </SelectTrigger>
              <SelectContent>
                {especialidades.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm">Profissional de Destino (opcional)</Label>
            <Select
              value={profissionalId}
              onValueChange={setProfissionalId}
              disabled={!especialidade || profissionaisDestino.length === 0}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={
                  !especialidade
                    ? 'Selecione a especialidade primeiro'
                    : profissionaisDestino.length === 0
                      ? 'Nenhum profissional desta especialidade na unidade'
                      : 'A recepção define ao agendar (opcional)'
                } />
              </SelectTrigger>
              <SelectContent>
                {profissionaisDestino.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm">Motivo do Encaminhamento *</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={5}
              placeholder="Descreva a justificativa clínica para o encaminhamento..."
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">{motivo.trim().length} caracteres (mín. 10)</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="gradient-primary text-primary-foreground">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar Encaminhamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EncaminhamentoInternoModal;
