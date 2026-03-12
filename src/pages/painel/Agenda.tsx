import React, { useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { useWebhookNotify } from '@/hooks/useWebhookNotify';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, ChevronLeft, ChevronRight, Check, X, Clock, UserCheck, RotateCcw, Play, LogIn, Trash2, RefreshCw, CalendarOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useFilaAutomatica } from '@/hooks/useFilaAutomatica';
import { useEnsurePortalAccess } from '@/hooks/useEnsurePortalAccess';

const statusActions = [
  { key: 'confirmado_chegada', label: 'Confirmar Chegada', icon: LogIn, color: 'bg-success text-success-foreground' },
  { key: 'atraso', label: 'Atrasou', icon: Clock, color: 'bg-warning text-warning-foreground' },
  { key: 'falta', label: 'Faltou', icon: X, color: 'bg-destructive text-destructive-foreground' },
  { key: 'concluido', label: 'Atendido', icon: UserCheck, color: 'bg-info text-info-foreground' },
  { key: 'remarcado', label: 'Remarcou', icon: RotateCcw, color: 'bg-muted text-muted-foreground' },
] as const;

const statusLabels: Record<string, string> = {
  pendente: 'Pendente', confirmado: 'Confirmado', confirmado_chegada: 'Chegou',
  cancelado: 'Cancelado', concluido: 'Concluído', falta: 'Falta', atraso: 'Atraso',
  remarcado: 'Remarcado', em_atendimento: 'Em Atendimento', aguardando_triagem: 'Aguard. Triagem',
  aguardando_atendimento: 'Aguard. Atendimento',
};

const statusBadgeClass: Record<string, string> = {
  pendente: 'bg-warning/10 text-warning',
  confirmado: 'bg-success/10 text-success',
  confirmado_chegada: 'bg-emerald-500/10 text-emerald-600',
  cancelado: 'bg-destructive/10 text-destructive',
  concluido: 'bg-info/10 text-info',
  falta: 'bg-destructive/10 text-destructive',
  atraso: 'bg-warning/10 text-warning',
  remarcado: 'bg-muted text-muted-foreground',
  em_atendimento: 'bg-primary/10 text-primary',
  aguardando_triagem: 'bg-warning/10 text-warning',
  aguardando_atendimento: 'bg-emerald-500/10 text-emerald-600',
};

const tipoBadge: Record<string, { label: string; class: string }> = {
  Consulta: { label: '1ª Consulta', class: 'bg-primary/10 text-primary' },
  Retorno: { label: 'Retorno', class: 'bg-accent/80 text-accent-foreground' },
  Exame: { label: 'Exame', class: 'bg-info/10 text-info' },
  Procedimento: { label: 'Procedimento', class: 'bg-warning/10 text-warning' },
};

