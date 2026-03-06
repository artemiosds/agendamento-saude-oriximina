import React, { useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, ChevronLeft, ChevronRight, Check, X, Clock, UserCheck, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

const statusActions = [
  { key: 'confirmado', label: 'Chegou', icon: Check, color: 'bg-success text-success-foreground' },
  { key: 'atraso', label: 'Atrasou', icon: Clock, color: 'bg-warning text-warning-foreground' },
  { key: 'falta', label: 'Faltou', icon: X, color: 'bg-destructive text-destructive-foreground' },
  { key: 'concluido', label: 'Atendido', icon: UserCheck, color: 'bg-info text-info-foreground' },
  { key: 'remarcado', label: 'Remarcou', icon: RotateCcw, color: 'bg-muted text-muted-foreground' },
] as const;

const Agenda: React.FC = () => {
  const { agendamentos, updateAgendamento, pacientes, funcionarios, unidades, salas, addAgendamento } = useData();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterUnit, setFilterUnit] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newAg, setNewAg] = useState({ pacienteId: '', profissionalId: '', salaId: '', hora: '', tipo: 'Consulta', obs: '' });

  const filtered = agendamentos.filter(a => {
    if (a.data !== selectedDate) return false;
    if (filterUnit !== 'all' && a.unidadeId !== filterUnit) return false;
    return true;
  }).sort((a, b) => a.hora.localeCompare(b.hora));

  const changeDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const profissionais = funcionarios.filter(f => f.role === 'profissional' && f.ativo);

  const handleCreate = () => {
    const pac = pacientes.find(p => p.id === newAg.pacienteId);
    const prof = profissionais.find(p => p.id === newAg.profissionalId);
    if (!pac || !prof || !newAg.hora) return;

    addAgendamento({
      id: `ag${Date.now()}`,
      pacienteId: pac.id,
      pacienteNome: pac.nome,
      unidadeId: prof.unidadeId,
      salaId: newAg.salaId,
      setorId: '',
      profissionalId: prof.id,
      profissionalNome: prof.nome,
      data: selectedDate,
      hora: newAg.hora,
      status: 'confirmado',
      tipo: newAg.tipo,
      observacoes: newAg.obs,
      origem: 'recepcao',
      criadoEm: new Date().toISOString(),
      criadoPor: 'current',
    });
    setDialogOpen(false);
    setNewAg({ pacienteId: '', profissionalId: '', salaId: '', hora: '', tipo: 'Consulta', obs: '' });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Agenda</h1>
          <p className="text-muted-foreground text-sm">Gerenciar agendamentos</p>
        </div>
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
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => changeDate(-1)}><ChevronLeft className="w-4 h-4" /></Button>
        <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-auto" />
        <Button variant="outline" size="icon" onClick={() => changeDate(1)}><ChevronRight className="w-4 h-4" /></Button>
        <Select value={filterUnit} onValueChange={setFilterUnit}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Unidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Unidades</SelectItem>
            {unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Appointments list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <Card className="shadow-card border-0"><CardContent className="p-8 text-center text-muted-foreground">Nenhum agendamento para esta data.</CardContent></Card>
        ) : filtered.map(ag => (
          <Card key={ag.id} className="shadow-card border-0">
            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <span className="text-lg font-mono font-bold text-primary w-16 shrink-0">{ag.hora}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">{ag.pacienteNome}</p>
                <p className="text-sm text-muted-foreground">{ag.profissionalNome} • {ag.tipo}</p>
              </div>
              <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium shrink-0",
                ag.status === 'confirmado' ? 'bg-success/10 text-success' :
                ag.status === 'pendente' ? 'bg-warning/10 text-warning' :
                ag.status === 'cancelado' ? 'bg-destructive/10 text-destructive' :
                ag.status === 'concluido' ? 'bg-info/10 text-info' :
                'bg-muted text-muted-foreground'
              )}>
                {ag.status}
              </span>
              <div className="flex gap-1 flex-wrap">
                {statusActions.map(sa => (
                  <Button
                    key={sa.key}
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => updateAgendamento(ag.id, { status: sa.key as any })}
                    title={sa.label}
                  >
                    <sa.icon className="w-3.5 h-3.5" />
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Agenda;
