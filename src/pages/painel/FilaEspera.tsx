import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { useWebhookNotify } from '@/hooks/useWebhookNotify';
import { useFilaAutomatica } from '@/hooks/useFilaAutomatica';
import { useEnsurePortalAccess } from '@/hooks/useEnsurePortalAccess';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Bell, Play, CheckCircle, XCircle, Pencil, Trash2, UserPlus, Clock, Users, ArrowRight, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const prioridadeColors: Record<string, string> = {
  normal: 'bg-muted text-muted-foreground',
  alta: 'bg-warning/10 text-warning',
  urgente: 'bg-destructive/10 text-destructive',
  gestante: 'bg-pink-500/10 text-pink-600',
  idoso: 'bg-amber-500/10 text-amber-600',
  pcd: 'bg-blue-500/10 text-blue-600',
  crianca: 'bg-green-500/10 text-green-600',
};

const prioridadeLabel: Record<string, string> = {
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
  gestante: 'Gestante',
  idoso: 'Idoso 60+',
  pcd: 'PNE',
  crianca: 'Criança 0-12',
};

const statusLabels: Record<string, { label: string; color: string }> = {
  aguardando: { label: 'Aguardando', color: 'bg-warning/10 text-warning' },
  encaixado: { label: 'Encaixado', color: 'bg-primary/10 text-primary' },
  chamado: { label: 'Chamado', color: 'bg-info/10 text-info' },
  em_atendimento: { label: 'Em Atendimento', color: 'bg-success/10 text-success' },
  atendido: { label: 'Atendido', color: 'bg-muted text-muted-foreground' },
  falta: { label: 'Faltou', color: 'bg-destructive/10 text-destructive' },
  cancelado: { label: 'Cancelado', color: 'bg-muted text-muted-foreground' },
};

interface ReservaInfo {
  filaId: string;
  slot: {
    data: string;
    hora: string;
    profissionalId: string;
    profissionalNome: string;
    unidadeId: string;
    salaId?: string;
    tipo?: string;
  };
  expiresAt: number;
}

