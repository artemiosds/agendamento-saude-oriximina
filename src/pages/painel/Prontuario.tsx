import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, FileText, Printer, Pencil, Search, CheckCircle, History, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AtendimentoTimer from '@/components/AtendimentoTimer';
import { openPrintDocument } from '@/lib/printLayout';

interface ProntuarioDB {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  unidade_id: string;
  sala_id: string;
  setor: string;
  agendamento_id: string;
  data_atendimento: string;
  hora_atendimento: string;
  queixa_principal: string;
  anamnese: string;
  sinais_sintomas: string;
  exame_fisico: string;
  hipotese: string;
  conduta: string;
  prescricao: string;
  solicitacao_exames: string;
  evolucao: string;
  observacoes: string;
  criado_em: string;
  atualizado_em: string;
}

const emptyForm = {
  paciente_id: '',
  paciente_nome: '',
  agendamento_id: '',
  data_atendimento: new Date().toISOString().split('T')[0],
  hora_atendimento: '',
  queixa_principal: '',
  anamnese: '',
  sinais_sintomas: '',
  exame_fisico: '',
  hipotese: '',
  conduta: '',
  prescricao: '',
  solicitacao_exames: '',
  evolucao: '',
  observacoes: '',
};

const classificarIMC = (imc: number): string => {
  if (imc < 18.5) return 'Abaixo do peso';
  if (imc < 25) return 'Normal';
  if (imc < 30) return 'Sobrepeso';
  if (imc < 35) return 'Obesidade grau I';
  if (imc < 40) return 'Obesidade grau II';
  return 'Obesidade grau III';
};

interface TriagemData {
  peso?: number; altura?: number; imc?: number;
  pressao_arterial?: string; temperatura?: number;
  frequencia_cardiaca?: number; saturacao_oxigenio?: number;
  glicemia?: number; alergias?: string[]; medicamentos?: string[];
  queixa?: string; confirmado_em?: string;
  tecnico_nome?: string; tecnico_coren?: string;
}

