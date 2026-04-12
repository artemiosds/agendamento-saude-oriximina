import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Plus, Pencil, Trash2, Loader2, Pill, FlaskConical, Eye } from 'lucide-react';
import { toast } from 'sonner';

interface Medication {
  id: string; nome: string; principio_ativo: string; classe_terapeutica: string;
  apresentacao: string; dosagem_padrao: string; via_padrao: string;
  is_global: boolean; profissional_id: string | null; ativo: boolean;
}

interface ExamType {
  id: string; nome: string; codigo_sus: string; categoria: string;
  is_global: boolean; profissional_id: string | null; ativo: boolean;
}

const PROFISSOES_PRESCRICAO = [
  { key: 'medicina', label: 'Médico / Médica' },
  { key: 'odontologia', label: 'Odontólogo / Odontóloga' },
  { key: 'fisioterapia', label: 'Fisioterapeuta' },
  { key: 'psicologia', label: 'Psicólogo / Psicóloga' },
  { key: 'fonoaudiologia', label: 'Fonoaudiólogo / Fonoaudióloga' },
  { key: 'nutricao', label: 'Nutricionista' },
  { key: 'terapia_ocupacional', label: 'Terapeuta Ocupacional' },
  { key: 'enfermagem', label: 'Enfermeiro / Enfermeira' },
];

const CONFIG_KEY = 'config_prescricao_perfil';

