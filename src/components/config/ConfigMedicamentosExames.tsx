import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables } from '@/integrations/supabase/types';
import { configObject } from '@/lib/configSectionGuard';
import { readCompleteCatalog, missingCatalogSeeds, catalogEdit, matchesCatalogSearch } from '@/lib/adminCatalog';
import { supabase } from '@/integrations/supabase/client';
import { useConfiguracao } from '@/hooks/useConfiguracao';
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

type Medication = Tables<'medications'>;
type ExamType = Tables<'exam_types'>;
const MED_EDIT_KEYS = ['nome','nome_comercial','principio_ativo','classe_terapeutica','apresentacao','dosagem_padrao','via_padrao','forma_farmaceutica','concentracao','tipo','is_global','estoque_controlado','estoque_quantidade','estoque_minimo','estoque_unidade','estoque_localizacao'] as const;
const EXAM_EDIT_KEYS = ['nome','codigo_sus','categoria','is_global'] as const;
const compareText = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });

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
  const { user } = useAuth();
  const identity = user?.role === 'master' && user.ativo === true ? user.authUserId : undefined;
  const [meds, setMeds] = useState<Medication[]>([]);
  const [exams, setExams] = useState<ExamType[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogReady, setCatalogReady] = useState(false);
  const [activeTab, setActiveTab] = useState('medicamentos');
  const [catalogError, setCatalogError] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const loadSequence = useRef(0);
  const [importReport, setImportReport] = useState('');
  const prescricaoBaseline = useRef<{identity: string; raw: unknown} | null>(null);
  const [prescricaoError, setPrescricaoError] = useState(false);
  const [examStatus, setExamStatus] = useState<'all' | 'active' | 'inactive'>('all');
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
  const {atualizarConfiguracao}=useConfiguracao();
  const [prescricaoReady,setPrescricaoReady]=useState(false);
  const [prescricaoSaving,setPrescricaoSaving]=useState(false);

  const confirmSession = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (!identity || error || data.session?.user.id !== identity) throw Error('Sessão administrativa não confirmada.');
  }, [identity]);

  const readMeds = () => readCompleteCatalog<Medication>(async (from, to) => {
    const { data, error, count } = await supabase.from('medications').select('*',{count:'exact'}).order('id').range(from,to);
    if (error || !data) throw Error('Não foi possível consultar os medicamentos.');
    return { rows:data,count };
  });
  const readExams = () => readCompleteCatalog<ExamType>(async (from, to) => {
    const { data, error, count } = await supabase.from('exam_types').select('*',{count:'exact'}).order('id').range(from,to);
    if (error || !data) throw Error('Não foi possível consultar os exames.');
    return { rows:data,count };
  });

  const loadData = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true); setCatalogReady(false); setCatalogError(false);
    setPrescricaoReady(false); setPrescricaoError(false); prescricaoBaseline.current = null;
    try {
      await confirmSession();
      const [medsRes, examsRes, cfgRes] = await Promise.allSettled([
        readMeds(), readExams(),
        supabase.from('system_config').select('configuracoes').eq('id','default').maybeSingle(),
      ]);
      await confirmSession();
      if (sequence !== loadSequence.current) return;
      if (medsRes.status === 'fulfilled' && examsRes.status === 'fulfilled') {
        setMeds(medsRes.value.sort((a,b)=>compareText(a.classe_terapeutica,b.classe_terapeutica)||compareText(a.nome,b.nome)||a.id.localeCompare(b.id)));
        setExams(examsRes.value.sort((a,b)=>compareText(a.categoria,b.categoria)||compareText(a.nome,b.nome)||a.id.localeCompare(b.id)));
        setCatalogReady(true);
      } else setCatalogError(true);
      try {
        if (cfgRes.status !== 'fulfilled' || cfgRes.value.error || !cfgRes.value.data || !identity) throw Error('Leitura não confirmada.');
        const raw = configObject(cfgRes.value.data.configuracoes)[CONFIG_KEY];
        const cfg = raw === undefined ? { medicina: true, odontologia: true } : configObject(raw);
        if (!Object.values(cfg).every(v=>typeof v === 'boolean')) throw Error('Permissões inválidas.');
        setPrescricaoConfig(cfg as Record<string,boolean>);
        prescricaoBaseline.current = { identity, raw };
        setPrescricaoReady(true);
      } catch { setPrescricaoError(true); }
    } catch {
      if (sequence === loadSequence.current) { setCatalogError(true); setPrescricaoError(true); }
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [confirmSession, identity]);

  useEffect(() => { void loadData(); return () => { loadSequence.current++; }; }, [loadData]);

  const runMutation = async (work: () => Promise<void>, requiresCatalog = true) => {
    if (lock.current || (requiresCatalog && !catalogReady)) return;
    lock.current = true; setBusy(true);
    try { await confirmSession(); await work(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Operação não confirmada.'); }
    finally { lock.current = false; setBusy(false); }
  };

  const filteredMeds = useMemo(() => {
    return meds.filter(m => {
      if (!m.ativo) return false;
      if (classFilter !== 'all' && (m.classe_terapeutica || 'Sem classificação') !== classFilter) return false;
      if (tipoFilter !== 'all' && m.tipo !== tipoFilter) return false;
      if (origemFilter !== 'all' && m.origem !== origemFilter) return false;
      return matchesCatalogSearch(search, [m.nome,m.nome_comercial,m.principio_ativo,m.classe_terapeutica,m.codigo_rename,m.forma_farmaceutica,m.tipo,m.concentracao]);
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
    return exams.filter(e => (examStatus === 'all' || e.ativo === (examStatus === 'active')) && matchesCatalogSearch(examSearch, [e.nome,e.codigo_sus,e.categoria]));
  }, [exams, examSearch, examStatus]);

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

  const unconfirmedCatalog = (message: string): never => { setCatalogReady(false); setCatalogError(true); throw Error(message); };

  const changeMed = async (med: Medication, patch: Partial<Medication>, expected: Partial<Medication>, message: string) => {
    const { data, error } = await supabase.from('medications').update(patch).eq('id',med.id).match(expected).select('*').maybeSingle();
    if (error || !data) return unconfirmedCatalog('Alteração não confirmada. Recarregue o catálogo e confira o registro.');
    await confirmSession();
    setMeds(prev => prev.map(m => m.id === data.id ? data : m));
    toast.success(message);
  };
  const changeExam = async (exam: ExamType, patch: Partial<ExamType>, expected: Partial<ExamType>, message: string) => {
    const { data, error } = await supabase.from('exam_types').update(patch).eq('id',exam.id).match(expected).select('*').maybeSingle();
    if (error || !data) return unconfirmedCatalog('Alteração não confirmada. Recarregue o catálogo e confira o registro.');
    await confirmSession();
    setExams(prev => prev.map(e => e.id === data.id ? data : e));
    toast.success(message);
  };
  const toggleMedAtivo = (id: string) => runMutation(async () => {
    const med = meds.find(m => m.id === id);
    if (med) await changeMed(med,{ativo:!med.ativo},{ativo:med.ativo},med.ativo?'Desabilitado':'Habilitado');
  });
  const toggleExamAtivo = (id: string) => runMutation(async () => {
    const exam = exams.find(e => e.id === id);
    if (exam) await changeExam(exam,{ativo:!exam.ativo},{ativo:exam.ativo},exam.ativo?'Desabilitado':'Habilitado');
  });
  const saveEditMed = () => runMutation(async () => {
    if (!editMed) return;
    const original = meds.find(m=>m.id===editMed.id);
    if (!original) throw Error('Registro não encontrado. Recarregue o catálogo.');
    const draft = {...editMed,nome:editMed.nome.trim()};
    if (!draft.nome) throw Error('Informe o nome do medicamento.');
    const {patch,expected} = catalogEdit(original,draft,MED_EDIT_KEYS);
    for (const value of [patch.estoque_quantidade,patch.estoque_minimo]) {
      if (value !== undefined && (!Number.isInteger(value)||value<0)) throw Error('Informe uma quantidade de estoque inteira e não negativa.');
    }
    if (Object.keys(patch).length) await changeMed(original,patch,expected,'Medicamento atualizado');
    setEditMed(null);
  });
  const saveEditExam = () => runMutation(async () => {
    if (!editExam) return;
    const original = exams.find(e=>e.id===editExam.id);
    if (!original) throw Error('Registro não encontrado. Recarregue o catálogo.');
    const draft = {...editExam,nome:editExam.nome.trim()};
    if (!draft.nome) throw Error('Informe o nome do exame.');
    const {patch,expected} = catalogEdit(original,draft,EXAM_EDIT_KEYS);
    if (Object.keys(patch).length) await changeExam(original,patch,expected,'Exame atualizado');
    setEditExam(null);
  });
  const addNewMed = () => runMutation(async () => {
    if (!newMed.nome?.trim()) return;
    const payload = {
      ...newMed, nome:newMed.nome.trim(),
      apresentacao:newMed.apresentacao || `${newMed.forma_farmaceutica || ''} ${newMed.concentracao || ''}`.trim(),
      dosagem_padrao:newMed.dosagem_padrao || newMed.concentracao || '',
      is_global:true, ativo:true, origem:'manual',
    };
    const {data,error} = await supabase.from('medications').insert(payload).select('*').single();
    if (error || !data) return unconfirmedCatalog('Cadastro não confirmado. Atualize o catálogo antes de repetir.');
    await confirmSession();
    setMeds(prev=>[...prev,data]); setAddMedDialog(false);
    setNewMed({ nome:'',nome_comercial:'',principio_ativo:'',classe_terapeutica:'',apresentacao:'',dosagem_padrao:'',via_padrao:'oral',forma_farmaceutica:'',concentracao:'',tipo:'comum' });
    toast.success('Medicamento criado');
  });
  const addNewExam = () => runMutation(async () => {
    if (!newExam.nome.trim()) return;
    const {data,error} = await supabase.from('exam_types').insert({...newExam,nome:newExam.nome.trim(),is_global:true,ativo:true}).select('*').single();
    if (error || !data) return unconfirmedCatalog('Cadastro não confirmado. Atualize o catálogo antes de repetir.');
    await confirmSession();
    setExams(prev=>[...prev,data]); setAddExamDialog(false);
    setNewExam({nome:'',codigo_sus:'',categoria:''}); toast.success('Exame criado');
  });
  const handleDelete = () => runMutation(async () => {
    if (!deleteItem) return;
    if (deleteItem.type === 'med') {
      const med = meds.find(m=>m.id===deleteItem.id);
      if (!med) throw Error('Medicamento não encontrado.');
      await changeMed(med,{ativo:false},{ativo:med.ativo},'Medicamento desativado');
    } else {
      const exam = exams.find(e=>e.id===deleteItem.id);
      if (!exam) throw Error('Exame não encontrado.');
      await changeExam(exam,{ativo:false},{ativo:exam.ativo},'Exame desativado');
    }
    setDeleteItem(null);
  });
  const reactivateMed = (id:string) => runMutation(async () => {
    const med = meds.find(m=>m.id===id);
    if (med) await changeMed(med,{ativo:true},{ativo:med.ativo},'Medicamento reativado');
  });
  const makeMedGlobal = (id:string) => runMutation(async () => {
    const med = meds.find(m=>m.id===id);
    if (med) await changeMed(med,{is_global:true},{is_global:med.is_global},'Medicamento tornado global');
  });
  const savePrescricaoConfig = (updated:Record<string,boolean>) => runMutation(async () => {
    const baseline = prescricaoBaseline.current;
    if (!prescricaoReady || !baseline || baseline.identity !== identity) return;
    setPrescricaoSaving(true);
    try {
      const ok = await atualizarConfiguracao(CONFIG_KEY,updated,{auditAcao:'ALTERAR_CONFIG_PRESCRICAO',expectedSection:{key:CONFIG_KEY,value:baseline.raw}});
      if (ok) { setPrescricaoConfig(updated); prescricaoBaseline.current = {identity:baseline.identity,raw:updated}; }
      else { setPrescricaoReady(false); setPrescricaoError(true); }
    } finally { setPrescricaoSaving(false); }
  },false);

  const importarSeed = (lista: MedicamentoSeed[], origem: OrigemMedicamento) => runMutation(async () => {
    if (!window.confirm(`Importar os itens ausentes da base local ${origem.toUpperCase()}? Itens já existentes não serão substituídos.`)) return;
    setImporting(origem==='rename'?'rename':'reme');
    setImportReport('Consultando códigos existentes…');
    let confirmed = 0;
    try {
      const existing = await readCompleteCatalog(async (from,to) => {
        const {data,error,count} = await supabase.from('medications').select('id,codigo_rename',{count:'exact'}).not('codigo_rename','is',null).order('id').range(from,to);
        if (error||!data) throw Error('Consulta de códigos não confirmada.');
        return {rows:data,count};
      });
      const novos = missingCatalogSeeds(lista,existing);
      const payload = novos.map(item=>({...item,origem,is_global:true,ativo:true}));
      for (let i=0;i<payload.length;i+=200) {
        await confirmSession();
        const chunk = payload.slice(i,i+200);
        const {data,error} = await supabase.from('medications').insert(chunk).select('id,codigo_rename');
        const received = new Set(data?.map(row=>row.codigo_rename)??[]);
        if (error||!data||data.length!==chunk.length||chunk.some(row=>!received.has(row.codigo_rename))) throw Error('Lote não confirmado.');
        confirmed += data.length;
        setImportReport(`${confirmed} de ${payload.length} itens confirmados.`);
      }
      setImportReport(`${confirmed} itens confirmados; ${lista.length-novos.length} códigos já presentes ou repetidos na lista.`);
      toast.success(`Importação concluída: ${confirmed} itens confirmados.`);
    } catch {
      setImportReport(`Importação interrompida: ${confirmed} itens confirmados. Um lote sem resposta pode ter sido gravado; confira o catálogo antes de repetir.`);
      toast.error('Importação não concluída. Confira o resultado.');
    } finally {
      await loadData();
      setImporting(null);
    }
  });

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Catálogos assistenciais</h3><p className="text-xs text-muted-foreground">Gerencie medicamentos, exames, bases locais e configurações de prescrição.</p></div><Button size="sm" variant="outline" disabled={busy} onClick={() => void loadData()}>Atualizar catálogos</Button></div>
        {catalogError ? <p role="alert" className="text-sm text-destructive">Consulta incompleta. Edição dos catálogos bloqueada até nova leitura confirmada.</p> : <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{[[meds.filter(m=>m.ativo).length,'Medicamentos ativos'],[exams.filter(e=>e.ativo).length,'Exames ativos'],[inactiveMeds.length,'Medicamentos inativos'],[exams.filter(e=>!e.ativo).length,'Exames inativos']].map(([value,label])=><div key={label} className="rounded-lg border p-3"><p className="text-xl font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>)}</div>}
        {busy && <p role="status" className="text-xs text-muted-foreground">Operação em andamento…</p>}
      </div>
      <fieldset disabled={busy} className="min-w-0">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="config-admin-tabs w-full flex-wrap h-auto">
          <TabsTrigger value="medicamentos" className="flex-1"><Pill className="w-4 h-4 mr-1.5" />Medicamentos <Badge variant="secondary" className="ml-1.5 text-[10px]">{catalogReady ? meds.filter(m => m.ativo).length : '—'}</Badge></TabsTrigger>
          <TabsTrigger value="exames" className="flex-1"><FlaskConical className="w-4 h-4 mr-1.5" />Exames <Badge variant="secondary" className="ml-1.5 text-[10px]">{catalogReady ? exams.filter(e => e.ativo).length : '—'}</Badge></TabsTrigger>
          <TabsTrigger value="categorias" className="flex-1"><FolderTree className="w-4 h-4 mr-1.5" />Categorias <Badge variant="secondary" className="ml-1.5 text-[10px]">{catalogReady ? allClasses.length : '—'}</Badge></TabsTrigger>
          <TabsTrigger value="personalizados" className="flex-1"><Pencil className="w-4 h-4 mr-1.5" />Personalizados <Badge variant="secondary" className="ml-1.5 text-[10px]">{catalogReady ? customMeds.length : '—'}</Badge></TabsTrigger>
          <TabsTrigger value="inativos" className="flex-1"><Trash2 className="w-4 h-4 mr-1.5" />Inativos <Badge variant="secondary" className="ml-1.5 text-[10px]">{catalogReady ? inactiveMeds.length : '—'}</Badge></TabsTrigger>
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
            <Button disabled={!catalogReady||busy} onClick={() => setAddMedDialog(true)}><Plus className="w-4 h-4 mr-1" />Novo</Button>
          </div>

          <p className="text-xs text-muted-foreground">{catalogReady ? `${filteredMeds.length} medicamento(s) encontrado(s)` : 'Resultado não confirmado'}</p>

          {Array.from(medsByClass.entries()).map(([classe, items]) => (
            <Card key={classe} className="config-admin-card shadow-card border-0">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2 border-l-4 border-accent pl-2 flex items-center gap-2">
                  {classe} <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
                </h4>
                <div className="space-y-1.5">
                  {items.map(m => {
                    const tipoBadge = TIPO_COLORS[m.tipo as TipoMedicamento] || TIPO_COLORS.comum;
                    return (
                      <div key={m.id} className={`flex items-center flex-wrap gap-2 py-1.5 px-2 rounded ${!m.ativo ? 'opacity-50' : ''}`}>
                        <Switch disabled={!catalogReady||busy} checked={m.ativo} onCheckedChange={() => toggleMedAtivo(m.id)} />
                        <div className="flex-1 min-w-[150px]">
                          <span className="text-sm font-medium">{m.nome}</span>
                          {m.nome_comercial && <span className="text-xs text-muted-foreground"> ({m.nome_comercial})</span>}
                          <div className="text-xs text-muted-foreground">
                            {[m.concentracao || m.dosagem_padrao, m.forma_farmaceutica, m.via_padrao].filter(Boolean).join(' • ')}
                          </div>
                        </div>
                        {m.tipo !== 'comum' && <Badge className={`text-[9px] ${tipoBadge.cls}`}>{tipoBadge.label}</Badge>}
                        {m.origem !== 'manual' && <Badge variant="outline" className="text-[9px]">{(m.origem || 'manual').toUpperCase()}</Badge>}
                        {stockBadge(m)}
                        {!m.is_global && <Badge variant="secondary" className="text-[9px]">Personalizado</Badge>}
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!catalogReady||busy} onClick={() => setEditMed({ ...m })}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/70" disabled={!catalogReady||busy} onClick={() => setDeleteItem({ type: 'med', id: m.id })}><Trash2 className="w-3.5 h-3.5" /></Button>
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
            <Select value={examStatus} onValueChange={v=>setExamStatus(v as typeof examStatus)}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="active">Ativos</SelectItem><SelectItem value="inactive">Inativos</SelectItem></SelectContent></Select>
            <Button disabled={!catalogReady||busy} onClick={() => setAddExamDialog(true)}><Plus className="w-4 h-4 mr-1" />Novo</Button>
          </div>
          <p className="text-xs text-muted-foreground">{catalogReady ? `${filteredExams.length} exame(s) encontrado(s)` : 'Resultado não confirmado'}</p>
          {Array.from(examsByCategory.entries()).map(([cat, items]) => (
            <Card key={cat} className="config-admin-card shadow-card border-0">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2 border-l-4 border-green-500 pl-2">{cat}</h4>
                <div className="space-y-1.5">
                  {items.map(e => (
                    <div key={e.id} className={`flex items-center gap-2 py-1.5 px-2 rounded ${!e.ativo ? 'opacity-50' : ''}`}>
                      <Switch disabled={!catalogReady||busy} checked={e.ativo} onCheckedChange={() => toggleExamAtivo(e.id)} />
                      <span className="text-sm flex-1">{e.nome} {e.codigo_sus && <span className="text-muted-foreground text-xs font-mono">({e.codigo_sus})</span>}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!catalogReady||busy} onClick={() => setEditExam({ ...e })}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/70" disabled={!catalogReady||busy} onClick={() => setDeleteItem({ type: 'exam', id: e.id })}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* CATEGORIAS */}
        <TabsContent value="categorias" className="mt-4">
          <Card className="config-admin-card shadow-card border-0">
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
            <Card className="config-admin-card"><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhum medicamento personalizado por profissionais.</CardContent></Card>
          ) : customMeds.map(m => (
            <Card key={m.id} className="config-admin-card shadow-card border-0">
              <CardContent className="p-3 flex items-center gap-2">
                <span className="text-sm flex-1">{m.nome} <span className="text-xs text-muted-foreground">— {m.dosagem_padrao}</span></span>
                <Badge variant="outline" className="text-[10px]">Personalizado</Badge>
                <Button size="sm" variant="outline" disabled={!catalogReady||busy} onClick={() => makeMedGlobal(m.id)}>Tornar global</Button>
                <Button size="icon" variant="ghost" className="text-destructive" disabled={!catalogReady||busy} onClick={() => setDeleteItem({ type: 'med', id: m.id })}><Trash2 className="w-4 h-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* INATIVOS */}
        <TabsContent value="inativos" className="mt-4 space-y-2">
          {inactiveMeds.length === 0 ? (
            <Card className="config-admin-card"><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhum medicamento inativo.</CardContent></Card>
          ) : inactiveMeds.map(m => (
            <Card key={m.id} className="config-admin-card shadow-card border-0">
              <CardContent className="p-3 flex items-center gap-2">
                <span className="text-sm flex-1 opacity-70">{m.nome} <span className="text-xs text-muted-foreground">— {m.classe_terapeutica}</span></span>
                <Button size="sm" variant="outline" disabled={!catalogReady||busy} onClick={() => reactivateMed(m.id)}>Reativar</Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* IMPORTAÇÃO */}
        <TabsContent value="importacao" className="mt-4 space-y-4">
          {importReport && <p role="status" className="rounded-lg border p-3 text-sm">{importReport}</p>}
          <Card className="config-admin-card shadow-card border-0">
            <CardContent className="p-4 space-y-2">
              <h3 className="font-semibold">Base padrão de Medicamentos — RENAME</h3>
              <p className="text-sm text-muted-foreground">
                Carrega <strong>{RENAME_MEDICAMENTOS.length}</strong> medicamentos da Relação Nacional de Medicamentos Essenciais.
                A lista local é uma seleção curada, não a lista oficial completa. Códigos existentes na consulta são ignorados.
              </p>
              <Button onClick={() => importarSeed(RENAME_MEDICAMENTOS, 'rename')} disabled={!!importing||busy||!catalogReady}>
                {importing === 'rename' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                Carregar / Restaurar base RENAME
              </Button>
            </CardContent>
          </Card>
          <Card className="config-admin-card shadow-card border-0">
            <CardContent className="p-4 space-y-2">
              <h3 className="font-semibold">Base padrão de Medicamentos — REME</h3>
              <p className="text-sm text-muted-foreground">
                Carrega <strong>{REME_MEDICAMENTOS.length}</strong> medicamentos da lista municipal genérica disponível no sistema. Não representa uma validação oficial da REME local. Códigos existentes na consulta são ignorados.
              </p>
              <Button onClick={() => importarSeed(REME_MEDICAMENTOS, 'reme')} disabled={!!importing||busy||!catalogReady} variant="secondary">
                {importing === 'reme' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                Carregar / Restaurar base REME
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PERMISSÕES */}
        <TabsContent value="perfil" className="space-y-4 mt-4">
          <Card className="config-admin-card shadow-card border-0">
            <CardContent className="p-3 sm:p-4">
              <h3 className="font-semibold mb-1">Prescrição de Medicamentos</h3>
              <p className="text-xs text-muted-foreground mb-3">Configuração de acesso à prescrição no sistema. Não substitui as normas profissionais vigentes.</p>
              {prescricaoError && <p role="alert" className="mb-3 text-sm text-destructive">Permissões não confirmadas. Atualize os catálogos antes de editar novamente.</p>}
              <div className="space-y-2">
                {PROFISSOES_PRESCRICAO.map(p => (
                  <div key={p.key} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                    <Checkbox
                      disabled={!prescricaoReady||prescricaoSaving||busy} checked={prescricaoConfig[p.key] ?? false}
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
      </fieldset>

      {/* EDIT MED DIALOG */}
      <Dialog open={!!editMed} onOpenChange={open => {if(!open&&!busy)setEditMed(null);}}>
        <DialogContent className="config-admin-modal max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="config-admin-modal-header"><DialogTitle className="config-admin-modal-title">Editar Medicamento</DialogTitle></DialogHeader>
          {editMed && (
            <fieldset disabled={busy||!catalogReady} className="space-y-3 min-w-0">
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
                  <Select value={editMed.tipo} onValueChange={(v: string) => setEditMed({ ...editMed, tipo: v })}>
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
                    <div><Label>Quantidade</Label><Input type="number" min={0} step={1} value={editMed.estoque_quantidade} onChange={e => setEditMed({ ...editMed, estoque_quantidade: parseInt(e.target.value) || 0 })} /></div>
                    <div><Label>Mínimo</Label><Input type="number" min={0} step={1} value={editMed.estoque_minimo} onChange={e => setEditMed({ ...editMed, estoque_minimo: parseInt(e.target.value) || 0 })} /></div>
                    <div><Label>Unidade</Label><Input value={editMed.estoque_unidade} placeholder="comprimidos" onChange={e => setEditMed({ ...editMed, estoque_unidade: e.target.value })} /></div>
                    <div><Label>Local</Label><Input value={editMed.estoque_localizacao} placeholder="Farmácia" onChange={e => setEditMed({ ...editMed, estoque_localizacao: e.target.value })} /></div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2"><Switch checked={editMed.is_global} onCheckedChange={v => setEditMed({ ...editMed, is_global: v })} /><Label>Global (visível para todos)</Label></div>
            </fieldset>
          )}
          {!catalogReady && <p role="alert" className="text-xs text-destructive">Feche o editor e atualize o catálogo antes de repetir.</p>}
          <DialogFooter className="config-admin-modal-footer">
            <Button variant="outline" disabled={busy} onClick={() => setEditMed(null)}>Cancelar</Button>
            <Button disabled={!catalogReady||busy} onClick={saveEditMed}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT EXAM */}
      <Dialog open={!!editExam} onOpenChange={open => {if(!open&&!busy)setEditExam(null);}}>
        <DialogContent className="config-admin-modal">
          <DialogHeader className="config-admin-modal-header"><DialogTitle className="config-admin-modal-title">Editar Exame</DialogTitle></DialogHeader>
          {editExam && (
            <fieldset disabled={busy||!catalogReady} className="space-y-3 min-w-0">
              <div><Label>Nome</Label><Input value={editExam.nome} onChange={e => setEditExam({ ...editExam, nome: e.target.value })} /></div>
              <div><Label>Código SUS</Label><Input value={editExam.codigo_sus} onChange={e => setEditExam({ ...editExam, codigo_sus: e.target.value })} /></div>
              <div><Label>Categoria</Label><Input value={editExam.categoria} onChange={e => setEditExam({ ...editExam, categoria: e.target.value })} /></div>
              <div className="flex items-center gap-2"><Switch checked={editExam.is_global} onCheckedChange={v => setEditExam({ ...editExam, is_global: v })} /><Label>Global</Label></div>
            </fieldset>
          )}
          {!catalogReady && <p role="alert" className="text-xs text-destructive">Feche o editor e atualize o catálogo antes de repetir.</p>}
          <DialogFooter className="config-admin-modal-footer">
            <Button variant="outline" disabled={busy} onClick={() => setEditExam(null)}>Cancelar</Button>
            <Button disabled={!catalogReady||busy} onClick={saveEditExam}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ADD MED */}
      <Dialog open={addMedDialog} onOpenChange={open=>{if(!busy)setAddMedDialog(open);}}>
        <DialogContent className="config-admin-modal max-w-2xl">
          <DialogHeader className="config-admin-modal-header"><DialogTitle className="config-admin-modal-title">Novo Medicamento</DialogTitle></DialogHeader>
          <fieldset disabled={busy||!catalogReady} className="space-y-3 min-w-0">
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
                <Select value={newMed.tipo || 'comum'} onValueChange={(v: string) => setNewMed(p => ({ ...p, tipo: v }))}>
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
          </fieldset>
          {!catalogReady && <p role="alert" className="text-xs text-destructive">Feche a janela e atualize o catálogo antes de repetir. O formulário permanece preenchido.</p>}
          <DialogFooter className="config-admin-modal-footer">
            <Button variant="outline" disabled={busy} onClick={() => setAddMedDialog(false)}>Cancelar</Button>
            <Button onClick={addNewMed} disabled={!catalogReady||busy||!newMed.nome?.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ADD EXAM */}
      <Dialog open={addExamDialog} onOpenChange={open=>{if(!busy)setAddExamDialog(open);}}>
        <DialogContent className="config-admin-modal">
          <DialogHeader className="config-admin-modal-header"><DialogTitle className="config-admin-modal-title">Novo Exame</DialogTitle></DialogHeader>
          <fieldset disabled={busy||!catalogReady} className="space-y-3 min-w-0">
            <div><Label>Nome *</Label><Input value={newExam.nome} onChange={e => setNewExam(p => ({ ...p, nome: e.target.value }))} /></div>
            <div><Label>Código SUS</Label><Input value={newExam.codigo_sus} onChange={e => setNewExam(p => ({ ...p, codigo_sus: e.target.value }))} /></div>
            <div><Label>Categoria</Label><Input value={newExam.categoria} onChange={e => setNewExam(p => ({ ...p, categoria: e.target.value }))} /></div>
          </fieldset>
          {!catalogReady && <p role="alert" className="text-xs text-destructive">Feche a janela e atualize o catálogo antes de repetir. O formulário permanece preenchido.</p>}
          <DialogFooter className="config-admin-modal-footer">
            <Button variant="outline" disabled={busy} onClick={() => setAddExamDialog(false)}>Cancelar</Button>
            <Button onClick={addNewExam} disabled={!catalogReady||busy||!newExam.nome.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteItem} onOpenChange={open=>{if(!open&&!busy)setDeleteItem(null);}}>
        <AlertDialogContent className="config-admin-modal config-admin-confirm">
          <AlertDialogHeader className="config-admin-modal-header">
            <AlertDialogTitle className="config-admin-modal-title">Desativar {deleteItem?.type === 'med' ? 'medicamento' : 'exame'}?</AlertDialogTitle>
            <AlertDialogDescription>O item será desativado, sem exclusão física. Medicamentos podem ser reativados em Inativos; exames na aba Exames.</AlertDialogDescription>
            {!catalogReady && <p role="alert" className="text-xs text-destructive">Alteração não confirmada. Feche a janela e atualize o catálogo.</p>}
          </AlertDialogHeader>
          <AlertDialogFooter className="config-admin-modal-footer">
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={!catalogReady||busy} onClick={e=>{e.preventDefault();void handleDelete();}}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ConfigMedicamentosExames;
