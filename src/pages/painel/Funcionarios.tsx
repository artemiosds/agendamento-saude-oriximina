import React, { useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Shield } from 'lucide-react';
import { UserRole } from '@/types';

const roleLabels: Record<UserRole, string> = {
  master: 'Master',
  coordenador: 'Coordenador',
  recepcao: 'Recepção',
  profissional: 'Profissional',
  gestao: 'Gestão',
};

const roleColors: Record<UserRole, string> = {
  master: 'bg-destructive/10 text-destructive',
  coordenador: 'bg-warning/10 text-warning',
  recepcao: 'bg-info/10 text-info',
  profissional: 'bg-success/10 text-success',
  gestao: 'bg-accent text-accent-foreground',
};

const Funcionarios: React.FC = () => {
  const { funcionarios, addFuncionario, unidades, setores } = useData();
  const { hasPermission } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    nome: '', usuario: '', email: '', senha: '', setor: '', unidadeId: '', cargo: '', role: 'recepcao' as UserRole,
  });

  const canCreate = hasPermission(['master', 'coordenador']);

  const handleCreate = () => {
    if (!form.nome || !form.usuario || !form.senha) return;
    addFuncionario({
      id: `u${Date.now()}`,
      ...form,
      ativo: true,
      criadoEm: new Date().toISOString(),
      criadoPor: 'current',
    });
    setDialogOpen(false);
    setForm({ nome: '', usuario: '', email: '', senha: '', setor: '', unidadeId: '', cargo: '', role: 'recepcao' });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Funcionários</h1>
          <p className="text-muted-foreground text-sm">{funcionarios.length} cadastrados</p>
        </div>
        {canCreate && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-2" />Novo Funcionário</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display">Cadastrar Funcionário</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Usuário *</Label><Input value={form.usuario} onChange={e => setForm(p => ({ ...p, usuario: e.target.value }))} /></div>
                  <div><Label>Senha Inicial *</Label><Input type="password" value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))} /></div>
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
                <Button onClick={handleCreate} className="w-full gradient-primary text-primary-foreground">Cadastrar</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

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
              <span className={`w-2 h-2 rounded-full shrink-0 ${f.ativo ? 'bg-success' : 'bg-destructive'}`} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Funcionarios;
