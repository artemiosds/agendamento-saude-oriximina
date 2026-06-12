import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2, Plus, Search, Eye, Edit2, AlertTriangle, Trash2, Save,
  RefreshCw, Clock, Target, CheckSquare, ChevronRight, Printer
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { BuscaPaciente } from '@/components/BuscaPaciente';
import { cn } from '@/lib/utils';

const SPECIALTIES = [
  'Fisioterapia', 'Fonoaudiologia', 'Psicologia', 'Terapia Ocupacional',
  'Neuropsicologia', 'Psicopedagogia', 'Nutrição', 'Serviço Social', 'Enfermagem',
];

const SPECIALTY_TO_SIGTAP: Record<string, string> = {
  'Fisioterapia': 'fisioterapia',
  'Fonoaudiologia': 'fonoaudiologia',
  'Psicologia': 'psicologia',
  'Terapia Ocupacional': 'terapia_ocupacional',
  'Nutrição': 'nutricao',
  'Serviço Social': 'assistencia_social',
  'Enfermagem': 'enfermagem',
};

const PRIORIDADES = ['Baixa', 'Média', 'Alta', 'Urgente'];
const STATUS_META = ['Não iniciada', 'Em andamento', 'Parcialmente atingida', 'Atingida', 'Suspensa', 'Cancelada'];
const CATEGORIAS_META = ['Curto Prazo', 'Médio Prazo', 'Longo Prazo'];
const CONTEXTOS = [
  'Linguagem', 'Motor', 'Cognição', 'Comportamento', 'Alimentação',
  'Socialização', 'AVDs', 'Escolar', 'Familiar', 'Emocional',
];
const TIPOS_ATENDIMENTO = [
  'Individual', 'Grupo', 'Domiciliar', 'Escolar', 'Compartilhado/Interdisciplinar',
];
const MOTIVOS_ENCERRAMENTO = [
  'Alta terapêutica', 'Abandono', 'Transferência', 'Suspensão', 'Óbito', 'Outro',
];

interface PTSRecord {
  id: string;
  patient_id: string;
  professional_id: string;
  unit_id: string;
  diagnostico_funcional: string;
  objetivos_terapeuticos: string;
  metas_curto_prazo: string;
  metas_medio_prazo: string;
  metas_longo_prazo: string;
  especialidades_envolvidas: string[];
  status: string;
  created_at: string;
  updated_at: string;
  // Extended fields
  prioridade?: string;
  contextos_afetados?: string[];
  tipo_atendimento?: string[];
  rede_apoio_presente?: boolean;
  acompanhamento_interdisciplinar?: boolean;
  ciencia_familia?: boolean;
  motivo_encaminhamento?: string;
  barreiras?: string;
  potencialidades?: string;
  objetivo_geral?: string;
  plano_conduta?: string;
  data_ultima_revisao?: string;
  data_proxima_revisao?: string;
  obs_revisao?: string;
  status_final?: string;
  motivo_encerramento?: string;
  resumo_desfecho?: string;
  orientacoes_finais?: string;
  criterio_alta_atingido?: boolean;
}

interface PTSMeta {
  id?: string;
  pts_id?: string;
  titulo: string;
  descricao: string;
  categoria: string;
  especialidade: string;
  responsavel?: string;
  status: string;
  prazo_estimado: string;
  indicador: string;
  prioridade: string;
  obs?: string;
}

interface SigtapProcedimento {
  id: string;
  codigo: string;
  nome: string;
  especialidade: string;
  total_cids: number;
}

interface SigtapCid {
  cid_codigo: string;
  cid_descricao: string;
}

interface SelectedSigtap {
  procedimento_codigo: string;
  procedimento_nome: string;
  especialidade: string;
}

interface SelectedCid {
  cid_codigo: string;
  cid_descricao: string;
}

const suggestReviewDate = (days: number = 30): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
};

const isOverdueReview = (pts: PTSRecord): boolean => {
  if (!pts.data_proxima_revisao) return false;
  return pts.data_proxima_revisao < new Date().toISOString().split('T')[0];
};