const ConfigMedicamentosExames: React.FC = () => {
  const [meds, setMeds] = useState<Medication[]>([]);
  const [exams, setExams] = useState<ExamType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [examSearch, setExamSearch] = useState('');
  const [editMed, setEditMed] = useState<Medication | null>(null);
  const [editExam, setEditExam] = useState<ExamType | null>(null);
  const [addMedDialog, setAddMedDialog] = useState(false);
  const [addExamDialog, setAddExamDialog] = useState(false);
  const [deleteItem, setDeleteItem] = useState<{ type: 'med' | 'exam'; id: string } | null>(null);
  const [newMed, setNewMed] = useState({ nome: '', principio_ativo: '', classe_terapeutica: '', apresentacao: '', dosagem_padrao: '', via_padrao: 'oral' });
  const [newExam, setNewExam] = useState({ nome: '', codigo_sus: '', categoria: '' });
  const [prescricaoConfig, setPrescricaoConfig] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    const [medsRes, examsRes, cfgRes] = await Promise.all([
      supabase.from('medications').select('*').order('classe_terapeutica,nome'),
      supabase.from('exam_types').select('*').order('categoria,nome'),
      supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle(),
    ]);
    if (medsRes.data) setMeds(medsRes.data);
    if (examsRes.data) setExams(examsRes.data);
    const cfg = cfgRes.data?.configuracoes as any;
    if (cfg?.[CONFIG_KEY]) setPrescricaoConfig(cfg[CONFIG_KEY]);
    else setPrescricaoConfig({ medicina: true, odontologia: true });
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredMeds = useMemo(() => {
    if (!search) return meds;
    const s = search.toLowerCase();
    return meds.filter(m => m.nome.toLowerCase().includes(s) || m.classe_terapeutica.toLowerCase().includes(s));
  }, [meds, search]);

  const filteredExams = useMemo(() => {
    if (!examSearch) return exams;
    const s = examSearch.toLowerCase();
    return exams.filter(e => e.nome.toLowerCase().includes(s) || e.codigo_sus.includes(s) || e.categoria.toLowerCase().includes(s));
  }, [exams, examSearch]);

  const medsByClass = useMemo(() => {
    const map = new Map<string, Medication[]>();
    filteredMeds.forEach(m => {
      const key = m.classe_terapeutica || 'Sem classificação';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    });
    return map;
  }, [filteredMeds]);

  const examsByCategory = useMemo(() => {
    const map = new Map<string, ExamType[]>();
    filteredExams.forEach(e => {
      const key = e.categoria || 'Sem categoria';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return map;
  }, [filteredExams]);

  const toggleMedAtivo = async (id: string) => {
    const med = meds.find(m => m.id === id);
    if (!med) return;
    const { error } = await supabase.from('medications').update({ ativo: !med.ativo }).eq('id', id);
    if (error) { toast.error('Erro ao atualizar'); return; }
    setMeds(prev => prev.map(m => m.id === id ? { ...m, ativo: !m.ativo } : m));
    toast.success(med.ativo ? 'Desabilitado' : 'Habilitado');
  };

  const toggleExamAtivo = async (id: string) => {
    const exam = exams.find(e => e.id === id);
    if (!exam) return;
    const { error } = await supabase.from('exam_types').update({ ativo: !exam.ativo }).eq('id', id);
    if (error) { toast.error('Erro ao atualizar'); return; }
    setExams(prev => prev.map(e => e.id === id ? { ...e, ativo: !e.ativo } : e));
    toast.success(exam.ativo ? 'Desabilitado' : 'Habilitado');
  };

  const saveEditMed = async () => {
    if (!editMed) return;
    const { error } = await supabase.from('medications').update({
      nome: editMed.nome, principio_ativo: editMed.principio_ativo,
      classe_terapeutica: editMed.classe_terapeutica, apresentacao: editMed.apresentacao,
      dosagem_padrao: editMed.dosagem_padrao, via_padrao: editMed.via_padrao,
      is_global: editMed.is_global,
    }).eq('id', editMed.id);
    if (error) { toast.error('Erro ao salvar'); return; }
    setMeds(prev => prev.map(m => m.id === editMed.id ? editMed : m));
    setEditMed(null);
    toast.success('Medicamento atualizado');
  };

  const saveEditExam = async () => {
    if (!editExam) return;
    const { error } = await supabase.from('exam_types').update({
      nome: editExam.nome, codigo_sus: editExam.codigo_sus,
      categoria: editExam.categoria, is_global: editExam.is_global,
    }).eq('id', editExam.id);
    if (error) { toast.error('Erro ao salvar'); return; }
    setExams(prev => prev.map(e => e.id === editExam.id ? editExam : e));
    setEditExam(null);
    toast.success('Exame atualizado');
  };

  const addNewMed = async () => {
    if (!newMed.nome.trim()) return;
    const { data, error } = await supabase.from('medications').insert({ ...newMed, is_global: true, ativo: true }).select().single();
    if (error) { toast.error('Erro ao criar'); return; }
    if (data) setMeds(prev => [...prev, data]);
    setAddMedDialog(false);
    setNewMed({ nome: '', principio_ativo: '', classe_terapeutica: '', apresentacao: '', dosagem_padrao: '', via_padrao: 'oral' });
    toast.success('Medicamento criado');
  };

  const addNewExam = async () => {
    if (!newExam.nome.trim()) return;
    const { data, error } = await supabase.from('exam_types').insert({ ...newExam, is_global: true, ativo: true }).select().single();
    if (error) { toast.error('Erro ao criar'); return; }
    if (data) setExams(prev => [...prev, data]);
    setAddExamDialog(false);
    setNewExam({ nome: '', codigo_sus: '', categoria: '' });
    toast.success('Exame criado');
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    if (deleteItem.type === 'med') {
      await supabase.from('medications').update({ ativo: false }).eq('id', deleteItem.id);
      setMeds(prev => prev.filter(m => m.id !== deleteItem.id));
    } else {
      await supabase.from('exam_types').update({ ativo: false }).eq('id', deleteItem.id);
      setExams(prev => prev.filter(e => e.id !== deleteItem.id));
    }
    setDeleteItem(null);
    toast.success('Item removido');
  };

  const makeMedGlobal = async (id: string) => {
    await supabase.from('medications').update({ is_global: true }).eq('id', id);
    setMeds(prev => prev.map(m => m.id === id ? { ...m, is_global: true } : m));
    toast.success('Medicamento tornado global');
  };

  const makeExamGlobal = async (id: string) => {
    await supabase.from('exam_types').update({ is_global: true }).eq('id', id);
    setExams(prev => prev.map(e => e.id === id ? { ...e, is_global: true } : e));
    toast.success('Exame tornado global');
  };

  const savePrescricaoConfig = async (updated: Record<string, boolean>) => {
    setPrescricaoConfig(updated);
    const { data: existing } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
    const existingConfig = (existing?.configuracoes as any) || {};
    await supabase.from('system_config').upsert({
      id: 'default',
      configuracoes: { ...existingConfig, [CONFIG_KEY]: updated },
      updated_at: new Date().toISOString(),
    });
    toast.success('Permissões de prescrição salvas');
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const customMeds = meds.filter(m => !m.is_global && m.profissional_id);
  const customExams = exams.filter(e => !e.is_global && e.profissional_id);

  return (
    <div className="space-y-6">
      <Tabs defaultValue="medicamentos">
        <TabsList className="w-full">
          <TabsTrigger value="medicamentos" className="flex-1"><Pill className="w-4 h-4 mr-1.5" />Medicamentos <Badge variant="secondary" className="ml-1.5 text-[10px]">{meds.length}</Badge></TabsTrigger>
          <TabsTrigger value="exames" className="flex-1"><FlaskConical className="w-4 h-4 mr-1.5" />Exames <Badge variant="secondary" className="ml-1.5 text-[10px]">{exams.length}</Badge></TabsTrigger>
          <TabsTrigger value="perfil" className="flex-1"><Eye className="w-4 h-4 mr-1.5" />Permissões</TabsTrigger>
        </TabsList>

        <TabsContent value="medicamentos" className="space-y-4 mt-4">
          <div className="flex gap-2">
            <div className="relative flex-1"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar por nome ou classe..." value={search} onChange={e => setSearch(e.target.value)} /></div>
            <Button onClick={() => setAddMedDialog(true)}><Plus className="w-4 h-4 mr-1" />Novo</Button>
          </div>

          {customMeds.length > 0 && (
            <Card className="border-warning/30 bg-warning/5">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold mb-2">Medicamentos criados por profissionais</h4>
                {customMeds.map(m => (
                  <div key={m.id} className="flex items-center gap-2 py-1.5">
                    <span className="text-sm flex-1">{m.nome}</span>
                    <Badge variant="outline" className="text-[10px]">Personalizado</Badge>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => makeMedGlobal(m.id)}>Tornar global</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => setDeleteItem({ type: 'med', id: m.id })}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {Array.from(medsByClass.entries()).map(([classe, items]) => (
            <Card key={classe} className="shadow-card border-0">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2 border-l-3 border-accent pl-2">{classe}</h4>
                <div className="space-y-1.5">
                  {items.map(m => (
                    <div key={m.id} className={`flex items-center gap-2 py-1.5 px-2 rounded ${!m.ativo ? 'opacity-50' : ''}`}>
                      <Switch checked={m.ativo} onCheckedChange={() => toggleMedAtivo(m.id)} />
                      <span className="text-sm flex-1">{m.nome} <span className="text-muted-foreground text-xs">— {m.dosagem_padrao} {m.via_padrao}</span></span>
                      {!m.is_global && <Badge variant="secondary" className="text-[9px]">Personalizado</Badge>}
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditMed({ ...m })}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/70" onClick={() => setDeleteItem({ type: 'med', id: m.id })}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="exames" className="space-y-4 mt-4">
          <div className="flex gap-2">
            <div className="relative flex-1"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar por nome, código SUS ou categoria..." value={examSearch} onChange={e => setExamSearch(e.target.value)} /></div>
            <Button onClick={() => setAddExamDialog(true)}><Plus className="w-4 h-4 mr-1" />Novo</Button>
          </div>

          {customExams.length > 0 && (
            <Card className="border-warning/30 bg-warning/5">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold mb-2">Exames criados por profissionais</h4>
                {customExams.map(e => (
                  <div key={e.id} className="flex items-center gap-2 py-1.5">
                    <span className="text-sm flex-1">{e.nome}</span>
                    <Badge variant="outline" className="text-[10px]">Personalizado</Badge>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => makeExamGlobal(e.id)}>Tornar global</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => setDeleteItem({ type: 'exam', id: e.id })}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {Array.from(examsByCategory.entries()).map(([cat, items]) => (
            <Card key={cat} className="shadow-card border-0">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2 border-l-3 border-success pl-2">{cat}</h4>
                <div className="space-y-1.5">
                  {items.map(e => (
                    <div key={e.id} className={`flex items-center gap-2 py-1.5 px-2 rounded ${!e.ativo ? 'opacity-50' : ''}`}>
                      <Switch checked={e.ativo} onCheckedChange={() => toggleExamAtivo(e.id)} />
                      <span className="text-sm flex-1">{e.nome} {e.codigo_sus && <span className="text-muted-foreground text-xs font-mono">({e.codigo_sus})</span>}</span>
                      {!e.is_global && <Badge variant="secondary" className="text-[9px]">Personalizado</Badge>}
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditExam({ ...e })}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/70" onClick={() => setDeleteItem({ type: 'exam', id: e.id })}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="perfil" className="space-y-4 mt-4">
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <h3 className="font-semibold font-display text-foreground mb-1">Prescrição de Medicamentos</h3>
              <p className="text-xs text-muted-foreground mb-3">Quais profissões podem prescrever medicamentos:</p>
              <div className="space-y-2">
                {PROFISSOES_PRESCRICAO.map(p => (
                  <div key={p.key} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                    <Checkbox
                      checked={prescricaoConfig[p.key] ?? false}
                      onCheckedChange={v => savePrescricaoConfig({ ...prescricaoConfig, [p.key]: !!v })}
                    />
                    <span className="text-sm">{p.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <h3 className="font-semibold font-display text-foreground mb-1">Solicitação de Exames</h3>
              <p className="text-xs text-muted-foreground mb-3">Quais profissões podem solicitar exames:</p>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-success/5 border border-success/20">
                <Checkbox checked defaultChecked disabled />
                <span className="text-sm font-medium">Todas as profissões (padrão)</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">Para restringir, desabilite acima e selecione individualmente.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Medication Dialog */}
      <Dialog open={!!editMed} onOpenChange={() => setEditMed(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Medicamento</DialogTitle></DialogHeader>
          {editMed && (
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={editMed.nome} onChange={e => setEditMed({ ...editMed, nome: e.target.value })} /></div>
              <div><Label>Princípio Ativo</Label><Input value={editMed.principio_ativo} onChange={e => setEditMed({ ...editMed, principio_ativo: e.target.value })} /></div>
              <div><Label>Classe Terapêutica</Label><Input value={editMed.classe_terapeutica} onChange={e => setEditMed({ ...editMed, classe_terapeutica: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Dosagem</Label><Input value={editMed.dosagem_padrao} onChange={e => setEditMed({ ...editMed, dosagem_padrao: e.target.value })} /></div>
                <div><Label>Via</Label><Input value={editMed.via_padrao} onChange={e => setEditMed({ ...editMed, via_padrao: e.target.value })} /></div>
              </div>
              <div className="flex items-center gap-2"><Switch checked={editMed.is_global} onCheckedChange={v => setEditMed({ ...editMed, is_global: v })} /><Label>Global (visível para todos)</Label></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMed(null)}>Cancelar</Button>
            <Button onClick={saveEditMed}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Exam Dialog */}
      <Dialog open={!!editExam} onOpenChange={() => setEditExam(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Exame</DialogTitle></DialogHeader>
          {editExam && (
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={editExam.nome} onChange={e => setEditExam({ ...editExam, nome: e.target.value })} /></div>
              <div><Label>Código SUS</Label><Input value={editExam.codigo_sus} onChange={e => setEditExam({ ...editExam, codigo_sus: e.target.value })} /></div>
              <div><Label>Categoria</Label><Input value={editExam.categoria} onChange={e => setEditExam({ ...editExam, categoria: e.target.value })} /></div>
              <div className="flex items-center gap-2"><Switch checked={editExam.is_global} onCheckedChange={v => setEditExam({ ...editExam, is_global: v })} /><Label>Global</Label></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditExam(null)}>Cancelar</Button>
            <Button onClick={saveEditExam}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Medication Dialog */}
      <Dialog open={addMedDialog} onOpenChange={setAddMedDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Medicamento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome *</Label><Input value={newMed.nome} onChange={e => setNewMed(p => ({ ...p, nome: e.target.value }))} /></div>
            <div><Label>Princípio Ativo</Label><Input value={newMed.principio_ativo} onChange={e => setNewMed(p => ({ ...p, principio_ativo: e.target.value }))} /></div>
            <div><Label>Classe Terapêutica</Label><Input value={newMed.classe_terapeutica} onChange={e => setNewMed(p => ({ ...p, classe_terapeutica: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Apresentação</Label><Input value={newMed.apresentacao} onChange={e => setNewMed(p => ({ ...p, apresentacao: e.target.value }))} /></div>
              <div><Label>Via</Label><Input value={newMed.via_padrao} onChange={e => setNewMed(p => ({ ...p, via_padrao: e.target.value }))} /></div>
            </div>
            <div><Label>Dosagem</Label><Input value={newMed.dosagem_padrao} onChange={e => setNewMed(p => ({ ...p, dosagem_padrao: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMedDialog(false)}>Cancelar</Button>
            <Button onClick={addNewMed} disabled={!newMed.nome.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Exam Dialog */}
      <Dialog open={addExamDialog} onOpenChange={setAddExamDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Exame</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome *</Label><Input value={newExam.nome} onChange={e => setNewExam(p => ({ ...p, nome: e.target.value }))} /></div>
            <div><Label>Código SUS</Label><Input value={newExam.codigo_sus} onChange={e => setNewExam(p => ({ ...p, codigo_sus: e.target.value }))} /></div>
            <div><Label>Categoria</Label><Input value={newExam.categoria} onChange={e => setNewExam(p => ({ ...p, categoria: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddExamDialog(false)}>Cancelar</Button>
            <Button onClick={addNewExam} disabled={!newExam.nome.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {deleteItem?.type === 'med' ? 'medicamento' : 'exame'}?</AlertDialogTitle>
            <AlertDialogDescription>O item será desativado. Registros em prontuários já salvos não são afetados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ConfigMedicamentosExames;