const ProntuarioPage: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const { pacientes, unidades, agendamentos, updateAgendamento, logAction } = useData();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [prontuarios, setProntuarios] = useState<ProntuarioDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [previousForm, setPreviousForm] = useState<typeof emptyForm | null>(null);
  const [search, setSearch] = useState('');
  const [activeAtendimento, setActiveAtendimento] = useState<{ agendamentoId: string; horaInicio: string } | null>(null);
  const [triagem, setTriagem] = useState<TriagemData | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const isProfissional = user?.role === 'profissional';
  const canEdit = hasPermission(['master', 'coordenador', 'profissional']);
  const canDelete = hasPermission(['master', 'coordenador']);

  const tempoLimite = user?.tempoAtendimento || 30;

  const loadProntuarios = async () => {
    setLoading(true);
    try {
      let query = (supabase as any).from('prontuarios').select('*').order('data_atendimento', { ascending: false });

      if (isProfissional && user) {
        query = query.eq('profissional_id', user.id);
      }
      if (user?.role === 'coordenador' && user.unidadeId) {
        query = query.eq('unidade_id', user.unidadeId);
      }

      const { data, error } = await query;
      if (data) setProntuarios(data);
      if (error) console.error('Error loading prontuarios:', error);
    } catch (err) {
      console.error('Error:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadProntuarios();
  }, [user]);

  // Load triage data for an agendamento
  const loadTriagem = async (agendamentoId: string) => {
    try {
      const { data } = await (supabase as any)
        .from('triage_records')
        .select('*')
        .eq('agendamento_id', agendamentoId)
        .not('confirmado_em', 'is', null)
        .maybeSingle();
      if (data) {
        // Fetch tecnico info
        const { data: tecnico } = await supabase.from('funcionarios')
          .select('nome, coren')
          .eq('id', data.tecnico_id)
          .maybeSingle();
        setTriagem({ ...data, tecnico_nome: (tecnico as any)?.nome || '', tecnico_coren: (tecnico as any)?.coren || '' });
      } else {
        setTriagem(null);
      }
    } catch { setTriagem(null); }
  };

  // Auto-open form when coming from "Iniciar Atendimento"
  useEffect(() => {
    const pacienteId = searchParams.get('pacienteId');
    const pacienteNome = searchParams.get('pacienteNome');
    const agendamentoId = searchParams.get('agendamentoId');
    const horaInicio = searchParams.get('horaInicio');
    const data = searchParams.get('data');

    if (pacienteId && pacienteNome) {
      if (agendamentoId) loadTriagem(agendamentoId);

      const existingForAgendamento = agendamentoId 
        ? prontuarios.find(p => p.agendamento_id === agendamentoId)
        : null;

      if (existingForAgendamento) {
        openEdit(existingForAgendamento);
      } else {
        setEditId(null);
        setForm({
          ...emptyForm,
          paciente_id: pacienteId,
          paciente_nome: pacienteNome,
          agendamento_id: agendamentoId || '',
          data_atendimento: data || new Date().toISOString().split('T')[0],
          hora_atendimento: horaInicio || '',
        });
        setDialogOpen(true);
      }

      if (agendamentoId && horaInicio) {
        setActiveAtendimento({ agendamentoId, horaInicio });
      } else if (agendamentoId) {
        // Try to restore timer from localStorage
        const stored = localStorage.getItem(`timer_${agendamentoId}`);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            setActiveAtendimento({ agendamentoId, horaInicio: parsed.horaInicio });
          } catch { /* ignore */ }
        }
      }
    }
  }, [searchParams, prontuarios.length]);

  const patientHistory = useMemo(() => {
    if (!form.paciente_id) return [];
    return prontuarios.filter(p => p.paciente_id === form.paciente_id && p.id !== editId)
      .sort((a, b) => b.data_atendimento.localeCompare(a.data_atendimento));
  }, [form.paciente_id, prontuarios, editId]);

  const openNew = () => {
    setEditId(null);
    setActiveAtendimento(null);
    setForm({ ...emptyForm, data_atendimento: new Date().toISOString().split('T')[0] });
    setDialogOpen(true);
  };

  const openEdit = (p: ProntuarioDB) => {
    setEditId(p.id);
    setActiveAtendimento(null);
    const formData = {
      paciente_id: p.paciente_id,
      paciente_nome: p.paciente_nome,
      agendamento_id: p.agendamento_id || '',
      data_atendimento: p.data_atendimento,
      hora_atendimento: p.hora_atendimento || '',
      queixa_principal: p.queixa_principal || '',
      anamnese: p.anamnese || '',
      sinais_sintomas: p.sinais_sintomas || '',
      exame_fisico: p.exame_fisico || '',
      hipotese: p.hipotese || '',
      conduta: p.conduta || '',
      prescricao: p.prescricao || '',
      solicitacao_exames: p.solicitacao_exames || '',
      evolucao: p.evolucao || '',
      observacoes: p.observacoes || '',
    };
    setForm(formData);
    setPreviousForm(formData);
    setDialogOpen(true);

    // Log PRONTUARIO_VISUALIZADO
    const pac = pacientes.find(px => px.id === p.paciente_id);
    logAction({
      acao: 'prontuario_visualizado', entidade: 'prontuario', entidadeId: p.id,
      modulo: 'prontuario', user,
      detalhes: { paciente_nome: p.paciente_nome, paciente_cpf: pac?.cpf || '' },
    });
  };

  const handleSave = async () => {
    if (!form.paciente_nome || !form.data_atendimento) {
      toast.error('Paciente e data são obrigatórios.');
      return;
    }

    setSaving(true);
    try {
      const record = {
        paciente_id: form.paciente_id || `manual_${Date.now()}`,
        paciente_nome: form.paciente_nome,
        profissional_id: user?.id || '',
        profissional_nome: user?.nome || '',
        unidade_id: user?.unidadeId || '',
        setor: user?.setor || '',
        agendamento_id: form.agendamento_id,
        data_atendimento: form.data_atendimento,
        hora_atendimento: form.hora_atendimento,
        queixa_principal: form.queixa_principal,
        anamnese: form.anamnese,
        sinais_sintomas: form.sinais_sintomas,
        exame_fisico: form.exame_fisico,
        hipotese: form.hipotese,
        conduta: form.conduta,
        prescricao: form.prescricao,
        solicitacao_exames: form.solicitacao_exames,
        evolucao: form.evolucao,
        observacoes: form.observacoes,
      };

      const pac = pacientes.find(px => px.id === (form.paciente_id || record.paciente_id));

      if (editId) {
        const { error } = await (supabase as any).from('prontuarios').update(record).eq('id', editId);
        if (error) throw error;

        // Log PRONTUARIO_EDITADO with field-level diffs
        const camposAlterados: Record<string, { anterior: string; novo: string }> = {};
        if (previousForm) {
          const fieldLabels: Record<string, string> = {
            queixa_principal: 'Queixa Principal', anamnese: 'Anamnese', sinais_sintomas: 'Sinais/Sintomas',
            exame_fisico: 'Exame Físico', hipotese: 'Hipótese', conduta: 'Conduta',
            prescricao: 'Prescrição', solicitacao_exames: 'Solicitação Exames', evolucao: 'Evolução', observacoes: 'Observações',
          };
          for (const [key, label] of Object.entries(fieldLabels)) {
            const prev = (previousForm as any)[key] || '';
            const curr = (form as any)[key] || '';
            if (prev !== curr) {
              camposAlterados[label] = { anterior: prev.substring(0, 200), novo: curr.substring(0, 200) };
            }
          }
        }
        await logAction({
          acao: 'prontuario_editado', entidade: 'prontuario', entidadeId: editId,
          modulo: 'prontuario', user,
          detalhes: { paciente_nome: form.paciente_nome, paciente_cpf: pac?.cpf || '', campos_alterados: camposAlterados },
        });

        toast.success('Prontuário atualizado!');
      } else {
        const { data: inserted, error } = await (supabase as any).from('prontuarios').insert(record).select('id').single();
        if (error) throw error;

        // Log PRONTUARIO_CRIADO
        await logAction({
          acao: 'prontuario_criado', entidade: 'prontuario', entidadeId: inserted?.id || '',
          modulo: 'prontuario', user,
          detalhes: { paciente_nome: form.paciente_nome, paciente_cpf: pac?.cpf || '' },
        });

        toast.success('Prontuário criado!');
      }

      setDialogOpen(false);
      setPreviousForm(null);
      await loadProntuarios();
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err?.message || 'erro desconhecido'));
    }
    setSaving(false);
  };

  const handleFinalizarAtendimento = async () => {
    await handleSave();

    if (!activeAtendimento) return;

    const now = new Date();
    const horaFim = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const [hi, mi] = activeAtendimento.horaInicio.split(':').map(Number);
    const [hf, mf] = horaFim.split(':').map(Number);
    const duracaoMinutos = (hf * 60 + mf) - (hi * 60 + mi);

    const pac = pacientes.find(px => px.id === form.paciente_id);

    try {
      await (supabase as any).from('atendimentos')
        .update({ hora_fim: horaFim, duracao_minutos: Math.max(0, duracaoMinutos), status: 'finalizado' })
        .eq('agendamento_id', activeAtendimento.agendamentoId);
    } catch (err) {
      console.error('Error finalizing atendimento:', err);
    }

    // Log ATENDIMENTO_FINALIZADO
    await logAction({
      acao: 'atendimento_finalizado', entidade: 'atendimento', entidadeId: activeAtendimento.agendamentoId,
      modulo: 'atendimento', user,
      detalhes: {
        paciente_nome: form.paciente_nome, paciente_cpf: pac?.cpf || '',
        hora_inicio: activeAtendimento.horaInicio, hora_fim: horaFim,
        duracao_minutos: Math.max(0, duracaoMinutos),
        unidade: user?.unidadeId || '', sala: user?.salaId || '',
      },
    });

    // Clean up localStorage timer
    localStorage.removeItem(`timer_${activeAtendimento.agendamentoId}`);

    updateAgendamento(activeAtendimento.agendamentoId, { status: 'concluido' });

    setActiveAtendimento(null);
    toast.success(`Atendimento finalizado! Duração: ${Math.max(0, duracaoMinutos)} minutos.`);
    navigate('/painel/agenda');
  };

  const handleDelete = async (p: ProntuarioDB) => {
    try {
      await (supabase as any).from('prontuarios').delete().eq('id', p.id);
      await logAction({
        acao: 'excluir', entidade: 'prontuario', entidadeId: p.id,
        detalhes: { paciente: p.paciente_nome, profissional: p.profissional_nome, data: p.data_atendimento },
        user,
      });
      setProntuarios(prev => prev.filter(pr => pr.id !== p.id));
      toast.success('Prontuário excluído!');
    } catch (err) {
      console.error('Error deleting:', err);
      toast.error('Erro ao excluir prontuário.');
    }
  };

  const handlePrint = (p: ProntuarioDB) => {
    const pac = pacientes.find(px => px.id === p.paciente_id);
    logAction({
      acao: 'prontuario_exportado_pdf', entidade: 'prontuario', entidadeId: p.id,
      modulo: 'prontuario', user,
      detalhes: { paciente_nome: p.paciente_nome, paciente_cpf: pac?.cpf || '' },
    });
    const unidadeNome = unidades.find(u => u.id === p.unidade_id)?.nome || p.unidade_id;

    const sections = [
      { title: 'Queixa Principal', content: p.queixa_principal },
      { title: 'Anamnese', content: p.anamnese },
      { title: 'Sinais e Sintomas', content: p.sinais_sintomas },
      { title: 'Exame Físico', content: p.exame_fisico },
      { title: 'Hipótese / Avaliação', content: p.hipotese },
      { title: 'Conduta', content: p.conduta },
      { title: 'Prescrição / Orientações', content: p.prescricao },
      { title: 'Solicitação de Exames', content: p.solicitacao_exames },
      { title: 'Evolução', content: p.evolucao },
      { title: 'Observações Gerais', content: p.observacoes },
    ].filter(s => s.content).map(s =>
      `<div class="section"><div class="section-title">${s.title}</div><div class="section-content">${s.content}</div></div>`
    ).join('');

    const body = `
      <div class="info-grid">
        <div><span class="info-label">Paciente:</span><br/><span class="info-value">${p.paciente_nome}</span></div>
        <div><span class="info-label">Data:</span><br/><span class="info-value">${new Date(p.data_atendimento + 'T12:00:00').toLocaleDateString('pt-BR')}</span></div>
        <div><span class="info-label">Profissional:</span><br/><span class="info-value">${p.profissional_nome}</span></div>
        <div><span class="info-label">Hora:</span><br/><span class="info-value">${p.hora_atendimento || '-'}</span></div>
        <div><span class="info-label">Unidade:</span><br/><span class="info-value">${unidadeNome}</span></div>
        <div><span class="info-label">Setor:</span><br/><span class="info-value">${p.setor || '-'}</span></div>
      </div>
      ${sections}
      <div class="signature">
        <div class="signature-line"></div>
        <div class="name">${p.profissional_nome}</div>
        <div class="role">${p.setor || ''}</div>
      </div>`;

    openPrintDocument('Prontuário de Atendimento', body, { 'Unidade': unidadeNome });
  };

  const queryPacienteId = searchParams.get('pacienteId');
  
  const filtered = prontuarios.filter(p => {
    if (queryPacienteId) {
      return p.paciente_id === queryPacienteId;
    }
    return !search || p.paciente_nome.toLowerCase().includes(search.toLowerCase()) ||
      p.profissional_nome.toLowerCase().includes(search.toLowerCase());
  });

  const queryPacienteNome = searchParams.get('pacienteNome');

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">
            {queryPacienteId ? `Prontuários — ${queryPacienteNome || 'Paciente'}` : 'Prontuários'}
          </h1>
          <p className="text-muted-foreground text-sm">{filtered.length} registro(s)</p>
        </div>
        <div className="flex gap-2">
          {queryPacienteId && (
            <Button variant="outline" onClick={() => navigate('/painel/prontuario')}>
              Ver todos
            </Button>
          )}
          {canEdit && (
            <Button onClick={openNew} className="gradient-primary text-primary-foreground">
              <Plus className="w-4 h-4 mr-2" />Novo Prontuário
            </Button>
          )}
        </div>
      </div>

      {!queryPacienteId && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por paciente ou profissional..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) setActiveAtendimento(null);
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editId ? 'Editar' : 'Novo'} Prontuário</DialogTitle>
          </DialogHeader>

          {/* Timer when active atendimento */}
          {activeAtendimento && (
            <AtendimentoTimer
              horaInicio={activeAtendimento.horaInicio}
              tempoLimite={tempoLimite}
              agendamentoId={activeAtendimento.agendamentoId}
            />
          )}

          {/* Triage Data (read-only) */}
          {triagem && (
            <div className="space-y-3 pointer-events-none select-text">
              {triagem.alergias && triagem.alergias.length > 0 && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                  <strong className="text-destructive">⚠️ ALERGIAS:</strong> {triagem.alergias.join(', ')}
                </div>
              )}
              <div className="text-sm text-muted-foreground">
                Triagem realizada por: <strong className="text-foreground">{triagem.tecnico_nome}</strong>
                {triagem.tecnico_coren && ` | COREN: ${triagem.tecnico_coren}`}
                {triagem.confirmado_em && ` às ${new Date(triagem.confirmado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm bg-muted/50 rounded-lg p-3 border">
                {triagem.peso && <span>Peso: <strong>{triagem.peso}kg</strong></span>}
                {triagem.altura && <span>Altura: <strong>{triagem.altura}cm</strong></span>}
                {triagem.imc && <span>IMC: <strong>{triagem.imc} ({classificarIMC(triagem.imc)})</strong></span>}
                {triagem.pressao_arterial && <span>PA: <strong>{triagem.pressao_arterial} mmHg</strong></span>}
                {triagem.temperatura && <span>Temp: <strong>{triagem.temperatura}°C</strong></span>}
                {triagem.frequencia_cardiaca && <span>FC: <strong>{triagem.frequencia_cardiaca} bpm</strong></span>}
                {triagem.saturacao_oxigenio && <span>SatO₂: <strong>{triagem.saturacao_oxigenio}%</strong></span>}
                {triagem.glicemia && <span>Glicemia: <strong>{triagem.glicemia} mg/dL</strong></span>}
              </div>
              {triagem.medicamentos && triagem.medicamentos.length > 0 && (
                <div className="text-sm"><strong>Medicamentos em uso:</strong> {triagem.medicamentos.join(', ')}</div>
              )}
              {triagem.queixa && (
                <div className="text-sm"><strong>Queixa (triagem):</strong> {triagem.queixa}</div>
              )}
            </div>
          )}
          {form.agendamento_id && !triagem && (
            <p className="text-xs text-muted-foreground italic">Triagem não realizada para este atendimento.</p>
          )}

          {/* Patient history section */}
          {patientHistory.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-3 border">
              <div className="flex items-center gap-2 mb-2">
                <History className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Histórico do Paciente ({patientHistory.length} registro(s) anterior(es))</span>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {patientHistory.slice(0, 5).map(ph => (
                  <div key={ph.id} className="flex items-center justify-between text-xs text-muted-foreground bg-background rounded px-2 py-1.5">
                    <span>{new Date(ph.data_atendimento + 'T12:00:00').toLocaleDateString('pt-BR')} — {ph.profissional_nome}</span>
                    <span className="truncate ml-2 max-w-[200px]">{ph.queixa_principal || 'Sem queixa registrada'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Paciente *</Label>
                <Select
                  value={form.paciente_id}
                  onValueChange={v => {
                    const pac = pacientes.find(p => p.id === v);
                    setForm(prev => ({ ...prev, paciente_id: v, paciente_nome: pac?.nome || '' }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione o paciente" /></SelectTrigger>
                  <SelectContent>
                    {pacientes.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Data *</Label><Input type="date" value={form.data_atendimento} onChange={e => setForm(p => ({ ...p, data_atendimento: e.target.value }))} /></div>
                <div><Label>Hora</Label><Input type="time" value={form.hora_atendimento} onChange={e => setForm(p => ({ ...p, hora_atendimento: e.target.value }))} /></div>
              </div>
            </div>

            <div><Label>Queixa Principal</Label><Textarea rows={2} value={form.queixa_principal} onChange={e => setForm(p => ({ ...p, queixa_principal: e.target.value }))} /></div>
            <div><Label>Anamnese</Label><Textarea rows={3} value={form.anamnese} onChange={e => setForm(p => ({ ...p, anamnese: e.target.value }))} /></div>
            <div><Label>Sinais e Sintomas</Label><Textarea rows={2} value={form.sinais_sintomas} onChange={e => setForm(p => ({ ...p, sinais_sintomas: e.target.value }))} /></div>
            <div><Label>Exame Físico</Label><Textarea rows={3} value={form.exame_fisico} onChange={e => setForm(p => ({ ...p, exame_fisico: e.target.value }))} /></div>
            <div><Label>Hipótese / Avaliação</Label><Textarea rows={2} value={form.hipotese} onChange={e => setForm(p => ({ ...p, hipotese: e.target.value }))} /></div>
            <div><Label>Conduta</Label><Textarea rows={2} value={form.conduta} onChange={e => setForm(p => ({ ...p, conduta: e.target.value }))} /></div>
            <div><Label>Prescrição / Orientações</Label><Textarea rows={2} value={form.prescricao} onChange={e => setForm(p => ({ ...p, prescricao: e.target.value }))} /></div>
            <div><Label>Solicitação de Exames</Label><Textarea rows={2} value={form.solicitacao_exames} onChange={e => setForm(p => ({ ...p, solicitacao_exames: e.target.value }))} /></div>
            <div><Label>Evolução</Label><Textarea rows={2} value={form.evolucao} onChange={e => setForm(p => ({ ...p, evolucao: e.target.value }))} /></div>
            <div><Label>Observações Gerais</Label><Textarea rows={2} value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} /></div>

            <div className="flex gap-2">
              {activeAtendimento ? (
                <>
                  <Button onClick={handleSave} disabled={saving} variant="outline" className="flex-1">
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Salvar Rascunho
                  </Button>
                  <Button onClick={handleFinalizarAtendimento} disabled={saving} className="flex-1 bg-success hover:bg-success/90 text-success-foreground">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Finalizar Atendimento
                  </Button>
                </>
              ) : (
                <Button onClick={handleSave} disabled={saving} className="w-full gradient-primary text-primary-foreground">
                  {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {editId ? 'Salvar Alterações' : 'Registrar Prontuário'}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card className="shadow-card border-0">
          <CardContent className="p-8 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhum prontuário encontrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <Card key={p.id} className="shadow-card border-0">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground">{p.paciente_nome}</p>
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                        {new Date(p.data_atendimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </span>
                      {p.hora_atendimento && (
                        <span className="text-xs text-muted-foreground">{p.hora_atendimento}</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Prof. {p.profissional_nome}{p.setor ? ` • ${p.setor}` : ''}
                    </p>
                    {p.queixa_principal && (
                      <p className="text-sm text-foreground mt-1 line-clamp-2">
                        <strong>QP:</strong> {p.queixa_principal}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {canEdit && (isProfissional ? p.profissional_id === user?.id : true) && (
                      <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => handlePrint(p)}>
                      <Printer className="w-4 h-4" />
                    </Button>
                    {canDelete && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir prontuário?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Excluir o prontuário de {p.paciente_nome} ({new Date(p.data_atendimento + 'T12:00:00').toLocaleDateString('pt-BR')})? Esta ação será registrada em log de auditoria.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(p)} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div ref={printRef} className="hidden" />
    </div>
  );
};

export default ProntuarioPage;
