import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Clock, Eye, CheckCircle, XCircle, AlertTriangle, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { differenceInMinutes } from 'date-fns';

interface FilaEnfermagem {
  id: string;
  pacienteNome: string;
  pacienteId: string;
  profissionalNome: string;
  hora: string;
  data: string;
  unidadeId: string;
  criadoEm: string;
  tipo: string;
}

interface TriagemResumo {
  peso?: number;
  altura?: number;
  imc?: number;
  pressao_arterial?: string;
  temperatura?: number;
  frequencia_cardiaca?: number;
  saturacao_oxigenio?: number;
  glicemia?: number;
  alergias?: string[];
  medicamentos?: string[];
  queixa?: string;
}

const AvaliacaoEnfermagem: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const { logAction, refreshAgendamentos } = useData();
  const [fila, setFila] = useState<FilaEnfermagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<FilaEnfermagem | null>(null);
  const [saving, setSaving] = useState(false);
  const [triagem, setTriagem] = useState<TriagemResumo | null>(null);
  const [now, setNow] = useState(new Date());

  const [form, setForm] = useState({
    anamnese_resumida: '',
    condicao_clinica: '',
    avaliacao_risco: '',
    prioridade: 'media',
    observacoes_clinicas: '',
    resultado: 'apto' as 'apto' | 'inapto' | 'multiprofissional',
    motivo_inapto: '',
  });

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const loadFila = useCallback(async () => {
    if (!user?.unidadeId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('agendamentos')
        .select('*')
        .eq('status', 'aguardando_enfermagem')
        .eq('unidade_id', user.unidadeId)
        .order('criado_em', { ascending: true });

      if (data && !error) {
        setFila(data.map((a: any) => ({
          id: a.id,
          pacienteNome: a.paciente_nome,
          pacienteId: a.paciente_id,
          profissionalNome: a.profissional_nome,
          hora: a.hora,
          data: a.data,
          unidadeId: a.unidade_id,
          criadoEm: a.criado_em || '',
          tipo: a.tipo,
        })));
      }
    } catch (err) {
      console.error('Error loading nursing queue:', err);
    }
    setLoading(false);
  }, [user?.unidadeId]);

  useEffect(() => { loadFila(); }, [loadFila]);

  useEffect(() => {
    if (!user?.unidadeId) return;
    const channel = supabase.channel('enfermagem-fila')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' }, () => loadFila())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.unidadeId, loadFila]);

  const openAvaliacao = async (ag: FilaEnfermagem) => {
    setSelected(ag);
    setForm({
      anamnese_resumida: '', condicao_clinica: '', avaliacao_risco: '',
      prioridade: 'media', observacoes_clinicas: '', resultado: 'apto', motivo_inapto: '',
    });
    // Load triage data
    const { data } = await (supabase as any)
      .from('triage_records')
      .select('*')
      .eq('agendamento_id', ag.id)
      .not('confirmado_em', 'is', null)
      .maybeSingle();
    setTriagem(data || null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!selected) return;
    if (!form.anamnese_resumida || !form.condicao_clinica || !form.avaliacao_risco) {
      toast.error('Preencha anamnese, condição clínica e avaliação de risco.');
      return;
    }
    if (form.resultado === 'inapto' && !form.motivo_inapto) {
      toast.error('Informe o motivo da inaptidão.');
      return;
    }
    setSaving(true);
    try {
      // Save nursing evaluation
      await (supabase as any).from('nursing_evaluations').insert({
        patient_id: selected.pacienteId,
        agendamento_id: selected.id,
        professional_id: user?.id || '',
        unit_id: user?.unidadeId || '',
        anamnese_resumida: form.anamnese_resumida,
        condicao_clinica: form.condicao_clinica,
        avaliacao_risco: form.avaliacao_risco,
        prioridade: form.prioridade,
        observacoes_clinicas: form.observacoes_clinicas,
        resultado: form.resultado,
        motivo_inapto: form.motivo_inapto,
      });

      // Save as prontuário entry (TRIAGEM + ENFERMAGEM)
      await (supabase as any).from('prontuarios').insert({
        paciente_id: selected.pacienteId,
        paciente_nome: selected.pacienteNome,
        profissional_id: user?.id || '',
        profissional_nome: user?.nome || '',
        unidade_id: user?.unidadeId || '',
        agendamento_id: selected.id,
        data_atendimento: new Date().toISOString().split('T')[0],
        hora_atendimento: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        tipo_registro: 'avaliacao_enfermagem',
        queixa_principal: form.anamnese_resumida,
        anamnese: form.condicao_clinica,
        hipotese: `Risco: ${form.avaliacao_risco} | Prioridade: ${form.prioridade}`,
        conduta: form.resultado === 'apto' ? 'APTO para avaliação profissional'
          : form.resultado === 'multiprofissional' ? 'Encaminhado para avaliação multiprofissional'
          : `INAPTO - ${form.motivo_inapto}`,
        observacoes: form.observacoes_clinicas,
      });

      // Update appointment status based on result
      let newStatus = '';
      let toastMsg = '';
      if (form.resultado === 'apto') {
        newStatus = 'aguardando_atendimento';
        toastMsg = 'Paciente APTO — encaminhado para atendimento.';
      } else if (form.resultado === 'multiprofissional') {
        newStatus = 'aguardando_multiprofissional';
        toastMsg = 'Paciente encaminhado para avaliação multiprofissional.';
      } else {
        newStatus = 'cancelado';
        toastMsg = 'Paciente considerado INAPTO — fluxo encerrado.';
      }

      await (supabase as any).from('agendamentos').update({ status: newStatus }).eq('id', selected.id);

      await logAction({
        acao: 'avaliacao_enfermagem',
        entidade: 'nursing_evaluation',
        entidadeId: selected.id,
        modulo: 'enfermagem',
        user,
        detalhes: {
          paciente_nome: selected.pacienteNome,
          resultado: form.resultado,
          prioridade: form.prioridade,
          avaliacao_risco: form.avaliacao_risco,
        },
      });

      toast.success(toastMsg);
      setDialogOpen(false);
      await loadFila();
      await refreshAgendamentos();
    } catch (err: any) {
      toast.error('Erro ao salvar avaliação: ' + (err?.message || 'erro'));
    }
    setSaving(false);
  };

  if (!hasPermission(['master', 'coordenador', 'profissional'])) {
    return <div className="p-6 text-muted-foreground">Sem permissão para acessar esta página.</div>;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">Avaliação de Enfermagem</h1>
        <p className="text-muted-foreground text-sm">{fila.length} paciente(s) aguardando avaliação</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : fila.length === 0 ? (
        <Card className="shadow-card border-0">
          <CardContent className="p-8 text-center text-muted-foreground">
            Nenhum paciente aguardando avaliação de enfermagem no momento.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {fila.map(ag => {
            const waitMinutes = ag.criadoEm ? differenceInMinutes(now, new Date(ag.criadoEm)) : 0;
            const waitLabel = waitMinutes >= 60 ? `${Math.floor(waitMinutes / 60)}h${waitMinutes % 60}min` : `${waitMinutes}min`;
            return (
              <Card key={ag.id} className="shadow-card border-0">
                <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <span className="text-lg font-mono font-bold text-primary w-16 shrink-0">{ag.hora}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{ag.pacienteNome}</p>
                    <p className="text-sm text-muted-foreground">{ag.profissionalNome} • {ag.tipo}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      <Clock className="w-3 h-3 mr-1" /> {waitLabel}
                    </Badge>
                    <Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => openAvaliacao(ag)}>
                      <Stethoscope className="w-3.5 h-3.5 mr-1" /> Avaliar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Avaliação de Enfermagem — {selected?.pacienteNome}</DialogTitle>
          </DialogHeader>

          {/* Triage summary */}
          {triagem && (
            <div className="space-y-2">
              {triagem.alergias && triagem.alergias.length > 0 && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-2 text-sm">
                  <strong className="text-destructive">⚠️ ALERGIAS:</strong> {triagem.alergias.join(', ')}
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-muted/50 rounded-lg p-3 border">
                {triagem.peso && <span>Peso: <strong>{triagem.peso}kg</strong></span>}
                {triagem.altura && <span>Altura: <strong>{triagem.altura}cm</strong></span>}
                {triagem.pressao_arterial && <span>PA: <strong>{triagem.pressao_arterial}</strong></span>}
                {triagem.temperatura && <span>Temp: <strong>{triagem.temperatura}°C</strong></span>}
                {triagem.frequencia_cardiaca && <span>FC: <strong>{triagem.frequencia_cardiaca} bpm</strong></span>}
                {triagem.saturacao_oxigenio && <span>SatO₂: <strong>{triagem.saturacao_oxigenio}%</strong></span>}
                {triagem.glicemia && <span>Glicemia: <strong>{triagem.glicemia}</strong></span>}
              </div>
              {triagem.queixa && <p className="text-sm"><strong>Queixa (triagem):</strong> {triagem.queixa}</p>}
              {triagem.medicamentos && triagem.medicamentos.length > 0 && (
                <p className="text-sm"><strong>Medicamentos:</strong> {triagem.medicamentos.join(', ')}</p>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <Label>Anamnese Resumida *</Label>
              <Textarea rows={3} value={form.anamnese_resumida}
                onChange={e => setForm(p => ({ ...p, anamnese_resumida: e.target.value }))}
                placeholder="Resumo da história clínica do paciente..." />
            </div>

            <div>
              <Label>Condição Clínica Geral *</Label>
              <Textarea rows={2} value={form.condicao_clinica}
                onChange={e => setForm(p => ({ ...p, condicao_clinica: e.target.value }))}
                placeholder="Estado geral do paciente..." />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Avaliação de Risco *</Label>
                <Select value={form.avaliacao_risco} onValueChange={v => setForm(p => ({ ...p, avaliacao_risco: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixo">Baixo</SelectItem>
                    <SelectItem value="moderado">Moderado</SelectItem>
                    <SelectItem value="alto">Alto</SelectItem>
                    <SelectItem value="critico">Crítico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade</Label>
                <Select value={form.prioridade} onValueChange={v => setForm(p => ({ ...p, prioridade: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Observações Clínicas</Label>
              <Textarea rows={2} value={form.observacoes_clinicas}
                onChange={e => setForm(p => ({ ...p, observacoes_clinicas: e.target.value }))}
                placeholder="Observações adicionais..." />
            </div>

            <div>
              <Label className="text-base font-semibold">Resultado da Avaliação *</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <Button type="button" variant={form.resultado === 'apto' ? 'default' : 'outline'}
                  className={form.resultado === 'apto' ? 'bg-success hover:bg-success/90 text-success-foreground' : ''}
                  onClick={() => setForm(p => ({ ...p, resultado: 'apto', motivo_inapto: '' }))}>
                  <CheckCircle className="w-4 h-4 mr-1" /> APTO
                </Button>
                <Button type="button" variant={form.resultado === 'inapto' ? 'default' : 'outline'}
                  className={form.resultado === 'inapto' ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground' : ''}
                  onClick={() => setForm(p => ({ ...p, resultado: 'inapto' }))}>
                  <XCircle className="w-4 h-4 mr-1" /> INAPTO
                </Button>
                <Button type="button" variant={form.resultado === 'multiprofissional' ? 'default' : 'outline'}
                  className={form.resultado === 'multiprofissional' ? 'bg-warning hover:bg-warning/90 text-warning-foreground' : ''}
                  onClick={() => setForm(p => ({ ...p, resultado: 'multiprofissional', motivo_inapto: '' }))}>
                  <AlertTriangle className="w-4 h-4 mr-1" /> MULTI
                </Button>
              </div>
            </div>

            {form.resultado === 'inapto' && (
              <div>
                <Label>Motivo da Inaptidão *</Label>
                <Textarea rows={2} value={form.motivo_inapto}
                  onChange={e => setForm(p => ({ ...p, motivo_inapto: e.target.value }))}
                  placeholder="Justifique a inaptidão do paciente..." />
              </div>
            )}

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirmar Avaliação de Enfermagem
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AvaliacaoEnfermagem;
