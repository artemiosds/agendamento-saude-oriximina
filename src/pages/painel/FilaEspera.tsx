import React, { useState, useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Bell, Play, CheckCircle, XCircle, Pencil, Trash2, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const prioridadeColors: Record<string, string> = {
  normal: 'bg-muted text-muted-foreground',
  alta: 'bg-warning/10 text-warning',
  urgente: 'bg-destructive/10 text-destructive',
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

const FilaEspera: React.FC = () => {
  const { fila, addToFila, updateFila, removeFromFila, pacientes, funcionarios, unidades } = useData();
  const { hasPermission } = useAuth();
  const canManage = hasPermission(['master', 'coordenador', 'recepcao', 'gestao']);
  const profissionais = funcionarios.filter(f => f.role === 'profissional' && f.ativo);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterUnidade, setFilterUnidade] = useState('all');
  const [filterProf, setFilterProf] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const [form, setForm] = useState({
    pacienteNome: '', pacienteId: '', unidadeId: '', profissionalId: '',
    setor: '', prioridade: 'normal' as 'normal' | 'alta' | 'urgente', observacoes: '',
  });

  const filteredFila = useMemo(() => {
    return [...fila]
      .filter(f => filterUnidade === 'all' || f.unidadeId === filterUnidade)
      .filter(f => filterProf === 'all' || f.profissionalId === filterProf)
      .filter(f => filterStatus === 'all' || f.status === filterStatus)
      .sort((a, b) => {
        const prioOrder: Record<string, number> = { urgente: 0, alta: 1, normal: 2 };
        if ((prioOrder[a.prioridade] ?? 2) !== (prioOrder[b.prioridade] ?? 2)) return (prioOrder[a.prioridade] ?? 2) - (prioOrder[b.prioridade] ?? 2);
        return a.horaChegada.localeCompare(b.horaChegada);
      });
  }, [fila, filterUnidade, filterProf, filterStatus]);

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
      await updateFila(editId, { ...form });
      toast.success('Registro atualizado!');
    } else {
      await addToFila({
        id: `f${Date.now()}`, ...form,
        status: 'aguardando', posicao: fila.length + 1,
        horaChegada: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        criadoPor: 'sistema',
      });
      toast.success('Paciente adicionado à fila!');
    }
    setDialogOpen(false);
  };

  const aguardandoCount = fila.filter(f => f.status === 'aguardando').length;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Fila de Espera</h1>
          <p className="text-muted-foreground text-sm">{aguardandoCount} aguardando</p>
        </div>
        {canManage && (
          <Button onClick={openNew} className="gradient-primary text-primary-foreground">
            <UserPlus className="w-4 h-4 mr-2" />Adicionar à Fila
          </Button>
        )}
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
              <Select value={form.prioridade} onValueChange={v => setForm(p => ({ ...p, prioridade: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="alta">Alta (Idoso/Gestante)</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
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
          return (
            <Card key={f.id} className="shadow-card border-0">
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
                </div>
                <Badge className={cn('shrink-0', prioridadeColors[f.prioridade])}>{f.prioridade}</Badge>
                <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium shrink-0', statusLabels[f.status]?.color)}>
                  {statusLabels[f.status]?.label}
                </span>
                {canManage && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => updateFila(f.id, { status: 'chamado', horaChamada: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) })} title="Chamar">
                      <Bell className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => updateFila(f.id, { status: 'em_atendimento' })} title="Iniciar">
                      <Play className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => updateFila(f.id, { status: 'atendido' })} title="Finalizar">
                      <CheckCircle className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => updateFila(f.id, { status: 'falta' })} title="Faltou">
                      <XCircle className="w-4 h-4" />
                    </Button>
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
