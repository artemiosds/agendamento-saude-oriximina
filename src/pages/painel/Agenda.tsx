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
import { Label } from '@/components/ui/label';
import { Plus, ChevronLeft, ChevronRight, Check, X, Clock, UserCheck, RotateCcw, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const statusActions = [
  { key: 'confirmado', label: 'Chegou', icon: Check, color: 'bg-success text-success-foreground' },
  { key: 'atraso', label: 'Atrasou', icon: Clock, color: 'bg-warning text-warning-foreground' },
  { key: 'falta', label: 'Faltou', icon: X, color: 'bg-destructive text-destructive-foreground' },
  { key: 'concluido', label: 'Atendido', icon: UserCheck, color: 'bg-info text-info-foreground' },
  { key: 'remarcado', label: 'Remarcou', icon: RotateCcw, color: 'bg-muted text-muted-foreground' },
] as const;

const statusLabels: Record<string, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  cancelado: 'Cancelado',
  concluido: 'Concluído',
  falta: 'Falta',
  atraso: 'Atraso',
  remarcado: 'Remarcado',
  em_atendimento: 'Em Atendimento',
};

const Agenda: React.FC = () => {
  const { agendamentos, updateAgendamento, pacientes, funcionarios, unidades, salas, addAgendamento, configuracoes, addAtendimento } = useData();
  const { user } = useAuth();
  const gcal = useGoogleCalendar();
  const { notify } = useWebhookNotify();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterUnit, setFilterUnit] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newAg, setNewAg] = useState({ pacienteId: '', profissionalId: '', salaId: '', hora: '', tipo: 'Consulta', obs: '' });

  const isProfissional = user?.role === 'profissional';

  // Filter appointments based on role
  const filtered = agendamentos.filter(a => {
    if (a.data !== selectedDate) return false;
    if (filterUnit !== 'all' && a.unidadeId !== filterUnit) return false;
    // Professionals see only their own appointments
    if (isProfissional && user && a.profissionalId !== user.id) return false;
    // Coordenador sees only their unit
    if (user?.role === 'coordenador' && user.unidadeId && a.unidadeId !== user.unidadeId) return false;
    // Recepcao sees only their unit
    if (user?.role === 'recepcao' && user.unidadeId && a.unidadeId !== user.unidadeId) return false;
    return true;
  }).sort((a, b) => a.hora.localeCompare(b.hora));

  const changeDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const profissionais = funcionarios.filter(f => f.role === 'profissional' && f.ativo);

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
      id: agId,
      pacienteId: pac.id,
      pacienteNome: pac.nome,
      unidadeId: prof.unidadeId,
      salaId: newAg.salaId,
      setorId: '',
      profissionalId: prof.id,
      profissionalNome: prof.nome,
      data: selectedDate,
      hora: newAg.hora,
      status: 'confirmado' as const,
      tipo: newAg.tipo,
      observacoes: newAg.obs,
      origem: 'recepcao' as const,
      criadoEm: new Date().toISOString(),
      criadoPor: 'current',
    };

    addAgendamento(agData);

    const googleEventId = await syncToGoogleCalendar({ ...agData, pacienteId: pac.id });
    if (googleEventId) {
      updateAgendamento(agId, { googleEventId, syncStatus: 'ok' });
      toast.success('Agendamento criado e sincronizado com Google Agenda!');
    } else {
      toast.success('Agendamento criado!');
    }

    notify({
      acao: 'novo_agendamento',
      nome: pac.nome,
      telefone: pac.telefone,
      email: pac.email,
      data: selectedDate,
      hora: newAg.hora,
      unidade: unidade?.nome || '',
      profissional: prof.nome,
      tipo_atendimento: newAg.tipo,
      observacoes: newAg.obs,
    });

    setDialogOpen(false);
    setNewAg({ pacienteId: '', profissionalId: '', salaId: '', hora: '', tipo: 'Consulta', obs: '' });
  };

  const handleStatusChange = async (agId: string, newStatus: string) => {
    const ag = agendamentos.find(a => a.id === agId);
    if (!ag) return;

    updateAgendamento(agId, { status: newStatus as any });

    const paciente = pacientes.find(p => p.id === ag.pacienteId || p.nome === ag.pacienteNome);
    const unidade = unidades.find(u => u.id === ag.unidadeId);

    if (newStatus === 'cancelado' || newStatus === 'remarcado') {
      notify({
        acao: newStatus === 'cancelado' ? 'cancelamento' : 'remarcacao',
        nome: ag.pacienteNome,
        telefone: paciente?.telefone || '',
        email: paciente?.email || '',
        data: ag.data,
        hora: ag.hora,
        unidade: unidade?.nome || '',
        profissional: ag.profissionalNome,
        tipo_atendimento: ag.tipo,
      });
    }

    if (ag.googleEventId) {
      try {
        if (newStatus === 'cancelado' && configuracoes.googleCalendar.removerCancelar) {
          await gcal.deleteEvent(ag.googleEventId);
          updateAgendamento(agId, { syncStatus: 'ok' });
          toast.success('Evento removido do Google Agenda.');
        } else if (newStatus === 'remarcado' && configuracoes.googleCalendar.atualizarRemarcar) {
          toast.info('Remarcação registrada. Atualize a data/hora e o evento será atualizado.');
        }
      } catch (err) {
        console.error('Google Calendar sync error:', err);
        updateAgendamento(agId, { syncStatus: 'erro' });
      }
    }
  };

  const handleIniciarAtendimento = async (ag: typeof agendamentos[0]) => {
    const now = new Date();
    const horaInicio = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Update agendamento status
    updateAgendamento(ag.id, { status: 'em_atendimento' });

    // Create atendimento record in DB
    try {
      await (supabase as any).from('atendimentos').insert({
        agendamento_id: ag.id,
        paciente_id: ag.pacienteId,
        paciente_nome: ag.pacienteNome,
        profissional_id: ag.profissionalId,
        profissional_nome: ag.profissionalNome,
        unidade_id: ag.unidadeId,
        sala_id: ag.salaId || '',
        setor: user?.setor || '',
        procedimento: ag.tipo,
        data: ag.data,
        hora_inicio: horaInicio,
        status: 'em_atendimento',
      });
    } catch (err) {
      console.error('Error creating atendimento:', err);
    }

    // Also add to in-memory context
    addAtendimento({
      id: `at${Date.now()}`,
      agendamentoId: ag.id,
      pacienteId: ag.pacienteId,
      pacienteNome: ag.pacienteNome,
      profissionalId: ag.profissionalId,
      profissionalNome: ag.profissionalNome,
      unidadeId: ag.unidadeId,
      salaId: ag.salaId,
      setor: user?.setor || '',
      procedimento: ag.tipo,
      observacoes: '',
      data: ag.data,
      horaInicio,
      horaFim: '',
      status: 'em_atendimento',
    });

    toast.success('Atendimento iniciado!');

    // Navigate to prontuário with pre-filled data
    const params = new URLSearchParams({
      pacienteId: ag.pacienteId,
      pacienteNome: ag.pacienteNome,
      agendamentoId: ag.id,
      horaInicio,
      data: ag.data,
    });
    navigate(`/painel/prontuario?${params.toString()}`);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Agenda</h1>
          <p className="text-muted-foreground text-sm">
            {isProfissional ? 'Seus agendamentos' : 'Gerenciar agendamentos'}
          </p>
        </div>
        {!isProfissional && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground">
                <Plus className="w-4 h-4 mr-2" /> Novo Agendamento
              </Button>
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Horário</Label>
                    <Input type="time" value={newAg.hora} onChange={e => setNewAg(p => ({ ...p, hora: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Tipo</Label>
                    <Select value={newAg.tipo} onValueChange={v => setNewAg(p => ({ ...p, tipo: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Consulta">Consulta</SelectItem>
                        <SelectItem value="Retorno">Retorno</SelectItem>
                        <SelectItem value="Exame">Exame</SelectItem>
                        <SelectItem value="Procedimento">Procedimento</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={handleCreate} className="w-full gradient-primary text-primary-foreground">Agendar</Button>
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

      {/* Appointments list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <Card className="shadow-card border-0"><CardContent className="p-8 text-center text-muted-foreground">Nenhum agendamento para esta data.</CardContent></Card>
        ) : filtered.map(ag => {
          const canStart = isProfissional && (ag.status === 'confirmado' || ag.status === 'pendente') && ag.data === new Date().toISOString().split('T')[0];
          const isEmAtendimento = ag.status === 'em_atendimento';

          return (
            <Card key={ag.id} className={cn('shadow-card border-0', isEmAtendimento && 'ring-2 ring-primary/50')}>
              <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <span className="text-lg font-mono font-bold text-primary w-16 shrink-0">{ag.hora}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">{ag.pacienteNome}</p>
                  <p className="text-sm text-muted-foreground">{ag.profissionalNome} • {ag.tipo}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium shrink-0",
                    ag.status === 'confirmado' ? 'bg-success/10 text-success' :
                    ag.status === 'pendente' ? 'bg-warning/10 text-warning' :
                    ag.status === 'cancelado' ? 'bg-destructive/10 text-destructive' :
                    ag.status === 'concluido' ? 'bg-info/10 text-info' :
                    ag.status === 'em_atendimento' ? 'bg-primary/10 text-primary' :
                    'bg-muted text-muted-foreground'
                  )}>
                    {statusLabels[ag.status] || ag.status}
                  </span>
                  {ag.googleEventId && (
                    <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium",
                      ag.syncStatus === 'ok' ? 'bg-success/10 text-success' :
                      ag.syncStatus === 'erro' ? 'bg-destructive/10 text-destructive' :
                      'bg-warning/10 text-warning'
                    )}>
                      📅
                    </span>
                  )}
                </div>

                <div className="flex gap-1 flex-wrap">
                  {/* Iniciar Atendimento button for professionals */}
                  {canStart && (
                    <Button
                      size="sm"
                      className="h-8 px-3 text-xs gradient-primary text-primary-foreground"
                      onClick={() => handleIniciarAtendimento(ag)}
                    >
                      <Play className="w-3.5 h-3.5 mr-1" /> Iniciar
                    </Button>
                  )}

                  {isEmAtendimento && isProfissional && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-3 text-xs"
                      onClick={() => {
                        const params = new URLSearchParams({
                          pacienteId: ag.pacienteId,
                          pacienteNome: ag.pacienteNome,
                          agendamentoId: ag.id,
                          data: ag.data,
                        });
                        navigate(`/painel/prontuario?${params.toString()}`);
                      }}
                    >
                      <Clock className="w-3.5 h-3.5 mr-1" /> Continuar
                    </Button>
                  )}

                  {/* Status action buttons (for non-em_atendimento, non-concluido) */}
                  {!isEmAtendimento && ag.status !== 'concluido' && !isProfissional && statusActions.map(sa => (
                    <Button
                      key={sa.key}
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleStatusChange(ag.id, sa.key)}
                      title={sa.label}
                    >
                      <sa.icon className="w-3.5 h-3.5" />
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default Agenda;
