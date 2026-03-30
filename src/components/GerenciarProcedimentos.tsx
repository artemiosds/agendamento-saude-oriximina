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
import { Plus, Pencil, Search, Stethoscope, Users, CheckCircle, AlertCircle } from 'lucide-react';
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

  // === DEBUG: Mostrar informações dos profissionais ===
  const profissionais = useMemo(() => {
    const filtered = funcionarios.filter(f => 
      f.role === 'profissional' && f.ativo === true
    );

    console.log('🔍 Total de funcionários:', funcionarios.length);
    console.log('✅ Profissionais ativos encontrados:', filtered.length);
    console.log('Profissões dos profissionais:', [...new Set(filtered.map(f => f.profissao))]);

    return filtered;
  }, [funcionarios]);

  const profissionaisPorProfissao = useMemo(() => {
    const grouped: Record<string, any[]> = {};

    PROFISSOES.forEach(prof => {
      // Filtro mais flexível (ignora maiúsculas/minúsculas e espaços extras)
      grouped[prof] = profissionais.filter(p => 
        p.profissao && 
        p.profissao.toString().trim().toLowerCase() === prof.toLowerCase()
      );
    });

    console.log('📊 Profissionais por profissão:', 
      Object.fromEntries(
        Object.entries(grouped).map(([key, value]) => [key, value.length])
      )
    );

    return grouped;
  }, [profissionais]);

  const loadProcedimentos = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('procedimentos')
      .select('*')
      .order('profissao', { ascending: true });

    if (error) console.error(error);
    if (data) {
      setProcedimentos(data.map((p: any) => ({
        ...p,
        profissionais_ids: Array.isArray(p.profissionais_ids) ? p.profissionais_ids : [],
      })));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadProcedimentos();
  }, []);

  const filtered = procedimentos.filter(p =>
    p.nome.toLowerCase().includes(search.toLowerCase()) ||
    p.profissao.toLowerCase().includes(search.toLowerCase()) ||
    (p.especialidade && p.especialidade.toLowerCase().includes(search.toLowerCase()))
  );

  const openNew = () => { /* mesmo código anterior */ 
    setEditId(null);
    setForm({ nome: '', descricao: '', profissao: '', especialidade: '', profissionais_ids: [], ativo: true });
    setDialogOpen(true);
  };

  const openEdit = (p: ProcedimentoDB) => {
    setEditId(p.id);
    setForm({
      nome: p.nome,
      descricao: p.descricao || '',
      profissao: p.profissao || '',
      especialidade: p.especialidade || '',
      profissionais_ids: Array.isArray(p.profissionais_ids) ? p.profissionais_ids : [],
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
    if (!form.nome?.trim() || !form.profissao) {
      toast.error('Nome e Área/Profissão são obrigatórios.');
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
      const { error } = await supabase.from('procedimentos').update(record).eq('id', editId);
      if (error) toast.error('Erro ao atualizar');
      else toast.success('Atualizado com sucesso!');
    } else {
      const { error } = await supabase.from('procedimentos').insert(record);
      if (error) toast.error('Erro ao criar');
      else toast.success('Criado com sucesso!');
    }

    setDialogOpen(false);
    await loadProcedimentos();
  };

  const toggleAtivo = async (p: ProcedimentoDB) => {
    const novoEstado = !p.ativo;
    await supabase.from('procedimentos').update({ ativo: novoEstado }).eq('id', p.id);
    setProcedimentos(prev => prev.map(x => x.id === p.id ? { ...x, ativo: novoEstado } : x));
    toast.success(novoEstado ? 'Ativado' : 'Inativado');
  };

  return (
    <Card className="shadow-card border-0">
      <CardContent className="p-5">
        {/* cabeçalho igual ao anterior */}

        {/* ... resto do código de listagem igual ... */}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Novo Procedimento</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Campos de nome, descrição, profissão e especialidade (igual) */}

              <div>
                <Label>Área / Profissão *</Label>
                <Select value={form.profissao} onValueChange={v => setForm(p => ({ ...p, profissao: v, profissionais_ids: [] }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a área" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROFISSOES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* === Parte corrigida dos profissionais === */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <Label className="font-medium">
                    Profissionais ({form.profissionais_ids.length} selecionados)
                  </Label>
                </div>

                {form.profissao ? (
                  profissionaisPorProfissao[form.profissao]?.length > 0 ? (
                    <ScrollArea className="h-52 border rounded-md p-3 bg-muted/30">
                      <div className="space-y-2">
                        {profissionaisPorProfissao[form.profissao].map((prof: any) => (
                          <div key={prof.id} className="flex items-center space-x-3 p-2 rounded hover:bg-accent">
                            <Checkbox
                              checked={form.profissionais_ids.includes(prof.id)}
                              onCheckedChange={() => toggleProfissional(prof.id)}
                            />
                            <div>
                              <div className="font-medium text-sm">{prof.nome}</div>
                              <div className="text-xs text-muted-foreground">
                                {prof.profissao} • {prof.crp || prof.cref || prof.registro || 'Sem registro'}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="border rounded-md p-6 text-center bg-muted/50">
                      <AlertCircle className="w-8 h-8 mx-auto text-amber-500 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Nenhum profissional encontrado para <strong>{form.profissao}</strong>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Verifique se os profissionais têm a profissão exatamente como "{form.profissao}"
                      </p>
                    </div>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground p-4 text-center border rounded-md">
                    Selecione uma área/profissão primeiro
                  </p>
                )}
              </div>

              {/* Switch Ativo e Botão Salvar */}
              <div className="flex items-center justify-between pt-4 border-t">
                <Label>Ativo</Label>
                <Switch checked={form.ativo} onCheckedChange={v => setForm(p => ({ ...p, ativo: v }))} />
              </div>

              <Button onClick={handleSave} className="w-full" disabled={!form.nome.trim() || !form.profissao}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Criar Procedimento
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default GerenciarProcedimentos;
