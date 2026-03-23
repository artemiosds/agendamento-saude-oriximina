import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { regulationService, PatientRegulation, PatientEvaluation } from '@/services/regulationService';
import { procedureService, ProcedimentoDB } from '@/services/procedureService';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Plus, Search, ArrowLeft, ArrowRight, Eye, ClipboardCheck, UserPlus,
  Clock, CheckCircle, XCircle, Loader2, FileText, Stethoscope
} from 'lucide-react';
import { toast } from 'sonner';
import { useUnidadeFilter } from '@/hooks/useUnidadeFilter';
import { cn } from '@/lib/utils';
import BuscaPaciente from '@/components/BuscaPaciente';

const SPECIALTIES = [
  'Fisioterapia', 'Fonoaudiologia', 'Psicologia', 'Terapia Ocupacional',
  'Neuropsicologia', 'Psicopedagogia', 'Nutrição', 'Serviço Social',
];

const REFERRAL_SOURCES = [
  { value: 'ubs', label: 'UBS' },
  { value: 'hospital', label: 'Hospital' },
  { value: 'espontaneo', label: 'Demanda Espontânea' },
  { value: 'judicial', label: 'Ordem Judicial' },
  { value: 'encaminhamento', label: 'Encaminhamento Médico' },
];

const PRIORITY_LEVELS = [
  { value: 'baixo', label: 'Baixo', color: 'bg-muted text-muted-foreground' },
  { value: 'medio', label: 'Médio', color: 'bg-warning/10 text-warning' },
  { value: 'alto', label: 'Alto', color: 'bg-destructive/10 text-destructive' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  waiting: { label: 'Aguardando', color: 'bg-warning/10 text-warning' },
  scheduled_evaluation: { label: 'Avaliação Agendada', color: 'bg-info/10 text-info' },
  evaluated: { label: 'Avaliado', color: 'bg-primary/10 text-primary' },
  in_treatment: { label: 'Em Tratamento', color: 'bg-success/10 text-success' },
  discharged: { label: 'Alta', color: 'bg-muted text-muted-foreground' },
};

const Regulacao: React.FC = () => {
  const { pacientes, funcionarios, unidades, logAction } = useData();
  const { user, hasPermission } = useAuth();
  const { filterByUnidade } = useUnidadeFilter();

  const [regulations, setRegulations] = useState<PatientRegulation[]>([]);
  const [evaluations, setEvaluations] = useState<PatientEvaluation[]>([]);
  const [procedimentos, setProcedimentos] = useState<ProcedimentoDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSpecialty, setFilterSpecialty] = useState('all');

  // Dialogs
  const [showNewReg, setShowNewReg] = useState(false);
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [showDetail, setShowDetail] = useState<PatientRegulation | null>(null);
  const [selectedRegForEval, setSelectedRegForEval] = useState<PatientRegulation | null>(null);

  // New regulation form
  const [newReg, setNewReg] = useState({
    patient_id: '', cns: '', cpf: '', name: '', mother_name: '',
    priority_level: 'baixo', referral_source: 'ubs', cid_code: '',
    requires_specialty: '', notes: '',
  });

  // Evaluation form
  const [evalForm, setEvalForm] = useState({
    professional_id: '', unit_id: '', clinical_notes: '',
    defined_procedures: [] as string[], sessions_planned: 10,
    frequency: 'semanal', status: 'approved' as 'approved' | 'rejected',
    rejection_reason: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [regs, evals, procs] = await Promise.all([
        regulationService.getAll(),
        regulationService.getEvaluations(),
        procedureService.getAll(),
      ]);
      setRegulations(regs);
      setEvaluations(evals);
      setProcedimentos(procs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const profissionais = useMemo(() =>
    funcionarios.filter(f => f.ativo && ['profissional'].includes(f.role)),
    [funcionarios]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return regulations.filter(r => {
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (filterSpecialty !== 'all' && r.requires_specialty !== filterSpecialty) return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.cpf.includes(q) && !r.cns.includes(q)) return false;
      return true;
    });
  }, [regulations, search, filterStatus, filterSpecialty]);

  const stats = useMemo(() => ({
    waiting: regulations.filter(r => r.status === 'waiting').length,
    scheduled: regulations.filter(r => r.status === 'scheduled_evaluation').length,
    evaluated: regulations.filter(r => r.status === 'evaluated').length,
    inTreatment: regulations.filter(r => r.status === 'in_treatment').length,
  }), [regulations]);

  const handleSelectPatient = (p: any) => {
    setNewReg(prev => ({
      ...prev,
      patient_id: p.id,
      name: p.nome,
      cpf: p.cpf || '',
      cns: p.cns || '',
      mother_name: p.nomeMae || '',
    }));
  };

  const handleCreateRegulation = async () => {
    if (!newReg.name || !newReg.requires_specialty) {
      toast.error('Preencha nome e especialidade necessária');
      return;
    }
    // Check active regulation
    if (newReg.patient_id) {
      const active = await regulationService.checkActiveRegulation(newReg.patient_id);
      if (active) {
        toast.error('Paciente já possui regulação ativa no sistema');
        return;
      }
    }
    try {
      await regulationService.create({ ...newReg, status: 'waiting' });
      toast.success('Regulação criada com sucesso');
      setShowNewReg(false);
      setNewReg({ patient_id: '', cns: '', cpf: '', name: '', mother_name: '', priority_level: 'baixo', referral_source: 'ubs', cid_code: '', requires_specialty: '', notes: '' });
      await logAction({ acao: 'criar', entidade: 'regulacao', entidadeId: newReg.patient_id, detalhes: { nome: newReg.name, especialidade: newReg.requires_specialty } });
      loadData();
    } catch (e: any) {
      toast.error('Erro ao criar regulação: ' + e.message);
    }
  };

  const openEvaluation = (reg: PatientRegulation) => {
    setSelectedRegForEval(reg);
    setEvalForm({
      professional_id: '', unit_id: '', clinical_notes: '',
      defined_procedures: [], sessions_planned: 10, frequency: 'semanal',
      status: 'approved', rejection_reason: '',
    });
    setShowEvaluation(true);
  };

  const handleSaveEvaluation = async () => {
    if (!selectedRegForEval) return;
    if (!evalForm.professional_id) {
      toast.error('Selecione o profissional avaliador');
      return;
    }
    try {
      const ev = await regulationService.createEvaluation({
        patient_id: selectedRegForEval.patient_id,
        regulation_id: selectedRegForEval.id,
        professional_id: evalForm.professional_id,
        unit_id: evalForm.unit_id,
        evaluation_date: new Date().toISOString().split('T')[0],
        clinical_notes: evalForm.clinical_notes,
        defined_procedures: evalForm.defined_procedures,
        sessions_planned: evalForm.sessions_planned,
        frequency: evalForm.frequency,
        status: evalForm.status,
        rejection_reason: evalForm.rejection_reason,
      });

      // Update regulation status
      const newStatus = evalForm.status === 'approved' ? 'evaluated' : 'waiting';
      await regulationService.update(selectedRegForEval.id, { status: newStatus });

      // If approved, auto-create treatment cycle
      if (evalForm.status === 'approved') {
        const prof = funcionarios.find(f => f.id === evalForm.professional_id);
        await (supabase as any).from('treatment_cycles').insert({
          patient_id: selectedRegForEval.patient_id,
          professional_id: evalForm.professional_id,
          unit_id: evalForm.unit_id,
          specialty: selectedRegForEval.requires_specialty,
          treatment_type: selectedRegForEval.requires_specialty,
          total_sessions: evalForm.sessions_planned,
          frequency: evalForm.frequency,
          clinical_notes: evalForm.clinical_notes,
          created_by: user?.id || '',
          status: 'em_andamento',
        });
        // Update regulation to in_treatment
        await regulationService.update(selectedRegForEval.id, { status: 'in_treatment' });
        toast.success('Avaliação aprovada e tratamento criado automaticamente!');
      } else {
        toast.info('Avaliação rejeitada. Paciente retorna à fila de regulação.');
      }

      await logAction({
        acao: evalForm.status === 'approved' ? 'aprovar_avaliacao' : 'rejeitar_avaliacao',
        entidade: 'avaliacao',
        entidadeId: selectedRegForEval.patient_id,
        detalhes: { regulation_id: selectedRegForEval.id, sessions: evalForm.sessions_planned },
      });

      setShowEvaluation(false);
      loadData();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    }
  };

  const handleScheduleEvaluation = async (reg: PatientRegulation) => {
    try {
      await regulationService.update(reg.id, { status: 'scheduled_evaluation' });
      toast.success('Avaliação agendada');
      loadData();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    }
  };

  const getEvaluationsForReg = (regId: string) =>
    evaluations.filter(e => e.regulation_id === regId);

  if (!hasPermission(['master', 'coordenador', 'profissional'])) {
    return <div className="p-6 text-muted-foreground">Sem permissão para acessar esta página.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Regulação CER</h1>
          <p className="text-sm text-muted-foreground">Fluxo de entrada e avaliação de pacientes</p>
        </div>
        <Button onClick={() => setShowNewReg(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" /> Nova Regulação
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Aguardando', value: stats.waiting, icon: Clock, color: 'text-warning' },
          { label: 'Av. Agendada', value: stats.scheduled, icon: FileText, color: 'text-info' },
          { label: 'Avaliados', value: stats.evaluated, icon: ClipboardCheck, color: 'text-primary' },
          { label: 'Em Tratamento', value: stats.inTreatment, icon: Stethoscope, color: 'text-success' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-3 flex items-center gap-3">
              <s.icon className={cn('w-5 h-5', s.color)} />
              <div>
                <p className="text-lg font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, CPF ou CNS..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSpecialty} onValueChange={setFilterSpecialty}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Especialidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Especialidades</SelectItem>
            {SPECIALTIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Nenhuma regulação encontrada</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(reg => {
            const st = STATUS_CONFIG[reg.status] || STATUS_CONFIG.waiting;
            const pri = PRIORITY_LEVELS.find(p => p.value === reg.priority_level);
            const evals = getEvaluationsForReg(reg.id);
            return (
              <Card key={reg.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{reg.name}</span>
                        <Badge variant="outline" className={cn('text-xs', st.color)}>{st.label}</Badge>
                        {pri && <Badge variant="outline" className={cn('text-xs', pri.color)}>{pri.label}</Badge>}
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {reg.cpf && <span>CPF: {reg.cpf}</span>}
                        {reg.cns && <span>CNS: {reg.cns}</span>}
                        <span>{reg.requires_specialty}</span>
                        {reg.cid_code && <span>CID: {reg.cid_code}</span>}
                        <span>{new Date(reg.created_at).toLocaleDateString('pt-BR')}</span>
                      </div>
                      {evals.length > 0 && (
                        <div className="text-xs mt-1 text-muted-foreground">
                          {evals.length} avaliação(ões) registrada(s)
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {reg.status === 'waiting' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => handleScheduleEvaluation(reg)}>
                            <FileText className="w-3 h-3 mr-1" /> Agendar Avaliação
                          </Button>
                        </>
                      )}
                      {(reg.status === 'waiting' || reg.status === 'scheduled_evaluation') && (
                        <Button size="sm" onClick={() => openEvaluation(reg)}>
                          <ClipboardCheck className="w-3 h-3 mr-1" /> Avaliar
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setShowDetail(reg)}>
                        <Eye className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Regulation Dialog */}
      <Dialog open={showNewReg} onOpenChange={setShowNewReg}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova Regulação</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Buscar Paciente Existente</Label>
              <BuscaPaciente
                pacientes={pacientes}
                onSelect={handleSelectPatient}
                placeholder="Buscar por nome, CPF ou CNS..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome *</Label>
                <Input value={newReg.name} onChange={e => setNewReg(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <Label>Nome da Mãe *</Label>
                <Input value={newReg.mother_name} onChange={e => setNewReg(p => ({ ...p, mother_name: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>CPF</Label>
                <Input value={newReg.cpf} onChange={e => setNewReg(p => ({ ...p, cpf: e.target.value }))} />
              </div>
              <div>
                <Label>CNS</Label>
                <Input value={newReg.cns} onChange={e => setNewReg(p => ({ ...p, cns: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Especialidade Necessária *</Label>
                <Select value={newReg.requires_specialty} onValueChange={v => setNewReg(p => ({ ...p, requires_specialty: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {SPECIALTIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade</Label>
                <Select value={newReg.priority_level} onValueChange={v => setNewReg(p => ({ ...p, priority_level: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITY_LEVELS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Origem do Encaminhamento</Label>
                <Select value={newReg.referral_source} onValueChange={v => setNewReg(p => ({ ...p, referral_source: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REFERRAL_SOURCES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>CID</Label>
                <Input value={newReg.cid_code} onChange={e => setNewReg(p => ({ ...p, cid_code: e.target.value }))} placeholder="Ex: F84.0" />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={newReg.notes} onChange={e => setNewReg(p => ({ ...p, notes: e.target.value }))} rows={3} />
            </div>
            <Button onClick={handleCreateRegulation} className="w-full">Criar Regulação</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Evaluation Dialog */}
      <Dialog open={showEvaluation} onOpenChange={setShowEvaluation}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Avaliação Inicial — {selectedRegForEval?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-3 bg-muted/30 rounded-lg text-sm space-y-1">
              <p><strong>Especialidade:</strong> {selectedRegForEval?.requires_specialty}</p>
              {selectedRegForEval?.cid_code && <p><strong>CID:</strong> {selectedRegForEval?.cid_code}</p>}
              {selectedRegForEval?.notes && <p><strong>Obs:</strong> {selectedRegForEval?.notes}</p>}
            </div>
            <div>
              <Label>Profissional Avaliador *</Label>
              <Select value={evalForm.professional_id} onValueChange={v => setEvalForm(p => ({ ...p, professional_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {profissionais.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nome} — {p.profissao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unidade</Label>
              <Select value={evalForm.unit_id} onValueChange={v => setEvalForm(p => ({ ...p, unit_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {unidades.filter(u => u.ativo).map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notas Clínicas</Label>
              <Textarea value={evalForm.clinical_notes} onChange={e => setEvalForm(p => ({ ...p, clinical_notes: e.target.value }))} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sessões Planejadas</Label>
                <Input type="number" min={1} max={100} value={evalForm.sessions_planned} onChange={e => setEvalForm(p => ({ ...p, sessions_planned: parseInt(e.target.value) || 1 }))} />
              </div>
              <div>
                <Label>Frequência</Label>
                <Select value={evalForm.frequency} onValueChange={v => setEvalForm(p => ({ ...p, frequency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['semanal', 'quinzenal', 'mensal', 'bisemanal'].map(f => (
                      <SelectItem key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Procedimentos Definidos</Label>
              <div className="grid grid-cols-1 gap-1 max-h-32 overflow-y-auto">
                {procedimentos.filter(p => p.ativo).map(proc => (
                  <label key={proc.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={evalForm.defined_procedures.includes(proc.id)}
                      onCheckedChange={(checked) => {
                        setEvalForm(prev => ({
                          ...prev,
                          defined_procedures: checked
                            ? [...prev.defined_procedures, proc.id]
                            : prev.defined_procedures.filter(id => id !== proc.id),
                        }));
                      }}
                    />
                    {proc.nome} <span className="text-muted-foreground">({proc.profissao})</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>Decisão</Label>
              <Select value={evalForm.status} onValueChange={v => setEvalForm(p => ({ ...p, status: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">✅ Aprovado — Iniciar Tratamento</SelectItem>
                  <SelectItem value="rejected">❌ Rejeitado — Retornar à fila</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {evalForm.status === 'rejected' && (
              <div>
                <Label>Motivo da Rejeição</Label>
                <Textarea value={evalForm.rejection_reason} onChange={e => setEvalForm(p => ({ ...p, rejection_reason: e.target.value }))} rows={2} />
              </div>
            )}
            <Button onClick={handleSaveEvaluation} className="w-full">
              {evalForm.status === 'approved' ? 'Aprovar e Criar Tratamento' : 'Registrar Rejeição'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Detalhes da Regulação</DialogTitle></DialogHeader>
          {showDetail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><strong>Nome:</strong> {showDetail.name}</div>
                <div><strong>Nome da Mãe:</strong> {showDetail.mother_name}</div>
                <div><strong>CPF:</strong> {showDetail.cpf || '—'}</div>
                <div><strong>CNS:</strong> {showDetail.cns || '—'}</div>
                <div><strong>Prioridade:</strong> {PRIORITY_LEVELS.find(p => p.value === showDetail.priority_level)?.label}</div>
                <div><strong>Origem:</strong> {REFERRAL_SOURCES.find(r => r.value === showDetail.referral_source)?.label}</div>
                <div><strong>Especialidade:</strong> {showDetail.requires_specialty}</div>
                <div><strong>CID:</strong> {showDetail.cid_code || '—'}</div>
                <div><strong>Status:</strong> {STATUS_CONFIG[showDetail.status]?.label}</div>
                <div><strong>Criado em:</strong> {new Date(showDetail.created_at).toLocaleDateString('pt-BR')}</div>
              </div>
              {showDetail.notes && (
                <div><strong>Observações:</strong><p className="mt-1 text-muted-foreground">{showDetail.notes}</p></div>
              )}
              {/* Evaluations history */}
              {getEvaluationsForReg(showDetail.id).length > 0 && (
                <div>
                  <strong>Histórico de Avaliações:</strong>
                  <div className="mt-2 space-y-2">
                    {getEvaluationsForReg(showDetail.id).map(ev => {
                      const prof = funcionarios.find(f => f.id === ev.professional_id);
                      return (
                        <div key={ev.id} className="p-2 border rounded text-xs">
                          <div className="flex justify-between">
                            <span>{prof?.nome || 'Profissional'}</span>
                            <Badge variant="outline" className={ev.status === 'approved' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}>
                              {ev.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground mt-1">{ev.clinical_notes || 'Sem notas'}</p>
                          {ev.status === 'approved' && <p>Sessões: {ev.sessions_planned} | Freq: {ev.frequency}</p>}
                          {ev.rejection_reason && <p className="text-destructive">Motivo: {ev.rejection_reason}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Regulacao;