const Agenda: React.FC = () => {
const { agendamentos, updateAgendamento, pacientes, funcionarios, unidades, salas, addAgendamento, configuracoes, addAtendimento, logAction, refreshAgendamentos, fila, disponibilidades, getAvailableSlots, getAvailableDates, bloqueios } = useData();
  const { user, hasPermission } = useAuth();
  const gcal = useGoogleCalendar();
  const { notify } = useWebhookNotify();
  const { handleVagaLiberada } = useFilaAutomatica();
  const { ensurePortalAccess } = useEnsurePortalAccess();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterUnit, setFilterUnit] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [retornoDialogOpen, setRetornoDialogOpen] = useState(false);
  const [retornoAg, setRetornoAg] = useState<{ pacienteId: string; pacienteNome: string } | null>(null);
  const [retornoForm, setRetornoForm] = useState({ data: '', hora: '' });
  const [newAg, setNewAg] = useState({ pacienteId: '', profissionalId: '', salaId: '', hora: '', tipo: 'Consulta', obs: '' });

  const isProfissional = user?.role === 'profissional';
  const canRetorno = isProfissional && user?.podeAgendarRetorno === true;
  const profissionais = funcionarios.filter(f => f.role === 'profissional' && f.ativo);

  // Check if selected date is blocked
  const blockedForDate = React.useMemo(() => {
    const dateRef = new Date(`${selectedDate}T00:00:00`).getTime();
    return bloqueios.filter(b => {
      const ini = new Date(`${b.dataInicio}T00:00:00`).getTime();
      const fim = new Date(`${b.dataFim}T00:00:00`).getTime();
      return dateRef >= ini && dateRef <= fim && b.diaInteiro;
    });
  }, [selectedDate, bloqueios]);

  // Check if selected date is a weekend without availability
  const weekendInfo = React.useMemo(() => {
    const dateObj = new Date(`${selectedDate}T12:00:00`);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (!isWeekend) return { isWeekend: false, hasAvailability: true };
    // Check if any professional has availability for this day of week on this date
    const hasAvailability = disponibilidades.some(d => 
      d.diasSemana.includes(dayOfWeek) && selectedDate >= d.dataInicio && selectedDate <= d.dataFim
    );
    return { isWeekend, hasAvailability };
  }, [selectedDate, disponibilidades]);

  // Available slots for new appointment dialog (internal)
  const newAgSlots = React.useMemo(() => {
    if (!newAg.profissionalId) return [];
    const prof = profissionais.find(p => p.id === newAg.profissionalId);
    if (!prof?.unidadeId) return [];
    return getAvailableSlots(newAg.profissionalId, prof.unidadeId, selectedDate);
  }, [newAg.profissionalId, selectedDate, profissionais, getAvailableSlots]);

  // Available dates/slots for retorno dialog
  const retornoAvailableDates = React.useMemo(() => {
    if (!user || !retornoDialogOpen) return [];
    return getAvailableDates(user.id, user.unidadeId);
  }, [user, retornoDialogOpen, getAvailableDates]);

  const retornoAvailableSlots = React.useMemo(() => {
    if (!user || !retornoForm.data) return [];
    return getAvailableSlots(user.id, user.unidadeId, retornoForm.data);
  }, [user, retornoForm.data, getAvailableSlots]);

  const filtered = agendamentos.filter(a => {
    if (a.data !== selectedDate) return false;
    if (filterUnit !== 'all' && a.unidadeId !== filterUnit) return false;
    if (isProfissional && user) {
      if (a.profissionalId !== user.id) return false;
    }
    if (user?.role === 'coordenador' && user.unidadeId && a.unidadeId !== user.unidadeId) return false;
    if (user?.role === 'recepcao' && user.unidadeId && a.unidadeId !== user.unidadeId) return false;
    return true;
  }).sort((a, b) => a.hora.localeCompare(b.hora));

  const changeDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const syncToGoogleCalendar = async (ag: { pacienteNome: string; profissionalNome: string; data: string; hora: string; tipo: string; unidadeId: string; pacienteId?: string }) => {
    if (!configuracoes.googleCalendar.conectado || !configuracoes.googleCalendar.criarEvento) return null;
    try {
      const unidade = unidades.find(u => u.id === ag.unidadeId);
      const paciente = pacientes.find(p => p.nome === ag.pacienteNome || p.id === ag.pacienteId);
      const startDateTime = `${ag.data}T${ag.hora}:00`;
      const [h, m] = ag.hora.split(':').map(Number);
      const endH = m + 30 >= 60 ? h + 1 : h;
      const endM = (m + 30) % 60;
      const endDateTime = `${ag.data}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`;

      const description = [
        `Paciente: ${ag.pacienteNome}`,
        paciente?.telefone ? `Telefone: ${paciente.telefone}` : '',
        paciente?.email ? `E-mail: ${paciente.email}` : '',
        `Profissional: ${ag.profissionalNome}`,
        `Tipo: ${ag.tipo}`,
        unidade ? `Unidade: ${unidade.nome}` : '',
      ].filter(Boolean).join('\n');

      const attendees = paciente?.email ? [{ email: paciente.email }] : undefined;

      const result = await gcal.createEvent({
        summary: `${ag.tipo} - ${ag.pacienteNome}`,
        description,
        start: { dateTime: startDateTime, timeZone: 'America/Belem' },
        end: { dateTime: endDateTime, timeZone: 'America/Belem' },
        attendees,
      });
      return result?.eventId || null;
    } catch (err) {
      console.error('Google Calendar sync failed:', err);
      return null;
    }
  };

  const handleCreate = async () => {
    const pac = pacientes.find(p => p.id === newAg.pacienteId);
    const prof = profissionais.find(p => p.id === newAg.profissionalId);
    if (!pac || !prof || !newAg.hora) return;

    const unidade = unidades.find(u => u.id === prof.unidadeId);
    const agId = `ag${Date.now()}`;
    const agData = {
      id: agId, pacienteId: pac.id, pacienteNome: pac.nome,
      unidadeId: prof.unidadeId, salaId: newAg.salaId, setorId: '',
      profissionalId: prof.id, profissionalNome: prof.nome,
      data: selectedDate, hora: newAg.hora, status: 'confirmado' as const, tipo: newAg.tipo,
      observacoes: newAg.obs, origem: 'recepcao' as const,
      criadoEm: new Date().toISOString(), criadoPor: 'current',
    };

    await addAgendamento(agData);

    // Ensure patient has portal access
    const unidadeNome = unidade?.nome || '';
    ensurePortalAccess({
      pacienteId: pac.id,
      contexto: 'agendamento',
      data: selectedDate,
      hora: newAg.hora,
      unidade: unidadeNome,
      profissional: prof.nome,
      tipo: newAg.tipo,
    }).then(result => {
      if (result.created) toast.info(`Acesso ao portal criado para ${pac.nome}. ${result.emailSent ? 'E-mail enviado.' : ''}`);
    }).catch(() => {});

    const googleEventId = await syncToGoogleCalendar({ ...agData, pacienteId: pac.id });
    if (googleEventId) {
      await updateAgendamento(agId, { googleEventId, syncStatus: 'ok' });
      toast.success('Agendamento criado e sincronizado com Google Agenda!');
    } else {
      toast.success('Agendamento criado!');
    }

    // Enviar notificação (aguardar para garantir que complete)
    await notify({
      evento: 'novo_agendamento', paciente_nome: pac.nome, telefone: pac.telefone,
      email: pac.email, data_consulta: selectedDate, hora_consulta: newAg.hora,
      unidade: unidade?.nome || '', profissional: prof.nome,
      tipo_atendimento: newAg.tipo, status_agendamento: 'confirmado',
      id_agendamento: agId, observacoes: newAg.obs,
    });

    setDialogOpen(false);
    setNewAg({ pacienteId: '', profissionalId: '', salaId: '', hora: '', tipo: 'Consulta', obs: '' });
  };

  const handleStatusChange = async (agId: string, newStatus: string) => {
    const ag = agendamentos.find(a => a.id === agId);
    if (!ag) return;

    // Check if triage is needed when confirming arrival
    if (newStatus === 'confirmado_chegada') {
      try {
        const { data: setting } = await (supabase as any)
          .from('triage_settings')
          .select('enabled')
          .or(`unidade_id.eq.${ag.unidadeId},unidade_id.is.null`)
          .eq('enabled', true)
          .limit(1)
          .maybeSingle();

        if (setting) {
          // Check if there's a tecnico in the unit
          const { count } = await supabase.from('funcionarios')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'tecnico')
            .eq('unidade_id', ag.unidadeId)
            .eq('ativo', true);

          if ((count ?? 0) > 0) {
            await updateAgendamento(agId, { status: 'aguardando_triagem' as any });
            toast.success(`Chegada de ${ag.pacienteNome} confirmada! Encaminhado para triagem.`);
            return;
          }
        }
      } catch (err) {
        console.error('Error checking triage settings:', err);
      }
    }

    await updateAgendamento(agId, { status: newStatus as any });

    const paciente = pacientes.find(p => p.id === ag.pacienteId || p.nome === ag.pacienteNome);
    const unidade = unidades.find(u => u.id === ag.unidadeId);

    if (newStatus === 'confirmado_chegada') {
      toast.success(`Chegada de ${ag.pacienteNome} confirmada!`);
    }

    // Notify for all relevant status changes
    const statusToEvento: Record<string, string> = {
      cancelado: 'cancelamento',
      remarcado: 'reagendamento',
      falta: 'nao_compareceu',
      confirmado: 'confirmacao',
      confirmado_chegada: 'confirmacao',
      concluido: 'atendimento_finalizado',
    };
    const evento = statusToEvento[newStatus];
    if (evento) {
      await notify({
        evento: evento as any,
        paciente_nome: ag.pacienteNome, telefone: paciente?.telefone || '',
        email: paciente?.email || '', data_consulta: ag.data, hora_consulta: ag.hora,
        unidade: unidade?.nome || '', profissional: ag.profissionalNome,
        tipo_atendimento: ag.tipo, status_agendamento: newStatus,
        id_agendamento: agId,
      });
    }

    if (newStatus === 'cancelado' || newStatus === 'falta') {
      await handleVagaLiberada({
        id: agId,
        data: ag.data,
        hora: ag.hora,
        profissionalId: ag.profissionalId,
        profissionalNome: ag.profissionalNome,
        unidadeId: ag.unidadeId,
        salaId: ag.salaId,
        tipo: ag.tipo,
      }, newStatus === 'cancelado' ? 'cancelamento' : 'falta', user);
    }

    if (ag.googleEventId) {
      try {
        if (newStatus === 'cancelado' && configuracoes.googleCalendar.removerCancelar) {
          await gcal.deleteEvent(ag.googleEventId);
          await updateAgendamento(agId, { syncStatus: 'ok' });
          toast.success('Evento removido do Google Agenda.');
        } else if (newStatus === 'remarcado' && configuracoes.googleCalendar.atualizarRemarcar) {
          toast.info('Remarcação registrada.');
        }
      } catch (err) {
        console.error('Google Calendar sync error:', err);
        await updateAgendamento(agId, { syncStatus: 'erro' });
      }
    }
  };

  const handleDeleteAgendamento = async (agId: string) => {
    try {
      await (supabase as any).from('agendamentos').delete().eq('id', agId);
      await logAction({
        acao: 'excluir', entidade: 'agendamento', entidadeId: agId,
        detalhes: { acao: 'exclusão de agendamento' }, user,
      });
      toast.success('Agendamento excluído!');
      await refreshAgendamentos();
    } catch (err) {
      console.error('Error deleting:', err);
      toast.error('Erro ao excluir agendamento.');
    }
  };

  const handleIniciarAtendimento = async (ag: typeof agendamentos[0]) => {
    // Backend validation first
    try {
      const { error: rpcError } = await supabase.rpc('iniciar_atendimento', {
        p_agendamento_id: ag.id,
        p_profissional_id: user?.id || '',
      });
      if (rpcError) {
        if (rpcError.message.includes('arrival_not_confirmed')) {
          toast.error('A chegada do paciente ainda não foi confirmada pela recepção.');
        } else if (rpcError.message.includes('not_authorized')) {
          toast.error('Você não tem permissão para este agendamento.');
        } else {
          toast.error('Não foi possível iniciar o atendimento.');
        }
        return;
      }
    } catch (err) {
      toast.error('Erro ao validar início do atendimento.');
      return;
    }

    const now = new Date();
    const horaInicio = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Save timer state in localStorage
    const timerState = {
      agendamentoId: ag.id,
      horaInicio,
      tempoLimite: user?.tempoAtendimento || 30,
      startTimestamp: Date.now(),
    };
    localStorage.setItem(`timer_${ag.id}`, JSON.stringify(timerState));

    // Status already updated by RPC, refresh local state
    await refreshAgendamentos();

    const pac = pacientes.find(p => p.id === ag.pacienteId);

    try {
      await (supabase as any).from('atendimentos').insert({
        agendamento_id: ag.id, paciente_id: ag.pacienteId,
        paciente_nome: ag.pacienteNome, profissional_id: ag.profissionalId,
        profissional_nome: ag.profissionalNome, unidade_id: ag.unidadeId,
        sala_id: ag.salaId || '', setor: user?.setor || '',
        procedimento: ag.tipo, data: ag.data, hora_inicio: horaInicio,
        status: 'em_atendimento',
      });
    } catch (err) {
      console.error('Error creating atendimento:', err);
    }

    addAtendimento({
      id: `at${Date.now()}`, agendamentoId: ag.id,
      pacienteId: ag.pacienteId, pacienteNome: ag.pacienteNome,
      profissionalId: ag.profissionalId, profissionalNome: ag.profissionalNome,
      unidadeId: ag.unidadeId, salaId: ag.salaId, setor: user?.setor || '',
      procedimento: ag.tipo, observacoes: '', data: ag.data,
      horaInicio, horaFim: '', status: 'em_atendimento',
    });

    // Log ATENDIMENTO_INICIADO
    await logAction({
      acao: 'atendimento_iniciado', entidade: 'atendimento', entidadeId: ag.id,
      modulo: 'atendimento', user,
      detalhes: {
        paciente_nome: ag.pacienteNome, paciente_cpf: pac?.cpf || '',
        hora_inicio: horaInicio, unidade: ag.unidadeId, sala: ag.salaId || '',
      },
    });

    toast.success('Atendimento iniciado!');

    const params = new URLSearchParams({
      pacienteId: ag.pacienteId, pacienteNome: ag.pacienteNome,
      agendamentoId: ag.id, horaInicio, data: ag.data,
    });
    navigate(`/painel/prontuario?${params.toString()}`);
  };

  const handleAgendarRetorno = async () => {
    if (!retornoAg || !retornoForm.data || !retornoForm.hora || !user) return;
    const agId = `ag${Date.now()}`;
    const pac = pacientes.find(p => p.id === retornoAg.pacienteId);
    const unidade = unidades.find(u => u.id === user.unidadeId);
    const agData = {
      id: agId, pacienteId: retornoAg.pacienteId, pacienteNome: retornoAg.pacienteNome,
      unidadeId: user.unidadeId, salaId: user.salaId || '', setorId: '',
      profissionalId: user.id, profissionalNome: user.nome,
      data: retornoForm.data, hora: retornoForm.hora, status: 'confirmado' as const,
      tipo: 'Retorno', observacoes: 'Retorno agendado pelo profissional',
      origem: 'recepcao' as const, criadoEm: new Date().toISOString(), criadoPor: user.id,
    };
    await addAgendamento(agData);
    await logAction({ acao: 'agendar_retorno', entidade: 'agendamento', entidadeId: agId, modulo: 'agendamento', detalhes: { paciente: retornoAg.pacienteNome, data: retornoForm.data, hora: retornoForm.hora }, user });

    // Notify patient
    if (pac) {
      await notify({
        evento: 'novo_agendamento', paciente_nome: pac.nome, telefone: pac.telefone,
        email: pac.email, data_consulta: retornoForm.data, hora_consulta: retornoForm.hora,
        unidade: unidade?.nome || '', profissional: user.nome,
        tipo_atendimento: 'Retorno', status_agendamento: 'confirmado',
        id_agendamento: agId, observacoes: 'Retorno agendado pelo profissional',
      });
      // Ensure portal access
      ensurePortalAccess({
        pacienteId: pac.id, contexto: 'agendamento',
        data: retornoForm.data, hora: retornoForm.hora,
        unidade: unidade?.nome || '', profissional: user.nome, tipo: 'Retorno',
      }).catch(() => {});
    }

    toast.success('Retorno agendado com sucesso!');
    setRetornoDialogOpen(false);
    setRetornoAg(null);
    setRetornoForm({ data: '', hora: '' });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Agenda</h1>
          <p className="text-muted-foreground text-sm">
            {isProfissional ? 'Pacientes confirmados para atendimento' : 'Gerenciar agendamentos'}
          </p>
        </div>
        {!isProfissional && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-2" /> Novo Agendamento</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle className="font-display">Novo Agendamento</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Paciente</Label>
                  <Select value={newAg.pacienteId} onValueChange={v => setNewAg(p => ({ ...p, pacienteId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{pacientes.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Profissional</Label>
                  <Select value={newAg.profissionalId} onValueChange={v => setNewAg(p => ({ ...p, profissionalId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{profissionais.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Sala</Label>
                  <Select value={newAg.salaId} onValueChange={v => setNewAg(p => ({ ...p, salaId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{salas.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={newAg.tipo} onValueChange={v => setNewAg(p => ({ ...p, tipo: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Consulta">Primeira Consulta</SelectItem>
                      <SelectItem value="Retorno">Retorno</SelectItem>
                      <SelectItem value="Exame">Exame</SelectItem>
                      <SelectItem value="Procedimento">Procedimento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Horário Disponível</Label>
                  {newAgSlots.length === 0 ? (
                    <p className="text-sm text-warning mt-1">
                      {!newAg.profissionalId ? 'Selecione um profissional.' : 'Não há horários disponíveis para hoje. Selecione outro dia.'}
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      {newAgSlots.map(slot => (
                        <Button key={slot} variant={newAg.hora === slot ? 'default' : 'outline'}
                          className={newAg.hora === slot ? 'gradient-primary text-primary-foreground' : ''}
                          size="sm" onClick={() => setNewAg(p => ({ ...p, hora: slot }))}>{slot}</Button>
                      ))}
                    </div>
                  )}
                </div>
                <Button onClick={handleCreate} className="w-full gradient-primary text-primary-foreground" disabled={!newAg.hora || !newAg.pacienteId || !newAg.profissionalId}>Agendar</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="icon" onClick={() => changeDate(-1)}><ChevronLeft className="w-4 h-4" /></Button>
        <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-auto" />
        <Button variant="outline" size="icon" onClick={() => changeDate(1)}><ChevronRight className="w-4 h-4" /></Button>
        {!isProfissional && (
          <Select value={filterUnit} onValueChange={setFilterUnit}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Unidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Unidades</SelectItem>
              {unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Blocked date indicator */}
      {blockedForDate.length > 0 && (
        <Card className="shadow-card border-0 bg-destructive/5 ring-1 ring-destructive/20">
          <CardContent className="p-4 flex items-center gap-3">
            <CalendarOff className="w-5 h-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-semibold text-destructive">🚫 Data bloqueada para agendamentos</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {blockedForDate.map(b => b.titulo).join(' • ')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weekend indicator */}
      {weekendInfo.isWeekend && !weekendInfo.hasAvailability && (
        <Card className="shadow-card border-0 bg-destructive/5 ring-1 ring-destructive/20">
          <CardContent className="p-4 flex items-center gap-3">
            <CalendarOff className="w-5 h-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-semibold text-destructive">🔴 Fim de semana — sem atendimento</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Nenhum profissional possui disponibilidade cadastrada para este dia.
                {user && ['master', 'coordenador'].includes(user.role) && (
                  <span className="block mt-1 text-warning">Master/Coordenador pode forçar encaixe ao criar agendamento.</span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {weekendInfo.isWeekend && weekendInfo.hasAvailability && (
        <Card className="shadow-card border-0 bg-orange-50 ring-1 ring-orange-300 dark:bg-orange-500/10 dark:ring-orange-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <Calendar className="w-5 h-5 text-orange-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">🟠 Fim de semana — com atendimento disponível</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Há profissionais com disponibilidade cadastrada para este dia.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Appointments list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <Card className="shadow-card border-0"><CardContent className="p-8 text-center text-muted-foreground">
            {isProfissional ? 'Nenhum paciente confirmado pela recepção para esta data.' : 'Nenhum agendamento para esta data.'}
          </CardContent></Card>
        ) : filtered.map(ag => {
          const ehHoje = ag.data === new Date().toISOString().split('T')[0];
          const canStart = isProfissional && (ag.status === 'confirmado_chegada' || ag.status === 'aguardando_atendimento') && ehHoje;
          const isEmAtendimento = ag.status === 'em_atendimento';
          const tipoInfo = tipoBadge[ag.tipo] || { label: ag.tipo, class: 'bg-muted text-muted-foreground' };
          const paciente = pacientes.find(p => p.id === ag.pacienteId);

          return (
            <Card key={ag.id} className={cn('shadow-card border-0', isEmAtendimento && 'ring-2 ring-primary/50')}>
              <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <span className="text-lg font-mono font-bold text-primary w-16 shrink-0">{ag.hora}</span>
                <div className="flex-1 min-w-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="font-semibold text-foreground cursor-default">{ag.pacienteNome}</p>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-xs"><strong>Paciente:</strong> {ag.pacienteNome}</p>
                      {paciente?.telefone && <p className="text-xs"><strong>Tel:</strong> {paciente.telefone}</p>}
                      {paciente?.cpf && <p className="text-xs"><strong>CPF:</strong> {paciente.cpf}</p>}
                      <p className="text-xs"><strong>Tipo:</strong> {tipoInfo.label}</p>
                      <p className="text-xs"><strong>Origem:</strong> {ag.origem}</p>
                    </TooltipContent>
                  </Tooltip>
                  <p className="text-sm text-muted-foreground">{ag.profissionalNome}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Tipo badge */}
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", tipoInfo.class)}>
                    {tipoInfo.label}
                  </span>
                  {/* Status badge */}
                  <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium shrink-0",
                    statusBadgeClass[ag.status] || 'bg-muted text-muted-foreground'
                  )}>
                    {statusLabels[ag.status] || ag.status}
                  </span>
                  {ag.googleEventId && (
                    <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium",
                      ag.syncStatus === 'ok' ? 'bg-success/10 text-success' :
                      ag.syncStatus === 'erro' ? 'bg-destructive/10 text-destructive' :
                      'bg-warning/10 text-warning'
                    )}>📅</span>
                  )}
                </div>

                <div className="flex gap-1 flex-wrap">
                  {/* Professional status-based action buttons */}
                  {isProfissional && (
                    <>
                      {(ag.status === 'pendente' || ag.status === 'confirmado') && ehHoje && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-8 px-3 text-xs cursor-not-allowed opacity-50" disabled>
                              ⏳ Aguardando chegada
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Aguardando confirmação de chegada pela recepção</TooltipContent>
                        </Tooltip>
                      )}
                      {ag.status === 'aguardando_triagem' && ehHoje && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline" className="h-8 px-3 text-xs cursor-not-allowed opacity-50 border-warning text-warning" disabled>
                              🩺 Em triagem
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Aguardando técnico de enfermagem concluir a triagem</TooltipContent>
                        </Tooltip>
                      )}
                      {canStart && (
                        <Button size="sm" className="h-8 px-3 text-xs bg-success text-success-foreground hover:bg-success/90" onClick={() => handleIniciarAtendimento(ag)}>
                          <Play className="w-3.5 h-3.5 mr-1" /> Iniciar atendimento
                        </Button>
                      )}
                      {isEmAtendimento && (
                        <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => {
                          const params = new URLSearchParams({
                            pacienteId: ag.pacienteId, pacienteNome: ag.pacienteNome,
                            agendamentoId: ag.id, data: ag.data,
                          });
                          navigate(`/painel/prontuario?${params.toString()}`);
                        }}>
                          <Clock className="w-3.5 h-3.5 mr-1" /> Continuar
                        </Button>
                      )}
                      {ag.status === 'concluido' && (
                        <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => {
                          const params = new URLSearchParams({
                            pacienteId: ag.pacienteId, pacienteNome: ag.pacienteNome,
                            agendamentoId: ag.id, data: ag.data,
                          });
                          navigate(`/painel/prontuario?${params.toString()}`);
                        }}>
                          ✅ Ver prontuário
                        </Button>
                      )}
                      {(ag.status === 'falta' || ag.status === 'cancelado') && (
                        <span className="text-xs text-muted-foreground px-2 py-1">
                          {ag.status === 'falta' ? 'Faltou' : 'Cancelado'}
                        </span>
                      )}
                      {!ehHoje && !['falta', 'cancelado', 'concluido'].includes(ag.status) && (
                        <span className="text-xs text-muted-foreground px-2 py-1">
                          📅 Agendado para {new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </span>
                      )}
                    </>
                  )}
                  {/* Retorno button for authorized professionals */}
                  {canRetorno && ag.status === 'concluido' && (
                    <Button size="sm" variant="outline" className="h-8 px-3 text-xs border-accent text-accent-foreground" onClick={() => {
                      setRetornoAg({ pacienteId: ag.pacienteId, pacienteNome: ag.pacienteNome });
                      setRetornoForm({ data: '', hora: '' });
                      setRetornoDialogOpen(true);
                    }}>
                      <RotateCcw className="w-3.5 h-3.5 mr-1" /> Retorno
                    </Button>
                  )}
                  {!isProfissional && ag.status !== 'cancelado' && ag.status !== 'concluido' && (
                    statusActions.map(sa => (
                      <Button key={sa.key} size="sm" variant="outline" className={cn("h-8 px-2 text-xs", ag.status === sa.key && sa.color)}
                        onClick={() => handleStatusChange(ag.id, sa.key)} disabled={ag.status === sa.key}
                        title={sa.label}>
                        <sa.icon className="w-3.5 h-3.5" />
                      </Button>
                    ))
                  )}
                  {/* Delete button */}
                  {!isProfissional && user && ['master', 'coordenador', 'recepcao'].includes(user.role) && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-destructive" title="Excluir">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir agendamento?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja excluir o agendamento de {ag.pacienteNome} às {ag.hora}? Esta ação será registrada no log de auditoria.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteAgendamento(ag.id)} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Retorno Dialog */}
      <Dialog open={retornoDialogOpen} onOpenChange={setRetornoDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="font-display">Agendar Retorno</DialogTitle></DialogHeader>
          {retornoAg && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Paciente: <strong className="text-foreground">{retornoAg.pacienteNome}</strong></p>
              <div>
                <Label>Data</Label>
                {retornoAvailableDates.length === 0 ? (
                  <p className="text-sm text-warning mt-1">Não há datas disponíveis na sua agenda.</p>
                ) : (
                  <Select value={retornoForm.data} onValueChange={v => setRetornoForm(p => ({ ...p, data: v, hora: '' }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione a data" /></SelectTrigger>
                    <SelectContent>
                      {retornoAvailableDates.slice(0, 30).map(d => {
                        const dateObj = new Date(d + 'T12:00:00');
                        const label = dateObj.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
                        return <SelectItem key={d} value={d}>{label}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {retornoForm.data && (
                <div>
                  <Label>Horário</Label>
                  {retornoAvailableSlots.length === 0 ? (
                    <p className="text-sm text-warning mt-1">Não há horários disponíveis para esta data.</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      {retornoAvailableSlots.map(slot => (
                        <Button key={slot} variant={retornoForm.hora === slot ? 'default' : 'outline'}
                          className={retornoForm.hora === slot ? 'gradient-primary text-primary-foreground' : ''}
                          size="sm" onClick={() => setRetornoForm(p => ({ ...p, hora: slot }))}>{slot}</Button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <Button onClick={handleAgendarRetorno} disabled={!retornoForm.data || !retornoForm.hora} className="w-full gradient-primary text-primary-foreground">
                Confirmar Retorno
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Agenda;

