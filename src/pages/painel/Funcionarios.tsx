import React, { useState, useEffect } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { UserRole } from '@/types';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const roleLabels: Record<UserRole, string> = {
  master: 'Master', coordenador: 'Coordenador', recepcao: 'Recepção', profissional: 'Profissional', gestao: 'Gestão',
};
const roleColors: Record<UserRole, string> = {
  master: 'bg-destructive/10 text-destructive', coordenador: 'bg-warning/10 text-warning',
  recepcao: 'bg-info/10 text-info', profissional: 'bg-success/10 text-success', gestao: 'bg-accent text-accent-foreground',
};

interface FuncionarioDB {
  id: string;
  auth_user_id: string | null;
  nome: string;
  usuario: string;
  email: string;
  setor: string;
  unidade_id: string;
  sala_id: string;
  cargo: string;
  role: string;
  ativo: boolean;
  criado_em: string;
  criado_por: string;
  tempo_atendimento: number;
  profissao: string;
  tipo_conselho: string;
  numero_conselho: string;
  uf_conselho: string;
}

const Funcionarios: React.FC = () => {
  const { unidades, salas } = useData();
  const { hasPermission, user } = useAuth();
  const [funcionarios, setFuncionarios] = useState<FuncionarioDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: '', usuario: '', email: '', senha: '', setor: '', unidade_id: '', sala_id: '', cargo: '', role: 'recepcao' as UserRole, tempo_atendimento: 30,
    profissao: '', tipo_conselho: '', numero_conselho: '', uf_conselho: '',
  });

  const canManage = hasPermission(['master', 'coordenador']);

  const loadFuncionarios = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-employee', {
        body: { action: 'list' },
      });
      if (data?.funcionarios) {
        setFuncionarios(data.funcionarios);
      }
    } catch (err) {
      console.error('Error loading employees:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadFuncionarios();
  }, []);

  const conselhoMap: Record<string, string> = {
    'Médico': 'CRM', 'Médica': 'CRM', 'Enfermeiro': 'COREN', 'Enfermeira': 'COREN',
    'Odontólogo': 'CRO', 'Odontóloga': 'CRO', 'Dentista': 'CRO',
    'Fisioterapeuta': 'CREFITO', 'Psicólogo': 'CRP', 'Psicóloga': 'CRP',
    'Assistente Social': 'CRESS', 'Nutricionista': 'CRN', 'Farmacêutico': 'CRF', 'Farmacêutica': 'CRF',
    'Fonoaudiólogo': 'CRFa', 'Fonoaudióloga': 'CRFa', 'Terapeuta Ocupacional': 'CREFITO',
    'Biomédico': 'CRBM', 'Biomédica': 'CRBM', 'Fisio': 'CREFITO',
  };

  const openEdit = (f: FuncionarioDB) => {
    setEditId(f.id);
    setForm({
      nome: f.nome, usuario: f.usuario, email: f.email, senha: '',
      setor: f.setor || '', unidade_id: f.unidade_id || '', sala_id: f.sala_id || '',
      cargo: f.cargo || '', role: f.role as UserRole, tempo_atendimento: f.tempo_atendimento || 30,
      profissao: f.profissao || '', tipo_conselho: f.tipo_conselho || '',
      numero_conselho: f.numero_conselho || '', uf_conselho: f.uf_conselho || '',
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditId(null);
    setForm({ nome: '', usuario: '', email: '', senha: '', setor: '', unidade_id: '', sala_id: '', cargo: '', role: 'recepcao', tempo_atendimento: 30, profissao: '', tipo_conselho: '', numero_conselho: '', uf_conselho: '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome || !form.usuario || !form.email) {
      toast.error('Nome, usuário e e-mail são obrigatórios.');
      return;
    }

    setSaving(true);
    try {
      if (editId) {
        const updateData: Record<string, any> = {
          action: 'update',
          id: editId,
          nome: form.nome,
          usuario: form.usuario,
          email: form.email,
          setor: form.setor,
          unidade_id: form.unidade_id,
          sala_id: form.sala_id,
          cargo: form.cargo,
          role: form.role,
          tempo_atendimento: form.tempo_atendimento,
        };
        if (form.senha) updateData.senha = form.senha;

        const { data, error } = await supabase.functions.invoke('manage-employee', {
          body: updateData,
        });

        if (error || data?.error) {
          toast.error(data?.error || 'Erro ao atualizar funcionário.');
          setSaving(false);
          return;
        }
        toast.success('Funcionário atualizado!');
      } else {
        if (!form.senha) {
          toast.error('Senha é obrigatória para novo funcionário.');
          setSaving(false);
          return;
        }

        const { data, error } = await supabase.functions.invoke('manage-employee', {
          body: {
            action: 'create',
            nome: form.nome,
            usuario: form.usuario,
            email: form.email,
            senha: form.senha,
            setor: form.setor,
            unidade_id: form.unidade_id,
            sala_id: form.sala_id,
            cargo: form.cargo,
            role: form.role,
            tempo_atendimento: form.tempo_atendimento,
            criado_por: user?.id || '',
          },
        });

        if (error || data?.error) {
          toast.error(data?.error || 'Erro ao cadastrar funcionário.');
          setSaving(false);
          return;
        }
        toast.success('Funcionário cadastrado com sucesso!');
      }

      setDialogOpen(false);
      await loadFuncionarios();
    } catch (err) {
      toast.error('Erro ao salvar funcionário.');
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-employee', {
        body: { action: 'delete', id },
      });
      if (error || data?.error) {
        toast.error(data?.error || 'Erro ao excluir.');
        return;
      }
      toast.success('Funcionário excluído!');
      await loadFuncionarios();
    } catch {
      toast.error('Erro ao excluir funcionário.');
    }
  };

  const visibleFuncionarios = user?.role === 'coordenador'
    ? funcionarios.filter(f => f.unidade_id === user.unidadeId || !f.unidade_id)
    : funcionarios;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Funcionários</h1>
          <p className="text-muted-foreground text-sm">{visibleFuncionarios.length} cadastrados</p>
        </div>
        {canManage && (
          <Button onClick={openNew} className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-2" />Novo Funcionário</Button>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">{editId ? 'Editar' : 'Cadastrar'} Funcionário</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Usuário *</Label><Input value={form.usuario} onChange={e => setForm(p => ({ ...p, usuario: e.target.value }))} /></div>
              <div><Label>{editId ? 'Nova Senha (opcional)' : 'Senha *'}</Label><Input type="password" value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))} /></div>
            </div>
            <div><Label>E-mail *</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
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
                <Select value={form.unidade_id} onValueChange={v => setForm(p => ({ ...p, unidade_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sala</Label>
                <Select value={form.sala_id || '__none__'} onValueChange={v => setForm(p => ({ ...p, sala_id: v === '__none__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Todas</SelectItem>
                    {salas.filter(s => !form.unidade_id || s.unidadeId === form.unidade_id).map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.role === 'profissional' && (
                <div>
                  <Label>Tempo de Atendimento</Label>
                  <Select value={String(form.tempo_atendimento)} onValueChange={v => setForm(p => ({ ...p, tempo_atendimento: Number(v) }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 minutos</SelectItem>
                      <SelectItem value="20">20 minutos</SelectItem>
                      <SelectItem value="30">30 minutos</SelectItem>
                      <SelectItem value="45">45 minutos</SelectItem>
                      <SelectItem value="60">60 minutos</SelectItem>
                      <SelectItem value="90">90 minutos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full gradient-primary text-primary-foreground">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editId ? 'Salvar' : 'Cadastrar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visibleFuncionarios.map(f => {
            const unidadeNome = unidades.find(u => u.id === f.unidade_id)?.nome || '';
            return (
              <Card key={f.id} className="shadow-card border-0">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
                    {f.nome.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{f.nome}</p>
                    <p className="text-sm text-muted-foreground">
                      {f.cargo}{f.setor ? ` • ${f.setor}` : ''}
                      {f.role === 'profissional' && f.tempo_atendimento ? ` • ${f.tempo_atendimento}min` : ''}
                    </p>
                    {unidadeNome && <p className="text-xs text-muted-foreground">{unidadeNome}</p>}
                  </div>
                  <Badge className={roleColors[f.role as UserRole] || 'bg-muted text-muted-foreground'}>
                    {roleLabels[f.role as UserRole] || f.role}
                  </Badge>
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
            );
          })}
          {visibleFuncionarios.length === 0 && !loading && (
            <p className="text-muted-foreground text-sm col-span-2 text-center py-8">
              Nenhum funcionário cadastrado. Clique em "Novo Funcionário" para começar.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default Funcionarios;