const FilaEspera: React.FC = () => {
  const { fila, addToFila, updateFila, removeFromFila, pacientes, funcionarios, unidades } = useData();
  const { user, hasPermission } = useAuth();
  const { notify } = useWebhookNotify();
  const { chamarProximoDaFila, confirmarEncaixe, expirarReserva, getNextInQueue } = useFilaAutomatica();
  const canManage = hasPermission(['master', 'coordenador', 'recepcao', 'gestao']);
  const profissionais = funcionarios.filter(f => f.role === 'profissional' && f.ativo);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterUnidade, setFilterUnidade] = useState('all');
  const [filterProf, setFilterProf] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [reservas, setReservas] = useState<Record<string, ReservaInfo>>({});
  const [now, setNow] = useState(Date.now());

  const [form, setForm] = useState({
    pacienteNome: '', pacienteId: '', unidadeId: '', profissionalId: '',
    setor: '', prioridade: 'normal' as string, observacoes: '',
  });

  // Load reservations from localStorage and tick timer
  useEffect(() => {
    const loadReservas = () => {
      const loaded: Record<string, ReservaInfo> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('fila_reserva_')) {
          try {
            const val = JSON.parse(localStorage.getItem(key)!);
            loaded[val.filaId] = val;
          } catch { /* ignore */ }
        }
      }
      setReservas(loaded);
    };
    loadReservas();
    const interval = setInterval(() => {
      setNow(Date.now());
      loadReservas();
    }, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, []);

  // Check for expired reservations
  useEffect(() => {
    Object.values(reservas).forEach(async (r) => {
      if (r.expiresAt <= now) {
        const filaItem = fila.find(f => f.id === r.filaId && f.status === 'chamado');
        if (filaItem) {
          await expirarReserva(r.filaId, r.slot, user);
        } else {
          localStorage.removeItem(`fila_reserva_${r.filaId}`);
        }
      }
    });
  }, [now, reservas, fila, expirarReserva, user]);

  const filteredFila = useMemo(() => {
    return [...fila]
      .filter(f => filterUnidade === 'all' || f.unidadeId === filterUnidade)
      .filter(f => filterProf === 'all' || f.profissionalId === filterProf)
      .filter(f => filterStatus === 'all' || f.status === filterStatus)
      .sort((a, b) => {
        const prioOrder: Record<string, number> = { urgente: 0, gestante: 1, idoso: 2, alta: 3, pcd: 4, crianca: 5, normal: 6 };
        if ((prioOrder[a.prioridade] ?? 6) !== (prioOrder[b.prioridade] ?? 6)) return (prioOrder[a.prioridade] ?? 6) - (prioOrder[b.prioridade] ?? 6);
        return a.horaChegada.localeCompare(b.horaChegada);
      });
  }, [fila, filterUnidade, filterProf, filterStatus]);

  const aguardandoCount = fila.filter(f => f.status === 'aguardando').length;
  const chamadoCount = fila.filter(f => f.status === 'chamado').length;

  const openNew = () => {
    setEditId(null);
    setForm({ pacienteNome: '', pacienteId: '', unidadeId: '', profissionalId: '', setor: '', prioridade: 'normal', observacoes: '' });
    setDialogOpen(true);
  };

  const openEdit = (f: typeof fila[0]) => {
    setEditId(f.id);
    setForm({
      pacienteNome: f.pacienteNome, pacienteId: f.pacienteId, unidadeId: f.unidadeId,
      profissionalId: f.profissionalId || '', setor: f.setor, prioridade: f.prioridade, observacoes: f.observacoes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.pacienteNome || !form.unidadeId) {
      toast.error('Informe o paciente e a unidade.');
      return;
    }

    if (editId) {
      await updateFila(editId, { ...form, prioridade: form.prioridade as any });
      toast.success('Registro atualizado!');
    } else {
      await addToFila({
        id: `f${Date.now()}`, ...form,
        prioridade: form.prioridade as any,
        status: 'aguardando', posicao: fila.length + 1,
        horaChegada: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        criadoPor: user?.id || 'sistema',
      });
      const pac = pacientes.find(p => p.id === form.pacienteId);
      const unidade = unidades.find(u => u.id === form.unidadeId);
      const prof = form.profissionalId ? funcionarios.find(f => f.id === form.profissionalId) : null;
      await notify({
        evento: 'fila_entrada',
        paciente_nome: form.pacienteNome, telefone: pac?.telefone || '',
        email: pac?.email || '', data_consulta: new Date().toISOString().split('T')[0],
        hora_consulta: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        unidade: unidade?.nome || '', profissional: prof?.nome || '',
        tipo_atendimento: 'Fila de Espera', status_agendamento: 'aguardando',
        id_agendamento: '',
      });
      toast.success('Paciente adicionado à fila!');
    }
    setDialogOpen(false);
  };

  const getReservaTimeLeft = (filaId: string) => {
    const r = reservas[filaId];
    if (!r) return null;
    const remaining = Math.max(0, r.expiresAt - now);
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return { minutes, seconds, slot: r.slot, expired: remaining <= 0 };
  };

  // Manual call for next in queue dialog
  const [manualCallDialog, setManualCallDialog] = useState(false);
  const [manualSlot, setManualSlot] = useState({ data: new Date().toISOString().split('T')[0], hora: '', profissionalId: '', unidadeId: '' });

  const handleManualCall = async () => {
    if (!manualSlot.hora || !manualSlot.profissionalId || !manualSlot.unidadeId) {
      toast.error('Preencha todos os campos.');
      return;
    }
    const prof = funcionarios.find(f => f.id === manualSlot.profissionalId);
    await chamarProximoDaFila({
      data: manualSlot.data,
      hora: manualSlot.hora,
      profissionalId: manualSlot.profissionalId,
      profissionalNome: prof?.nome || '',
      unidadeId: manualSlot.unidadeId,
    }, user);
    setManualCallDialog(false);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Fila de Espera</h1>
          <p className="text-muted-foreground text-sm">
            {aguardandoCount} aguardando {chamadoCount > 0 && `• ${chamadoCount} chamado(s)`}
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <>
              <Button variant="outline" onClick={() => {
                setManualSlot({ data: new Date().toISOString().split('T')[0], hora: '', profissionalId: '', unidadeId: '' });
                setManualCallDialog(true);
              }}>
                <ArrowRight className="w-4 h-4 mr-2" />Chamar Próximo da Fila
              </Button>
              <Button onClick={openNew} className="gradient-primary text-primary-foreground">
                <UserPlus className="w-4 h-4 mr-2" />Adicionar à Fila
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Select value={filterUnidade} onValueChange={setFilterUnidade}>
          <SelectTrigger><SelectValue placeholder="Unidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Unidades</SelectItem>
            {unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterProf} onValueChange={setFilterProf}>
          <SelectTrigger><SelectValue placeholder="Profissional" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Profissionais</SelectItem>
            {profissionais.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            <SelectItem value="aguardando">Aguardando</SelectItem>
            <SelectItem value="encaixado">Encaixado</SelectItem>
            <SelectItem value="chamado">Chamado</SelectItem>
            <SelectItem value="em_atendimento">Em Atendimento</SelectItem>
            <SelectItem value="atendido">Atendido</SelectItem>
            <SelectItem value="falta">Faltou</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Manual Call Dialog */}
      <Dialog open={manualCallDialog} onOpenChange={setManualCallDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-display">Chamar Próximo da Fila</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Informe o horário da vaga disponível para chamar o próximo paciente elegível.</p>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Unidade *</Label>
              <Select value={manualSlot.unidadeId} onValueChange={v => setManualSlot(p => ({ ...p, unidadeId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Profissional *</Label>
              <Select value={manualSlot.profissionalId} onValueChange={v => setManualSlot(p => ({ ...p, profissionalId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{profissionais.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data</Label>
                <Input type="date" value={manualSlot.data} onChange={e => setManualSlot(p => ({ ...p, data: e.target.value }))} />
              </div>
              <div>
                <Label>Horário *</Label>
                <Input type="time" value={manualSlot.hora} onChange={e => setManualSlot(p => ({ ...p, hora: e.target.value }))} />
              </div>
            </div>
            {manualSlot.unidadeId && manualSlot.profissionalId && (
              <div className="p-3 rounded-lg bg-muted/50 text-sm">
                <p className="font-medium flex items-center gap-1"><Users className="w-4 h-4" /> Próximos na fila:</p>
                {getNextInQueue(manualSlot.profissionalId, manualSlot.unidadeId).slice(0, 3).map((f, i) => (
                  <p key={f.id} className="ml-5 text-muted-foreground">
                    {i + 1}. {f.pacienteNome} ({prioridadeLabel[f.prioridade] || f.prioridade})
                  </p>
                ))}
                {getNextInQueue(manualSlot.profissionalId, manualSlot.unidadeId).length === 0 && (
                  <p className="ml-5 text-muted-foreground italic">Nenhum paciente na fila</p>
                )}
              </div>
            )}
            <Button onClick={handleManualCall} className="w-full gradient-primary text-primary-foreground">
              <Bell className="w-4 h-4 mr-2" />Chamar Próximo
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-display">{editId ? 'Editar' : 'Adicionar à'} Fila de Espera</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Paciente *</Label>
              <Input value={form.pacienteNome} onChange={e => setForm(p => ({ ...p, pacienteNome: e.target.value }))} placeholder="Nome do paciente" />
              {form.pacienteNome.length >= 2 && (
                <div className="mt-1 max-h-24 overflow-y-auto border rounded-md">
                  {pacientes.filter(p => p.nome.toLowerCase().includes(form.pacienteNome.toLowerCase())).slice(0, 5).map(p => (
                    <button key={p.id} className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
                      onClick={() => setForm(prev => ({ ...prev, pacienteNome: p.nome, pacienteId: p.id }))}>
                      {p.nome} — {p.telefone}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Unidade *</Label>
              <Select value={form.unidadeId} onValueChange={v => setForm(p => ({ ...p, unidadeId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Profissional (opcional)</Label>
              <Select value={form.profissionalId || 'none'} onValueChange={v => setForm(p => ({ ...p, profissionalId: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Qualquer</SelectItem>
                  {profissionais.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={form.prioridade} onValueChange={v => setForm(p => ({ ...p, prioridade: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="gestante">Gestante</SelectItem>
                  <SelectItem value="idoso">Idoso 60+</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                  <SelectItem value="crianca">Criança 0-12</SelectItem>
                  <SelectItem value="pcd">PNE</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observações</Label>
              <Input value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} placeholder="Observações..." />
            </div>
            <Button onClick={handleSave} className="w-full gradient-primary text-primary-foreground">
              {editId ? 'Atualizar' : 'Adicionar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Queue List */}
      <div className="space-y-2">
        {filteredFila.length === 0 ? (
          <Card className="shadow-card border-0"><CardContent className="p-8 text-center text-muted-foreground">Fila vazia.</CardContent></Card>
        ) : filteredFila.map((f, i) => {
          const prof = f.profissionalId ? funcionarios.find(fn => fn.id === f.profissionalId) : null;
          const unidade = unidades.find(u => u.id === f.unidadeId);
          const reservaTime = getReservaTimeLeft(f.id);
          const isChamado = f.status === 'chamado';

          return (
            <Card key={f.id} className={cn('shadow-card border-0', isChamado && 'ring-2 ring-primary/30')}>
              <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">{f.pacienteNome}</p>
                  <p className="text-sm text-muted-foreground">
                    {unidade?.nome || f.setor} • {prof ? prof.nome : 'Qualquer profissional'} • Chegou: {f.horaChegada}
                  </p>
                  {f.observacoes && <p className="text-xs text-muted-foreground mt-0.5">{f.observacoes}</p>}
                  {/* Reservation timer */}
                  {isChamado && reservaTime && !reservaTime.expired && (
                    <div className="flex items-center gap-1 mt-1 text-xs font-medium text-primary">
                      <Timer className="w-3 h-3" />
                      Reserva: {reservaTime.minutes}:{String(reservaTime.seconds).padStart(2, '0')} restantes
                      — Vaga: {reservaTime.slot.hora} com {reservaTime.slot.profissionalNome}
                    </div>
                  )}
                  {isChamado && reservaTime && reservaTime.expired && (
                    <div className="flex items-center gap-1 mt-1 text-xs font-medium text-destructive">
                      <Timer className="w-3 h-3" />
                      Reserva expirada!
                    </div>
                  )}
                </div>
                <Badge className={cn('shrink-0', prioridadeColors[f.prioridade] || prioridadeColors.normal)}>
                  {prioridadeLabel[f.prioridade] || f.prioridade}
                </Badge>
                <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium shrink-0', statusLabels[f.status]?.color)}>
                  {statusLabels[f.status]?.label}
                </span>
                {canManage && (
                  <div className="flex gap-1 shrink-0 flex-wrap">
                    {/* Confirm slot for "chamado" patients */}
                    {isChamado && reservaTime?.slot && (
                      <Button size="sm" variant="default" className="h-8 bg-success text-success-foreground hover:bg-success/90"
                        onClick={() => confirmarEncaixe(f.id, reservaTime.slot, user)}
                        title="Confirmar Encaixe">
                        <CheckCircle className="w-4 h-4 mr-1" /> Confirmar
                      </Button>
                    )}
                    {/* Expire reservation manually */}
                    {isChamado && reservaTime?.slot && (
                      <Button size="sm" variant="outline" className="h-8"
                        onClick={() => expirarReserva(f.id, reservaTime.slot, user)}
                        title="Expirar Reserva / Chamar Próximo">
                        <ArrowRight className="w-4 h-4 mr-1" /> Próximo
                      </Button>
                    )}
                    {/* Standard actions for non-chamado */}
                    {!isChamado && f.status === 'aguardando' && (
                      <Button size="sm" variant="ghost" className="h-8" onClick={async () => {
                        await updateFila(f.id, { status: 'chamado', horaChamada: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) });
                        const pac = pacientes.find(p => p.id === f.pacienteId);
                        const unidadeN = unidades.find(u => u.id === f.unidadeId);
                        await notify({
                          evento: 'fila_chamada',
                          paciente_nome: f.pacienteNome, telefone: pac?.telefone || '',
                          email: pac?.email || '', data_consulta: new Date().toISOString().split('T')[0],
                          hora_consulta: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                          unidade: unidadeN?.nome || '', profissional: prof?.nome || '',
                          tipo_atendimento: 'Chamada da Fila', status_agendamento: 'chamado',
                          id_agendamento: '',
                        });
                        toast.info('Paciente chamado!');
                      }} title="Chamar">
                        <Bell className="w-4 h-4" />
                      </Button>
                    )}
                    {f.status !== 'encaixado' && f.status !== 'atendido' && f.status !== 'cancelado' && !isChamado && (
                      <>
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => updateFila(f.id, { status: 'em_atendimento' })} title="Iniciar">
                          <Play className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => updateFila(f.id, { status: 'atendido' })} title="Finalizar">
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => updateFila(f.id, { status: 'falta' })} title="Faltou">
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => openEdit(f)} title="Editar">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-8 text-destructive" title="Remover">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Remover da fila?</AlertDialogTitle><AlertDialogDescription>Tem certeza que deseja remover {f.pacienteNome} da fila?</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={async () => { await removeFromFila(f.id); toast.success('Removido da fila!'); }}>Remover</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default FilaEspera;
