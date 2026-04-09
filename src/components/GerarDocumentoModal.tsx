import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { FileText, Printer } from 'lucide-react';
import { openPrintDocument } from '@/lib/printLayout';
import { salvarEncaminhamento } from '@/services/encaminhamentoService';
import type { DocumentTemplate } from '@/components/ModelosDocumentos';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paciente?: { id?: string; nome: string; cpf: string; cns: string; data_nascimento: string; cid: string; especialidade_destino: string };
  profissional?: { id?: string; nome: string; profissao: string; numero_conselho: string; tipo_conselho: string; uf_conselho: string };
  unidade?: string;
  dataAtendimento?: string;
}

const ENCAMINHAMENTO_TIPOS = ['encaminhamento', 'guia de encaminhamento'];

const GerarDocumentoModal: React.FC<Props> = ({ open, onOpenChange, paciente, profissional, unidade, dataAtendimento }) => {
  const { user } = useAuth();
  const { funcionarios } = useData();
  const [modelos, setModelos] = useState<DocumentTemplate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [conteudoFinal, setConteudoFinal] = useState('');
  const [profDestinoId, setProfDestinoId] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) loadModelos();
  }, [open]);

  const loadModelos = async () => {
    try {
      const { data } = await supabase
        .from('system_config')
        .select('configuracoes')
        .eq('id', 'modelos_documentos')
        .maybeSingle();
      if (data?.configuracoes) {
        const raw = data.configuracoes as Record<string, unknown>;
        const all: DocumentTemplate[] = Array.isArray(raw) ? raw : ((raw as any).modelos || []);
        const filtered = all.filter(m =>
          m.ativo && m.perfis_permitidos.includes(user?.role || '')
        );
        setModelos(filtered);
      }
    } catch (e) { console.error(e); }
  };

  const substituir = (conteudo: string): string => {
    const hoje = new Date().toLocaleDateString('pt-BR');
    return conteudo
      .replace(/\{\{nome_paciente\}\}/g, paciente?.nome || '—')
      .replace(/\{\{cpf\}\}/g, paciente?.cpf || '—')
      .replace(/\{\{cns\}\}/g, paciente?.cns || '—')
      .replace(/\{\{data_nascimento\}\}/g, paciente?.data_nascimento || '—')
      .replace(/\{\{data_atendimento\}\}/g, dataAtendimento || hoje)
      .replace(/\{\{profissional\}\}/g, profissional?.nome || '—')
      .replace(/\{\{cid\}\}/g, paciente?.cid || '—')
      .replace(/\{\{especialidade\}\}/g, paciente?.especialidade_destino || '—')
      .replace(/\{\{unidade\}\}/g, unidade || 'CER II Oriximiná')
      .replace(/\{\{data_hoje\}\}/g, hoje);
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setProfDestinoId('');
    const m = modelos.find(x => x.id === id);
    if (m) setConteudoFinal(substituir(m.conteudo));
  };

  const selected = modelos.find(x => x.id === selectedId);
  const isEncaminhamento = selected && ENCAMINHAMENTO_TIPOS.includes(selected.tipo.toLowerCase());

  const handleSaveAndPrint = async () => {
    if (!selected) return;

    // If it's an encaminhamento, save it
    if (isEncaminhamento && profDestinoId) {
      setSalvando(true);
      const conselho = profissional
        ? `${profissional.tipo_conselho} ${profissional.numero_conselho}/${profissional.uf_conselho}`
        : '';

      const result = await salvarEncaminhamento({
        paciente_id: paciente?.id || '',
        paciente_nome: paciente?.nome || '',
        paciente_cpf: paciente?.cpf || '',
        paciente_cns: paciente?.cns || '',
        paciente_data_nascimento: paciente?.data_nascimento || '',
        paciente_cid: paciente?.cid || '',
        paciente_especialidade_destino: paciente?.especialidade_destino || '',
        profissional_origem_id: profissional?.id || user?.id || '',
        profissional_origem_nome: profissional?.nome || user?.nome || '',
        profissional_origem_profissao: profissional?.profissao || '',
        profissional_origem_conselho: conselho,
        profissional_destino_id: profDestinoId,
        especialidade_destino: paciente?.especialidade_destino || '',
        conteudo_documento: conteudoFinal,
        observacao: '',
        gerado_por: user?.nome || '',
        gerado_por_perfil: user?.role || '',
        unidade: unidade || 'CER II Oriximiná',
        tipo_documento: selected.tipo,
      });

      setSalvando(false);

      if (!result.success) {
        toast.error('Erro ao salvar encaminhamento: ' + (result.error || ''));
        return;
      }
      toast.success('Encaminhamento salvo e enviado ao profissional destino!');
    }

    // Print
    const html = conteudoFinal.replace(/\n/g, '<br/>');
    const conselho = profissional
      ? `${profissional.tipo_conselho} ${profissional.numero_conselho}/${profissional.uf_conselho}`
      : '';
    const body = `
      <div class="content-block" style="margin-top:20px;">
        <div style="font-size:14px;line-height:1.8;white-space:pre-wrap;">${html}</div>
      </div>
      <div class="signature">
        <div class="signature-line"></div>
        <div class="name">${profissional?.nome || ''}</div>
        <div class="role">${profissional?.profissao || ''} — ${conselho}</div>
      </div>
    `;
    openPrintDocument(selected.tipo, body, {
      'Paciente': paciente?.nome || '',
      'CPF': paciente?.cpf || '',
      'Data': new Date().toLocaleDateString('pt-BR'),
    });
    toast.success('Documento gerado para impressão!');
  };

  const profissionaisDestino = funcionarios.filter(f =>
    f.ativo && f.role === 'profissional' && f.id !== (profissional?.id || user?.id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" /> Gerar Documento Clínico
          </DialogTitle>
          <DialogDescription className="sr-only">Selecione um modelo e gere o documento</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[13px] font-bold">Selecionar modelo</Label>
            {modelos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum modelo disponível para seu perfil. Solicite ao master a criação de modelos.</p>
            ) : (
              <Select value={selectedId} onValueChange={handleSelect}>
                <SelectTrigger><SelectValue placeholder="Escolha um modelo..." /></SelectTrigger>
                <SelectContent>
                  {modelos.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.nome} — {m.tipo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selected && (
            <>
              {/* If encaminhamento, show destination professional selector */}
              {isEncaminhamento && (
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-bold">Profissional destino (encaminhamento)</Label>
                  <Select value={profDestinoId} onValueChange={setProfDestinoId}>
                    <SelectTrigger><SelectValue placeholder="Selecione o profissional destino..." /></SelectTrigger>
                    <SelectContent>
                      {profissionaisDestino.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nome} — {p.profissao}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">O encaminhamento será salvo e ficará disponível na fila do profissional selecionado.</p>
                </div>
              )}

              <Separator />
              <div className="space-y-1.5">
                <Label className="text-[13px] font-bold">Conteúdo (editável antes de imprimir)</Label>
                <Textarea
                  value={conteudoFinal}
                  onChange={e => setConteudoFinal(e.target.value)}
                  className="min-h-[200px] text-sm"
                />
                <p className="text-xs text-muted-foreground">As variáveis já foram substituídas pelos dados reais. Você pode ajustar o texto antes de imprimir.</p>
              </div>

              {/* Preview inline */}
              <div className="border rounded-lg p-5 bg-white">
                <div className="text-center mb-3">
                  <h3 className="font-bold text-sm uppercase text-primary">Secretaria Municipal de Saúde de Oriximiná</h3>
                  <p className="text-xs text-muted-foreground">CER II — Sistema de Gestão em Saúde</p>
                </div>
                <Separator className="mb-3" />
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{conteudoFinal}</div>
                <div className="mt-8 text-center">
                  <div className="w-64 border-t border-foreground mx-auto mb-1" />
                  <p className="text-xs font-semibold">{profissional?.nome}</p>
                  <p className="text-xs text-muted-foreground">{profissional?.profissao}</p>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          {selected && (
            <Button
              onClick={handleSaveAndPrint}
              disabled={salvando || (isEncaminhamento && !profDestinoId)}
              className="gap-1.5"
            >
              <Printer className="w-4 h-4" />
              {isEncaminhamento ? 'Salvar e Imprimir' : 'Imprimir Documento'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GerarDocumentoModal;