const prioridadeColor = (p: string): string => {
  switch (p) {
    case 'Urgente': return 'bg-destructive/10 text-destructive border-destructive/30';
    case 'Alta': return 'bg-warning/10 text-warning border-warning/30';
    case 'Média': return 'bg-info/10 text-info border-info/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const statusBadgeColor = (status: string): string => {
  switch (status) {
    case 'ativo': return 'bg-success/10 text-success border-success/30';
    case 'encerrado': case 'alta': return 'bg-muted text-muted-foreground border-border';
    case 'suspenso': return 'bg-destructive/10 text-destructive border-destructive/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const statusMetaColor = (s: string): string => {
  switch (s) {
    case 'Atingida': return 'bg-success/10 text-success';
    case 'Em andamento': return 'bg-info/10 text-info';
    case 'Suspensa': case 'Cancelada': return 'bg-destructive/10 text-destructive';
    default: return 'bg-muted text-muted-foreground';
  }
};

const PTS: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const { pacientes, funcionarios, logAction } = useData();

  // List state
  const [ptsList, setPtsList] = useState<PTSRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPts, setEditingPts] = useState<PTSRecord | null>(null);
  const [detailPts, setDetailPts] = useState<PTSRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('identificacao');

  // SIGTAP catalog state (preserved from original)
  const [sigtapProcs, setSigtapProcs] = useState<SigtapProcedimento[]>([]);
  const [selectedProcCodigo, setSelectedProcCodigo] = useState('');
  const [validCids, setValidCids] = useState<SigtapCid[]>([]);
  const [cidSearch, setCidSearch] = useState('');
  const [procSearch, setProcSearch] = useState('');
  const [cidWarning, setCidWarning] = useState(false);
  const [loadingCids, setLoadingCids] = useState(false);
  const [loadingProcs, setLoadingProcs] = useState(false);
  const [searchingGlobal, setSearchingGlobal] = useState(false);
  const [sigtapSelecionados, setSigtapSelecionados] = useState<SelectedSigtap[]>([]);
  const [cidsSelecionados, setCidsSelecionados] = useState<SelectedCid[]>([]);

  // Structured metas state
  const [metas, setMetas] = useState<PTSMeta[]>([]);
  const [editingMetaIdx, setEditingMetaIdx] = useState<number | null>(null);
  const [metaDialogOpen, setMetaDialogOpen] = useState(false);
  const [metaForm, setMetaForm] = useState<PTSMeta>({
    titulo: '', descricao: '', categoria: 'Curto Prazo', especialidade: '',
    responsavel: '', status: 'Não iniciada', prazo_estimado: '',
    indicador: '', prioridade: 'Média', obs: '',
  });

  // Revisão modal state
  const [revisaoOpen, setRevisaoOpen] = useState(false);
  const [revisaoForm, setRevisaoForm] = useState({
    obs: '', data_proxima: '',
  });

  // Alta/encerramento modal state
  const [altaOpen, setAltaOpen] = useState(false);
  const [altaForm, setAltaForm] = useState({
    motivo_encerramento: '', resumo_desfecho: '', orientacoes_finais: '',
    criterio_alta_atingido: false, ciencia_familia: false, status_final: 'encerrado',
  });

  // Detail view SIGTAP/CID
  const [detailSigtap, setDetailSigtap] = useState<SelectedSigtap[]>([]);
  const [detailCids, setDetailCids] = useState<SelectedCid[]>([]);
  const [detailMetas, setDetailMetas] = useState<PTSMeta[]>([]);

  const isMaster = user?.role === 'master';

  const normalize = useCallback((value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(), []);

  const isFisioterapeuta = useMemo(() => {
    if (!user) return false;
    const prof = normalize(user.profissao || '');
    return prof.includes('fisioterap') || prof.includes('fisio');
  }, [user, normalize]);

  const emptyForm = {
    patient_id: '', patient_name: '',
    diagnostico_funcional: '', objetivos_terapeuticos: '',
    metas_curto_prazo: '', metas_medio_prazo: '', metas_longo_prazo: '',
    especialidades_envolvidas: [] as string[],
    prioridade: 'Média',
    contextos_afetados: [] as string[],
    tipo_atendimento: [] as string[],
    rede_apoio_presente: false,
    acompanhamento_interdisciplinar: false,
    ciencia_familia: false,
    motivo_encaminhamento: '',
    barreiras: '',
    potencialidades: '',
    objetivo_geral: '',
    plano_conduta: '',
    data_proxima_revisao: suggestReviewDate(30),
  };

  const [form, setForm] = useState(emptyForm);

  const loadSigtapProcsForSpecialties = useCallback(async (specialties: string[]) => {
    if (!user) return;
    const sigtapKeys = specialties.map(s => SPECIALTY_TO_SIGTAP[s]).filter(Boolean);
    if (sigtapKeys.length === 0) { setSigtapProcs([]); return; }
    setLoadingProcs(true);
    try {
      const { data, error } = await supabase
        .from('sigtap_procedimentos')
        .select('*')
        .in('especialidade', sigtapKeys)
        .eq('ativo', true)
        .order('especialidade')
        .order('codigo');
      if (error) { console.error('Erro ao carregar SIGTAP:', error); return; }
      setSigtapProcs(data || []);
    } catch (err) {
      console.error('Erro SIGTAP:', err);
    } finally {
      setLoadingProcs(false);
    }
  }, [user]);

  useEffect(() => {
    if (!dialogOpen) return;
    if (!isFisioterapeuta && !isMaster) { setSigtapProcs([]); return; }
    loadSigtapProcsForSpecialties(form.especialidades_envolvidas);
  }, [form.especialidades_envolvidas, dialogOpen, isFisioterapeuta, isMaster, loadSigtapProcsForSpecialties]);

  // Load CIDs for selected procedure
  useEffect(() => {
    if (!selectedProcCodigo) { setValidCids([]); return; }
    setLoadingCids(true);
    supabase
      .from('sigtap_procedimento_cids')
      .select('cid_codigo, cid_descricao')
      .eq('procedimento_codigo', selectedProcCodigo)
      .order('cid_codigo')
      .then(({ data, error }) => {
        if (error) console.error('Erro ao carregar CIDs:', error);
        setValidCids(data || []);
        setLoadingCids(false);
      });
  }, [selectedProcCodigo]);

  // Global SIGTAP Search
  const searchGlobalSigtap = async () => {
    if (!procSearch.trim() || procSearch.trim().length < 2) {
      toast.info('Digite pelo menos 2 caracteres para a pesquisa geral.');
      return;
    }
    setSearchingGlobal(true);
    try {
      const q = procSearch.trim().toUpperCase();
      const isCode = /^\d+$/.test(q);
      const isCid = /^[A-Z]\d/.test(q); // Ex: A00, B10
      
      let finalProcs: SigtapProcedimento[] = [];

      if (isCid) {
        // Search by CID
        const { data: procCids, error: cidErr } = await supabase
          .from('sigtap_procedimento_cids')
          .select('procedimento_codigo')
          .ilike('cid_codigo', `${q}%`)
          .limit(100);

        if (cidErr) throw cidErr;

        if (procCids && procCids.length > 0) {
          const codes = [...new Set(procCids.map(pc => pc.procedimento_codigo))];
          const { data, error } = await supabase
            .from('sigtap_procedimentos')
            .select('*')
            .in('codigo', codes)
            .eq('ativo', true)
            .limit(50);
          if (error) throw error;
          finalProcs = data || [];
        }
      } else {
        // Search by name or code
        let query = supabase.from('sigtap_procedimentos').select('*').eq('ativo', true);
        if (isCode) {
          query = query.ilike('codigo', `%${q}%`);
        } else {
          query = query.ilike('nome', `%${q}%`);
        }
        const { data, error } = await query.limit(100);
        if (error) throw error;
        finalProcs = data || [];
      }
      
      if (finalProcs.length === 0) {
        toast.info('Nenhum procedimento encontrado na base geral.');
      } else {
        setSigtapProcs(prev => {
          const currentCodes = new Set(prev.map(p => p.codigo));
          const newItems = finalProcs.filter(p => !currentCodes.has(p.codigo));
          return [...prev, ...newItems];
        });
        toast.success(`${finalProcs.length} procedimento(s) encontrado(s) na base geral.`);
      }
    } catch (err) {
      console.error('Erro na pesquisa geral SIGTAP:', err);
      toast.error('Erro ao pesquisar na base geral.');
    } finally {
      setSearchingGlobal(false);
    }
  };

  // CID warning

  useEffect(() => {
    if (!selectedProcCodigo || !cidSearch.trim()) { setCidWarning(false); return; }
    const typed = cidSearch.trim().toUpperCase();
    if (typed.length >= 3) {
      const found = validCids.some(c =>
        c.cid_codigo.toUpperCase() === typed || c.cid_codigo.toUpperCase().startsWith(typed)
      );
      setCidWarning(!found);
    } else {
      setCidWarning(false);
    }
  }, [cidSearch, validCids, selectedProcCodigo]);

  const filteredCids = useMemo(() => {
    if (!cidSearch.trim()) return validCids.slice(0, 20);
    const q = cidSearch.trim().toUpperCase();
    return validCids
      .filter(c => c.cid_codigo.toUpperCase().includes(q) || c.cid_descricao.toUpperCase().includes(q))
      .slice(0, 30);
  }, [validCids, cidSearch]);

  const loadPts = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('pts').select('*').order('created_at', { ascending: false });
    if (user?.usuario !== 'admin.sms' && user?.unidadeId) {
      query = query.eq('unit_id', user.unidadeId);
    }
    if (!isMaster && user?.role === 'profissional') {
      query = query.eq('professional_id', user.id);
    }
    const { data } = await query;
    if (data) setPtsList(data as unknown as PTSRecord[]);
    setLoading(false);
  }, [isMaster, user]);

  useEffect(() => { loadPts(); }, [loadPts]);

  const filtered = useMemo(() => {
    if (!search) return ptsList;
    const q = search.toLowerCase();
    return ptsList.filter(p => {
      const pac = pacientes.find(px => px.id === p.patient_id);
      return pac?.nome.toLowerCase().includes(q) || p.diagnostico_funcional.toLowerCase().includes(q);
    });
  }, [ptsList, search, pacientes]);

  const canEditPts = useCallback((pts: PTSRecord) => {
    if (isMaster) return true;
    return pts.professional_id === user?.id;
  }, [isMaster, user]);

  const toggleSpec = (spec: string) => {
    setForm(p => {
      const newSpecs = p.especialidades_envolvidas.includes(spec)
        ? p.especialidades_envolvidas.filter(s => s !== spec)
        : [...p.especialidades_envolvidas, spec];
      return { ...p, especialidades_envolvidas: newSpecs };
    });
    setSelectedProcCodigo('');
    setCidSearch('');
  };

  const toggleContexto = (ctx: string) => {
    setForm(p => ({
      ...p,
      contextos_afetados: p.contextos_afetados.includes(ctx)
        ? p.contextos_afetados.filter(c => c !== ctx)
        : [...p.contextos_afetados, ctx],
    }));
  };

  const toggleTipoAtendimento = (tipo: string) => {
    setForm(p => ({
      ...p,
      tipo_atendimento: p.tipo_atendimento.includes(tipo)
        ? p.tipo_atendimento.filter(t => t !== tipo)
        : [...p.tipo_atendimento, tipo],
    }));
  };

  const saveImmediateFono = async (item: SelectedSigtap, cids?: SelectedCid[]) => {
    try {
      if (user?.id) {
        await (supabase as any).from('procedimento_profissionais').upsert({
          procedimento_codigo: item.procedimento_codigo,
          profissional_id: user.id
        }, { onConflict: 'procedimento_codigo, profissional_id' });
      }
      if (editingPts) {
        await (supabase as any).from('pts_sigtap').upsert({
          pts_id: editingPts.id,
          procedimento_codigo: item.procedimento_codigo,
          procedimento_nome: item.procedimento_nome,
          especialidade: item.especialidade
        }, { onConflict: 'pts_id, procedimento_codigo' });
      }
      if (form.patient_id) {
        const cidInfo = cids && cids.length > 0 ? `\nCIDs: ${cids.map(c => c.cid_codigo).join(', ')}` : '';
        await (supabase as any).from('prontuarios').insert({
          paciente_id: form.patient_id,
          paciente_nome: form.patient_name,
          profissional_id: user?.id || '',
          profissional_nome: user?.nome || '',
          unidade_id: user?.unidadeId || '',
          data_atendimento: new Date().toISOString().split('T')[0],
          hora_atendimento: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          tipo_registro: 'pts_procedimento',
          queixa_principal: 'Procedimento Fonoaudiologia (PTS)',
          observacoes: `Procedimento: ${item.procedimento_codigo} - ${item.procedimento_nome}${cidInfo}`
        });
      }
    } catch (err) {
      console.error('Erro ao salvar imediato fono:', err);
    }
  };

  const handleAddSigtap = async () => {
    if (!selectedProcCodigo) return;
    const proc = sigtapProcs.find(p => p.codigo === selectedProcCodigo);
    if (!proc) return;
    if (sigtapSelecionados.some(s => s.procedimento_codigo === proc.codigo)) {
      toast.info('Procedimento já adicionado.');
      return;
    }
    const newItem: SelectedSigtap = {
      procedimento_codigo: proc.codigo,
      procedimento_nome: proc.nome,
      especialidade: proc.especialidade,
    };
    setSigtapSelecionados(prev => [...prev, newItem]);
    setSelectedProcCodigo('');
    if (proc.especialidade === 'fonoaudiologia') {
      const { data: relatedCids } = await supabase
        .from('sigtap_procedimento_cids')
        .select('cid_codigo, cid_descricao')
        .eq('procedimento_codigo', proc.codigo);
      const cidsToAdd: SelectedCid[] = [];
      if (relatedCids && relatedCids.length > 0) {
        setCidsSelecionados(prev => {
          const currentCodes = new Set(prev.map(c => c.cid_codigo));
          const toAdd = relatedCids.filter(c => !currentCodes.has(c.cid_codigo));
          cidsToAdd.push(...toAdd);
          return [...prev, ...toAdd];
        });
      }
      await saveImmediateFono(newItem, cidsToAdd);
      toast.success('Procedimento e CIDs de Fonoaudiologia vinculados.');
    } else {
      toast.success('Procedimento SIGTAP adicionado.');
    }
  };

  const handleAddCid = async (cid: SigtapCid) => {
    if (cidsSelecionados.some(c => c.cid_codigo === cid.cid_codigo)) {
      toast.info('CID já adicionado.');
      return;
    }
    const newCid = { cid_codigo: cid.cid_codigo, cid_descricao: cid.cid_descricao };
    setCidsSelecionados(prev => [...prev, newCid]);
    setCidSearch('');
    const currentProc = sigtapProcs.find(p => p.codigo === selectedProcCodigo);
    if (currentProc?.especialidade === 'fonoaudiologia' && editingPts) {
      await (supabase as any).from('pts_cid').upsert({
        pts_id: editingPts.id,
        cid_codigo: cid.cid_codigo,
        cid_descricao: cid.cid_descricao
      }, { onConflict: 'pts_id, cid_codigo' });
    }
    toast.success(`CID ${cid.cid_codigo} adicionado.`);
  };

  const handleForceAddCid = async () => {
    const code = cidSearch.trim().toUpperCase();
    if (!code) return;
    if (cidsSelecionados.some(c => c.cid_codigo === code)) { toast.info('CID já adicionado.'); return; }
    const newCid = { cid_codigo: code, cid_descricao: 'CID informado manualmente' };
    setCidsSelecionados(prev => [...prev, newCid]);
    setCidSearch('');
    setCidWarning(false);
    const currentProc = sigtapProcs.find(p => p.codigo === selectedProcCodigo);
    if (currentProc?.especialidade === 'fonoaudiologia' && editingPts) {
      await (supabase as any).from('pts_cid').upsert({
        pts_id: editingPts.id, cid_codigo: code, cid_descricao: 'CID informado manualmente'
      }, { onConflict: 'pts_id, cid_codigo' });
    }
    toast.info('CID aceito manualmente.');
  };

  const removeSigtap = (codigo: string) => setSigtapSelecionados(prev => prev.filter(s => s.procedimento_codigo !== codigo));
  const removeCid = (codigo: string) => setCidsSelecionados(prev => prev.filter(c => c.cid_codigo !== codigo));

  const resetSigtapState = () => {
    setSelectedProcCodigo(''); setCidSearch(''); setSigtapProcs([]);
    setSigtapSelecionados([]); setCidsSelecionados([]); setValidCids([]); setCidWarning(false);
  };

  const loadPtsSigtapCid = useCallback(async (ptsId: string) => {
    const [sigtapRes, cidRes] = await Promise.all([
      (supabase as any).from('pts_sigtap').select('procedimento_codigo, procedimento_nome, especialidade').eq('pts_id', ptsId),
      (supabase as any).from('pts_cid').select('cid_codigo, cid_descricao').eq('pts_id', ptsId),
    ]);
    return {
      sigtap: (sigtapRes.data || []) as SelectedSigtap[],
      cids: (cidRes.data || []) as SelectedCid[],
    };
  }, []);

  const loadPtsMetas = useCallback(async (ptsId: string): Promise<PTSMeta[]> => {
    try {
      const { data } = await (supabase as any).from('pts_metas').select('*').eq('pts_id', ptsId).order('created_at');
      return (data || []) as PTSMeta[];
    } catch {
      return [];
    }
  }, []);

  const extractMissingPtsColumn = (error: any): string | null => {
    const message = String(error?.message || '');
    const match = message.match(/Could not find the '([^']+)' column of 'pts'/i);
    return match?.[1] || null;
  };

  const removeUndefinedFields = (payload: Record<string, any>) =>
    Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));

  const runPtsMutation = async (
    mode: 'insert' | 'update',
    rawPayload: Record<string, any>,
    ptsId?: string,
  ) => {
    const payload = { ...rawPayload };
    const removedColumns: string[] = [];

    while (true) {
      const sanitizedPayload = removeUndefinedFields(payload);

      if (mode === 'update' && Object.keys(sanitizedPayload).length === 0) {
        return { data: null, removedColumns, skipped: true };
      }

      const result = mode === 'update'
        ? await (supabase as any).from('pts').update(sanitizedPayload).eq('id', ptsId)
        : await (supabase as any).from('pts').insert(sanitizedPayload).select('id').single();

      if (!result.error) {
        return { data: result.data, removedColumns, skipped: false };
      }

      const missingColumn = extractMissingPtsColumn(result.error);
      if (!missingColumn || !(missingColumn in sanitizedPayload)) {
        throw result.error;
      }

      delete payload[missingColumn];
      removedColumns.push(missingColumn);
    }
  };

  const openNewDialog = () => {
    setEditingPts(null);
    setForm({ ...emptyForm, data_proxima_revisao: suggestReviewDate(30) });
    setMetas([]);
    resetSigtapState();
    setActiveTab('identificacao');
    setDialogOpen(true);
  };

  const openEditDialog = async (pts: PTSRecord) => {
    const pac = pacientes.find(p => p.id === pts.patient_id);
    setEditingPts(pts);
    setForm({
      patient_id: pts.patient_id,
      patient_name: pac?.nome || pts.patient_id,
      diagnostico_funcional: pts.diagnostico_funcional,
      objetivos_terapeuticos: pts.objetivos_terapeuticos,
      metas_curto_prazo: pts.metas_curto_prazo,
      metas_medio_prazo: pts.metas_medio_prazo,
      metas_longo_prazo: pts.metas_longo_prazo,
      especialidades_envolvidas: pts.especialidades_envolvidas || [],
      prioridade: pts.prioridade || 'Média',
      contextos_afetados: pts.contextos_afetados || [],
      tipo_atendimento: pts.tipo_atendimento || [],
      rede_apoio_presente: pts.rede_apoio_presente || false,
      acompanhamento_interdisciplinar: pts.acompanhamento_interdisciplinar || false,
      ciencia_familia: pts.ciencia_familia || false,
      motivo_encaminhamento: pts.motivo_encaminhamento || '',
      barreiras: pts.barreiras || '',
      potencialidades: pts.potencialidades || '',
      objetivo_geral: pts.objetivo_geral || '',
      plano_conduta: pts.plano_conduta || '',
      data_proxima_revisao: pts.data_proxima_revisao || suggestReviewDate(30),
    });
    const [{ sigtap, cids }, metasData] = await Promise.all([
      loadPtsSigtapCid(pts.id),
      loadPtsMetas(pts.id),
    ]);
    setSigtapSelecionados(sigtap);
    setCidsSelecionados(cids);
    setMetas(metasData);
    setSelectedProcCodigo('');
    setCidSearch('');
    setActiveTab('identificacao');
    setDialogOpen(true);
  };

  const openDetailDialog = async (pts: PTSRecord) => {
    setDetailPts(pts);
    const [{ sigtap, cids }, metasData] = await Promise.all([
      loadPtsSigtapCid(pts.id),
      loadPtsMetas(pts.id),
    ]);
    setDetailSigtap(sigtap);
    setDetailCids(cids);
    setDetailMetas(metasData);
  };

  const handleSave = async () => {
    let finalSigtap = [...sigtapSelecionados];
    let finalCids = [...cidsSelecionados];

    if (selectedProcCodigo && !finalSigtap.some(s => s.procedimento_codigo === selectedProcCodigo)) {
      const proc = sigtapProcs.find(p => p.codigo === selectedProcCodigo);
      if (proc) {
        const newItem: SelectedSigtap = { procedimento_codigo: proc.codigo, procedimento_nome: proc.nome, especialidade: proc.especialidade };
        finalSigtap.push(newItem);
        if (proc.especialidade === 'fonoaudiologia') {
          const { data: relatedCids } = await supabase.from('sigtap_procedimento_cids').select('cid_codigo, cid_descricao').eq('procedimento_codigo', proc.codigo);
          if (relatedCids && relatedCids.length > 0) {
            const currentCidCodes = new Set(finalCids.map(c => c.cid_codigo));
            finalCids.push(...relatedCids.filter(c => !currentCidCodes.has(c.cid_codigo)));
          }
        }
      }
    }

    if (!form.patient_id || !form.diagnostico_funcional || !form.objetivos_terapeuticos) {
      toast.error('Preencha paciente, diagnóstico funcional e objetivos.');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        patient_id: form.patient_id,
        professional_id: editingPts ? editingPts.professional_id : (user?.id || ''),
        unit_id: user?.unidadeId || '',
        diagnostico_funcional: form.diagnostico_funcional,
        objetivos_terapeuticos: form.objetivos_terapeuticos,
        metas_curto_prazo: form.metas_curto_prazo,
        metas_medio_prazo: form.metas_medio_prazo,
        metas_longo_prazo: form.metas_longo_prazo,
        especialidades_envolvidas: form.especialidades_envolvidas,
        prioridade: form.prioridade,
        contextos_afetados: form.contextos_afetados,
        tipo_atendimento: form.tipo_atendimento,
        rede_apoio_presente: form.rede_apoio_presente,
        acompanhamento_interdisciplinar: form.acompanhamento_interdisciplinar,
        ciencia_familia: form.ciencia_familia,
        motivo_encaminhamento: form.motivo_encaminhamento,
        barreiras: form.barreiras,
        potencialidades: form.potencialidades,
        objetivo_geral: form.objetivo_geral,
        plano_conduta: form.plano_conduta,
        data_proxima_revisao: form.data_proxima_revisao || null,
      };

      let ptsId: string;
      let removedPtsColumns: string[] = [];

      if (editingPts) {
        const updateResult = await runPtsMutation('update', payload, editingPts.id);
        removedPtsColumns = updateResult.removedColumns;
        ptsId = editingPts.id;
        
        await (supabase as any).from('pts_sigtap').delete().eq('pts_id', ptsId);
        await (supabase as any).from('pts_cid').delete().eq('pts_id', ptsId);
        await (supabase as any).from('pts_metas').delete().eq('pts_id', ptsId);
      } else {
        const insertResult = await runPtsMutation('insert', { ...payload, status: 'ativo' });
        removedPtsColumns = insertResult.removedColumns;
        const newPts = insertResult.data;
        if (!newPts) throw new Error('Falha ao criar PTS');
        ptsId = newPts.id;

        // Create prontuário record
        const procInfo = finalSigtap.map(s => `${s.procedimento_codigo} - ${s.procedimento_nome}`).join('; ');
        const cidInfo = finalCids.map(c => `${c.cid_codigo} - ${c.cid_descricao}`).join('; ');
        try {
          await (supabase as any).from('prontuarios').insert({
            paciente_id: form.patient_id,
            paciente_nome: form.patient_name,
            profissional_id: user?.id || '',
            profissional_nome: user?.nome || '',
            unidade_id: user?.unidadeId || '',
            data_atendimento: new Date().toISOString().split('T')[0],
            hora_atendimento: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            tipo_registro: 'pts',
            queixa_principal: 'Projeto Terapêutico Singular',
            anamnese: form.diagnostico_funcional,
            hipotese: form.objetivos_terapeuticos,
            conduta: `Curto prazo: ${form.metas_curto_prazo}\nMédio prazo: ${form.metas_medio_prazo}\nLongo prazo: ${form.metas_longo_prazo}`,
            observacoes: `Especialidades: ${form.especialidades_envolvidas.join(', ')}${procInfo ? `\nSIGTAP: ${procInfo}` : ''}${cidInfo ? `\nCID: ${cidInfo}` : ''}`,
          });
        } catch {
          // Não bloqueia a criação do PTS se o registro no prontuário falhar.
        }
      }

      // SIGTAP links
      if (finalSigtap.length > 0) {
        await (supabase as any).from('pts_sigtap').insert(
          finalSigtap.map(s => ({ pts_id: ptsId, procedimento_codigo: s.procedimento_codigo, procedimento_nome: s.procedimento_nome, especialidade: s.especialidade }))
        );
      }
      // CID links
      if (finalCids.length > 0) {
        await (supabase as any).from('pts_cid').insert(
          finalCids.map(c => ({ pts_id: ptsId, cid_codigo: c.cid_codigo, cid_descricao: c.cid_descricao }))
        );
      }
      // Metas estruturadas
      if (metas.length > 0) {
        await (supabase as any).from('pts_metas').insert(
          metas.map(m => ({
            pts_id: ptsId,
            titulo: m.titulo, descricao: m.descricao, categoria: m.categoria,
            especialidade: m.especialidade, responsavel: m.responsavel || '',
            status: m.status, prazo_estimado: m.prazo_estimado || null,
            indicador: m.indicador || '', prioridade: m.prioridade || 'Média', obs: m.obs || '',
          }))
        );
      }

      await logAction({
        acao: editingPts ? 'editar_pts' : 'criar_pts',
        entidade: 'pts', entidadeId: ptsId, modulo: 'pts', user,
        detalhes: {
          paciente_nome: form.patient_name,
          especialidades: form.especialidades_envolvidas,
          cid_count: finalCids.length,
          metas_count: metas.length,
        },
      });

      if (removedPtsColumns.length > 0) {
        toast.info(`PTS salvo com compatibilidade automática. Campos ignorados: ${removedPtsColumns.join(', ')}`);
      }

      toast.success(editingPts ? 'PTS atualizado com sucesso!' : 'PTS criado e registrado no prontuário!');
      setDialogOpen(false);
      setEditingPts(null);
      resetSigtapState();
      setMetas([]);
      loadPts();
    } catch (err: any) {
      console.error('Erro no handleSave:', err);
      toast.error('Erro ao salvar: ' + (err?.message || 'Erro desconhecido'));
    }
    setSaving(false);
  };

  const handleDelete = async (pts: PTSRecord) => {
    if (!window.confirm(`Tem certeza que deseja excluir o PTS de ${pacientes.find(p => p.id === pts.patient_id)?.nome || pts.patient_id}?`)) return;
    try {
      await (supabase as any).from('pts_sigtap').delete().eq('pts_id', pts.id);
      await (supabase as any).from('pts_cid').delete().eq('pts_id', pts.id);
      try { await (supabase as any).from('pts_metas').delete().eq('pts_id', pts.id); } catch { /* may not exist */ }
      const { error } = await supabase.from('pts').delete().eq('id', pts.id);
      if (error) throw error;
      await logAction({
        acao: 'excluir_pts', entidade: 'pts', entidadeId: pts.id, modulo: 'pts', user,
        detalhes: { paciente_id: pts.patient_id, paciente_nome: pacientes.find(p => p.id === pts.patient_id)?.nome },
      });
      toast.success('PTS excluído com sucesso!');
      loadPts();
    } catch (err: any) {
      console.error('Erro ao excluir PTS:', err);
      toast.error('Erro ao excluir: ' + (err?.message || 'Erro desconhecido'));
    }
  };

  const handleRevisao = async () => {
    const ptsId = detailPts?.id;
    if (!ptsId) return;
    try {
      const revisaoResult = await runPtsMutation('update', {
        obs_revisao: revisaoForm.obs,
        data_ultima_revisao: new Date().toISOString().split('T')[0],
        data_proxima_revisao: revisaoForm.data_proxima || null,
      }, ptsId);
      if (revisaoResult.removedColumns.length > 0) {
        toast.info(`Revisão salva com compatibilidade automática. Campos ignorados: ${revisaoResult.removedColumns.join(', ')}`);
      }
      await logAction({
        acao: 'revisao_pts', entidade: 'pts', entidadeId: ptsId, modulo: 'pts', user,
        detalhes: { obs: revisaoForm.obs, proxima_revisao: revisaoForm.data_proxima },
      });
      toast.success('Revisão do PTS registrada!');
      setRevisaoOpen(false);
      setDetailPts(null);
      loadPts();
    } catch (err: any) {
      toast.error('Erro ao registrar revisão: ' + (err?.message || ''));
    }
  };

  const handleAlta = async () => {
    const ptsId = detailPts?.id;
    if (!ptsId) return;
    if (!altaForm.motivo_encerramento) { toast.error('Informe o motivo do encerramento.'); return; }
    try {
      const altaResult = await runPtsMutation('update', {
        status: altaForm.status_final || 'encerrado',
        motivo_encerramento: altaForm.motivo_encerramento,
        resumo_desfecho: altaForm.resumo_desfecho,
        orientacoes_finais: altaForm.orientacoes_finais,
        criterio_alta_atingido: altaForm.criterio_alta_atingido,
        ciencia_familia: altaForm.ciencia_familia,
      }, ptsId);
      if (altaResult.removedColumns.length > 0) {
        toast.info(`Alta salva com compatibilidade automática. Campos ignorados: ${altaResult.removedColumns.join(', ')}`);
      }
      await logAction({
        acao: 'alta_pts', entidade: 'pts', entidadeId: ptsId, modulo: 'pts', user,
        detalhes: { motivo: altaForm.motivo_encerramento, status_final: altaForm.status_final },
      });
      toast.success('Alta/encerramento do PTS registrado!');
      setAltaOpen(false);
      setDetailPts(null);
      loadPts();
    } catch (err: any) {
      toast.error('Erro ao registrar alta: ' + (err?.message || ''));
    }
  };

  const handleAddMeta = () => {
    setMetaForm({ titulo: '', descricao: '', categoria: 'Curto Prazo', especialidade: '', responsavel: '', status: 'Não iniciada', prazo_estimado: '', indicador: '', prioridade: 'Média', obs: '' });
    setEditingMetaIdx(null);
    setMetaDialogOpen(true);
  };

  const handleEditMeta = (idx: number) => {
    setMetaForm({ ...metas[idx] });
    setEditingMetaIdx(idx);
    setMetaDialogOpen(true);
  };

  const handleSaveMeta = () => {
    if (!metaForm.titulo) { toast.error('Título da meta é obrigatório.'); return; }
    if (editingMetaIdx !== null) {
      setMetas(prev => prev.map((m, i) => i === editingMetaIdx ? { ...metaForm } : m));
    } else {
      setMetas(prev => [...prev, { ...metaForm }]);
    }
    setMetaDialogOpen(false);
  };

  const handleRemoveMeta = (idx: number) => setMetas(prev => prev.filter((_, i) => i !== idx));

  const procsBySpecialty = useMemo(() => {
    const map: Record<string, SigtapProcedimento[]> = {};
    const searchTerm = normalize(procSearch);
    for (const p of sigtapProcs) {
      if (searchTerm) {
        const procName = normalize(p.nome);
        if (!procName.includes(searchTerm) && !p.codigo.includes(searchTerm)) continue;
      }
      const esp = p.especialidade || 'outros';
      if (!map[esp]) map[esp] = [];
      map[esp].push(p);
    }
    return map;
  }, [sigtapProcs, procSearch, normalize]);

  const getSpecLabelForSigtap = useCallback((key: string): string => {
    const entry = Object.entries(SPECIALTY_TO_SIGTAP).find(([, v]) => v === key);
    return entry ? entry[0] : key;
  }, []);

  if (!can('tratamento', 'can_view')) {
    return <div className="p-6 text-muted-foreground">Sem permissão.</div>;
  }

  // RENDER
  return (
    <div className="space-y-4 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">PTS — Projeto Terapêutico Singular</h1>
          <p className="text-muted-foreground text-sm">{ptsList.length} projeto(s) registrado(s)</p>
        </div>
        <Button onClick={openNewDialog}>
          <Plus className="w-4 h-4 mr-1" /> Novo PTS
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por paciente ou diagnóstico..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum PTS encontrado.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(pts => {
            const pac = pacientes.find(p => p.id === pts.patient_id);
            const prof = funcionarios.find(f => f.id === pts.professional_id);
            const editable = canEditPts(pts);
            const overdue = isOverdueReview(pts);
            return (
              <Card key={pts.id} className={cn("hover:shadow-sm transition-shadow", overdue && "border-l-4 border-l-warning")}>
                <CardContent className="p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{pac?.nome || pts.patient_id}</span>
                      <Badge variant="outline" className={cn("text-xs", statusBadgeColor(pts.status))}>
                        {pts.status === 'ativo' ? 'Ativo' : pts.status === 'encerrado' ? 'Encerrado' : pts.status || 'Ativo'}
                      </Badge>
                      {pts.prioridade && (
                        <Badge variant="outline" className={cn("text-xs", prioridadeColor(pts.prioridade))}>
                          {pts.prioridade}
                        </Badge>
                      )}
                      {overdue && (
                        <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/30">
                          <Clock className="w-3 h-3 mr-1" /> Revisão vencida
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Prof. {prof?.nome || '—'} • {new Date(pts.created_at).toLocaleDateString('pt-BR')}
                      {pts.especialidades_envolvidas.length > 0 && ` • ${pts.especialidades_envolvidas.join(', ')}`}
                    </p>
                    {pts.data_proxima_revisao && (
                      <p className="text-xs text-muted-foreground">
                        Próx. revisão: {new Date(pts.data_proxima_revisao + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {editable && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => openEditDialog(pts)} title="Editar PTS">
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" title="Registrar Revisão" onClick={() => {
                          setDetailPts(pts);
                          setRevisaoForm({ obs: '', data_proxima: suggestReviewDate(30) });
                          setRevisaoOpen(true);
                        }}>
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                        {(!pts.status || pts.status === 'ativo') && (
                          <Button size="sm" variant="ghost" title="Alta/Encerrar" onClick={() => {
                            setDetailPts(pts);
                            setAltaForm({ motivo_encerramento: '', resumo_desfecho: '', orientacoes_finais: '', criterio_alta_atingido: false, ciencia_familia: false, status_final: 'encerrado' });
                            setAltaOpen(true);
                          }}>
                            <CheckSquare className="w-4 h-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(pts)} title="Excluir PTS">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => openDetailDialog(pts)} title="Visualizar">
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT DIALOG */}
      <Dialog open={dialogOpen} onOpenChange={v => { if (!v) { setDialogOpen(false); setEditingPts(null); } }}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[95vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="font-display text-xl">{editingPts ? 'Editar PTS' : 'Novo PTS'}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <TabsList className="mx-6 mt-3 mb-0 grid grid-cols-5 shrink-0">
                <TabsTrigger value="identificacao" className="text-sm">Identificação</TabsTrigger>
                <TabsTrigger value="diagnostico" className="text-sm">Diagnóstico</TabsTrigger>
                <TabsTrigger value="metas" className="text-sm">Metas</TabsTrigger>
                <TabsTrigger value="procedimentos" className="text-sm">Procedimentos</TabsTrigger>
                <TabsTrigger value="revisao" className="text-sm">Revisão</TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">

                <TabsContent value="identificacao" className="mt-0 space-y-4 outline-none">
                  <div>
                    <Label>Paciente *</Label>
                    {editingPts ? (
                      <Input value={form.patient_name} disabled className="bg-muted" />
                    ) : (
                      <BuscaPaciente pacientes={pacientes} value={form.patient_id}
                        onChange={(id, nome) => setForm(p => ({ ...p, patient_id: id, patient_name: nome }))} />
                    )}
                  </div>

                  <div>
                    <Label>Motivo do Encaminhamento</Label>
                    <Textarea rows={2} value={form.motivo_encaminhamento}
                      onChange={e => setForm(p => ({ ...p, motivo_encaminhamento: e.target.value }))}
                      placeholder="Descreva o motivo pelo qual o paciente está sendo encaminhado para o PTS..." />
                  </div>

                  <div>
                    <Label className="mb-2 block">Prioridade do Caso</Label>
                    <div className="flex gap-2 flex-wrap">
                      {PRIORIDADES.map(p => (
                        <button key={p} type="button"
                          onClick={() => setForm(f => ({ ...f, prioridade: p }))}
                          className={cn(
                            'px-3 py-1.5 rounded-full border text-xs font-medium transition-colors',
                            form.prioridade === p
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background border-border text-muted-foreground hover:bg-accent'
                          )}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="mb-2 block">Contextos Afetados</Label>
                    <div className="flex flex-wrap gap-2">
                      {CONTEXTOS.map(ctx => (
                        <button key={ctx} type="button"
                          onClick={() => toggleContexto(ctx)}
                          className={cn(
                            'px-2.5 py-1 rounded-md border text-xs transition-colors',
                            form.contextos_afetados.includes(ctx)
                              ? 'bg-primary/15 border-primary text-primary'
                              : 'bg-background border-border text-muted-foreground hover:bg-accent'
                          )}>
                          {ctx}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="mb-2 block">Tipo de Atendimento</Label>
                    <div className="flex flex-wrap gap-2">
                      {TIPOS_ATENDIMENTO.map(tipo => (
                        <button key={tipo} type="button"
                          onClick={() => toggleTipoAtendimento(tipo)}
                          className={cn(
                            'px-2.5 py-1 rounded-md border text-xs transition-colors',
                            form.tipo_atendimento.includes(tipo)
                              ? 'bg-info/15 border-info text-info'
                              : 'bg-background border-border text-muted-foreground hover:bg-accent'
                          )}>
                          {tipo}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div>
                        <p className="text-sm font-medium">Rede de Apoio Presente</p>
                        <p className="text-xs text-muted-foreground">Família, comunidade, outros serviços</p>
                      </div>
                      <Switch checked={form.rede_apoio_presente}
                        onCheckedChange={v => setForm(p => ({ ...p, rede_apoio_presente: v }))} />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div>
                        <p className="text-sm font-medium">Atuação Interdisciplinar</p>
                        <p className="text-xs text-muted-foreground">Necessita equipe multiprofissional</p>
                      </div>
                      <Switch checked={form.acompanhamento_interdisciplinar}
                        onCheckedChange={v => setForm(p => ({ ...p, acompanhamento_interdisciplinar: v }))} />
                    </div>
                  </div>

                  <div>
                    <Label className="mb-2 block">Especialidades Envolvidas</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {SPECIALTIES.map(spec => (
                        <label key={spec} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox checked={form.especialidades_envolvidas.includes(spec)}
                            onCheckedChange={() => toggleSpec(spec)} />
                          {spec}
                        </label>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                {/* TAB 2: Diagnóstico e Objetivos */}
                <TabsContent value="diagnostico" className="mt-0 space-y-6 outline-none pb-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-semibold">Diagnóstico Funcional Global *</Label>
                        <Textarea rows={6} value={form.diagnostico_funcional}
                          onChange={e => setForm(p => ({ ...p, diagnostico_funcional: e.target.value }))}
                          placeholder="Diagnóstico funcional completo do paciente contemplando aspectos físicos, cognitivos e sociais..."
                          className="mt-1.5 resize-none focus-visible:ring-primary" />
                      </div>
                      <div>
                        <Label className="text-sm font-semibold">Potencialidades do Paciente</Label>
                        <Textarea rows={4} value={form.potencialidades}
                          onChange={e => setForm(p => ({ ...p, potencialidades: e.target.value }))}
                          placeholder="Recursos, habilidades, pontos fortes e fatores de proteção..."
                          className="mt-1.5 resize-none" />
                      </div>
                      <div>
                        <Label className="text-sm font-semibold">Barreiras e Dificuldades</Label>
                        <Textarea rows={4} value={form.barreiras}
                          onChange={e => setForm(p => ({ ...p, barreiras: e.target.value }))}
                          placeholder="Obstáculos ambientais, familiares ou individuais para o progresso terapêutico..."
                          className="mt-1.5 resize-none" />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-semibold">Objetivo Geral do Tratamento</Label>
                        <Textarea rows={3} value={form.objetivo_geral}
                          onChange={e => setForm(p => ({ ...p, objetivo_geral: e.target.value }))}
                          placeholder="O principal resultado esperado ao final do processo terapêutico..."
                          className="mt-1.5 resize-none" />
                      </div>
                      <div>
                        <Label className="text-sm font-semibold">Objetivos Terapêuticos Específicos *</Label>
                        <Textarea rows={5} value={form.objetivos_terapeuticos}
                          onChange={e => setForm(p => ({ ...p, objetivos_terapeuticos: e.target.value }))}
                          placeholder="Descreva metas claras e mensuráveis..."
                          className="mt-1.5 resize-none" />
                      </div>
                      
                      <div className="space-y-3 pt-2">
                        <Label className="text-sm font-semibold">Metas Temporais</Label>
                        <div className="grid grid-cols-1 gap-3">
                          <div className="relative">
                            <span className="absolute -left-2 top-2 w-1 h-8 bg-blue-500 rounded-full" />
                            <div className="pl-3">
                              <Label className="text-xs text-blue-600 font-bold uppercase tracking-wider">Curto Prazo (1-3 meses)</Label>
                              <Textarea rows={2} value={form.metas_curto_prazo}
                                onChange={e => setForm(p => ({ ...p, metas_curto_prazo: e.target.value }))}
                                className="mt-1 text-sm bg-blue-50/30 border-blue-100" />
                            </div>
                          </div>
                          <div className="relative">
                            <span className="absolute -left-2 top-2 w-1 h-8 bg-amber-500 rounded-full" />
                            <div className="pl-3">
                              <Label className="text-xs text-amber-600 font-bold uppercase tracking-wider">Médio Prazo (3-6 meses)</Label>
                              <Textarea rows={2} value={form.metas_medio_prazo}
                                onChange={e => setForm(p => ({ ...p, metas_medio_prazo: e.target.value }))}
                                className="mt-1 text-sm bg-amber-50/30 border-amber-100" />
                            </div>
                          </div>
                          <div className="relative">
                            <span className="absolute -left-2 top-2 w-1 h-8 bg-emerald-500 rounded-full" />
                            <div className="pl-3">
                              <Label className="text-xs text-emerald-600 font-bold uppercase tracking-wider">Longo Prazo (6-12 meses)</Label>
                              <Textarea rows={2} value={form.metas_longo_prazo}
                                onChange={e => setForm(p => ({ ...p, metas_longo_prazo: e.target.value }))}
                                className="mt-1 text-sm bg-emerald-50/30 border-emerald-100" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="pt-2 border-t mt-4">
                    <Label className="text-sm font-semibold">Plano de Conduta Terapêutica</Label>
                    <Textarea rows={4} value={form.plano_conduta}
                      onChange={e => setForm(p => ({ ...p, plano_conduta: e.target.value }))}
                      placeholder="Estratégias detalhadas, frequência de atendimentos, abordagens específicas e orientações..."
                      className="mt-1.5 resize-none bg-muted/20" />
                  </div>
                </TabsContent>

                {/* TAB 3: Metas Estruturadas */}
                <TabsContent value="metas" className="mt-0 space-y-4 outline-none">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-sm">Metas Estruturadas</h3>
                      <p className="text-xs text-muted-foreground">Cadastre metas com indicadores, prazos e status individuais</p>
                    </div>
                    <Button size="sm" onClick={handleAddMeta}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> Nova Meta
                    </Button>
                  </div>
                  {metas.length === 0 ? (
                    <div className="border-2 border-dashed rounded-xl p-8 text-center text-muted-foreground text-sm">
                      <Target className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      Nenhuma meta cadastrada. Clique em "Nova Meta" para começar.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {metas.map((meta, idx) => (
                        <div key={idx} className="border rounded-lg p-3 bg-card">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{meta.titulo}</span>
                                <Badge variant="outline" className="text-xs">{meta.categoria}</Badge>
                                <Badge variant="outline" className={cn("text-xs", statusMetaColor(meta.status))}>
                                  {meta.status}
                                </Badge>
                                <Badge variant="outline" className={cn("text-xs", prioridadeColor(meta.prioridade))}>
                                  {meta.prioridade}
                                </Badge>
                              </div>
                              {meta.especialidade && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {meta.especialidade}{meta.responsavel ? ` • ${meta.responsavel}` : ''}
                                </p>
                              )}
                              {meta.indicador && <p className="text-xs text-muted-foreground">📊 {meta.indicador}</p>}
                              {meta.prazo_estimado && (
                                <p className="text-xs text-muted-foreground">
                                  📅 Prazo: {new Date(meta.prazo_estimado + 'T12:00:00').toLocaleDateString('pt-BR')}
                                </p>
                              )}
                              {meta.descricao && <p className="text-xs text-muted-foreground mt-0.5">{meta.descricao}</p>}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleEditMeta(idx)}>
                                <Edit2 className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleRemoveMeta(idx)}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* TAB 4: Procedimentos SIGTAP */}
                <TabsContent value="procedimentos" className="mt-0 space-y-4 outline-none">
                  {(isFisioterapeuta || isMaster) ? (
                    <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold flex items-center gap-1.5">
                          📋 Procedimentos SIGTAP
                          {loadingProcs && <Loader2 className="w-3 h-3 animate-spin" />}
                        </Label>
                      </div>

                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input 
                            placeholder="Pesquisar por nome ou código..." 
                            value={procSearch}
                            onChange={e => setProcSearch(e.target.value)} 
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                searchGlobalSigtap();
                              }
                            }}
                            className="pl-9 h-9 text-sm" 
                          />
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-9 gap-2" 
                          onClick={searchGlobalSigtap}
                          disabled={searchingGlobal || !procSearch.trim()}
                        >
                          {searchingGlobal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                          <span className="hidden sm:inline">Pesquisa Geral</span>
                        </Button>
                      </div>

                      {sigtapProcs.length > 0 && (
                        <div className="flex gap-2 items-end">
                          <div className="flex-1">
                            <Select value={selectedProcCodigo} onValueChange={v => { setSelectedProcCodigo(v); setCidSearch(''); }}>
                              <SelectTrigger>
                                <SelectValue placeholder={procSearch ? 'Selecione nos resultados...' : 'Selecione o procedimento...'} />
                              </SelectTrigger>
                              <SelectContent className="max-h-[300px]">
                                {Object.entries(procsBySpecialty).length === 0 ? (
                                  <div className="p-4 text-center text-xs text-muted-foreground">
                                    Nenhum procedimento encontrado
                                  </div>
                                ) : (
                                  Object.entries(procsBySpecialty).map(([esp, procs]) => (
                                    <React.Fragment key={esp}>
                                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 sticky top-0 z-10">
                                        {getSpecLabelForSigtap(esp)} ({procs.length})
                                      </div>
                                      {procs.map(p => (
                                        <SelectItem key={p.codigo} value={p.codigo}>
                                          <span className="text-xs font-mono text-muted-foreground mr-1">{p.codigo}</span>
                                          <span className="text-xs">{p.nome}</span>
                                        </SelectItem>
                                      ))}
                                    </React.Fragment>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button size="sm" onClick={handleAddSigtap} disabled={!selectedProcCodigo}>
                            <Plus className="w-4 h-4 mr-1" /> Adicionar
                          </Button>
                        </div>
                      )}

                      {sigtapProcs.length === 0 && !loadingProcs && (
                        <p className="text-xs text-muted-foreground">
                          {form.especialidades_envolvidas.length === 0
                            ? 'Selecione especialidades na aba Identificação para carregar procedimentos SIGTAP.'
                            : 'Nenhum procedimento SIGTAP encontrado para as especialidades selecionadas.'}
                        </p>
                      )}

                      {sigtapSelecionados.length > 0 && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Procedimentos adicionados ({sigtapSelecionados.length}):</Label>
                          {sigtapSelecionados.map(s => (
                            <div key={s.procedimento_codigo} className="flex items-center gap-2 bg-background rounded px-2 py-1 text-xs">
                              <Badge variant="secondary" className="font-mono text-xs shrink-0">{s.procedimento_codigo}</Badge>
                              <span className="flex-1 truncate">{s.procedimento_nome}</span>
                              <span className="text-muted-foreground shrink-0">{getSpecLabelForSigtap(s.especialidade)}</span>
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => removeSigtap(s.procedimento_codigo)}>
                                <Trash2 className="w-3 h-3 text-destructive" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      {selectedProcCodigo && (
                        <div className="space-y-2 border-t pt-2">
                          <Label className="text-xs">
                            Buscar CID vinculado ao procedimento ({validCids.length} CIDs válidos)
                          </Label>
                          <Input placeholder="Digite código ou descrição do CID..."
                            value={cidSearch} onChange={e => setCidSearch(e.target.value)} className="text-sm" />
                          {cidWarning && (
                            <div className="flex items-start gap-2 p-2 rounded bg-warning/10 border border-warning/30 text-xs">
                              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                              <div>
                                <p className="font-medium text-warning">CID não vinculado ao procedimento no SIGTAP.</p>
                                <Button size="sm" variant="outline" className="mt-1 h-6 text-xs" onClick={handleForceAddCid}>
                                  Usar mesmo assim?
                                </Button>
                              </div>
                            </div>
                          )}
                          {loadingCids ? (
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Carregando CIDs...
                            </div>
                          ) : (
                            cidSearch.trim() && filteredCids.length > 0 && (
                              <div className="max-h-40 overflow-y-auto border rounded text-xs divide-y">
                                {filteredCids.map(c => (
                                  <button key={c.cid_codigo}
                                    className="w-full text-left px-2 py-1.5 hover:bg-accent/50 flex gap-2"
                                    onClick={() => handleAddCid(c)}>
                                    <span className="font-mono font-medium text-primary shrink-0">{c.cid_codigo}</span>
                                    <span className="text-muted-foreground truncate">{c.cid_descricao}</span>
                                  </button>
                                ))}
                              </div>
                            )
                          )}
                        </div>
                      )}

                      {cidsSelecionados.length > 0 && (
                        <div className="space-y-1 border-t pt-2">
                          <Label className="text-xs text-muted-foreground">CIDs adicionados ({cidsSelecionados.length}):</Label>
                          {cidsSelecionados.map(c => (
                            <div key={c.cid_codigo} className="flex items-center gap-2 bg-background rounded px-2 py-1 text-xs">
                              <Badge variant="secondary" className="font-mono text-xs shrink-0">{c.cid_codigo}</Badge>
                              <span className="flex-1 truncate">{c.cid_descricao}</span>
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => removeCid(c.cid_codigo)}>
                                <Trash2 className="w-3 h-3 text-destructive" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-6 bg-muted/30 rounded-lg text-center text-sm text-muted-foreground">
                      A vinculação de procedimentos SIGTAP está disponível para Fisioterapeutas e administradores.
                      <br />
                      <span className="text-xs mt-1 block">Selecione especialidades e configure pelo perfil adequado.</span>
                    </div>
                  )}
                </TabsContent>

                {/* TAB 5: Revisão e Configurações */}
                <TabsContent value="revisao" className="mt-0 space-y-4 outline-none">
                  <div>
                    <Label>Data da Próxima Revisão</Label>
                    <Input type="date" value={form.data_proxima_revisao}
                      onChange={e => setForm(p => ({ ...p, data_proxima_revisao: e.target.value }))} />
                    <div className="flex gap-2 mt-2">
                      {[30, 60, 90].map(days => (
                        <Button key={days} size="sm" variant="outline" className="text-xs h-7"
                          onClick={() => setForm(p => ({ ...p, data_proxima_revisao: suggestReviewDate(days) }))}>
                          +{days} dias
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div>
                        <p className="text-sm font-medium">Revisão Obrigatória</p>
                        <p className="text-xs text-muted-foreground">Marcação prioritária de acompanhamento</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div>
                        <p className="text-sm font-medium">Ciência da Família</p>
                        <p className="text-xs text-muted-foreground">Família/responsável ciente do plano</p>
                      </div>
                      <Switch checked={form.ciencia_familia}
                        onCheckedChange={v => setForm(p => ({ ...p, ciencia_familia: v }))} />
                    </div>
                  </div>
                </TabsContent>

              </div>
            </Tabs>
          </div>

          <div className="flex gap-2 justify-end px-6 py-4 border-t shrink-0 bg-background">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gradient-primary text-primary-foreground">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              {editingPts ? 'Salvar Alterações' : 'Criar PTS'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* META DIALOG */}
      <Dialog open={metaDialogOpen} onOpenChange={setMetaDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMetaIdx !== null ? 'Editar Meta' : 'Nova Meta'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título da Meta *</Label>
              <Input value={metaForm.titulo}
                onChange={e => setMetaForm(p => ({ ...p, titulo: e.target.value }))}
                placeholder="Ex: Melhorar compreensão de comandos simples" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria / Prazo</Label>
                <Select value={metaForm.categoria} onValueChange={v => setMetaForm(p => ({ ...p, categoria: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS_META.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade</Label>
                <Select value={metaForm.prioridade} onValueChange={v => setMetaForm(p => ({ ...p, prioridade: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORIDADES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Especialidade</Label>
                <Select value={metaForm.especialidade || ''} onValueChange={v => setMetaForm(p => ({ ...p, especialidade: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {SPECIALTIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={metaForm.status} onValueChange={v => setMetaForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_META.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Profissional Responsável</Label>
              <Input value={metaForm.responsavel || ''}
                onChange={e => setMetaForm(p => ({ ...p, responsavel: e.target.value }))}
                placeholder="Nome do profissional responsável" />
            </div>
            <div>
              <Label>Prazo Estimado</Label>
              <Input type="date" value={metaForm.prazo_estimado}
                onChange={e => setMetaForm(p => ({ ...p, prazo_estimado: e.target.value }))} />
            </div>
            <div>
              <Label>Indicador de Sucesso</Label>
              <Input value={metaForm.indicador}
                onChange={e => setMetaForm(p => ({ ...p, indicador: e.target.value }))}
                placeholder="Ex: Responde corretamente a 8 de 10 comandos" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea rows={2} value={metaForm.descricao}
                onChange={e => setMetaForm(p => ({ ...p, descricao: e.target.value }))}
                placeholder="Descreva a meta em detalhes..." />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea rows={2} value={metaForm.obs || ''}
                onChange={e => setMetaForm(p => ({ ...p, obs: e.target.value }))} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setMetaDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveMeta}>Salvar Meta</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* REVISÃO DIALOG */}
      <Dialog open={revisaoOpen} onOpenChange={v => { if (!v) { setRevisaoOpen(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-primary" /> Registrar Revisão do PTS
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {detailPts && (
              <div className="bg-muted/30 rounded-lg p-3 text-sm">
                <p className="font-medium">{pacientes.find(p => p.id === detailPts.patient_id)?.nome || detailPts.patient_id}</p>
                {detailPts.data_ultima_revisao && (
                  <p className="text-xs text-muted-foreground">
                    Última revisão: {new Date(detailPts.data_ultima_revisao + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </p>
                )}
              </div>
            )}
            <div>
              <Label>Observações da Revisão</Label>
              <Textarea rows={3} value={revisaoForm.obs}
                onChange={e => setRevisaoForm(p => ({ ...p, obs: e.target.value }))}
                placeholder="Descreva as alterações, progresso e decisões desta revisão..." />
            </div>
            <div>
              <Label>Próxima Revisão Prevista</Label>
              <Input type="date" value={revisaoForm.data_proxima}
                onChange={e => setRevisaoForm(p => ({ ...p, data_proxima: e.target.value }))} />
              <div className="flex gap-2 mt-1">
                {[30, 60, 90].map(days => (
                  <Button key={days} size="sm" variant="outline" className="text-xs h-7"
                    onClick={() => setRevisaoForm(p => ({ ...p, data_proxima: suggestReviewDate(days) }))}>
                    +{days} dias
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setRevisaoOpen(false); }}>Cancelar</Button>
              <Button onClick={handleRevisao}>Registrar Revisão</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ALTA / ENCERRAMENTO DIALOG */}
      <Dialog open={altaOpen} onOpenChange={v => { if (!v) setAltaOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-success" /> Alta / Encerramento do PTS
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Status Final *</Label>
              <Select value={altaForm.status_final} onValueChange={v => setAltaForm(p => ({ ...p, status_final: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="encerrado">Encerrado</SelectItem>
                  <SelectItem value="alta">Alta Terapêutica</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
                  <SelectItem value="transferido">Transferido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Motivo do Encerramento *</Label>
              <Select value={altaForm.motivo_encerramento}
                onValueChange={v => setAltaForm(p => ({ ...p, motivo_encerramento: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {MOTIVOS_ENCERRAMENTO.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Resumo do Desfecho Clínico</Label>
              <Textarea rows={3} value={altaForm.resumo_desfecho}
                onChange={e => setAltaForm(p => ({ ...p, resumo_desfecho: e.target.value }))}
                placeholder="Descreva os resultados alcançados e o estado do paciente ao encerrar..." />
            </div>
            <div>
              <Label>Orientações Finais</Label>
              <Textarea rows={2} value={altaForm.orientacoes_finais}
                onChange={e => setAltaForm(p => ({ ...p, orientacoes_finais: e.target.value }))}
                placeholder="Orientações para continuidade do cuidado..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <p className="text-sm font-medium">Critério de alta atingido</p>
                <Switch checked={altaForm.criterio_alta_atingido}
                  onCheckedChange={v => setAltaForm(p => ({ ...p, criterio_alta_atingido: v }))} />
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <p className="text-sm font-medium">Ciência da família</p>
                <Switch checked={altaForm.ciencia_familia}
                  onCheckedChange={v => setAltaForm(p => ({ ...p, ciencia_familia: v }))} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setAltaOpen(false)}>Cancelar</Button>
              <Button onClick={handleAlta} disabled={!altaForm.motivo_encerramento}
                className="bg-success text-success-foreground hover:bg-success/90">
                Confirmar Alta/Encerramento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

                {/* Revisão alert */}
      <Dialog open={!!detailPts && !revisaoOpen && !altaOpen}
        onOpenChange={v => { if (!v) { setDetailPts(null); setDetailSigtap([]); setDetailCids([]); setDetailMetas([]); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Detalhes do PTS</DialogTitle>
          </DialogHeader>
          {detailPts && (() => {
            const pac = pacientes.find(p => p.id === detailPts.patient_id);
            const prof = funcionarios.find(f => f.id === detailPts.professional_id);
            return (
              <div className="space-y-4 text-sm">
                {/* Header info */}
                <div className="grid grid-cols-2 gap-3 p-3 bg-muted/30 rounded-lg">
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-semibold block">Paciente</span>
                    <p className="font-semibold">{pac?.nome || detailPts.patient_id}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-semibold block">Profissional</span>
                    <p>{prof?.nome || '—'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-semibold block">Status</span>
                    <Badge variant="outline" className={cn("text-xs mt-0.5", statusBadgeColor(detailPts.status || 'ativo'))}>
                      {detailPts.status || 'Ativo'}
                    </Badge>
                  </div>
                  {detailPts.prioridade && (
                    <div>
                      <span className="text-xs text-muted-foreground uppercase font-semibold block">Prioridade</span>
                      <Badge variant="outline" className={cn("text-xs mt-0.5", prioridadeColor(detailPts.prioridade))}>
                        {detailPts.prioridade}
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Revisão alert */}
                {detailPts.data_proxima_revisao && (
                  <div className={cn(
                    "p-2 rounded-lg border text-xs flex items-center gap-2",
                    isOverdueReview(detailPts)
                      ? 'bg-warning/10 border-warning/30 text-warning'
                      : 'bg-muted/30 border-border text-muted-foreground'
                  )}>
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    Próxima revisão: {new Date(detailPts.data_proxima_revisao + 'T12:00:00').toLocaleDateString('pt-BR')}
                    {isOverdueReview(detailPts) && ' — VENCIDA'}
                  </div>
                )}

                {/* Contexts */}
                {detailPts.contextos_afetados && detailPts.contextos_afetados.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-semibold block mb-1">Contextos Afetados</span>
                    <div className="flex flex-wrap gap-1">
                      {detailPts.contextos_afetados.map(c => <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>)}
                    </div>
                  </div>
                )}

                {/* Especialidades */}
                {detailPts.especialidades_envolvidas.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-semibold block mb-1">Especialidades</span>
                    <div className="flex flex-wrap gap-1">
                      {detailPts.especialidades_envolvidas.map(s => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
                    </div>
                  </div>
                )}

                {/* Diagnóstico */}
                {detailPts.diagnostico_funcional && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-semibold">Diagnóstico Funcional</span>
                    <p className="mt-1 bg-muted/30 rounded p-2">{detailPts.diagnostico_funcional}</p>
                  </div>
                )}

                {/* Objetivos */}
                {detailPts.objetivos_terapeuticos && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-semibold">Objetivos Terapêuticos</span>
                    <p className="mt-1 bg-muted/30 rounded p-2">{detailPts.objetivos_terapeuticos}</p>
                  </div>
                )}

                {/* Metas estruturadas */}
                {detailMetas.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-semibold block mb-2">Metas ({detailMetas.length})</span>
                    <div className="space-y-1.5">
                      {detailMetas.map((m, i) => (
                        <div key={i} className="border rounded p-2 flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-xs">{m.titulo}</span>
                              <Badge variant="outline" className="text-[10px]">{m.categoria}</Badge>
                              <Badge variant="outline" className={cn("text-[10px]", statusMetaColor(m.status))}>{m.status}</Badge>
                            </div>
                            {m.indicador && <p className="text-[11px] text-muted-foreground">📊 {m.indicador}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* SIGTAP */}
                {detailSigtap.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-semibold block mb-1">Procedimentos SIGTAP</span>
                    <div className="flex flex-wrap gap-1">
                      {detailSigtap.map(s => (
                        <Badge key={s.procedimento_codigo} variant="secondary" className="text-xs font-mono">
                          {s.procedimento_codigo} — {s.procedimento_nome.slice(0, 30)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* CIDs */}
                {detailCids.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-semibold block mb-1">CIDs</span>
                    <div className="flex flex-wrap gap-1">
                      {detailCids.map(c => (
                        <Badge key={c.cid_codigo} variant="outline" className="text-xs font-mono" title={c.cid_descricao}>
                          {c.cid_codigo}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                {canEditPts(detailPts) && (
                  <div className="flex gap-2 pt-2 border-t flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => {
                      const pts = detailPts;
                      setDetailPts(null);
                      openEditDialog(pts);
                    }}>
                      <Edit2 className="w-3.5 h-3.5 mr-1" /> Editar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => {
                      setRevisaoForm({ obs: '', data_proxima: suggestReviewDate(30) });
                      setRevisaoOpen(true);
                    }}>
                      <RefreshCw className="w-3.5 h-3.5 mr-1" /> Registrar Revisão
                    </Button>
                    {(!detailPts.status || detailPts.status === 'ativo') && (
                      <Button variant="outline" size="sm"
                        className="border-success/50 text-success hover:bg-success/10"
                        onClick={() => {
                          setAltaForm({ motivo_encerramento: '', resumo_desfecho: '', orientacoes_finais: '', criterio_alta_atingido: false, ciencia_familia: false, status_final: 'encerrado' });
                          setAltaOpen(true);
                        }}>
                        <CheckSquare className="w-3.5 h-3.5 mr-1" /> Alta/Encerrar
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PTS;


