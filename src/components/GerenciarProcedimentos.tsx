import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Pencil, Search, Stethoscope, Users, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useData } from '@/contexts/DataContext';

interface ProcedimentoDB {
  id: string;
  nome: string;
  descricao: string | null;
  profissao: string;
  especialidade: string | null;
  profissionais_ids: string[];
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
    nome: '',
    descricao: '',
    profissao: '',
    especialidade: '',
    profissionais_ids: [] as string[],
    ativo: true,
  });

  // Filtra apenas profissionais ativos
  const profissionais = useMemo(() => 
    funcionarios.filter(f => f.role === 'profissional' && f.ativo),
    [funcionarios]
  );

  // Agrupa profissionais por profissão
  const profissionaisPorProfissao = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    PROFISSOES.forEach(prof => {
      grouped[prof] = profissionais.filter(p => p.profissao === prof);
    });
    return grouped;
  }, [profissionais]);

  const loadProcedimentos = async () => {
    setLoading(true);
    
    const { data, error } = await supabase
      .from('procedimentos')
      .select('*')
      .order('profissao', { ascending: true });

    if (error) {
      console.error('Erro ao carregar procedimentos:', error);
      toast.error('Erro ao carregar procedimentos');
    }

    if (data) {
      setProcedimentos(
        data.map((p: any) => ({
          ...p,
          profissionais_ids: Array.isArray(p.profissionais_ids) 
            ? p.profissionais_ids 
            : (p.profissional_id ? [p.profissional_id] : []),
        }))
      );
    }
    
    setLoading(false);
  };

  useEffect(() => {
    loadProcedimentos();
  }, []);

  // Filtragem com busca melhorada
  const filtered = procedimentos.filter(p =>
    p.nome.toLowerCase().includes(search.toLowerCase()) ||
    p.profissao.toLowerCase().includes(search.toLowerCase()) ||
    (p.especialidade && p.especialidade.toLowerCase().includes(search.toLowerCase()))
  );

  const openNew = () => {
    setEditId(null);
    setForm({
      nome: '',
      descricao: '',
      profissao: '',
      especialidade: '',
      profissionais_ids: [],
      ativo: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (p: ProcedimentoDB) => {
    setEditId(p.id);
    setForm({
      nome: p.nome,
      descricao: p.descricao || '',
      profissao: p.profissao || '',
      especialidade: p.especialidade || '',
      profissionais_ids: p.profissionais_ids || [],
      ativo: p.ativo,
    });
    setDialogOpen(true);
  };

  const toggleProfissional = (profissionalId: string) => {
    setForm(prev => ({
      ...prev,
      profissionais_ids: prev.profissionais_ids.includes(profissionalId)
        ? prev.profissionais_ids.filter(id => id !== profissionalId)
        : [...prev.profissionais_ids, profissionalId]
    }));
  };

  const handleSave = async () => {
    if (!form.nome?.trim()) {
      toast.error('Nome é obrigatório.');
      return;
    }
    if (!form.profissao) {
      toast.error('Área / Profissão é obrigatória.');
      return;
    }

    const record = {
      nome: form.nome.trim(),
      descricao: form.descricao?.trim() || null,
      profissao: form.profissao,
      especialidade: form.especialidade?.trim() || null,
      profissionais_ids: form.profissionais_ids,
      ativo: form.ativo,
    };

    if (editId) {
      const { error } = await supabase
        .from('procedimentos')
        .update({
          ...record,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', editId);

      if (error) {
        console.error(error);
        toast.error('Erro ao atualizar procedimento.');
        return;
      }
      toast.success('Procedimento atualizado com sucesso!');
    } else {
      const { error } = await supabase
        .from('procedimentos')
        .insert(record);

      if (error) {
        console.error(error);
        toast.error('Erro ao criar procedimento.');
        return;
      }
      toast.success('Procedimento criado com sucesso!');
    }

    setDialogOpen(false);
    await loadProcedimentos();
  };

  const toggleAtivo = async (p: ProcedimentoDB) => {
    const novoEstado = !p.ativo;
    
    const { error } = await supabase
      .from('procedimentos')
      .update({ 
        ativo: novoEstado,
        atualizado_em: new Date().toISOString()
      })
      .eq('id', p.id);

    if (error) {
      toast.error('Erro ao alterar status.');
      return;
    }

    setProcedimentos(prev =>
      prev.map(x => x.id === p.id ? { ...x, ativo: novoEstado } : x)
    );

    toast.success(novoEstado ? 'Procedimento ativado.' : 'Procedimento inativado.');
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
            <p className="text-sm text-muted-foreground">Multi-seleção de profissionais por procedimento</p>
          </div>
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-1" /> Novo
          </Button>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar procedimento, profissão ou especialidade..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            className="pl-10" 
          />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Carregando procedimentos...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {search ? 'Nenhum procedimento encontrado.' : 'Nenhum procedimento cadastrado.'}
          </p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {filtered.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/50 border">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{p.nome}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{p.profissao}</Badge>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {p.profissionais_ids?.length || 0} prof.
                    </Badge>
                    {!p.ativo && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Inativo</Badge>
                    )}
                  </div>
                  {p.especialidade && (
                    <p className="text-xs text-muted-foreground mt-0.5">{p.especialidade}</p>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Switch 
                    checked={p.ativo} 
                    onCheckedChange={() => toggleAtivo(p)} 
                  />
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-7 w-7" 
                    onClick={() => openEdit(p)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">
                {editId ? 'Editar' : 'Novo'} Procedimento
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div>
                <Label>Nome *</Label>
                <Input 
                  value={form.nome} 
                  onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} 
                  placeholder="Ex: Fisioterapia Respiratória CER II" 
                />
              </div>

              <div>
                <Label>Descrição</Label>
                <Input 
                  value={form.descricao} 
                  onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} 
                  placeholder="Descrição do procedimento..." 
                />
              </div>

              <div>
                <Label>Área / Profissão *</Label>
                <Select 
                  value={form.profissao} 
                  onValueChange={v => setForm(p => ({ 
                    ...p, 
                    profissao: v, 
                    profissionais_ids: [] // limpa seleção ao mudar profissão
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a área" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROFISSOES.map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Especialidade (opcional)</Label>
                <Input 
                  value={form.especialidade} 
                  onChange={e => setForm(p => ({ ...p, especialidade: e.target.value }))} 
                  placeholder="Ex: Reabilitação Neurológica" 
                />
              </div>

              {/* Seleção múltipla de profissionais */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <Label className="font-medium">
                    Profissionais ({form.profissionais_ids.length} selecionados)
                  </Label>
                </div>

                {form.profissao && profissionaisPorProfissao[form.profissao]?.length > 0 ? (
                  <ScrollArea className="h-40 border rounded-md p-3">
                    <div className="space-y-1">
                      {profissionaisPorProfissao[form.profissao].map(prof => (
                        <div 
                          key={prof.id} 
                          className="flex items-center space-x-2 p-2 rounded hover:bg-accent"
                        >
                          <Checkbox
                            id={`prof-${prof.id}`}
                            checked={form.profissionais_ids.includes(prof.id)}
                            onCheckedChange={() => toggleProfissional(prof.id)}
                          />
                          <Label 
                            htmlFor={`prof-${prof.id}`} 
                            className="text-sm cursor-pointer flex-1"
                          >
                            {prof.nome}
                            <span className="text-xs text-muted-foreground ml-1">
                              ({prof.crp || prof.cref || prof.registro || 'CRE'})
                            </span>
                          </Label>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : form.profissao ? (
                  <p className="text-sm text-muted-foreground p-4 text-center border rounded-md bg-muted/50">
                    Nenhum profissional cadastrado nesta área ainda.
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <Label>Ativo</Label>
                <Switch 
                  checked={form.ativo} 
                  onCheckedChange={v => setForm(p => ({ ...p, ativo: v }))} 
                />
              </div>

              <Button 
                onClick={handleSave} 
                className="w-full gradient-primary text-primary-foreground"
                disabled={!form.nome.trim() || !form.profissao}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {editId ? 'Salvar Alterações' : 'Criar Procedimento'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default GerenciarProcedimentos;
