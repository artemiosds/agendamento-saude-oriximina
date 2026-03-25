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
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Loader2, CalendarCheck, Eye, EyeOff } from 'lucide-react';
import { UserRole } from '@/types';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUnidadeFilter } from '@/hooks/useUnidadeFilter';

const roleLabels: Record<UserRole, string> = {
  master: 'Master', coordenador: 'Coordenador', recepcao: 'Recepção', profissional: 'Profissional de Saúde', gestao: 'Gestão', tecnico: 'Triagem', enfermagem: 'Enfermagem',
};
const roleColors: Record<UserRole, string> = {
  master: 'bg-destructive/10 text-destructive', coordenador: 'bg-warning/10 text-warning',
  recepcao: 'bg-info/10 text-info', profissional: 'bg-success/10 text-success', gestao: 'bg-accent text-accent-foreground',
  tecnico: 'bg-primary/10 text-primary', enfermagem: 'bg-purple-100 text-purple-700',
};

interface FuncionarioDB {
  id: string;
  auth_user_id: string | null;
  nome: string;
  usuario: string;
  email: string;
  cpf: string;
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
  pode_agendar_retorno: boolean;
  coren: string;
}

const Funcionarios: React.FC = () => {
  const { unidades, salas, refreshFuncionarios, logAction } = useData();
  const { unidadesVisiveis } = useUnidadeFilter();
  const { hasPermission, user } = useAuth();
  const [funcionarios, setFuncionarios] = useState<FuncionarioDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showSenha, setShowSenha] = useState(false);
  const [form, setForm] = useState({
    nome: '', usuario: '', email: '', cpf: '', senha: '', setor: '', unidade_id: '', sala_id: '', cargo: '', role: 'recepcao' as UserRole, tempo_atendimento: 30,
    profissao: '', tipo_conselho: '', numero_conselho: '', uf_conselho: '', pode_agendar_retorno: false, coren: '',
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
      nome: f.nome, usuario: f.usuario, email: f.email, cpf: f.cpf || '', senha: '',
      setor: f.setor || '', unidade_id: f.unidade_id || '', sala_id: f.sala_id || '',
      cargo: f.cargo || '', role: f.role as UserRole, tempo_atendimento: f.tempo_atendimento || 30,
      profissao: f.profissao || '', tipo_conselho: f.tipo_conselho || '',
      numero_conselho: f.numero_conselho || '', uf_conselho: f.uf_conselho || '',
      pode_agendar_retorno: f.pode_agendar_retorno ?? false,
      coren: f.coren || '',
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditId(null);
    setForm({ nome: '', usuario: '', email: '', cpf: '', senha: '', setor: '', unidade_id: '', sala_id: '', cargo: '', role: 'recepcao', tempo_atendimento: 30, profissao: '', tipo_conselho: '', numero_conselho: '', uf_conselho: '', pode_agendar_retorno: false, coren: '' });
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
          cpf: form.cpf,
          setor: form.setor,
          unidade_id: form.unidade_id,
          sala_id: form.sala_id,
          cargo: form.cargo,
          role: form.role,
          tempo_atendimento: form.tempo_atendimento,
          profissao: form.profissao,
          tipo_conselho: form.tipo_conselho,
          numero_conselho: form.numero_conselho,
          uf_conselho: form.uf_conselho,
          pode_agendar_retorno: form.pode_agendar_retorno,
          coren: form.coren,
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
            cpf: form.cpf,
            senha: form.senha,
            setor: form.setor,
            unidade_id: form.unidade_id,
            sala_id: form.sala_id,
            cargo: form.cargo,
            role: form.role,
            tempo_atendimento: form.tempo_atendimento,
            profissao: form.profissao,
            tipo_conselho: form.tipo_conselho,
            numero_conselho: form.numero_conselho,
            uf_conselho: form.uf_conselho,
            pode_agendar_retorno: form.pode_agendar_retorno,
            coren: form.coren,
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
      // Also refresh DataContext so other pages see the new employee immediately
      await refreshFuncionarios();
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
      await refreshFuncionarios();
    } catch {
      toast.error('Erro ao excluir funcionário.');
    }
  };

  const visibleFuncionarios = (user?.role === 'coordenador' || user?.role === 'recepcao')
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
              <div>
                <Label>{editId ? 'Nova Senha (opcional)' : 'Senha *'}</Label>
                <div className="relative">
                  <Input type={showSenha ? 'text' : 'password'} value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))} className="pr-10" />
                  <button type="button" onClick={() => setShowSenha(!showSenha)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>E-mail *</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
              <div><Label>CPF</Label><Input value={form.cpf} onChange={e => setForm(p => ({ ...p, cpf: e.target.value }))} placeholder="000.000.000-00" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Cargo</Label><Input value={form.cargo} onChange={e => setForm(p => ({ ...p, cargo: e.target.value }))} /></div>
              <div><Label>Perfil do Usuário *</Label>
                <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v as UserRole }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o perfil" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="master">Master</SelectItem>
                    <SelectItem value="gestao">Gestão</SelectItem>
                    <SelectItem value="coordenador">Coordenador</SelectItem>
                    <SelectItem value="recepcao">Recepção</SelectItem>
                    <SelectItem value="tecnico">Triagem</SelectItem>
                    <SelectItem value="enfermagem">Enfermagem</SelectItem>
                    <SelectItem value="profissional">Profissional de Saúde</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Setor</Label><Input value={form.setor} onChange={e => setForm(p => ({ ...p, setor: e.target.value }))} /></div>
              <div><Label>Unidade</Label>
                <Select value={form.unidade_id} onValueChange={v => setForm(p => ({ ...p, unidade_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{unidadesVisiveis.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
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
            {(form.role === 'profissional' || form.role === 'tecnico') && (
              <>
                <div className="border-t pt-3 mt-2">
                  <p className="text-sm font-semibold text-foreground mb-2">Conselho Profissional</p>
                </div>
                {form.role === 'tecnico' && (
                  <div>
                    <Label>COREN</Label>
                    <Input value={(form as any).coren || ''} onChange={e => setForm(p => ({ ...p, coren: e.target.value } as any))} placeholder="Nº do COREN" />
                  </div>
                )}
                {form.role === 'profissional' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Profissão</Label>
                        <Select value={form.profissao || '__none__'} onValueChange={v => {
                          const prof = v === '__none__' ? '' : v;
                          const conselho = conselhoMap[prof] || '';
                          setForm(p => ({ ...p, profissao: prof, tipo_conselho: conselho || p.tipo_conselho }));
                        }}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Selecione</SelectItem>
                            {Object.keys(conselhoMap).map(p => (
                              <SelectItem key={p} value={p}>{p}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Tipo de Conselho</Label>
                        <Input value={form.tipo_conselho} onChange={e => setForm(p => ({ ...p, tipo_conselho: e.target.value }))} placeholder="CRM, COREN..." />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Nº do Conselho</Label>
                        <Input value={form.numero_conselho} onChange={e => setForm(p => ({ ...p, numero_conselho: e.target.value }))} placeholder="000000" />
                      </div>
                      <div>
                        <Label>UF do Conselho</Label>
                        <Select value={form.uf_conselho || '__none__'} onValueChange={v => setForm(p => ({ ...p, uf_conselho: v === '__none__' ? '' : v }))}>
                          <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                              <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
            {form.role === 'profissional' && canManage && (
              <div className="border-t pt-3 mt-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold">Permissão de Retorno</Label>
                    <p className="text-xs text-muted-foreground">Permitir que este profissional agende retorno de paciente</p>
                  </div>
                  <Switch
                    checked={form.pode_agendar_retorno}
                    onCheckedChange={v => setForm(p => ({ ...p, pode_agendar_retorno: v }))}
                  />
                </div>
              </div>
            )}
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
                    {f.tipo_conselho && f.numero_conselho && (
                      <p className="text-xs text-muted-foreground">{f.tipo_conselho} {f.numero_conselho}{f.uf_conselho ? `/${f.uf_conselho}` : ''}</p>
                    )}
                    {unidadeNome && <p className="text-xs text-muted-foreground">{unidadeNome}</p>}
                    {f.role === 'profissional' && f.pode_agendar_retorno && (
                      <Badge variant="outline" className="text-xs mt-1 border-success/50 text-success"><CalendarCheck className="w-3 h-3 mr-1" />Retorno</Badge>
                    )}
                    {!f.ativo && <Badge variant="outline" className="text-xs mt-1">Inativo</Badge>}
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
