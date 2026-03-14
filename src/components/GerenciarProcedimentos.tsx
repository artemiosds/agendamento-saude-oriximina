import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Search, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useData } from '@/contexts/DataContext';

interface ProcedimentoDB {
  id: string;
  nome: string;
  descricao: string;
  profissao: string;
  especialidade: string;
  profissional_id: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

const PROFISSOES = [
  'Psicologia', 'Fisioterapia', 'Fonoaudiologia', 'Enfermagem',
  'Nutrição', 'Terapia Ocupacional', 'Serviço Social', 'Medicina', 'Outro',
];

const GerenciarProcedimentos: React.FC = () => {
  const { funcionarios } = useData();
  const [procedimentos, setProcedimentos] = useState<ProcedimentoDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    nome: '', descricao: '', profissao: '', especialidade: '', profissional_id: '', ativo: true,
  });

  const profissionais = useMemo(() =>
    funcionarios.filter(f => f.role === 'profissional' && f.ativo),
    [funcionarios]
  );

  const loadProcedimentos = async () => {
    setLoading(true);
    const { data } = await (supabase as any).from('procedimentos').select('*').order('profissao', { ascending: true });
    if (data) setProcedimentos(data);
    setLoading(false);
  };

  useEffect(() => { loadProcedimentos(); }, []);

  const filtered = procedimentos.filter(p =>
    p.nome.toLowerCase().includes(search.toLowerCase()) ||
    p.profissao.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => {
    setEditId(null);
    setForm({ nome: '', descricao: '', profissao: '', especialidade: '', profissional_id: '', ativo: true });
    setDialogOpen(true);
  };

  const openEdit = (p: ProcedimentoDB) => {
    setEditId(p.id);
    setForm({
      nome: p.nome, descricao: p.descricao || '', profissao: p.profissao || '',
      especialidade: p.especialidade || '', profissional_id: p.profissional_id || '', ativo: p.ativo,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome) { toast.error('Nome é obrigatório.'); return; }
    if (!form.profissao) { toast.error('Profissão/área é obrigatória.'); return; }

    const record = {
      nome: form.nome, descricao: form.descricao, profissao: form.profissao,
      especialidade: form.especialidade, profissional_id: form.profissional_id || null,
      ativo: form.ativo, atualizado_em: new Date().toISOString(),
    };

    if (editId) {
      const { error } = await (supabase as any).from('procedimentos').update(record).eq('id', editId);
      if (error) { toast.error('Erro ao atualizar.'); return; }
      toast.success('Procedimento atualizado!');
    } else {
      const { error } = await (supabase as any).from('procedimentos').insert(record);
      if (error) { toast.error('Erro ao criar.'); return; }
      toast.success('Procedimento criado!');
    }
    setDialogOpen(false);
    await loadProcedimentos();
  };

  const toggleAtivo = async (p: ProcedimentoDB) => {
    await (supabase as any).from('procedimentos').update({ ativo: !p.ativo }).eq('id', p.id);
    setProcedimentos(prev => prev.map(x => x.id === p.id ? { ...x, ativo: !x.ativo } : x));
    toast.success(p.ativo ? 'Procedimento inativado.' : 'Procedimento ativado.');
  };

  return (
    <Card className="shadow-card border-0">
      <CardContent className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Stethoscope className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold font-display text-foreground">Procedimentos Clínicos</h3>
            <p className="text-sm text-muted-foreground">Cadastro e gerenciamento de procedimentos por área</p>
          </div>
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Novo</Button>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar procedimento..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum procedimento cadastrado.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {filtered.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/50 border">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{p.nome}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{p.profissao}</Badge>
                    {!p.ativo && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Inativo</Badge>}
                  </div>
                  {p.especialidade && <p className="text-xs text-muted-foreground">{p.especialidade}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <Switch checked={p.ativo} onCheckedChange={() => toggleAtivo(p)} />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(p)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle className="font-display">{editId ? 'Editar' : 'Novo'} Procedimento</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Avaliação psicológica" /></div>
              <div><Label>Descrição</Label><Input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Descrição breve..." /></div>
              <div>
                <Label>Área / Profissão *</Label>
                <Select value={form.profissao} onValueChange={v => setForm(p => ({ ...p, profissao: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione a área" /></SelectTrigger>
                  <SelectContent>{PROFISSOES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Especialidade (opcional)</Label><Input value={form.especialidade} onChange={e => setForm(p => ({ ...p, especialidade: e.target.value }))} placeholder="Ex: Neuropsicologia" /></div>
              <div>
                <Label>Profissional específico (opcional)</Label>
                <Select value={form.profissional_id || 'none'} onValueChange={v => setForm(p => ({ ...p, profissional_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Todos da área" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Todos da área</SelectItem>
                    {profissionais.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}{p.profissao ? ` — ${p.profissao}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>Ativo</Label>
                <Switch checked={form.ativo} onCheckedChange={v => setForm(p => ({ ...p, ativo: v }))} />
              </div>
              <Button onClick={handleSave} className="w-full gradient-primary text-primary-foreground">{editId ? 'Salvar' : 'Criar'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default GerenciarProcedimentos;
