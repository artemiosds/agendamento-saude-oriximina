import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, CheckCircle, XCircle, ClipboardList, User } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface PacienteMulti {
  agendamentoId: string;
  pacienteId: string;
  pacienteNome: string;
  profissionalNome: string;
  unidadeId: string;
  data: string;
  hora: string;
}

interface EvalExisting {
  id: string;
  professional_id: string;
  professional_nome: string;
  specialty: string;
  parecer: string;
  clinical_evaluation: string;
  observations: string;
  created_at: string;
}

const AvaliacaoMultiprofissional: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const { logAction, refreshAgendamentos } = useData();
  const [pacientes, setPacientes] = useState<PacienteMulti[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<PacienteMulti | null>(null);
  const [existingEvals, setExistingEvals] = useState<EvalExisting[]>([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    clinical_evaluation: '',
    parecer: 'favoravel' as 'favoravel' | 'desfavoravel',
    observations: '',
  });

  const loadPacientes = useCallback(async () => {
    setLoading(true);
    try {
      let query = (supabase as any).from('agendamentos')
        .select('*')
        .eq('status', 'aguardando_multiprofissional')
        .order('data', { ascending: true });

      if (user?.unidadeId && user.role !== 'master') {
        query = query.eq('unidade_id', user.unidadeId);
      }

      const { data } = await query;
      if (data) {
        setPacientes(data.map((ag: any) => ({
          agendamentoId: ag.id,
          pacienteId: ag.paciente_id,
          pacienteNome: ag.paciente_nome,
          profissionalNome: ag.profissional_nome,
          unidadeId: ag.unidade_id,
          data: ag.data,
          hora: ag.hora,
        })));
      }
    } catch (err) {
      console.error('Error loading multiprofessional queue:', err);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadPacientes(); }, [loadPacientes]);

  const openEvaluation = async (pac: PacienteMulti) => {
    setSelected(pac);
    setForm({ clinical_evaluation: '', parecer: 'favoravel', observations: '' });

    const { data } = await (supabase as any)
      .from('multiprofessional_evaluations')
      .select('*')
      .eq('patient_id', pac.pacienteId)
      .eq('agendamento_id', pac.agendamentoId)
      .order('created_at', { ascending: true });

    setExistingEvals(data || []);
    setDialogOpen(true);
  };

  const alreadyEvaluated = existingEvals.some(e => e.professional_id === user?.id);

  const handleSave = async () => {
    if (!selected || !user) return;
    if (!form.clinical_evaluation.trim()) {
      toast.error('Preencha a avaliação clínica da sua especialidade.');
      return;
    }

    setSaving(true);
    try {
      await (supabase as any).from('multiprofessional_evaluations').insert({
        patient_id: selected.pacienteId,
        agendamento_id: selected.agendamentoId,
        professional_id: user.id,
        professional_nome: user.nome,
        specialty: user.profissao || user.cargo || '',
        unit_id: selected.unidadeId || user.unidadeId || '',
        clinical_evaluation: form.clinical_evaluation,
        parecer: form.parecer,
        observations: form.observations,
      });

      await (supabase as any).from('prontuarios').insert({
        paciente_id: selected.pacienteId,
        paciente_nome: selected.pacienteNome,
        profissional_id: user.id,
        profissional_nome: user.nome,
        unidade_id: selected.unidadeId || user.unidadeId || '',
        agendamento_id: selected.agendamentoId,
        data_atendimento: new Date().toISOString().split('T')[0],
        hora_atendimento: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        tipo_registro: 'avaliacao_multiprofissional',
        queixa_principal: '',
        anamnese: form.clinical_evaluation,
        hipotese: `Parecer: ${form.parecer === 'favoravel' ? 'FAVORÁVEL' : 'NÃO FAVORÁVEL'}`,
        conduta: form.parecer === 'favoravel' ? 'Aprovado para tratamento' : 'Não aprovado — indeferido',
        observacoes: form.observations,
        evolucao: `AVALIAÇÃO MULTIPROFISSIONAL (${user.profissao || user.cargo || 'Profissional'}) — Parecer: ${form.parecer === 'favoravel' ? 'FAVORÁVEL' : 'NÃO FAVORÁVEL'}`,
      });

      await logAction({
        acao: 'avaliacao_multiprofissional',
        entidade: 'multiprofessional_evaluations',
        entidadeId: selected.agendamentoId,
        modulo: 'avaliacao',
        user,
        detalhes: {
          paciente: selected.pacienteNome,
          parecer: form.parecer,
          especialidade: user.profissao || '',
        },
      });

      toast.success(`Avaliação registrada com sucesso! Parecer: ${form.parecer === 'favoravel' ? 'FAVORÁVEL' : 'NÃO FAVORÁVEL'}`);
      setDialogOpen(false);
      await loadPacientes();
      await refreshAgendamentos();
    } catch (err) {
      console.error('Error saving evaluation:', err);
      toast.error('Erro ao salvar avaliação.');
    }
    setSaving(false);
  };

  const handleFinalDecision = async (decision: 'aprovado' | 'indeferido') => {
    if (!selected) return;
    setSaving(true);
    try {
      const newStatus = decision === 'aprovado' ? 'aguardando_atendimento' : 'cancelado';
      await (supabase as any).from('agendamentos')
        .update({ status: newStatus })
        .eq('id', selected.agendamentoId);

      await logAction({
        acao: decision === 'aprovado' ? 'multiprofissional_aprovado' : 'multiprofissional_indeferido',
        entidade: 'agendamento',
        entidadeId: selected.agendamentoId,
        modulo: 'avaliacao',
        user,
        detalhes: {
          paciente: selected.pacienteNome,
          total_avaliacoes: existingEvals.length,
          favoraveis: existingEvals.filter(e => e.parecer === 'favoravel').length,
        },
      });

      toast.success(decision === 'aprovado'
        ? 'Paciente APROVADO — liberado para agendamento.'
        : 'Paciente INDEFERIDO — fluxo encerrado.'
      );
      setDialogOpen(false);
      await loadPacientes();
      await refreshAgendamentos();
    } catch (err) {
      toast.error('Erro ao registrar decisão.');
    }
    setSaving(false);
  };

  const canDecide = can('enfermagem', 'can_execute');
  const favoraveis = existingEvals.filter(e => e.parecer === 'favoravel').length;
  const desfavoraveis = existingEvals.filter(e => e.parecer === 'desfavoravel').length;

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">Avaliação Multiprofissional</h1>
        <p className="text-muted-foreground text-sm">{pacientes.length} paciente(s) aguardando avaliação</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : pacientes.length === 0 ? (
        <Card className="shadow-card border-0">
          <CardContent className="p-8 text-center text-muted-foreground">
            Nenhum paciente aguardando avaliação multiprofissional no momento.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {pacientes.map(pac => (
            <Card key={pac.agendamentoId} className="shadow-card border-0">
              <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">{pac.pacienteNome}</p>
                  <p className="text-sm text-muted-foreground">{pac.profissionalNome} • {pac.data} às {pac.hora}</p>
                </div>
                <Badge className="bg-warning/10 text-warning">Aguardando Avaliações</Badge>
                <Button size="sm" onClick={() => openEvaluation(pac)}>
                  <ClipboardList className="w-4 h-4 mr-1" /> Avaliar
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Avaliação Multiprofissional — {selected?.pacienteNome}</DialogTitle>
          </DialogHeader>

          {existingEvals.length > 0 && (
            <div className="space-y-2 mb-4">
              <h3 className="text-sm font-semibold text-foreground">Avaliações Registradas ({existingEvals.length})</h3>
              {existingEvals.map(ev => (
                <div key={ev.id} className="border rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{ev.professional_nome} ({ev.specialty})</span>
                    <Badge className={ev.parecer === 'favoravel' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}>
                      {ev.parecer === 'favoravel' ? '✓ Favorável' : '✗ Não Favorável'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{ev.clinical_evaluation}</p>
                  {ev.observations && <p className="text-xs text-muted-foreground italic">Obs: {ev.observations}</p>}
                </div>
              ))}
              <div className="flex gap-2 text-sm">
                <Badge variant="outline" className="text-success border-success">Favoráveis: {favoraveis}</Badge>
                <Badge variant="outline" className="text-destructive border-destructive">Desfavoráveis: {desfavoraveis}</Badge>
              </div>
            </div>
          )}

          {!alreadyEvaluated ? (
            <div className="space-y-4 border-t pt-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <User className="w-4 h-4" /> Sua Avaliação ({user?.profissao || user?.cargo || 'Profissional'})
              </h3>

              <div>
                <Label>Avaliação Clínica da Especialidade *</Label>
                <Textarea value={form.clinical_evaluation} onChange={e => setForm(p => ({ ...p, clinical_evaluation: e.target.value }))}
                  placeholder="Descreva sua avaliação clínica detalhada..." rows={4} />
              </div>

              <div>
                <Label className="mb-2 block">Parecer *</Label>
                <div className="flex gap-2">
                  <Button type="button" variant={form.parecer === 'favoravel' ? 'default' : 'outline'}
                    className={form.parecer === 'favoravel' ? 'bg-success hover:bg-success/90 text-success-foreground' : ''}
                    onClick={() => setForm(p => ({ ...p, parecer: 'favoravel' }))}>
                    <CheckCircle className="w-4 h-4 mr-1" /> Favorável
                  </Button>
                  <Button type="button" variant={form.parecer === 'desfavoravel' ? 'default' : 'outline'}
                    className={form.parecer === 'desfavoravel' ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground' : ''}
                    onClick={() => setForm(p => ({ ...p, parecer: 'desfavoravel' }))}>
                    <XCircle className="w-4 h-4 mr-1" /> Não Favorável
                  </Button>
                </div>
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea value={form.observations} onChange={e => setForm(p => ({ ...p, observations: e.target.value }))}
                  placeholder="Observações adicionais..." rows={2} />
              </div>

              <Button onClick={handleSave} disabled={saving} className="w-full gradient-primary text-primary-foreground">
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Registrar Avaliação
              </Button>
            </div>
          ) : (
            <div className="border-t pt-4 text-center">
              <Badge className="bg-success/10 text-success text-sm py-1 px-3">✓ Você já registrou sua avaliação</Badge>
            </div>
          )}

          {canDecide && existingEvals.length > 0 && (
            <div className="border-t pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Decisão Final</h3>
              <p className="text-xs text-muted-foreground">
                Resultado: {favoraveis} favorável(is), {desfavoraveis} desfavorável(is)
              </p>
              <div className="flex gap-3">
                <Button onClick={() => handleFinalDecision('aprovado')} disabled={saving}
                  className="flex-1 bg-success hover:bg-success/90 text-success-foreground">
                  {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  <CheckCircle className="w-4 h-4 mr-1" /> APROVAR — Liberar para Agendamento
                </Button>
                <Button onClick={() => handleFinalDecision('indeferido')} disabled={saving}
                  variant="destructive" className="flex-1">
                  {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  <XCircle className="w-4 h-4 mr-1" /> INDEFERIR
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AvaliacaoMultiprofissional;
