import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Plus, Pencil, Trash2, Loader2, Pill, FlaskConical, Eye, Download, AlertTriangle, Package, FolderTree } from 'lucide-react';
import { toast } from 'sonner';
import { RENAME_MEDICAMENTOS, REME_MEDICAMENTOS, type MedicamentoSeed, type TipoMedicamento, type OrigemMedicamento } from '@/data/medicamentosRename';

interface Medication {
  id: string;
  nome: string;
  nome_comercial: string;
  principio_ativo: string;
  classe_terapeutica: string;
  apresentacao: string;
  dosagem_padrao: string;
  via_padrao: string;
  forma_farmaceutica: string;
  concentracao: string;
  codigo_rename: string | null;
  tipo: TipoMedicamento;
  origem: OrigemMedicamento;
  estoque_quantidade: number;
  estoque_minimo: number;
  estoque_unidade: string;
  estoque_localizacao: string;
  estoque_controlado: boolean;
  is_global: boolean;
  profissional_id: string | null;
  ativo: boolean;
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

const TIPO_COLORS: Record<TipoMedicamento, { label: string; cls: string }> = {
  comum: { label: 'Comum', cls: 'bg-muted text-muted-foreground' },
  controlado: { label: 'CONTROLADO', cls: 'bg-destructive text-destructive-foreground' },
  psicotropico: { label: 'PSICOTRÓPICO', cls: 'bg-destructive text-destructive-foreground' },
  antibiotico: { label: 'ANTIBIÓTICO', cls: 'bg-orange-500 text-white' },
};

function stockBadge(m: Medication) {
  if (!m.estoque_controlado) return null;
  if (m.estoque_quantidade <= 0) return <Badge className="bg-destructive text-destructive-foreground text-[9px]">Indisponível</Badge>;
  if (m.estoque_quantidade <= m.estoque_minimo) return <Badge className="bg-yellow-500 text-white text-[9px]">Estoque baixo</Badge>;
  return <Badge className="bg-green-600 text-white text-[9px]">Disponível</Badge>;
}

const ConfigMedicamentosExames: React.FC = () => {
  const [meds, setMeds] = useState<Medication[]>([]);
  const [exams, setExams] = useState<ExamType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [examSearch, setExamSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [tipoFilter, setTipoFilter] = useState<string>('all');
  const [origemFilter, setOrigemFilter] = useState<string>('all');
  const [editMed, setEditMed] = useState<Medication | null>(null);
  const [editExam, setEditExam] = useState<ExamType | null>(null);
  const [addMedDialog, setAddMedDialog] = useState(false);
  const [addExamDialog, setAddExamDialog] = useState(false);
  const [deleteItem, setDeleteItem] = useState<{ type: 'med' | 'exam'; id: string } | null>(null);
  const [importing, setImporting] = useState<null | 'rename' | 'reme'>(null);
  const [newMed, setNewMed] = useState<Partial<Medication>>({
    nome: '', nome_comercial: '', principio_ativo: '', classe_terapeutica: '',
    apresentacao: '', dosagem_padrao: '', via_padrao: 'oral',
    forma_farmaceutica: '', concentracao: '', tipo: 'comum',
  });
  const [newExam, setNewExam] = useState({ nome: '', codigo_sus: '', categoria: '' });
  const [prescricaoConfig, setPrescricaoConfig] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    const [medsRes, examsRes, cfgRes] = await Promise.all([
      supabase.from('medications').select('*').order('classe_terapeutica').order('nome'),
      supabase.from('exam_types').select('*').order('categoria').order('nome'),
      supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle(),
    ]);
    if (medsRes.data) setMeds(medsRes.data as any);
    if (examsRes.data) setExams(examsRes.data as any);
    const cfg = cfgRes.data?.configuracoes as any;
    if (cfg?.[CONFIG_KEY]) setPrescricaoConfig(cfg[CONFIG_KEY]);
    else setPrescricaoConfig({ medicina: true, odontologia: true });
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredMeds = useMemo(() => {
    const s = search.trim().toLowerCase();
    return meds.filter(m => {
      if (!m.ativo) return false;
      if (classFilter !== 'all' && (m.classe_terapeutica || 'Sem classificação') !== classFilter) return false;
      if (tipoFilter !== 'all' && m.tipo !== tipoFilter) return false;
      if (origemFilter !== 'all' && m.origem !== origemFilter) return false;
      if (!s) return true;
      return (
        m.nome.toLowerCase().includes(s) ||
        (m.nome_comercial || '').toLowerCase().includes(s) ||
        (m.principio_ativo || '').toLowerCase().includes(s) ||
        (m.classe_terapeutica || '').toLowerCase().includes(s) ||
        (m.codigo_rename || '').toLowerCase().includes(s) ||
        (m.forma_farmaceutica || '').toLowerCase().includes(s) ||
        (m.tipo || '').toLowerCase().includes(s)
      );
    });
  }, [meds, search, classFilter, tipoFilter, origemFilter]);

  const inactiveMeds = useMemo(() => meds.filter(m => !m.ativo), [meds]);
  const customMeds = useMemo(() => meds.filter(m => !m.is_global && m.profissional_id), [meds]);

  const allClasses = useMemo(() => {
    const set = new Set<string>();
    meds.forEach(m => set.add(m.classe_terapeutica || 'Sem classificação'));
    return Array.from(set).sort();
  }, [meds]);

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
      nome: editMed.nome, nome_comercial: editMed.nome_comercial,
      principio_ativo: editMed.principio_ativo, classe_terapeutica: editMed.classe_terapeutica,
      apresentacao: editMed.apresentacao, dosagem_padrao: editMed.dosagem_padrao,
      via_padrao: editMed.via_padrao, forma_farmaceutica: editMed.forma_farmaceutica,
      concentracao: editMed.concentracao, tipo: editMed.tipo, is_global: editMed.is_global,
      estoque_controlado: editMed.estoque_controlado,
      estoque_quantidade: editMed.estoque_quantidade, estoque_minimo: editMed.estoque_minimo,
      estoque_unidade: editMed.estoque_unidade, estoque_localizacao: editMed.estoque_localizacao,
    } as any).eq('id', editMed.id);
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
    if (!newMed.nome?.trim()) return;
    const payload: any = {
      ...newMed,
      nome: newMed.nome!.trim(),
      apresentacao: newMed.apresentacao || `${newMed.forma_farmaceutica || ''} ${newMed.concentracao || ''}`.trim(),
      dosagem_padrao: newMed.dosagem_padrao || newMed.concentracao || '',
      is_global: true, ativo: true, origem: 'manual',
    };
    const { data, error } = await supabase.from('medications').insert(payload).select().single();
    if (error) { toast.error('Erro ao criar: ' + error.message); return; }
    if (data) setMeds(prev => [...prev, data as any]);
    setAddMedDialog(false);
    setNewMed({ nome: '', nome_comercial: '', principio_ativo: '', classe_terapeutica: '', apresentacao: '', dosagem_padrao: '', via_padrao: 'oral', forma_farmaceutica: '', concentracao: '', tipo: 'comum' });
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
      setMeds(prev => prev.map(m => m.id === deleteItem.id ? { ...m, ativo: false } : m));
    } else {
      await supabase.from('exam_types').update({ ativo: false }).eq('id', deleteItem.id);
      setExams(prev => prev.map(e => e.id === deleteItem.id ? { ...e, ativo: false } : e));
    }
    setDeleteItem(null);
    toast.success('Item desativado (movido para Inativos)');
  };

  const reactivateMed = async (id: string) => {
    await supabase.from('medications').update({ ativo: true }).eq('id', id);
    setMeds(prev => prev.map(m => m.id === id ? { ...m, ativo: true } : m));
    toast.success('Reativado');
  };

  const makeMedGlobal = async (id: string) => {
    await supabase.from('medications').update({ is_global: true }).eq('id', id);
    setMeds(prev => prev.map(m => m.id === id ? { ...m, is_global: true } : m));
    toast.success('Medicamento tornado global');
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

  const importarSeed = async (lista: MedicamentoSeed[], origem: OrigemMedicamento) => {
    setImporting(origem === 'rename' ? 'rename' : 'reme');
    try {
      // Fetch existing codigo_rename to avoid duplicates
      const { data: existing } = await supabase
        .from('medications')
        .select('codigo_rename')
        .not('codigo_rename', 'is', null);
      const existingCodes = new Set((existing || []).map((r: any) => r.codigo_rename).filter(Boolean));
      const novos = lista.filter(item => !existingCodes.has(item.codigo_rename));
      if (novos.length === 0) {
        toast.info(`Nenhum item novo: a base ${origem.toUpperCase()} já está atualizada.`);
        setImporting(null);
        return;
      }
      const payload = novos.map(item => ({
        nome: item.nome,
        nome_comercial: item.nome_comercial,
        principio_ativo: item.principio_ativo,
        classe_terapeutica: item.classe_terapeutica,
        apresentacao: item.apresentacao,
        dosagem_padrao: item.dosagem_padrao,
        via_padrao: item.via_padrao,
        forma_farmaceutica: item.forma_farmaceutica,
        concentracao: item.concentracao,
        codigo_rename: item.codigo_rename,
        tipo: item.tipo,
        origem,
        is_global: true,
        ativo: true,
      }));
      // Insert in chunks of 200
      for (let i = 0; i < payload.length; i += 200) {
        const chunk = payload.slice(i, i + 200);
        const { error } = await supabase.from('medications').insert(chunk as any);
        if (error) throw error;
      }
      toast.success(`Base ${origem.toUpperCase()} carregada: ${novos.length} medicamentos importados (${lista.length - novos.length} já existiam).`);
      await loadData();
    } catch (err: any) {
      toast.error(`Erro ao importar ${origem.toUpperCase()}: ${err?.message || err}`);
    } finally {
      setImporting(null);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="medicamentos">
        <TabsList className="w-full flex-wrap h-auto">
          <TabsTrigger value="medicamentos" className="flex-1"><Pill className="w-4 h-4 mr-1.5" />Medicamentos <Badge variant="secondary" className="ml-1.5 text-[10px]">{meds.filter(m => m.ativo).length}</Badge></TabsTrigger>
          <TabsTrigger value="exames" className="flex-1"><FlaskConical className="w-4 h-4 mr-1.5" />Exames <Badge variant="secondary" className="ml-1.5 text-[10px]">{exams.filter(e => e.ativo).length}</Badge></TabsTrigger>
          <TabsTrigger value="categorias" className="flex-1"><FolderTree className="w-4 h-4 mr-1.5" />Categorias <Badge variant="secondary" className="ml-1.5 text-[10px]">{allClasses.length}</Badge></TabsTrigger>
          <TabsTrigger value="personalizados" className="flex-1"><Pencil className="w-4 h-4 mr-1.5" />Personalizados <Badge variant="secondary" className="ml-1.5 text-[10px]">{customMeds.length}</Badge></TabsTrigger>
          <TabsTrigger value="inativos" className="flex-1"><Trash2 className="w-4 h-4 mr-1.5" />Inativos <Badge variant="secondary" className="ml-1.5 text-[10px]">{inactiveMeds.length}</Badge></TabsTrigger>
          <TabsTrigger value="importacao" className="flex-1"><Download className="w-4 h-4 mr-1.5" />Importação</TabsTrigger>
          <TabsTrigger value="perfil" className="flex-1"><Eye className="w-4 h-4 mr-1.5" />Permissões</TabsTrigger>
        </TabsList>

        {/* MEDICAMENTOS */}
        <TabsContent value="medicamentos" className="space-y-4 mt-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por nome, comercial, princípio ativo, classe, código RENAME..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Classe" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as classes</SelectItem>
                {allClasses.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={tipoFilter} onValueChange={setTipoFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="comum">Comum</SelectItem>
                <SelectItem value="controlado">Controlado</SelectItem>
                <SelectItem value="psicotropico">Psicotrópico</SelectItem>
                <SelectItem value="antibiotico">Antibiótico</SelectItem>
              </SelectContent>
            </Select>
            <Select value={origemFilter} onValueChange={setOrigemFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Origem" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas origens</SelectItem>
                <SelectItem value="rename">RENAME</SelectItem>
                <SelectItem value="reme">REME</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setAddMedDialog(true)}><Plus className="w-4 h-4 mr-1" />Novo</Button>
          </div>

          <p className="text-xs text-muted-foreground">{filteredMeds.length} medicamento(s) encontrado(s)</p>

          {Array.from(medsByClass.entries()).map(([classe, items]) => (
            <Card key={classe} className="shadow-card border-0">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2 border-l-4 border-accent pl-2 flex items-center gap-2">
                  {classe} <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
                </h4>
                <div className="space-y-1.5">
                  {items.map(m => {
                    const tipoBadge = TIPO_COLORS[m.tipo] || TIPO_COLORS.comum;
                    return (
                      <div key={m.id} className={`flex items-center flex-wrap gap-2 py-1.5 px-2 rounded ${!m.ativo ? 'opacity-50' : ''}`}>
                        <Switch checked={m.ativo} onCheckedChange={() => toggleMedAtivo(m.id)} />
                        <div className="flex-1 min-w-[150px]">
                          <span className="text-sm font-medium">{m.nome}</span>
                          {m.nome_comercial && <span className="text-xs text-muted-foreground"> ({m.nome_comercial})</span>}
                          <div className="text-xs text-muted-foreground">
                            {[m.concentracao || m.dosagem_padrao, m.forma_farmaceutica, m.via_padrao].filter(Boolean).join(' • ')}
                          </div>
                        </div>
                        {m.tipo !== 'comum' && <Badge className={`text-[9px] ${tipoBadge.cls}`}>{tipoBadge.label}</Badge>}
                        {m.origem !== 'manual' && <Badge variant="outline" className="text-[9px]">{m.origem.toUpperCase()}</Badge>}
                        {stockBadge(m)}
                        {!m.is_global && <Badge variant="secondary" className="text-[9px]">Personalizado</Badge>}
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditMed({ ...m })}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/70" onClick={() => setDeleteItem({ type: 'med', id: m.id })}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* EXAMES */}
        <TabsContent value="exames" className="space-y-4 mt-4">
          <div className="flex gap-2">
            <div className="relative flex-1"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar por nome, código SUS ou categoria..." value={examSearch} onChange={e => setExamSearch(e.target.value)} /></div>
            <Button onClick={() => setAddExamDialog(true)}><Plus className="w-4 h-4 mr-1" />Novo</Button>
          </div>
          {Array.from(examsByCategory.entries()).map(([cat, items]) => (
            <Card key={cat} className="shadow-card border-0">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2 border-l-4 border-green-500 pl-2">{cat}</h4>
                <div className="space-y-1.5">
                  {items.map(e => (
                    <div key={e.id} className={`flex items-center gap-2 py-1.5 px-2 rounded ${!e.ativo ? 'opacity-50' : ''}`}>
                      <Switch checked={e.ativo} onCheckedChange={() => toggleExamAtivo(e.id)} />
                      <span className="text-sm flex-1">{e.nome} {e.codigo_sus && <span className="text-muted-foreground text-xs font-mono">({e.codigo_sus})</span>}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditExam({ ...e })}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/70" onClick={() => setDeleteItem({ type: 'exam', id: e.id })}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* CATEGORIAS */}
        <TabsContent value="categorias" className="mt-4">
          <Card className="shadow-card border-0">
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold mb-3">Classes terapêuticas em uso</h3>
              {allClasses.map(c => {
                const count = meds.filter(m => (m.classe_terapeutica || 'Sem classificação') === c && m.ativo).length;
                return (
                  <div key={c} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                    <span className="text-sm">{c}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PERSONALIZADOS */}
        <TabsContent value="personalizados" className="mt-4 space-y-3">
          {customMeds.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhum medicamento personalizado por profissionais.</CardContent></Card>
          ) : customMeds.map(m => (
            <Card key={m.id} className="shadow-card border-0">
              <CardContent className="p-3 flex items-center gap-2">
                <span className="text-sm flex-1">{m.nome} <span className="text-xs text-muted-foreground">— {m.dosagem_padrao}</span></span>
                <Badge variant="outline" className="text-[10px]">Personalizado</Badge>
                <Button size="sm" variant="outline" onClick={() => makeMedGlobal(m.id)}>Tornar global</Button>
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setDeleteItem({ type: 'med', id: m.id })}><Trash2 className="w-4 h-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* INATIVOS */}
        <TabsContent value="inativos" className="mt-4 space-y-2">
          {inactiveMeds.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhum medicamento inativo.</CardContent></Card>
          ) : inactiveMeds.map(m => (
            <Card key={m.id} className="shadow-card border-0">
              <CardContent className="p-3 flex items-center gap-2">
                <span className="text-sm flex-1 opacity-70">{m.nome} <span className="text-xs text-muted-foreground">— {m.classe_terapeutica}</span></span>
                <Button size="sm" variant="outline" onClick={() => reactivateMed(m.id)}>Reativar</Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* IMPORTAÇÃO */}
        <TabsContent value="importacao" className="mt-4 space-y-4">
          <Card className="shadow-card border-0">
            <CardContent className="p-4 space-y-2">
              <h3 className="font-semibold">Base padrão de Medicamentos — RENAME</h3>
              <p className="text-sm text-muted-foreground">
                Carrega <strong>{RENAME_MEDICAMENTOS.length}</strong> medicamentos da Relação Nacional de Medicamentos Essenciais.
                Itens já existentes (mesmo código RENAME) <strong>não são duplicados</strong>.
              </p>
              <Button onClick={() => importarSeed(RENAME_MEDICAMENTOS, 'rename')} disabled={!!importing}>
                {importing === 'rename' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                Carregar / Restaurar base RENAME
              </Button>
            </CardContent>
          </Card>
          <Card className="shadow-card border-0">
            <CardContent className="p-4 space-y-2">
              <h3 className="font-semibold">Base padrão de Medicamentos — REME</h3>
              <p className="text-sm text-muted-foreground">
                Carrega <strong>{REME_MEDICAMENTOS.length}</strong> medicamentos da Relação Municipal (complementa a RENAME). Itens já existentes não são duplicados.
              </p>
              <Button onClick={() => importarSeed(REME_MEDICAMENTOS, 'reme')} disabled={!!importing} variant="secondary">
                {importing === 'reme' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                Carregar / Restaurar base REME
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PERMISSÕES */}
        <TabsContent value="perfil" className="space-y-4 mt-4">
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <h3 className="font-semibold mb-1">Prescrição de Medicamentos</h3>
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
        </TabsContent>
      </Tabs>

      {/* EDIT MED DIALOG */}
      <Dialog open={!!editMed} onOpenChange={() => setEditMed(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Medicamento</DialogTitle></DialogHeader>
          {editMed && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Nome Genérico</Label><Input value={editMed.nome} onChange={e => setEditMed({ ...editMed, nome: e.target.value })} /></div>
                <div><Label>Nome Comercial</Label><Input value={editMed.nome_comercial || ''} onChange={e => setEditMed({ ...editMed, nome_comercial: e.target.value })} /></div>
              </div>
              <div><Label>Princípio Ativo</Label><Input value={editMed.principio_ativo} onChange={e => setEditMed({ ...editMed, principio_ativo: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label>Concentração</Label><Input value={editMed.concentracao || ''} onChange={e => setEditMed({ ...editMed, concentracao: e.target.value })} /></div>
                <div><Label>Forma Farmacêutica</Label><Input value={editMed.forma_farmaceutica || ''} placeholder="Comprimido, ampola..." onChange={e => setEditMed({ ...editMed, forma_farmaceutica: e.target.value })} /></div>
                <div><Label>Via</Label><Input value={editMed.via_padrao} onChange={e => setEditMed({ ...editMed, via_padrao: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Classe Terapêutica</Label><Input value={editMed.classe_terapeutica} onChange={e => setEditMed({ ...editMed, classe_terapeutica: e.target.value })} /></div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={editMed.tipo} onValueChange={(v: any) => setEditMed({ ...editMed, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comum">Comum</SelectItem>
                      <SelectItem value="controlado">Controlado</SelectItem>
                      <SelectItem value="psicotropico">Psicotrópico</SelectItem>
                      <SelectItem value="antibiotico">Antibiótico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="pt-2 border-t">
                <div className="flex items-center gap-2 mb-2">
                  <Switch checked={editMed.estoque_controlado} onCheckedChange={v => setEditMed({ ...editMed, estoque_controlado: v })} />
                  <Label className="flex items-center gap-1"><Package className="w-3.5 h-3.5" /> Controlar estoque deste medicamento</Label>
                </div>
                {editMed.estoque_controlado && (
                  <div className="grid grid-cols-4 gap-2">
                    <div><Label>Quantidade</Label><Input type="number" value={editMed.estoque_quantidade} onChange={e => setEditMed({ ...editMed, estoque_quantidade: parseInt(e.target.value) || 0 })} /></div>
                    <div><Label>Mínimo</Label><Input type="number" value={editMed.estoque_minimo} onChange={e => setEditMed({ ...editMed, estoque_minimo: parseInt(e.target.value) || 0 })} /></div>
                    <div><Label>Unidade</Label><Input value={editMed.estoque_unidade} placeholder="comprimidos" onChange={e => setEditMed({ ...editMed, estoque_unidade: e.target.value })} /></div>
                    <div><Label>Local</Label><Input value={editMed.estoque_localizacao} placeholder="Farmácia" onChange={e => setEditMed({ ...editMed, estoque_localizacao: e.target.value })} /></div>
                  </div>
                )}
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

      {/* EDIT EXAM */}
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

      {/* ADD MED */}
      <Dialog open={addMedDialog} onOpenChange={setAddMedDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Novo Medicamento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Nome Genérico *</Label><Input value={newMed.nome || ''} onChange={e => setNewMed(p => ({ ...p, nome: e.target.value }))} /></div>
              <div><Label>Nome Comercial</Label><Input value={newMed.nome_comercial || ''} onChange={e => setNewMed(p => ({ ...p, nome_comercial: e.target.value }))} /></div>
            </div>
            <div><Label>Princípio Ativo</Label><Input value={newMed.principio_ativo || ''} onChange={e => setNewMed(p => ({ ...p, principio_ativo: e.target.value }))} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>Concentração</Label><Input value={newMed.concentracao || ''} onChange={e => setNewMed(p => ({ ...p, concentracao: e.target.value }))} /></div>
              <div><Label>Forma Farmacêutica</Label><Input value={newMed.forma_farmaceutica || ''} placeholder="Comprimido, ampola..." onChange={e => setNewMed(p => ({ ...p, forma_farmaceutica: e.target.value }))} /></div>
              <div><Label>Via</Label><Input value={newMed.via_padrao || 'oral'} onChange={e => setNewMed(p => ({ ...p, via_padrao: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Classe Terapêutica</Label><Input value={newMed.classe_terapeutica || ''} onChange={e => setNewMed(p => ({ ...p, classe_terapeutica: e.target.value }))} /></div>
              <div>
                <Label>Tipo</Label>
                <Select value={newMed.tipo || 'comum'} onValueChange={(v: any) => setNewMed(p => ({ ...p, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comum">Comum</SelectItem>
                    <SelectItem value="controlado">Controlado</SelectItem>
                    <SelectItem value="psicotropico">Psicotrópico</SelectItem>
                    <SelectItem value="antibiotico">Antibiótico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMedDialog(false)}>Cancelar</Button>
            <Button onClick={addNewMed} disabled={!newMed.nome?.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ADD EXAM */}
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

      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar {deleteItem?.type === 'med' ? 'medicamento' : 'exame'}?</AlertDialogTitle>
            <AlertDialogDescription>O item será movido para a aba "Inativos" e pode ser reativado depois. Prontuários já salvos não são afetados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ConfigMedicamentosExames;
