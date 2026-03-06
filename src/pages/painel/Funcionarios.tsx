import React, { useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { UserRole } from '@/types';
import { toast } from 'sonner';

const roleLabels: Record<UserRole, string> = {
  master: 'Master', coordenador: 'Coordenador', recepcao: 'Recepção', profissional: 'Profissional', gestao: 'Gestão',
};
const roleColors: Record<UserRole, string> = {
  master: 'bg-destructive/10 text-destructive', coordenador: 'bg-warning/10 text-warning',
  recepcao: 'bg-info/10 text-info', profissional: 'bg-success/10 text-success', gestao: 'bg-accent text-accent-foreground',
};

const Funcionarios: React.FC = () => {
  const { funcionarios, addFuncionario, updateFuncionario, deleteFuncionario, unidades } = useData();
  const { hasPermission } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: '', usuario: '', email: '', senha: '', setor: '', unidadeId: '', cargo: '', role: 'recepcao' as UserRole,
  });

  const canManage = hasPermission(['master', 'coordenador']);

  const openEdit = (f: typeof funcionarios[0]) => {
    setEditId(f.id);
    setForm({ nome: f.nome, usuario: f.usuario, email: f.email, senha: '', setor: f.setor, unidadeId: f.unidadeId, cargo: f.cargo, role: f.role });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditId(null);
    setForm({ nome: '', usuario: '', email: '', senha: '', setor: '', unidadeId: '', cargo: '', role: 'recepcao' });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.nome || !form.usuario) return;
    if (editId) {
      const data: any = { nome: form.nome, usuario: form.usuario, email: form.email, setor: form.setor, unidadeId: form.unidadeId, cargo: form.cargo, role: form.role };
      if (form.senha) data.senha = form.senha;
      updateFuncionario(editId, data);
      toast.success('Funcionário atualizado!');
    } else {
      if (!form.senha) { toast.error('Senha é obrigatória para novo funcionário.'); return; }
      addFuncionario({ id: `u${Date.now()}`, ...form, ativo: true, criadoEm: new Date().toISOString(), criadoPor: 'current' });
      toast.success('Funcionário cadastrado!');
    }
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    deleteFuncionario(id);
    toast.success('Funcionário excluído!');
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Funcionários</h1>
          <p className="text-muted-foreground text-sm">{funcionarios.length} cadastrados</p>
        </div>
        {canManage && (
          <Button onClick={openNew} className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-2" />Novo Funcionário</Button>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">{editId ? 'Editar' : 'Cadastrar'} Funcionário</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Usuário *</Label><Input value={form.usuario} onChange={e => setForm(p => ({ ...p, usuario: e.target.value }))} /></div>
              <div><Label>{editId ? 'Nova Senha (opcional)' : 'Senha *'}</Label><Input type="password" value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))} /></div>
            </div>
            <div><Label>E-mail</Label><Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Cargo</Label><Input value={form.cargo} onChange={e => setForm(p => ({ ...p, cargo: e.target.value }))} /></div>
              <div><Label>Perfil</Label>
                <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v as UserRole }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="coordenador">Coordenador</SelectItem>
                    <SelectItem value="recepcao">Recepção</SelectItem>
                    <SelectItem value="profissional">Profissional</SelectItem>
                    <SelectItem value="gestao">Gestão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Setor</Label><Input value={form.setor} onChange={e => setForm(p => ({ ...p, setor: e.target.value }))} /></div>
              <div><Label>Unidade</Label>
                <Select value={form.unidadeId} onValueChange={v => setForm(p => ({ ...p, unidadeId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleSave} className="w-full gradient-primary text-primary-foreground">{editId ? 'Salvar' : 'Cadastrar'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {funcionarios.map(f => (
          <Card key={f.id} className="shadow-card border-0">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
                {f.nome.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">{f.nome}</p>
                <p className="text-sm text-muted-foreground">{f.cargo} • {f.setor}</p>
              </div>
              <Badge className={roleColors[f.role]}>{roleLabels[f.role]}</Badge>
              {canManage && (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(f)}><Pencil className="w-4 h-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="w-4 h-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir funcionário?</AlertDialogTitle>
                        <AlertDialogDescription>Tem certeza que deseja excluir {f.nome}? Esta ação não pode ser desfeita.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(f.id)}>Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Funcionarios;
