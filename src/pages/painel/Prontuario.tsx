import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue } from "react";
import { cn, todayLocalStr, nowTimeBrazilStr } from "@/lib/utils";
import { ModalAgendarSessao } from "@/components/ModalAgendarSessao";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Skeleton } from "@/components/ui/skeleton";
import FichaPacienteCabecalho from "@/components/FichaPacienteCabecalho";
import { useProntuarioStructure } from "@/hooks/useProntuarioStructure";
import { useProntuarioConfig } from "@/hooks/useProntuarioConfig";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useData } from "@/contexts/DataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DebouncedInput } from "@/components/ui/debounced-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DebouncedTextarea } from "@/components/ui/debounced-textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, FileText, Printer, Pencil, Search, CheckCircle, History, Trash2, Activity, ClipboardList, Heart, AlertTriangle, Clock, ChevronDown, Settings, X, Tag, Pencil as PencilIcon, Eye, MoreVertical, Download, Link2, Send, FlaskConical, ChevronRight, Calendar, User, MapPin, Target, CalendarClock, Eraser } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import HistoricoPacientePanel from "@/components/prontuario/HistoricoPacientePanel";
import HistoricoCentralList from "@/components/prontuario/HistoricoCentralList";
import { NovoProcedimentoModal } from "@/components/NovoProcedimentoModal";
import { procedureService } from "@/services/procedureService";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { useSearchParams, useNavigate } from "react-router-dom";
import AtendimentoTimer from "@/components/AtendimentoTimer";
import { openPrintDocument } from "@/lib/printLayout";
import { downloadProntuarioPdf } from "@/lib/prontuarioPdf";
import { Lock, FileDown } from "lucide-react";
import { HistoricoClinico } from "@/components/HistoricoClinico";
import { BuscaPaciente } from "@/components/BuscaPaciente";
import GerarDocumentoModal from "@/components/GerarDocumentoModal";
import DocumentosHistorico from "@/components/DocumentosHistorico";

import SolicitacaoExames from "@/components/SolicitacaoExames";
import PrescricaoMedicamentos from "@/components/PrescricaoMedicamentos";
import CamposEspecialidade from "@/components/CamposEspecialidade";
import HistoricoCompletoModal from "@/components/HistoricoCompletoModal";
import EncaminhamentoInternoModal from "@/components/EncaminhamentoInternoModal";
import SoapFieldsAdaptive from "@/components/SoapFieldsAdaptive";
import DynamicProntuarioFields from "@/components/prontuario/DynamicProntuarioFields";
import { isMedico, hasDropdownSoap } from "@/data/soapOptionsByProfession";
import { useSoapCustomOptions } from "@/hooks/useSoapCustomOptions";
import { Stamp } from "lucide-react";
import { getSoapValidationError, normalizeSoapPayload, treatmentService } from "@/services/treatmentService";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

const PTS_SPECIALTIES = [
  'Fisioterapia', 'Fonoaudiologia', 'Psicologia', 'Terapia Ocupacional',
  'Neuropsicologia', 'Psicopedagogia', 'Nutrição', 'Serviço Social', 'Enfermagem',
];

import { FREQUENCY_OPTIONS_NEW, WEEKDAY_LABELS, getMaxWeekdays, isWeekdayFrequency, calculateTotalSessions, generateSessionDates, generateSessionDatesWithInfo, calcEndDateFromSessions, buildBlockedRanges } from '@/lib/treatmentSessionGenerator';

interface ProntuarioDB {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  unidade_id: string;
  sala_id: string;
  setor: string;
  agendamento_id: string;
  data_atendimento: string;
  hora_atendimento: string;
  queixa_principal: string;
  anamnese: string;
  sinais_sintomas: string;
  exame_fisico: string;
  hipotese: string;
  conduta: string;
  prescricao: string;
  solicitacao_exames: string;
  evolucao: string;
  observacoes: string;
  indicacao_retorno: string;
  motivo_alteracao: string;
  procedimentos_texto: string;
  outro_procedimento: string;
  episodio_id: string | null;
  pts_meta_id?: string | null;
  custom_data?: any;
  criado_em: string;
  atualizado_em: string;
}

interface ProcedimentoDB {
  uuid: string;
  id: string;
  nome: string;
  profissao: string;
  especialidade: string;
  profissionais_ids: string[] | null;
  ativo: boolean;
  origem?: 'SIGTAP' | 'PERSONALIZADO';
}

const TIPOS_REGISTRO = [
  { value: 'avaliacao_inicial', label: '🟢 Avaliação Inicial' },
  { value: 'retorno', label: '🔵 Retorno' },
  { value: 'sessao', label: '🟡 Sessão' },
  { value: 'urgencia', label: '🔴 Urgência' },
  { value: 'procedimento', label: '🟣 Procedimento' },
  { value: 'consulta', label: 'Consulta (legado)' },
  { value: 'reavaliacao', label: 'Reavaliação (legado)' },
  { value: 'avaliacao_enfermagem', label: 'Avaliação de Enfermagem (legado)' },
  { value: 'pts', label: 'PTS (legado)' },
  { value: 'triagem_inicial', label: 'Triagem Inicial (legado)' },
];

const emptyForm = {
  paciente_id: "",
  paciente_nome: "",
  profissional_id: "",
  profissional_nome: "",
  agendamento_id: "",
  data_atendimento: todayLocalStr(),
  hora_atendimento: "",
  tipo_registro: "consulta",
  queixa_principal: "",
  anamnese: "",
  sinais_sintomas: "",
  exame_fisico: "",
  hipotese: "",
  conduta: "",
  prescricao: "",
  solicitacao_exames: "",
  evolucao: "",
  observacoes: "",
  resultado_exame: "",
  indicacao_retorno: "",
  motivo_alteracao: "",
  procedimentos_texto: "",
  outro_procedimento: "",
  episodio_id: "",
  pts_meta_id: "",
  soap_subjetivo: "",
  soap_objetivo: "",
  soap_avaliacao: "",
  soap_plano: "",
  custom_data: {} as any,
};

const classificarIMC = (imc: number): string => {
  if (imc < 18.5) return "Abaixo do peso";
  if (imc < 25) return "Normal";
  if (imc < 30) return "Sobrepeso";
  if (imc < 35) return "Obesidade grau I";
  if (imc < 40) return "Obesidade grau II";
  return "Obesidade grau III";
};

interface TriagemData {
  peso?: number;
  altura?: number;
  imc?: number;
  pressao_arterial?: string;
  temperatura?: number;
  frequencia_cardiaca?: number;
  saturacao_oxigenio?: number;
  glicemia?: number;
  alergias?: string[];
  medicamentos?: string[];
  queixa?: string;
  confirmado_em?: string;
  tecnico_nome?: string;
  tecnico_coren?: string;
  custom_data?: any;
}

const retornoOptions = [
  { value: "no_indication", label: "Sem indicação" },
  { value: "sem_retorno", label: "Sem retorno" },
  { value: "7_dias", label: "Retorno em 7 dias" },
  { value: "15_dias", label: "Retorno em 15 dias" },
  { value: "30_dias", label: "Retorno em 30 dias" },
  { value: "60_dias", label: "Retorno em 60 dias" },
  { value: "90_dias", label: "Retorno em 90 dias" },
  { value: "outro", label: "Outro prazo" },
];

const getObservacoesTexto = (value?: any): string => {
  if (!value) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object") {
          if ("texto" in parsed) return parsed.texto || "";
          if ("medicamentos" in parsed && Array.isArray(parsed.medicamentos)) {
            return parsed.medicamentos.map((m: any) => `• ${m.nome || ""} ${m.dosagem || ""}`).join("\n");
          }
          if ("exames" in parsed && Array.isArray(parsed.exames)) {
            return parsed.exames.map((e: any) => `• ${e.nome || ""}`).join("\n");
          }
        }
      } catch {}
    }
    return trimmed;
  }
  if (typeof value === "object") {
    if ("texto" in value) return value.texto || "";
    return JSON.stringify(value);
  }
  return String(value);
};

const getDynamicFieldsPayload = (data: Record<string, any>) => Object.keys(data).reduce((acc: Record<string, any>, key) => {
  if (!(key in emptyForm) && data[key] !== undefined && data[key] !== null) acc[key] = data[key];
  return acc;
}, {});

const buildCustomDataPayload = (dynamicFields: Record<string, any>, specialtyFields: Record<string, string>) => ({
  ...dynamicFields,
  ...Object.fromEntries(Object.entries(specialtyFields || {}).map(([key, value]) => [`esp_${key}`, value])),
});

const sessionStatusLabels: Record<string, string> = {
  pendente_agendamento: "Ag. Agendamento",
  agendada: "Agendada",
  realizada: "Realizada",
  paciente_faltou: "Faltou",
  cancelada: "Cancelada",
  remarcada: "Remarcada",
};

type TreatmentContext = {
  patientId: string;
  prontuarioId?: string | null;
  professionalId?: string | null;
  professionalName?: string | null;
  specialty?: string | null;
  date?: string | null;
  explicitCycleId?: string | null;
  explicitPtsId?: string | null;
  explicitPtsMetaId?: string | null;
};

const normalizeContextText = (value?: string | null) =>
  (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

const getCustomDataObject = (source: any) =>
  source?.custom_data && typeof source.custom_data === "object" ? source.custom_data : {};

const getTreatmentSpecialtyFromSource = (source: any, professional?: any, userProfissao?: string) => {
  const cd = getCustomDataObject(source);
  return (
    cd.especialidade || cd.specialty || cd.profissao ||
    source?.especialidade || source?.specialty || source?.profissao ||
    professional?.profissao || professional?.cargo || userProfissao || ""
  );
};

const isDateInsideCycle = (cycle: any, date?: string | null) => {
  if (!date) return true;
  if (cycle?.start_date && date < cycle.start_date) return false;
  const end = cycle?.end_date_predicted || cycle?.end_date || cycle?.data_fim;
  if (end && date > end) return false;
  return true;
};

const isSpecialtyCompatible = (left?: string | null, right?: string | null) => {
  const a = normalizeContextText(left);
  const b = normalizeContextText(right);
  if (!a || !b) return true;
  return a === b || a.includes(b) || b.includes(a);
};

const isPtsSpecialtyCompatible = (pts: any, specialty?: string | null) => {
  const normalizedSpecialty = normalizeContextText(specialty);
  const involved = Array.isArray(pts?.especialidades_envolvidas) ? pts.especialidades_envolvidas : [];
  if (!normalizedSpecialty || involved.length === 0) return true;
  return involved.some((item: string) => isSpecialtyCompatible(item, specialty));
};

const ProntuarioPage: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const { pacientes, unidades, agendamentos, updateAgendamento, logAction, refreshAgendamentos, funcionarios, addAgendamento, getAvailableSlots, getAvailableDates, salas, bloqueios } = useData();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [previousForm, setPreviousForm] = useState<typeof emptyForm | null>(null);
  // Autosave state
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [autosaveAt, setAutosaveAt] = useState<Date | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutosaveHashRef = useRef<string>('');
  const editIdRef = useRef<string | null>(null);
  const formRef = useRef(emptyForm);
  const autosaveInFlightRef = useRef(false);
  const savingRef = useRef(false);
  const finalizingRef = useRef(false);
  const registeringSessionRef = useRef(false);
  useEffect(() => { editIdRef.current = editId; }, [editId]);
  useEffect(() => { formRef.current = form; }, [form]);


  const [search, setSearch] = useState("");
  const [activeAtendimento, setActiveAtendimento] = useState<{ agendamentoId: string; horaInicio: string } | null>(
    null,
  );

  // Computed: can we finalize this appointment? Based on agendamento status, not just activeAtendimento
  const canFinalize = useMemo(() => {
    if (activeAtendimento) return true;
    if (!form.agendamento_id) return false;
    const ag = agendamentos.find((a: any) => a.id === form.agendamento_id);
    return ag && ag.status === 'em_atendimento';
  }, [activeAtendimento, form.agendamento_id, agendamentos]);
  const [triagem, setTriagem] = useState<TriagemData | null>(null);
  const [showHistorico, setShowHistorico] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // PTS inline creation
  const [ptsOpen, setPtsOpen] = useState(false);
  const [ptsSaving, setPtsSaving] = useState(false);
  const [ptsForm, setPtsForm] = useState({
    diagnostico_funcional: '', objetivos_terapeuticos: '',
    metas_curto_prazo: '', metas_medio_prazo: '', metas_longo_prazo: '',
    especialidades: [] as string[],
  });

  // Treatment cycle inline creation
  const [cycleOpen, setCycleOpen] = useState(false);
  const [cycleSaving, setCycleSaving] = useState(false);
  const [cycleForm, setCycleForm] = useState({
    treatment_type: '', total_sessions: 0, frequency: '1x_semana',
    start_date: todayLocalStr(), clinical_notes: '',
    weekdays: [] as number[], duration_months: 3,
  });

  const [procedimentos, setProcedimentos] = useState<ProcedimentoDB[]>([]);
  const [sigtapDisponibilizarTodos, setSigtapDisponibilizarTodos] = useState<boolean>(false);
  const [selectedProcIds, setSelectedProcIds] = useState<string[]>([]);
  const [procDetails, setProcDetails] = useState<Record<string, { quantidade: number; observacao: string }>>({});
  const [episodios, setEpisodios] = useState<{ id: string; titulo: string; status: string }[]>([]);
  const [cidsByProc, setCidsByProc] = useState<Record<string, { codigo: string; descricao: string }[]>>({});
  const [selectedCidsByProc, setSelectedCidsByProc] = useState<Record<string, string[]>>({});
  const [pacienteProcHistory, setPacienteProcHistory] = useState<{ id: string; nome: string; ultima: string; isGlobal?: boolean }[]>([]);
  const [novoProcOpen, setNovoProcOpen] = useState(false);
  const [expandedProcId, setExpandedProcId] = useState<string | null>(null);
  const [procSearch, setProcSearch] = useState("");
  const [cidSearchByProc, setCidSearchByProc] = useState<Record<string, string>>({});
  const [cidSearchResults, setCidSearchResults] = useState<Record<string, { codigo: string; descricao: string }[]>>({});
  const [cidSearchLoading, setCidSearchLoading] = useState<Record<string, boolean>>({});

  const loadCidsForProc = useCallback((procId: string) => {
    if (cidsByProc[procId]) return;
    procedureService.getCidsForProcedure(procId).then((list) => {
      setCidsByProc((m) => ({ ...m, [procId]: list }));
      // Preserve any pre-existing user/loaded selection; do NOT auto-select all suggested CIDs.
      setSelectedCidsByProc((m) => ({ ...m, [procId]: m[procId] ?? [] }));
    });
  }, [cidsByProc]);

  const toggleExpandProc = useCallback((procId: string) => {
    setExpandedProcId((prev) => {
      const next = prev === procId ? null : procId;
      if (next) loadCidsForProc(next);
      return next;
    });
  }, [loadCidsForProc]);

  // ===== Unified Search (SIGTAP + CID-10) =====
  const [unifiedQuery, setUnifiedQuery] = useState("");
  const [unifiedResults, setUnifiedResults] = useState<{
    procedimentos: {
      codigo: string;
      nome: string;
      especialidade: string | null;
      matched_by?: 'codigo' | 'nome' | 'cid';
      cid_codigo?: string | null;
      cid_descricao?: string | null;
    }[];
    cids: { codigo: string; descricao: string }[];
  }>({ procedimentos: [], cids: [] });
  const [unifiedLoading, setUnifiedLoading] = useState(false);
  const [unifiedOpen, setUnifiedOpen] = useState(false);
  const unifiedDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (unifiedDebounceRef.current) window.clearTimeout(unifiedDebounceRef.current);
    const q = unifiedQuery.trim();
    if (q.length < 2) {
      setUnifiedResults({ procedimentos: [], cids: [] });
      setUnifiedLoading(false);
      return;
    }
    setUnifiedLoading(true);
    unifiedDebounceRef.current = window.setTimeout(async () => {
      const res = await procedureService.searchUnified(q, 50);
      setUnifiedResults(res);
      setUnifiedLoading(false);
    }, 300);
    return () => { if (unifiedDebounceRef.current) window.clearTimeout(unifiedDebounceRef.current); };
  }, [unifiedQuery]);

  const handlePickProcedimento = useCallback((codigo: string, nome: string) => {
    setSelectedProcIds((prev) => prev.includes(codigo) ? prev : [...prev, codigo]);
    setProcDetails((prev) => ({ ...prev, [codigo]: prev[codigo] || { quantidade: 1, observacao: "" } }));
    loadCidsForProc(codigo);
    setExpandedProcId(codigo);
    setUnifiedQuery("");
    setUnifiedOpen(false);
    toast.success(`Procedimento adicionado: ${codigo} — ${nome}`);
  }, [loadCidsForProc]);

  const handlePickCid = useCallback(async (cid: { codigo: string; descricao: string }) => {
    // 1) If there is an expanded/selected procedure, attach there
    const targetProc = expandedProcId && selectedProcIds.includes(expandedProcId)
      ? expandedProcId
      : selectedProcIds[selectedProcIds.length - 1] || null;

    if (targetProc) {
      setCidsByProc((m) => {
        const cur = m[targetProc] || [];
        return cur.some((x) => x.codigo === cid.codigo) ? m : { ...m, [targetProc]: [...cur, cid] };
      });
      setSelectedCidsByProc((m) => ({
        ...m,
        [targetProc]: Array.from(new Set([...(m[targetProc] || []), cid.codigo])),
      }));
      setUnifiedQuery("");
      setUnifiedOpen(false);
      toast.success(`CID ${cid.codigo} vinculado ao procedimento selecionado.`);
      return;
    }

    // 2) Otherwise look up procedures linked to this CID
    const linked = await procedureService.getProceduresForCid(cid.codigo, 5);
    if (linked.length === 0) {
      toast.error("Selecione um procedimento antes de adicionar o CID (não há procedimento vinculado a este CID).");
      return;
    }
    const first = linked[0];
    handlePickProcedimento(first.codigo, first.nome);
    // Attach the CID to it
    setCidsByProc((m) => {
      const cur = m[first.codigo] || [];
      return cur.some((x) => x.codigo === cid.codigo) ? m : { ...m, [first.codigo]: [...cur, cid] };
    });
    setSelectedCidsByProc((m) => ({
      ...m,
      [first.codigo]: Array.from(new Set([...(m[first.codigo] || []), cid.codigo])),
    }));
    toast.success(`Procedimento ${first.codigo} sugerido pelo CID ${cid.codigo} foi adicionado.`);
  }, [expandedProcId, selectedProcIds, handlePickProcedimento]);


  const isProfissional = user?.role === "profissional";
  const canEdit = can('prontuario', 'can_edit');
  const canDelete = can('prontuario', 'can_delete');
  const tempoLimite = user?.tempoAtendimento || 30;
  const { enabledFields: structureFields } = useProntuarioStructure(form.tipo_registro);
  // Custom fields storage (for fields not in DB columns)
  const [customFields, setCustomFields] = useState<Record<string, string>>({});




  const soapCustom = useSoapCustomOptions(user?.id);

  const [docModalOpen, setDocModalOpen] = useState(false);
  const [encInternoOpen, setEncInternoOpen] = useState(false);
  const [historicoCompletoOpen, setHistoricoCompletoOpen] = useState(false);
  const [viewerProntuario, setViewerProntuario] = useState<any | null>(null);
  const [historicoPacienteId, setHistoricoPacienteId] = useState<{ id: string; nome: string } | null>(null);
  const [listaExames, setListaExames] = useState<{ id: string; nome: string; codigo_sus: string; indicacao: string }[]>([]);
  const [listaPrescricao, setListaPrescricao] = useState<{ id: string; nome: string; dosagem: string; via: string; posologia: string; duracao: string }[]>([]);
  const [especialidadeFields, setEspecialidadeFields] = useState<Record<string, string>>({});

  const especialidadeFieldsRef = useRef(especialidadeFields);
  const listaExamesRef = useRef(listaExames);
  const listaPrescricaoRef = useRef(listaPrescricao);
  const selectedProcIdsRef = useRef(selectedProcIds);
  const procDetailsRef = useRef(procDetails);
  const selectedCidsByProcRef = useRef(selectedCidsByProc);

  useEffect(() => { especialidadeFieldsRef.current = especialidadeFields; }, [especialidadeFields]);
  useEffect(() => { listaExamesRef.current = listaExames; }, [listaExames]);
  useEffect(() => { listaPrescricaoRef.current = listaPrescricao; }, [listaPrescricao]);
  useEffect(() => { selectedProcIdsRef.current = selectedProcIds; }, [selectedProcIds]);
  useEffect(() => { procDetailsRef.current = procDetails; }, [procDetails]);
  useEffect(() => { selectedCidsByProcRef.current = selectedCidsByProc; }, [selectedCidsByProc]);


  // Sessão: cycle + PTS state
  interface CycleSession { id: string; cycle_id: string; patient_id: string; professional_id: string; session_number: number; total_sessions: number; scheduled_date: string; status: string; clinical_notes: string; procedure_done?: string; absence_type?: string | null; appointment_id: string | null; }
  interface ActiveCycle { id: string; patient_id: string; treatment_type: string; professional_id: string; start_date: string; end_date_predicted: string | null; frequency: string; status: string; total_sessions: number; sessions_done: number; created_at: string; unit_id: string; specialty?: string; pts_id?: string | null; }
  interface ActivePTS { id: string; patient_id: string; unit_id: string; diagnostico_funcional: string; objetivos_terapeuticos: string; metas_curto_prazo: string; metas_medio_prazo: string; metas_longo_prazo: string; especialidades_envolvidas: string[]; created_at: string; professional_id: string; status: string; updated_at?: string; }
  const [sessaoCycle, setSessaoCycle] = useState<ActiveCycle | null>(null);

  const formProfessional = useMemo(
    () => funcionarios.find((f) => f.id === form.profissional_id),
    [funcionarios, form.profissional_id],
  );

  const effectiveProfissao = useMemo(() => {
    if (form.tipo_registro === 'sessao' && sessaoCycle?.specialty) {
      return sessaoCycle.specialty;
    }
    return getTreatmentSpecialtyFromSource(form, formProfessional, !editId ? user?.profissao : '') || user?.profissao;
  }, [editId, form, formProfessional, form.tipo_registro, sessaoCycle?.specialty, user?.profissao]);

  const { isBlocoVisible: isProfBlocoVisible, isBlocoRequired, config: profConfig, visibleBlocks } = useProntuarioConfig(user?.id, form.tipo_registro, effectiveProfissao);

  const showSoapDropdown = hasDropdownSoap(effectiveProfissao);
  const [sessaoCycleSessions, setSessaoCycleSessions] = useState<CycleSession[]>([]);
  const [sessaoPts, setSessaoPts] = useState<ActivePTS | null>(null);
  const [sessaoPtsSigtap, setSessaoPtsSigtap] = useState<{ procedimento_codigo: string; procedimento_nome: string; especialidade: string }[]>([]);
  const [sessaoPtsCids, setSessaoPtsCids] = useState<{ cid_codigo: string; cid_descricao: string }[]>([]);
  const [sessaoDataLoading, setSessaoDataLoading] = useState(false);
  const [sessaoHighlightSOAP, setSessaoHighlightSOAP] = useState(false);
  const [soapErrors, setSoapErrors] = useState(false);
  const [soapEnabled, setSoapEnabled] = useState(true);
  const [sessionRegistrationRequested, setSessionRegistrationRequested] = useState(false);
  const [confirmingSessionId, setConfirmingSessionId] = useState<string | null>(null);
  const soapRef = useRef<HTMLDivElement>(null);

  // Modal Agendar/Remarcar states
  const [agendarSessaoTarget, setAgendarSessaoTarget] = useState<CycleSession | null>(null);
  const [remarcarTarget, setRemarcarTarget] = useState<CycleSession | null>(null);
  const [agendarSessaoData, setAgendarSessaoData] = useState("");
  const [agendarSessaoHora, setAgendarSessaoHora] = useState("");
  const [agendarSessaoSalaId, setAgendarSessaoSalaId] = useState("");
  const [agendandoSessao, setAgendandoSessao] = useState(false);
  const [remarcarSaving, setRemarcarSaving] = useState(false);
  const [selectSessionOpen, setSelectSessionOpen] = useState(false);

  const buildTreatmentContext = useCallback((source: any = form): TreatmentContext => {
    const cd = getCustomDataObject(source);
    const professionalId = source?.profissional_id || (!editId ? user?.id : "") || "";
    const professional = funcionarios.find((f) => f.id === professionalId);
    return {
      patientId: source?.paciente_id || "",
      prontuarioId: editId,
      professionalId,
      professionalName: source?.profissional_nome || professional?.nome || "",
      specialty: getTreatmentSpecialtyFromSource(source, professional, !editId ? user?.profissao : ""),
      date: source?.data_atendimento || todayLocalStr(),
      explicitCycleId: cd.treatment_cycle_id || cd.cycle_id || cd.treatmentCycleId || null,
      explicitPtsId: cd.pts_id || cd.ptsId || source?.pts_meta_id || cd.pts_meta_id || null,
      explicitPtsMetaId: source?.pts_meta_id || cd.pts_meta_id || null,
    };
  }, [editId, form, funcionarios, user?.id, user?.profissao]);

  const loadSessaoData = async (contextInput: string | TreatmentContext, _professionalId?: string) => {
    setSessaoDataLoading(true);
    try {
      const context = typeof contextInput === 'string'
        ? buildTreatmentContext({ ...formRef.current, paciente_id: contextInput, profissional_id: _professionalId || formRef.current.profissional_id })
        : contextInput;
      const patientId = context.patientId;
      const professionalId = context.professionalId || "";
      const specialty = context.specialty || "";

      let cycle: ActiveCycle | null = null;
      if (context.explicitCycleId) {
        const { data } = await (supabase as any).from('treatment_cycles').select('*')
          .eq('id', context.explicitCycleId)
          .eq('patient_id', patientId)
          .maybeSingle();
        cycle = data as ActiveCycle | null;
      } else if (patientId && professionalId) {
        const { data } = await (supabase as any).from('treatment_cycles').select('*')
          .eq('patient_id', patientId)
          .eq('professional_id', professionalId)
          .in('status', ['em_andamento', 'ativo'])
          .order('created_at', { ascending: false });
        cycle = ((data || []) as ActiveCycle[]).find((candidate) =>
          isSpecialtyCompatible(candidate.specialty || candidate.treatment_type, specialty) &&
          isDateInsideCycle(candidate, context.date)
        ) || null;
      }
      setSessaoCycle(cycle || null);

      let pts: ActivePTS | null = null;
      if (context.explicitPtsId || context.explicitPtsMetaId || cycle?.pts_id) {
        const ptsId = context.explicitPtsId || context.explicitPtsMetaId || cycle?.pts_id;
        const { data } = await supabase.from('pts').select('*')
          .eq('id', ptsId)
          .eq('patient_id', patientId)
          .maybeSingle();
        pts = data as ActivePTS | null;
      } else if (patientId && professionalId) {
        const { data } = await supabase.from('pts').select('*')
          .eq('patient_id', patientId)
          .eq('professional_id', professionalId)
          .eq('status', 'ativo')
          .order('created_at', { ascending: false });
        pts = ((data || []) as ActivePTS[]).find((candidate) => isPtsSpecialtyCompatible(candidate, specialty)) || null;
      }
      setSessaoPts(pts);

      if (pts) {
        const [sigtapRes, cidRes] = await Promise.all([
          (supabase as any).from('pts_sigtap').select('procedimento_codigo, procedimento_nome, especialidade').eq('pts_id', pts.id),
          (supabase as any).from('pts_cid').select('cid_codigo, cid_descricao').eq('pts_id', pts.id),
        ]);
        setSessaoPtsSigtap(sigtapRes.data || []);
        setSessaoPtsCids(cidRes.data || []);
      } else {
        setSessaoPtsSigtap([]);
        setSessaoPtsCids([]);
      }

      if (cycle) {
        const { data: sessions } = await (supabase as any).from('treatment_sessions').select('*')
          .eq('cycle_id', cycle.id)
          .order('session_number', { ascending: true });
        setSessaoCycleSessions(sessions || []);
      } else {
        setSessaoCycleSessions([]);
      }
    } catch (err) {
      console.error('[loadSessaoData]', err);
    }
    setSessaoDataLoading(false);
  };

  const registrationReferenceDate =
    form.data_atendimento || searchParams.get('data') || todayLocalStr();
  const registrationReferenceDateLabel = registrationReferenceDate
    ? new Date(`${registrationReferenceDate}T12:00:00`).toLocaleDateString('pt-BR')
    : 'a data do prontuário';

  const availableSessionsForRegistration = useMemo(() => {
    if (!sessaoCycle || sessaoCycleSessions.length === 0) return [];

    return sessaoCycleSessions.filter(
      (session) => !['realizada', 'paciente_faltou', 'cancelada', 'remarcada'].includes(session.status),
    );
  }, [sessaoCycle, sessaoCycleSessions]);

  // Session matching the current prontuário date (for inline registration)
  const currentSessionForRegistration = useMemo(() => {
    if (!sessaoCycle || availableSessionsForRegistration.length === 0 || !registrationReferenceDate) return null;

    if (form.agendamento_id) {
      const exactAppointmentMatch = availableSessionsForRegistration.find(
        (session) =>
          session.appointment_id === form.agendamento_id &&
          session.scheduled_date === registrationReferenceDate,
      );

      if (exactAppointmentMatch) {
        return exactAppointmentMatch;
      }
    }

    return (
      availableSessionsForRegistration.find(
        (session) => session.scheduled_date === registrationReferenceDate,
      ) || null
    );
  }, [availableSessionsForRegistration, form.agendamento_id, registrationReferenceDate, sessaoCycle]);

  const isSessionRegistrationFlow = useMemo(() => {
    if (!sessaoCycle || !currentSessionForRegistration) return false;
    return sessionRegistrationRequested || form.tipo_registro === 'sessao';
  }, [currentSessionForRegistration, form.tipo_registro, sessaoCycle, sessionRegistrationRequested]);

  const sessionRegistrationError = useMemo(() => {
    if (!(sessionRegistrationRequested || form.tipo_registro === 'sessao')) return null;
    if (!sessaoCycle) return null; // No cycle is OK — user can create one
    if (!registrationReferenceDate) return 'Defina a data do prontuário para registrar a sessão.';
    // Don't block if no current session — user can still confirm past sessions from the table
    return null;
  }, [
    form.tipo_registro,
    registrationReferenceDate,
    sessaoCycle,
    sessionRegistrationRequested,
  ]);

  const handleRegistrarSessaoClick = () => {
    setSelectSessionOpen(true);
  };

  const handleSelectSessionToRegister = (session: CycleSession) => {
    if (sessionRegistrationError) {
      toast.error(sessionRegistrationError);
      return;
    }

    if (!session) {
      toast.error(`Sessão não selecionada.`);
      return;
    }

    setSelectSessionOpen(false);

    const shouldSubmitSession = sessionRegistrationRequested || form.tipo_registro === 'sessao';

    setSessionRegistrationRequested(true);
    setSoapErrors(false);
    
    const nextForm = {
      ...form,
      tipo_registro: 'sessao' as const,
      data_atendimento: session.scheduled_date || form.data_atendimento || registrationReferenceDate,
      agendamento_id: form.agendamento_id || session.appointment_id || '',
    };
    
    setForm(nextForm);

    if (shouldSubmitSession) {
      const effectiveError = null;
      if (effectiveError) {
        setSoapErrors(true);
        setSessaoHighlightSOAP(true);
        setTimeout(() => {
          soapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
        setTimeout(() => setSessaoHighlightSOAP(false), 4000);
        toast.error(effectiveError);
        return;
      }

      void handleSave(nextForm);
      return;
    }


    setSessaoHighlightSOAP(true);
    setTimeout(() => {
      soapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    setTimeout(() => setSessaoHighlightSOAP(false), 4000);
  };

  const sessionSoapPayload = useMemo(
    () =>
      normalizeSoapPayload({
        subjetivo: form.soap_subjetivo,
        objetivo: form.soap_objetivo,
        avaliacao: form.soap_avaliacao,
        plano: form.soap_plano,
      }),
    [form.soap_avaliacao, form.soap_objetivo, form.soap_plano, form.soap_subjetivo],
  );

  const sessionSoapValidationError = useMemo(
    () => getSoapValidationError(sessionSoapPayload, { required: false }),
    [sessionSoapPayload, soapEnabled, effectiveProfissao],
  );

  const canConfirmSessionRegistration = useMemo(
    () => Boolean(currentSessionForRegistration && sessaoCycle && !sessionRegistrationError && (!soapEnabled || !sessionSoapValidationError)),
    [currentSessionForRegistration, sessaoCycle, sessionRegistrationError, sessionSoapValidationError, soapEnabled],
  );

  // Medications & exam types state
  interface MedicationDB {
    id: string; nome: string; principio_ativo: string; classe_terapeutica: string;
    apresentacao: string; dosagem_padrao: string; via_padrao: string; is_global: boolean;
    profissional_id: string | null; ativo: boolean;
  }
  const [medications, setMedications] = useState<MedicationDB[]>([]);
  const [profPreferences, setProfPreferences] = useState<{ tipo: string; item_id: string; desabilitado: boolean }[]>([]);

  // Derived: active medications (filtered by preferences)
  const activeMedications = useMemo(() => {
    const disabledMedIds = new Set(
      profPreferences.filter(p => p.tipo === 'medication' && p.desabilitado).map(p => p.item_id)
    );
    return medications.filter(m => m.ativo && !disabledMedIds.has(m.id));
  }, [medications, profPreferences]);

  useEffect(() => {
    if (!user?.id) return;
    const profId = user.id;
    const loadAll = async () => {
      const { procedureService } = await import("@/services/procedureService");
      const [procsList, medsRes, prefsRes, sigCfg] = await Promise.all([
        procedureService.getActive(),
        (supabase as any).from("medications").select("*").or(`is_global.eq.true,profissional_id.eq.${profId}`),
        supabase.from("professional_preferences").select("tipo,item_id,desabilitado").eq("profissional_id", profId),
        procedureService.getSigtapConfig(user?.unidadeId || null),
      ]);
      setProcedimentos(procsList as any as ProcedimentoDB[]);
      if (medsRes.data) setMedications(medsRes.data as MedicationDB[]);
      if (prefsRes.data) setProfPreferences(prefsRes.data as any[]);
      setSigtapDisponibilizarTodos(!!sigCfg?.disponibilizarTodos);
    };
    loadAll();
  }, [user?.id, user?.unidadeId]);

  // Realtime: react to changes in system_config so the SIGTAP config flips immediately
  useEffect(() => {
    const channel = supabase
      .channel('prontuario-sigtap-config')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_config' }, async () => {
        const { procedureService } = await import('@/services/procedureService');
        const cfg = await procedureService.getSigtapConfig(user?.unidadeId || null);
        setSigtapDisponibilizarTodos(!!cfg?.disponibilizarTodos);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.unidadeId]);

  const filteredProcedimentos = useMemo(() => {
    if (!user) return [];
    const q = procSearch.trim().toLowerCase();
    
    // Agora a base SIGTAP importada é completa e disponível para todos por padrão.
    // O filtro por profissão/especialidade só é aplicado se a flag de disponibilização estiver desativada.
    const semFiltroProfissao = sigtapDisponibilizarTodos;

    return procedimentos.filter((p) => {
      // Filtro de segurança/associação específica por profissional continua valendo
      if (p.profissionais_ids && p.profissionais_ids.length > 0) {
        if (!p.profissionais_ids.includes(user.id)) return false;
      }

      // Filtro por profissão só se a config global 'disponibilizarTodos' for false
      if (!semFiltroProfissao) {
        if (user.profissao && p.profissao && p.profissao.toLowerCase() !== user.profissao.toLowerCase()) return false;
      }

      if (q) {
        const hay = `${p.nome} ${p.id} ${p.especialidade}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [procedimentos, user, procSearch, sigtapDisponibilizarTodos]);

  const selectedProcIdSet = useMemo(() => new Set(selectedProcIds), [selectedProcIds]);
  const listedProcedimentos = useMemo(() => {
    const available = filteredProcedimentos.filter((p) => !selectedProcIdSet.has(p.id));
    // Sem busca: corta para evitar render pesado (todos seguem acessíveis via busca unificada acima).
    // Com busca: NÃO cortar — todos os resultados compatíveis devem aparecer.
    return procSearch.trim() ? available : available.slice(0, 200);
  }, [filteredProcedimentos, selectedProcIdSet, procSearch]);

  // Lighter projection for listing (avoid heavy text columns until detail)
  const LIST_COLS = "id,paciente_id,paciente_nome,profissional_id,profissional_nome,unidade_id,sala_id,setor,agendamento_id,data_atendimento,hora_atendimento,queixa_principal,indicacao_retorno,procedimentos_texto,tipo_registro,criado_em,atualizado_em";

  const prontuariosQueryKey = useMemo(
    () => ['prontuarios', 'lista', user?.usuario === 'admin.sms' ? 'all' : (user?.unidadeId || 'none')] as const,
    [user?.usuario, user?.unidadeId],
  );

  // Two-phase fetch: paint first 100 instantly via setQueryData, then page the rest in background.
  const fetchProntuariosLeve = useCallback(async (): Promise<ProntuarioDB[]> => {
    const restrictUnit = user?.unidadeId && user?.usuario !== 'admin.sms';

    // Phase 1 — first 100 most recent
    let firstQuery = (supabase as any)
      .from("prontuarios")
      .select(LIST_COLS)
      .order("data_atendimento", { ascending: false })
      .order("criado_em", { ascending: false })
      .range(0, 99);
    if (restrictUnit) firstQuery = firstQuery.eq("unidade_id", user!.unidadeId);
    const { data: first, error: firstErr } = await firstQuery;
    if (firstErr) {
      console.error("Error loading prontuarios:", firstErr);
      return [];
    }

    const firstPage: any[] = (first as any) || [];
    // Paint immediately while remaining pages stream in
    queryClient.setQueryData(prontuariosQueryKey, firstPage);

    // Phase 2 — paginate remaining silently
    const PAGE_SIZE = 1000;
    let fromIdx = 100;
    const collected: any[] = [...firstPage];
    while (true) {
      let q = (supabase as any)
        .from("prontuarios")
        .select(LIST_COLS)
        .order("data_atendimento", { ascending: false })
        .order("criado_em", { ascending: false })
        .range(fromIdx, fromIdx + PAGE_SIZE - 1);
      if (restrictUnit) q = q.eq("unidade_id", user!.unidadeId);
      const { data, error } = await q;
      if (error) { console.error("Background load error:", error); break; }
      if (!data || data.length === 0) break;
      collected.push(...data);
      queryClient.setQueryData(prontuariosQueryKey, [...collected]);
      if (data.length < PAGE_SIZE) break;
      fromIdx += PAGE_SIZE;
    }
    if (import.meta.env.DEV) console.debug("[Prontuarios] total carregado:", collected.length);
    return collected;
  }, [user?.id, user?.usuario, user?.unidadeId, prontuariosQueryKey, queryClient]);

  const { data: prontuarios = [], isLoading: prontuariosLoading, refetch: refetchProntuarios } = useQuery<ProntuarioDB[]>({
    queryKey: prontuariosQueryKey,
    queryFn: fetchProntuariosLeve,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Backwards-compat alias for legacy call sites that triggered a reload.
  const loadProntuarios = useCallback(() => {
    refetchProntuarios();
  }, [refetchProntuarios]);

  // Reflect query loading state into the existing `loading` flag (used by skeletons).
  useEffect(() => {
    setLoading(prontuariosLoading && prontuarios.length === 0);
  }, [prontuariosLoading, prontuarios.length]);

  const dialogOpenRef = useRef(false);
  useEffect(() => { dialogOpenRef.current = dialogOpen; }, [dialogOpen]);

  const silentRefreshProntuarios = useCallback(() => {
    // Don't refresh while user is editing — it resets form state (SOAP fields)
    if (dialogOpenRef.current) return;
    queryClient.invalidateQueries({ queryKey: prontuariosQueryKey });
  }, [queryClient, prontuariosQueryKey]);

  useRealtimeSubscription({
    tables: ['prontuarios', 'treatment_cycles', 'treatment_sessions'],
    onchange: silentRefreshProntuarios,
  });

  // Prefetch detail on hover — opening becomes instant when user clicks.
  const handleProntuarioHover = useCallback((id: string) => {
    queryClient.prefetchQuery({
      queryKey: ['prontuario', id],
      queryFn: async () => {
        const { data, error } = await (supabase as any)
          .from("prontuarios")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        return data;
      },
      staleTime: 2 * 60 * 1000,
    });
  }, [queryClient]);

  const loadFullProntuario = useCallback(async (id: string): Promise<ProntuarioDB> => {
    const cached = queryClient.getQueryData<ProntuarioDB>(['prontuario', id]);
    if (cached && (cached as any).soap_subjetivo !== undefined) return cached;

    const { data, error } = await (supabase as any)
      .from("prontuarios")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Prontuário não encontrado no banco.");
    queryClient.setQueryData(['prontuario', id], data);
    return data as ProntuarioDB;
  }, [queryClient]);

  const loadTriagem = async (agendamentoId: string) => {
    try {
      // Try to find triage by agendamento_id first
      let { data } = await (supabase as any)
        .from("triage_records")
        .select("*")
        .eq("agendamento_id", agendamentoId)
        .not("confirmado_em", "is", null)
        .maybeSingle();

      // If not found, also try searching by patient + recent date (for demanda reprimida)
      if (!data) {
        const pacienteId = searchParams.get("pacienteId");
        if (pacienteId) {
          const { data: fallback } = await (supabase as any)
            .from("triage_records")
            .select("*")
            .not("confirmado_em", "is", null)
            .order("confirmado_em", { ascending: false })
            .limit(10);
          // Match by checking if any record's agendamento_id corresponds to a fila entry for this patient
          if (fallback && fallback.length > 0) {
            const { data: filaIds } = await supabase
              .from("fila_espera")
              .select("id")
              .eq("paciente_id", pacienteId);
            const filaIdSet = new Set((filaIds || []).map((f: any) => f.id));
            data = fallback.find((t: any) => filaIdSet.has(t.agendamento_id)) || null;
          }
        }
      }

      if (data) {
        const { data: tecnico } = await supabase
          .from("funcionarios")
          .select("nome, coren")
          .eq("id", data.tecnico_id)
          .maybeSingle();
        setTriagem({
          ...data,
          tecnico_nome: (tecnico as any)?.nome || "",
          tecnico_coren: (tecnico as any)?.coren || "",
        });
      } else {
        setTriagem(null);
      }
    } catch {
      setTriagem(null);
    }
  };

  const loadProntuarioProcedimentos = async (prontuarioId: string, patientId?: string, date?: string) => {
    // 1. Load procedures specific to THIS prontuario (current visit)
    let prontuarioProcs: any[] = [];
    if (prontuarioId) {
      const { data } = await (supabase as any)
        .from("prontuario_procedimentos")
        .select("procedimento_id, cids_selecionados, quantidade, observacao")
        .eq("prontuario_id", prontuarioId);
      prontuarioProcs = data || [];
    }
    
    // 2. Load global procedures for this patient on this specific date
    let globalProcs: any[] = [];
    if (patientId && date) {
      const { data } = await (supabase as any)
        .from("procedimentos_realizados")
        .select("procedimento_id, cids_selecionados, quantidade, observacao")
        .eq("paciente_id", patientId)
        .eq("data_atendimento", date);
      globalProcs = data || [];
    }

    // Merge both, with current prontuario procedures taking precedence
    const combinedData = [...prontuarioProcs];
    globalProcs.forEach(p => {
      if (!combinedData.some(cp => cp.procedimento_id === p.procedimento_id)) {
        combinedData.push(p);
      }
    });
    
    if (combinedData.length > 0) {
      const ids: string[] = [];
      const cidsMap: Record<string, string[]> = {};
      const detailsMap: Record<string, { quantidade: number; observacao: string }> = {};
      
      combinedData.forEach((d: any) => {
        const proc = procedimentos.find(p => p.uuid === d.procedimento_id);
        const displayId = proc ? proc.id : d.procedimento_id;
        
        ids.push(displayId);
        cidsMap[displayId] = Array.isArray(d.cids_selecionados) ? d.cids_selecionados : [];
        detailsMap[displayId] = {
          quantidade: d.quantidade || 1,
          observacao: d.observacao || ""
        };
        
        if (proc) {
          loadCidsForProc(proc.id);
        }
      });
      
      setSelectedProcIds(ids);
      setSelectedCidsByProc(cidsMap);
      setProcDetails(detailsMap);
    } else {
      setSelectedProcIds([]);
      setSelectedCidsByProc({});
      setProcDetails({});
    }
  };

  const loadEpisodios = async (pacienteId: string) => {
    const { data } = await (supabase as any)
      .from("episodios_clinicos")
      .select("id,titulo,status")
      .eq("paciente_id", pacienteId)
      .eq("status", "ativo");
    if (data) setEpisodios(data);
    else setEpisodios([]);
  };

  // Map agenda tipo to prontuário tipo_registro
  const mapAgendaTipoToRegistro = (agendaTipo: string | null): string => {
    if (!agendaTipo) return 'avaliacao_inicial';
    const map: Record<string, string> = {
      'Consulta': 'avaliacao_inicial',
      'Primeira Consulta': 'avaliacao_inicial',
      'Retorno': 'retorno',
      'Sessão de Tratamento': 'sessao',
      'Sessão': 'sessao',
      'Urgência': 'urgencia',
      'Procedimento': 'procedimento',
      'Exame': 'procedimento',
    };
    return map[agendaTipo] || 'avaliacao_inicial';
  };

  const initializedRef = useRef(false);

  useEffect(() => {
    const pacienteId = searchParams.get("pacienteId");
    const pacienteNome = searchParams.get("pacienteNome");
    const agendamentoId = searchParams.get("agendamentoId");
    const horaInicio = searchParams.get("horaInicio");
    const data = searchParams.get("data");
    const agendaTipo = searchParams.get("tipo");

    if (pacienteId && pacienteNome && agendamentoId) {
      // Only initialize once per searchParams to avoid re-opening/resetting the form
      // when prontuarios refresh in background
      if (initializedRef.current) {
        // If already initialized, only update if we find an existing prontuário for this agendamento
        // and we don't already have the dialog open
        if (!dialogOpen) {
          const existingForAgendamento = prontuarios.find((p) => p.agendamento_id === agendamentoId);
          if (existingForAgendamento) {
            openEdit(existingForAgendamento);
          }
        }
        return;
      }
      initializedRef.current = true;

      loadTriagem(agendamentoId);
      loadEpisodios(pacienteId);
      const existingForAgendamento = prontuarios.find((p) => p.agendamento_id === agendamentoId);
      if (existingForAgendamento) {
        openEdit(existingForAgendamento);
      } else {
        const tipoRegistro = mapAgendaTipoToRegistro(agendaTipo);
        setSessionRegistrationRequested(false);
        setEditId(null);
        setSelectedProcIds([]);
        setSelectedCidsByProc({});
        setProcDetails({});
        loadProntuarioProcedimentos("", pacienteId, data || todayLocalStr()); // Load global patient procedures for this date
        setForm({
          ...emptyForm,
          paciente_id: pacienteId,
          paciente_nome: pacienteNome,
          agendamento_id: agendamentoId || "",
          data_atendimento: data || todayLocalStr(),
          hora_atendimento: horaInicio || "",
          tipo_registro: tipoRegistro,
        });
        setDialogOpen(true);
      }
      if (horaInicio) {
        setActiveAtendimento({ agendamentoId, horaInicio });
      } else {
        const stored = localStorage.getItem(`timer_${agendamentoId}`);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            setActiveAtendimento({ agendamentoId, horaInicio: parsed.horaInicio });
          } catch {}
        }
      }
    } else if (pacienteId && pacienteNome) {
      setSearch(pacienteNome);
    }
  }, [searchParams, prontuarios.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load cycle + PTS data when sessao type is selected or patient changes
  useEffect(() => {
    if (form.paciente_id && (form.tipo_registro === 'sessao' || !!form.agendamento_id)) {
      loadSessaoData(buildTreatmentContext(form));
    }
  }, [form.tipo_registro, form.paciente_id, form.agendamento_id, form.profissional_id, form.data_atendimento, editId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const matchesCurrentSessionByAppointment = currentSessionForRegistration?.appointment_id === form.agendamento_id;
    const matchesCurrentSessionByDate = currentSessionForRegistration?.scheduled_date === form.data_atendimento;

    if (
      editId ||
      !form.agendamento_id ||
      form.tipo_registro !== 'consulta' ||
      !currentSessionForRegistration ||
      (!matchesCurrentSessionByAppointment && !matchesCurrentSessionByDate)
    ) {
      return;
    }

    setSessionRegistrationRequested(true);
    setForm((prev) => {
      if (prev.tipo_registro !== 'consulta') return prev;
      return { ...prev, tipo_registro: 'sessao' };
    });
  }, [currentSessionForRegistration, editId, form.agendamento_id, form.tipo_registro]);

  const patientHistory = useMemo(() => {
    if (!form.paciente_id) return [];
    return prontuarios
      .filter((p) => p.paciente_id === form.paciente_id && p.id !== editId)
      .sort((a, b) => b.data_atendimento.localeCompare(a.data_atendimento));
  }, [form.paciente_id, prontuarios, editId]);

  // Carrega histórico de procedimentos do paciente (sugestões)
  useEffect(() => {
    if (!form.paciente_id) { setPacienteProcHistory([]); return; }
    (async () => {
      // 1. Suggest from Prontuario Procedures (Historical)
      const { data: prontuarioData } = await (supabase as any)
        .from("prontuario_procedimentos")
        .select("procedimento_id, prontuarios!inner(paciente_id, data_atendimento)")
        .eq("prontuarios.paciente_id", form.paciente_id)
        .order("criado_em", { ascending: false })
        .limit(25);
        
      // 2. Suggest from Global Production Table (Global History)
      const { data: globalData } = await (supabase as any)
        .from("procedimentos_realizados")
        .select("procedimento_id, data_atendimento")
        .eq("paciente_id", form.paciente_id)
        .order("data_atendimento", { ascending: false })
        .limit(25);

      const seen = new Map<string, { id: string; nome: string; ultima: string; isGlobal?: boolean }>();
      
      const processItem = (r: any, isGlobal = false) => {
        const proc = procedimentos.find((p) => p.uuid === r.procedimento_id);
        if (proc && !seen.has(proc.id)) {
          const dt = (r.prontuarios?.data_atendimento || r.data_atendimento || '');
          const ultima = dt ? new Date(dt + 'T12:00:00').toLocaleDateString('pt-BR') : '';
          seen.set(proc.id, { id: proc.id, nome: proc.nome, ultima, isGlobal });
        }
      };

      (globalData || []).forEach(r => processItem(r, true));
      (prontuarioData || []).forEach(r => processItem(r));
      
      setPacienteProcHistory(Array.from(seen.values()));
    })();
  }, [form.paciente_id, procedimentos]);

  const openNew = (pacienteId?: string, pacienteNome?: string) => {
    setEditId(null);
    setActiveAtendimento(null);
    setSessionRegistrationRequested(false);
    setSelectedProcIds([]);
    setSelectedCidsByProc({});
    setProcDetails({});
    setEpisodios([]);
    setListaExames([]);
    setListaPrescricao([]);
    setEspecialidadeFields({});
    setSoapErrors(false);
    setSoapEnabled(true);
    
    if (pacienteId) {
      loadProntuarioProcedimentos("", pacienteId, todayLocalStr());
    }
    
    setForm({ 
      ...emptyForm, 
      paciente_id: pacienteId || "",
      paciente_nome: pacienteNome || "",
      data_atendimento: todayLocalStr(), 
      tipo_registro: "avaliacao_inicial" 
    });
    setDialogOpen(true);
  };

  const openEdit = async (item: ProntuarioDB) => {
    const p = await loadFullProntuario(item.id);

    setEditId(p.id);
    setActiveAtendimento(null);
    setSessionRegistrationRequested(false);
    
    // Clear state before loading
    setSelectedProcIds([]);
    setSelectedCidsByProc({});
    setProcDetails({});
    setSessaoCycle(null);
    setSessaoCycleSessions([]);
    setSessaoPts(null);
    setSessaoPtsSigtap([]);
    setSessaoPtsCids([]);

    loadProntuarioProcedimentos(p.id, p.paciente_id, p.data_atendimento);
    loadEpisodios(p.paciente_id);
    const formData = {
      paciente_id: p.paciente_id,
      paciente_nome: p.paciente_nome,
      profissional_id: p.profissional_id || "",
      profissional_nome: p.profissional_nome || "",
      agendamento_id: p.agendamento_id || "",
      data_atendimento: p.data_atendimento,
      hora_atendimento: p.hora_atendimento || "",
      tipo_registro: (p as any).tipo_registro || "consulta",
      queixa_principal: p.queixa_principal || "",
      anamnese: p.anamnese || "",
      sinais_sintomas: p.sinais_sintomas || "",
      exame_fisico: p.exame_fisico || "",
      hipotese: p.hipotese || "",
      conduta: p.conduta || "",
      prescricao: p.prescricao || "",
      solicitacao_exames: p.solicitacao_exames || "",
      evolucao: p.evolucao || "",
      observacoes: getObservacoesTexto(p.observacoes),
      resultado_exame: (p as any).resultado_exame || "",
      indicacao_retorno: p.indicacao_retorno || "",
      motivo_alteracao: "",
      procedimentos_texto: p.procedimentos_texto || "",
      outro_procedimento: p.outro_procedimento || "",
      episodio_id: p.episodio_id || "",
      soap_subjetivo: (p as any).soap_subjetivo || "",
      soap_objetivo: (p as any).soap_objetivo || "",
      soap_avaliacao: (p as any).soap_avaliacao || "",
      soap_plano: (p as any).soap_plano || "",
      custom_data: getCustomDataObject(p),
    };
    setForm(formData);
    setPreviousForm(formData);
    if (formData.paciente_id && (formData.tipo_registro === 'sessao' || !!formData.agendamento_id)) {
      loadSessaoData({
        patientId: formData.paciente_id,
        prontuarioId: p.id,
        professionalId: formData.profissional_id,
        professionalName: formData.profissional_nome,
        specialty: getTreatmentSpecialtyFromSource(formData, funcionarios.find((f) => f.id === formData.profissional_id), user?.profissao),
        date: formData.data_atendimento,
        explicitCycleId: formData.custom_data?.treatment_cycle_id || formData.custom_data?.cycle_id || formData.custom_data?.treatmentCycleId || null,
        explicitPtsId: formData.custom_data?.pts_id || formData.custom_data?.ptsId || formData.custom_data?.pts_meta_id || null,
        explicitPtsMetaId: formData.custom_data?.pts_meta_id || null,
      });
    }
    // Load exames from solicitacao_exames JSON
    try {
      const parsed = p.solicitacao_exames ? JSON.parse(p.solicitacao_exames) : null;
      if (parsed?.exames && Array.isArray(parsed.exames)) setListaExames(parsed.exames);
      else setListaExames([]);
    } catch { setListaExames([]); }
    // Load prescriptions from prescricao JSON
    try {
      const parsed = p.prescricao ? JSON.parse(p.prescricao) : null;
      if (parsed?.medicamentos && Array.isArray(parsed.medicamentos)) setListaPrescricao(parsed.medicamentos);
      else setListaPrescricao([]);
    } catch { setListaPrescricao([]); }
    // Load specialty fields and dynamic fields from observacoes JSON
    try {
      const parsed = p.observacoes ? JSON.parse(p.observacoes) : null;
      if (parsed && typeof parsed === 'object') {
        if (parsed.especialidade_fields) {
          setEspecialidadeFields(parsed.especialidade_fields);
        } else {
          setEspecialidadeFields({});
        }

        // Carrega campos dinâmicos de volta para o form
        const dynamicFromCustomData = p.custom_data && typeof p.custom_data === 'object'
          ? Object.fromEntries(Object.entries(p.custom_data).filter(([key]) => !key.startsWith('esp_')))
          : {};
        if (Object.keys(dynamicFromCustomData).length > 0 || (parsed.dynamic_fields && typeof parsed.dynamic_fields === 'object')) {
          setForm(prev => ({
            ...prev,
            ...dynamicFromCustomData,
            ...(parsed.dynamic_fields || {})
          }));
        }
      } else {
        setEspecialidadeFields({});
      }
    } catch { setEspecialidadeFields({}); }
    setDialogOpen(true);
    const pac = pacientes.find((px) => px.id === p.paciente_id);
    logAction({
      acao: "prontuario_visualizado",
      entidade: "prontuario",
      entidadeId: p.id,
      modulo: "prontuario",
      user,
      detalhes: { paciente_nome: p.paciente_nome, paciente_cpf: pac?.cpf || "" },
    });
  };

  const handleSave = async (formOverride?: any): Promise<boolean> => {
    // Anti-duplo-clique: bloqueia chamadas concorrentes antes mesmo de setSaving refletir.
    if (savingRef.current) {
      console.warn("[handleSave] Salvamento já em curso — clique duplo ignorado.");
      return false;
    }
    savingRef.current = true;
    console.log("[handleSave] Iniciando salvamento...", { hasEditId: !!editId, editId });
    const f = formOverride || formRef.current;
    const ef = especialidadeFieldsRef.current;
    const le = listaExamesRef.current;
    const lp = listaPrescricaoRef.current;
    const spi = selectedProcIdsRef.current;
    const pd = procDetailsRef.current;
    const scbp = selectedCidsByProcRef.current;

    if (!f.paciente_nome || !f.data_atendimento) {
      toast.error("Paciente e data são obrigatórios.");
      return false;
    }
    // Prevent creating/editing prontuários for future dates
    const today = todayLocalStr();
    if (f.data_atendimento > today && !editId) {
      toast.error("Não é possível registrar prontuário para data futura. O atendimento precisa ocorrer primeiro.");
      return false;
    }
    // Motivo da alteração agora é opcional ao editar.
    if (sessionRegistrationError) {
      toast.error(sessionRegistrationError);
      return false;
    }
    
    // Normalize SOAP values
    const soapPayload = normalizeSoapPayload({
      subjetivo: f.soap_subjetivo,
      objetivo: f.soap_objetivo,
      avaliacao: f.soap_avaliacao,
      plano: f.soap_plano,
    });
    
    const soapValidationError = null;
    setSoapErrors(false);
    setSaving(true);
    // CRÍTICO: cancela autosave pendente e aguarda autosave em andamento para
    // evitar duplicação de prontuário (autosave INSERT + handleSave INSERT).
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    // Aguarda autosave em voo terminar (até 5s) antes de prosseguir
    const autosaveStart = Date.now();
    while (autosaveInFlightRef.current && Date.now() - autosaveStart < 5000) {
      await new Promise(r => setTimeout(r, 100));
    }
    // Usa editIdRef.current como fonte de verdade (autosave pode ter criado o registro)
    const effectiveEditId = editId || editIdRef.current;
    let insertedNewProntuario = false;
    let prontuarioId: string | null = effectiveEditId;
    try {
      const procTexto = spi
        .map((id) => {
          const p = procedimentos.find((pr) => pr.id === id);
          const detail = pd[id];
          const qtdStr = detail && detail.quantidade > 1 ? ` (${detail.quantidade}x)` : '';
          return p ? `${p.nome}${qtdStr}` : '';
        })
        .filter(Boolean)
        .join(", ");

      // Profissional responsável: ao editar, PRESERVA estritamente o original do prontuário
      // (carregado em openEdit a partir de prontuarios.profissional_id/nome). Master pode
      // trocar explicitamente via UI, alterando form.profissional_id/nome. NUNCA cair para
      // user.id/user.nome em edição, para não trocar o responsável pelo usuário logado.
      // Ao criar novo prontuário, usa o usuário logado.
      const profIdToSave = effectiveEditId ? (f.profissional_id || "") : (user?.id || "");
      const profNomeToSave = effectiveEditId
        ? (f.profissional_nome || funcionarios.find(fx => fx.id === profIdToSave)?.nome || "")
        : (user?.nome || "");
      const dynamicFields = getDynamicFieldsPayload(f);
      const allDynamicData = {
        ...getCustomDataObject(f),
        ...dynamicFields,
        ...ef,
      };
      // Adiciona prefixo esp_ para campos de especialidade apenas se não existirem
      Object.entries(ef || {}).forEach(([key, value]) => {
        if (!key.startsWith('esp_')) {
          allDynamicData[`esp_${key}`] = value;
        }
      });

      const record: any = {
        paciente_id: f.paciente_id || `manual_${Date.now()}`,
        paciente_nome: f.paciente_nome,
        profissional_id: profIdToSave,
        profissional_nome: profNomeToSave,
        ...(effectiveEditId ? {} : { unidade_id: user?.unidadeId || "", setor: user?.setor || "" }),
        agendamento_id: f.agendamento_id,
        data_atendimento: f.data_atendimento,
        hora_atendimento: f.hora_atendimento,
        queixa_principal: f.queixa_principal,
        anamnese: f.anamnese,
        sinais_sintomas: f.sinais_sintomas,
        exame_fisico: f.exame_fisico,
        hipotese: f.hipotese,
        conduta: f.conduta,
        prescricao: lp.length > 0 ? JSON.stringify({ medicamentos: lp }) : (f.prescricao?.includes('"medicamentos":') ? JSON.stringify({ medicamentos: [] }) : f.prescricao),
        solicitacao_exames: le.length > 0 ? JSON.stringify({ exames: le }) : (f.solicitacao_exames?.includes('"exames":') ? JSON.stringify({ exames: [] }) : f.solicitacao_exames),

        evolucao: f.evolucao,
        observacoes: JSON.stringify({ 
          especialidade_fields: ef, 
          texto: f.observacoes,
          dynamic_fields: dynamicFields
        }),
        custom_data: allDynamicData,

        resultado_exame: f.resultado_exame || "",
        // CORRIGIDO: converte 'no_indication' para '' antes de salvar no banco
        indicacao_retorno: f.indicacao_retorno === "no_indication" ? "" : f.indicacao_retorno || "",
        motivo_alteracao: effectiveEditId ? f.motivo_alteracao : "",
        procedimentos_texto: procTexto || f.procedimentos_texto || "",
        outro_procedimento: f.outro_procedimento || "",
        tipo_registro: f.tipo_registro || "consulta",
        soap_subjetivo: soapPayload.subjetivo,
        soap_objetivo: soapPayload.objetivo,
        soap_avaliacao: soapPayload.avaliacao,
        soap_plano: soapPayload.plano,
      };

      console.log("[handleSave] Payload final a ser enviado ao banco:", {
        id: effectiveEditId,
        paciente: record.paciente_nome,
        queixa: record.queixa_principal,
        hasCustomData: Object.keys(record.custom_data || {}).length > 0,
        customData: record.custom_data
      });


      // CORRIGIDO: não salva 'no_episode' no banco
      if (form.episodio_id && form.episodio_id !== "no_episode") {
        record.episodio_id = form.episodio_id;
      }

      const pac = pacientes.find((px) => px.id === (form.paciente_id || record.paciente_id));
      if (effectiveEditId) {
        // Segurança: se por algum motivo o profissional não estiver no form em edição,
        // remove os campos do update para preservar o original do banco.
        if (!record.profissional_id) { delete record.profissional_id; delete record.profissional_nome; }
        const { data: updated, error } = await (supabase as any).from("prontuarios").update(record).eq("id", effectiveEditId).select("id, criado_em, atualizado_em").maybeSingle();
        if (error) throw error;
        if (!updated?.id) throw new Error("Nenhum prontuário foi atualizado. Verifique o ID do registro e as permissões.");
        console.log("[handleSave] Prontuário atualizado com sucesso:", updated.id);
        const camposAlterados: Record<string, { anterior: string; novo: string }> = {};
        if (previousForm) {
          const fieldLabels: Record<string, string> = {
            queixa_principal: "Queixa Principal",
            anamnese: "Anamnese",
            sinais_sintomas: "Sinais/Sintomas",
            exame_fisico: "Exame Físico",
            hipotese: "Hipótese",
            conduta: "Conduta",
            prescricao: "Prescrição",
            solicitacao_exames: "Solicitação Exames",
            evolucao: "Evolução",
            observacoes: "Observações",
            resultado_exame: "Resultado de Exame",
            indicacao_retorno: "Indicação Retorno",
            procedimentos_texto: "Procedimentos",
            outro_procedimento: "Outro Procedimento",
          };
          for (const [key, label] of Object.entries(fieldLabels)) {
            const prev = (previousForm as any)[key] || "";
            const curr = key === "procedimentos_texto" ? procTexto : (form as any)[key] || "";
            if (prev !== curr) {
              camposAlterados[label] = { anterior: prev.substring(0, 200), novo: curr.substring(0, 200) };
            }
          }
        }
        // Detecta troca de profissional responsável (registro explícito de auditoria)
        const prevProfId = previousForm ? (previousForm as any).profissional_id || "" : "";
        const prevProfNome = previousForm ? (previousForm as any).profissional_nome || "" : "";
        if (prevProfId && prevProfId !== profIdToSave) {
          camposAlterados["Profissional Responsável"] = {
            anterior: prevProfNome.substring(0, 200),
            novo: profNomeToSave.substring(0, 200),
          };
        }
        await logAction({
          acao: "prontuario_editado",
          entidade: "prontuario",
          entidadeId: effectiveEditId,
          modulo: "prontuario",
          user,
          pacienteId: form.paciente_id || record.paciente_id,
          pacienteNome: form.paciente_nome,
          profissionalId: profIdToSave,
          profissionalNome: profNomeToSave,
          prontuarioId: effectiveEditId,
          before: previousForm,
          after: record,
          detalhes: {
            motivo_alteracao: form.motivo_alteracao,
            campos_alterados: camposAlterados,
            editado_por_id: user?.id || "",
            editado_por_nome: user?.nome || "",
          },
        });

      } else {
        const { data: inserted, error } = await (supabase as any)
          .from("prontuarios")
          .insert(record)
          .select("id, criado_em, atualizado_em")
          .single();
        if (error) throw error;
        console.log("[handleSave] Prontuário inserido com sucesso:", inserted?.id);
        prontuarioId = inserted?.id;
        insertedNewProntuario = true;
        // Sincroniza imediatamente o ref para que próximos saves não dupliquem
        if (prontuarioId) {
          editIdRef.current = prontuarioId;
          setEditId(prontuarioId);
          console.log("[handleSave] Novo ID setado no estado:", prontuarioId);
        }
      }

      if (prontuarioId) {
        // First, fetch current procedures to avoid unnecessary deletion if no changes
        const { data: existingProcs } = await (supabase as any)
          .from("prontuario_procedimentos")
          .select("procedimento_id, quantidade, observacao, cids_selecionados")
          .eq("prontuario_id", prontuarioId);

        // Prepare the new list of links to insert
        const linksToInsert = selectedProcIds.map((pid) => {
          const proc = procedimentos.find(p => p.id === pid);
          return {
            prontuario_id: prontuarioId,
            procedimento_id: proc?.uuid || pid, // Use UUID if found
            cids_selecionados: Array.from(new Set(selectedCidsByProc[pid] || [])),
            quantidade: procDetails[pid]?.quantidade || 1,
            observacao: procDetails[pid]?.observacao || "",
          };
        }).filter(l => l.procedimento_id && l.procedimento_id.length > 30); // Ensure it's a UUID

        // Simple strategy: delete and re-insert if different
        // We compare existing vs new to see if we need to do anything
        const hasChanges = JSON.stringify(existingProcs || []) !== JSON.stringify(linksToInsert.map(l => ({
          procedimento_id: l.procedimento_id,
          quantidade: l.quantidade,
          observacao: l.observacao,
          cids_selecionados: l.cids_selecionados
        })));

        if (hasChanges || !existingProcs || existingProcs.length !== linksToInsert.length) {
          // Verify each procedure UUID is valid before deleting/inserting
          const validLinks = linksToInsert.filter(l => {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(l.procedimento_id);
            if (!isUuid) {
              console.warn(`[Prontuario] Pulando procedimento com ID inválido (não é UUID): ${l.procedimento_id}`);
            }
            return isUuid;
          });

          const { error: deleteError } = await (supabase as any).from("prontuario_procedimentos").delete().eq("prontuario_id", prontuarioId);
          if (deleteError) {
            console.error("[Prontuario] Erro real ao remover procedimentos antigos", {
              error: deleteError,
              prontuarioId,
              action: "delete_procedures"
            });
            // We don't throw here to allow the main record to remain saved, but we warn the user
            toast.error("Erro ao atualizar lista de procedimentos. O prontuário principal foi salvo.");
          } else if (validLinks.length > 0) {
            const { error: insertError } = await (supabase as any).from("prontuario_procedimentos").insert(validLinks);
            if (insertError) {
              console.error("[Prontuario] Erro real ao salvar procedimentos", {
                error: insertError,
                prontuarioId,
                validLinks,
                action: "insert_procedures"
              });
              toast.error("O prontuário foi salvo, mas houve um erro ao vincular os procedimentos.");
            }
          }
        }
      }

      const shouldRegisterSession = Boolean(isSessionRegistrationFlow && currentSessionForRegistration && sessaoCycle);

      if (shouldRegisterSession) {
        const procedureDone =
          procTexto ||
          form.procedimentos_texto?.trim() ||
          form.outro_procedimento?.trim() ||
          form.queixa_principal?.trim() ||
          'Sessão registrada';

        const result = await treatmentService.registerCompletedSession({
          cycle: sessaoCycle,
          session: currentSessionForRegistration,
          soap: soapPayload,
          procedureDone,
          userId: user?.id,
          appointmentId: form.agendamento_id || currentSessionForRegistration.appointment_id || null,
        });

        if (result.cycleStatus === 'concluido') {
          toast.info('🎉 Ciclo de tratamento concluído!');
        }

        await logAction({
          acao: 'sessao_registrada',
          entidade: 'treatment_session',
          entidadeId: currentSessionForRegistration.id,
          modulo: 'prontuario',
          user,
          detalhes: { paciente: form.paciente_nome, sessao_numero: currentSessionForRegistration.session_number, ciclo_id: sessaoCycle.id },
        });
        toast.success(`✅ Sessão ${currentSessionForRegistration.session_number} registrada com sucesso!`);
      } else {
        toast.success(effectiveEditId ? "Prontuário atualizado!" : "Prontuário criado!");
      }

      if (!effectiveEditId) {
        await logAction({
          acao: "prontuario_criado",
          entidade: "prontuario",
          entidadeId: prontuarioId || "",
          modulo: "prontuario",
          user,
          pacienteId: form.paciente_id || record.paciente_id,
          pacienteNome: form.paciente_nome,
          profissionalId: profIdToSave,
          profissionalNome: profNomeToSave,
          prontuarioId: prontuarioId || "",
          after: record,
          detalhes: { paciente_nome: form.paciente_nome, paciente_cpf: pac?.cpf || "" },
        });

      }

      // Reload data in BACKGROUND — não bloquear UI (close dialog imediatamente)
      void Promise.all([
        loadProntuarios(),
        refreshAgendamentos(),
        form.tipo_registro === 'sessao' && form.paciente_id
          ? loadSessaoData(buildTreatmentContext())
          : Promise.resolve(),
      ]).catch(err => console.error('[Prontuario] background reload failed:', err));

      setSessionRegistrationRequested(false);
      // Only close dialog if NOT a session registration flow — keep prontuário open after session registration
      if (!shouldRegisterSession) {
        setDialogOpen(false);
      } else {
        // Session registered: update editId to the saved prontuário so user can continue editing
        if (prontuarioId) {
          setEditId(prontuarioId);
          // Refresh procedures for the newly saved record
          loadProntuarioProcedimentos(prontuarioId, form.paciente_id, form.data_atendimento);
        }
        // Keep SOAP fields intact so user can still view/edit the prontuário
      }
      setPreviousForm(null);
      return true;
    } catch (err: any) {
      if (insertedNewProntuario && prontuarioId) {
        try {
          await (supabase as any).from("prontuario_procedimentos").delete().eq("prontuario_id", prontuarioId);
          await (supabase as any).from("prontuarios").delete().eq("id", prontuarioId);
        } catch (rollbackError) {
          console.error("Erro ao reverter prontuário após falha na sessão:", rollbackError);
        }
      }
      console.error("Erro ao salvar prontuário/sessão:", {
        error: err,
        message: err?.message,
        tipo_registro: form.tipo_registro,
        paciente_id: form.paciente_id,
        agendamento_id: form.agendamento_id || null,
        cycle_id: sessaoCycle?.id || null,
        session_id: currentSessionForRegistration?.id || null,
      });
      if (form.tipo_registro === 'sessao' && !editId) {
        toast.error(err?.message?.startsWith('Preencha') ? err.message : '❌ Erro ao registrar sessão. Tente novamente.');
      } else {
        toast.error("Erro ao salvar: " + (err?.message || "erro desconhecido"));
      }
      return false;
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  // ============== AUTOSAVE ==============
  // Silent autosave: persists draft without validations/toasts/logs/navigation.
  // Does NOT change agendamento status. Finalize button continues to set "concluido".
  const performAutosave = useCallback(async () => {
    if (autosaveInFlightRef.current) return;
    const f = formRef.current;
    const ef = especialidadeFieldsRef.current;
    const lp = listaPrescricaoRef.current;
    const le = listaExamesRef.current;
    const spi = selectedProcIdsRef.current;
    const pd = procDetailsRef.current;
    const scbp = selectedCidsByProcRef.current;

    // Skip when no patient selected, no date, or in session-registration flow
    if (!f.paciente_nome || !f.paciente_id || !f.data_atendimento) return;
    
    // Check if there is actual content to save (at least one field should be non-empty)
    const hasContent = 
      f.queixa_principal?.trim() || f.anamnese?.trim() || f.sinais_sintomas?.trim() || 
      f.exame_fisico?.trim() || f.hipotese?.trim() || f.conduta?.trim() || 
      f.evolucao?.trim() || f.observacoes?.trim() || 
      f.soap_subjetivo?.trim() || f.soap_objetivo?.trim() || f.soap_avaliacao?.trim() || f.soap_plano?.trim() ||
      spi.length > 0 || Object.keys(ef).length > 0;

    if (!hasContent) return;

    if (f.tipo_registro === 'sessao' && !editIdRef.current) return; // require explicit "Registrar Sessão"
    const today = todayLocalStr();
    if (!editIdRef.current && f.data_atendimento > today) return;

    autosaveInFlightRef.current = true;
    setAutosaveStatus('saving');
    try {
      const procTexto = spi
        .map((id) => {
          const p = procedimentos.find((pr) => pr.id === id);
          const detail = pd[id];
          const qtdStr = detail && detail.quantidade > 1 ? ` (${detail.quantidade}x)` : '';
          return p ? `${p.nome}${qtdStr}` : '';
        })
        .filter(Boolean)
        .join(', ');
      // Preserva profissional ao editar (nunca cair para user.id/nome em edição);
      // usa logado apenas ao criar novo prontuário.
      const isEditing = Boolean(editIdRef.current);
      const profIdAuto = isEditing ? (f.profissional_id || '') : (user?.id || '');
      const profNomeAuto = isEditing ? (f.profissional_nome || '') : (user?.nome || '');
      const dynamicFields = getDynamicFieldsPayload(f);
      const record: any = {
        paciente_id: f.paciente_id,
        paciente_nome: f.paciente_nome,
        profissional_id: profIdAuto,
        profissional_nome: profNomeAuto,
        ...(isEditing ? {} : { unidade_id: user?.unidadeId || '', setor: user?.setor || '' }),
        agendamento_id: f.agendamento_id,
        data_atendimento: f.data_atendimento,
        hora_atendimento: f.hora_atendimento,
        queixa_principal: f.queixa_principal,
        anamnese: f.anamnese,
        sinais_sintomas: f.sinais_sintomas,
        exame_fisico: f.exame_fisico,
        hipotese: f.hipotese,
        conduta: f.conduta,
        prescricao: lp.length > 0 ? JSON.stringify({ medicamentos: lp }) : (f.prescricao?.includes('"medicamentos":') ? JSON.stringify({ medicamentos: [] }) : f.prescricao),
        solicitacao_exames: le.length > 0 ? JSON.stringify({ exames: le }) : (f.solicitacao_exames?.includes('"exames":') ? JSON.stringify({ exames: [] }) : f.solicitacao_exames),

        evolucao: f.evolucao,
        observacoes: JSON.stringify({ 
          especialidade_fields: ef, 
          texto: f.observacoes,
          dynamic_fields: dynamicFields
        }),
        custom_data: {
          ...getCustomDataObject(f),
          ...dynamicFields,
          ...ef,
          ...Object.fromEntries(Object.entries(ef || {}).map(([key, value]) => {
            const finalKey = key.startsWith('esp_') ? key : `esp_${key}`;
            return [finalKey, value];
          })),
        },
        indicacao_retorno: f.indicacao_retorno === 'no_indication' ? '' : (f.indicacao_retorno || ''),
        motivo_alteracao: editIdRef.current ? (f.motivo_alteracao || 'Edição automática (autosave)') : '',
        procedimentos_texto: procTexto || f.procedimentos_texto || '',
        outro_procedimento: f.outro_procedimento || '',
        tipo_registro: f.tipo_registro || 'consulta',
        soap_subjetivo: f.soap_subjetivo,
        soap_objetivo: f.soap_objetivo,
        soap_avaliacao: f.soap_avaliacao,
        soap_plano: f.soap_plano,
        resultado_exame: f.resultado_exame || "",
      };
      if (f.episodio_id && f.episodio_id !== 'no_episode') record.episodio_id = f.episodio_id;



      let prontId = editIdRef.current;
      if (prontId) {
        // Preserva profissional original se o form não tiver no autosave
        if (!record.profissional_id) { delete record.profissional_id; delete record.profissional_nome; }
        const { error } = await (supabase as any).from('prontuarios').update(record).eq('id', prontId);
        if (error) throw error;
        console.log("[performAutosave] Draft atualizado:", prontId);
      } else {
        const { data: inserted, error } = await (supabase as any)
          .from('prontuarios')
          .insert(record)
          .select('id')
          .single();
        if (error) throw error;
        if (inserted?.id) {
          prontId = inserted.id;
          console.log("[performAutosave] Novo draft criado:", prontId);
          setEditId(prontId);
          editIdRef.current = prontId;
          // Reset status de faltas ao registrar novo atendimento
          try { await (supabase as any).rpc('resetar_faltas_paciente', { p_paciente_id: record.paciente_id }); } catch {}
        }
      }

      // Autosave procedures to junction table
      if (prontId) {
        const links = spi.map((pid) => {
          const proc = procedimentos.find(p => p.id === pid);
          return {
            prontuario_id: prontId,
            procedimento_id: proc?.uuid || pid,
            cids_selecionados: Array.from(new Set(scbp[pid] || [])),
            quantidade: pd[pid]?.quantidade || 1,
            observacao: pd[pid]?.observacao || "",
          };
        }).filter(l => l.procedimento_id && l.procedimento_id.length > 30);

        
        // Use a single transaction (delete + insert)
        const validLinks = links.filter(l => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(l.procedimento_id));
        
        const { error: deleteError } = await (supabase as any).from("prontuario_procedimentos").delete().eq("prontuario_id", prontId);
        if (!deleteError && validLinks.length > 0) {
          const { error: insertError } = await (supabase as any).from("prontuario_procedimentos").insert(validLinks);
          if (insertError) {
            console.error('[autosave] Erro ao inserir procedimentos:', insertError);
          }
        } else if (deleteError) {
          console.error('[autosave] Erro ao remover procedimentos:', deleteError);
        }
      }
      setAutosaveStatus('saved');
      setAutosaveAt(new Date());
    } catch (err) {
      console.error('[autosave] erro:', err);
      setAutosaveStatus('error');
    } finally {
      autosaveInFlightRef.current = false;
    }
  }, [user, selectedProcIds, procDetails, selectedCidsByProc, procedimentos]);

  // Keep latest performAutosave in a ref so the debounce effect doesn't re-run
  // every time selectedProcIds/procDetails/selectedCidsByProc/procedimentos change.
  const performAutosaveRef = useRef(performAutosave);
  useEffect(() => { performAutosaveRef.current = performAutosave; }, [performAutosave]);

  // Debounced trigger watching form changes while dialog is open
  useEffect(() => {
    if (!dialogOpen) return;
    if (!form.paciente_id || !form.paciente_nome) return;
    // Build a hash of editable text fields to detect real changes
    const hash = JSON.stringify({
      qp: form.queixa_principal, an: form.anamnese, ss: form.sinais_sintomas,
      ef: form.exame_fisico, hp: form.hipotese, cd: form.conduta,
      pr: form.prescricao, se: form.solicitacao_exames, ev: form.evolucao,
      ob: form.observacoes, ir: form.indicacao_retorno, op: form.outro_procedimento,
      pt: form.procedimentos_texto, ep: form.episodio_id, tr: form.tipo_registro,
      da: form.data_atendimento, ho: form.hora_atendimento,
      // Include selected procedures in hash to trigger autosave
      sp: selectedProcIds,
      pd: procDetails,
      sc: selectedCidsByProc,
    });
    if (hash === lastAutosaveHashRef.current) return;
    lastAutosaveHashRef.current = hash;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => { void performAutosaveRef.current(); }, 2500);
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
  }, [
    dialogOpen,
    form.paciente_id,
    form.paciente_nome,
    form.queixa_principal,
    form.anamnese,
    form.sinais_sintomas,
    form.exame_fisico,
    form.hipotese,
    form.conduta,
    form.prescricao,
    form.solicitacao_exames,
    form.evolucao,
    form.observacoes,
    form.indicacao_retorno,
    form.outro_procedimento,
    form.procedimentos_texto,
    form.episodio_id,
    form.tipo_registro,
    form.data_atendimento,
    form.hora_atendimento,
    selectedProcIds,
    procDetails,
    selectedCidsByProc,
  ]);

  // Flush on tab hide / before unload
  useEffect(() => {
    if (!dialogOpen) return;
    const flush = () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      void performAutosave();
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [dialogOpen, performAutosave]);

  // Reset autosave indicator when dialog closes/opens
  useEffect(() => {
    if (!dialogOpen) {
      setAutosaveStatus('idle');
      setAutosaveAt(null);
      lastAutosaveHashRef.current = '';
      if (autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null; }
    }
  }, [dialogOpen]);
  // ============ END AUTOSAVE ============

  const handleFinalizarAtendimento = async () => {
    if (finalizingRef.current) {
      console.warn("[handleFinalizarAtendimento] Finalização já em curso — clique duplo ignorado.");
      return;
    }
    finalizingRef.current = true;
    try {
      const saved = await handleSave();
      if (!saved) return;

    // Resolve the agendamento ID — from activeAtendimento or form
    const agendamentoId = activeAtendimento?.agendamentoId || form.agendamento_id;
    if (!agendamentoId) {
      toast.error("Nenhum agendamento vinculado para finalizar.");
      return;
    }

    const now = new Date();
    const horaFim = nowTimeBrazilStr(now);
    let duracaoMinutos = 0;
    if (activeAtendimento?.horaInicio) {
      const [hi, mi] = activeAtendimento.horaInicio.split(":").map(Number);
      const [hf, mf] = horaFim.split(":").map(Number);
      duracaoMinutos = hf * 60 + mf - (hi * 60 + mi);
    }
    const pac = pacientes.find((px) => px.id === form.paciente_id);

    // Confirma no banco a finalização do atendimento antes de navegar
    const { error: finalizeError } = await (supabase as any)
      .from("atendimentos")
      .update({ hora_fim: horaFim, duracao_minutos: Math.max(0, duracaoMinutos), status: "finalizado" })
      .eq("agendamento_id", agendamentoId);

    if (finalizeError) {
      console.error("[Prontuario] Falha ao finalizar atendimento no banco:", finalizeError);
      toast.error("❌ Não foi possível finalizar o atendimento. Tente novamente.");
      return;
    }

    // Side-effects secundários em background (log e alta automática)
    void (async () => {
      try {
        const tasks: Array<Promise<any> | any> = [
          logAction({
            acao: "atendimento_finalizado",
            entidade: "atendimento",
            entidadeId: agendamentoId,
            modulo: "atendimento",
            user,
            detalhes: {
              paciente_nome: form.paciente_nome,
              paciente_cpf: pac?.cpf || "",
              hora_inicio: activeAtendimento?.horaInicio || "",
              hora_fim: horaFim,
              duracao_minutos: Math.max(0, duracaoMinutos),
              unidade: user?.unidadeId || "",
              sala: user?.salaId || "",
            },
          }),
        ];

        // Auto-discharge: if cycle completed, register discharge
        if (sessaoCycle && form.tipo_registro === 'sessao') {
          const completedCount = sessaoCycleSessions.filter(s => s.status === 'realizada').length;
          if (completedCount >= sessaoCycle.total_sessions) {
            tasks.push(
              (async () => {
                await (supabase as any).from('treatment_cycles').update({
                  status: 'finalizado_alta',
                  updated_at: new Date().toISOString(),
                }).eq('id', sessaoCycle.id);
                await (supabase as any).from('patient_discharges').insert({
                  cycle_id: sessaoCycle.id,
                  patient_id: form.paciente_id,
                  professional_id: user?.id || '',
                  reason: 'Alta automática — ciclo concluído',
                  final_notes: 'Tratamento finalizado com todas as sessões realizadas.',
                });
                toast.success("🎉 Paciente recebeu alta automática — tratamento concluído!");
              })()
            );
          }
        }

        await Promise.allSettled(tasks);
      } catch (err) {
        console.error("[Prontuario] background finalizar tasks failed:", err);
      }
    })();

    localStorage.removeItem(`timer_${agendamentoId}`);
    updateAgendamento(agendamentoId, { status: "concluido" });
    setActiveAtendimento(null);
    toast.success(`Atendimento finalizado!${duracaoMinutos > 0 ? ` Duração: ${Math.max(0, duracaoMinutos)} minutos.` : ''}`);
    navigate("/painel/agenda");
    } finally {
      finalizingRef.current = false;
    }
  };

  // Dedicated handler: register session only (no close)
  const handleRegistrarSessaoOnly = async () => {
    if (registeringSessionRef.current) {
      console.warn("[handleRegistrarSessaoOnly] Registro já em curso — clique duplo ignorado.");
      return;
    }
    if (!currentSessionForRegistration || !sessaoCycle) {
      toast.error("Nenhuma sessão disponível para registro.");
      return;
    }
    if (sessionRegistrationError) {
      toast.error(sessionRegistrationError);
      return;
    }
    registeringSessionRef.current = true;
    const soapPayload = sessionSoapPayload;
    const soapError = null;
    setSoapErrors(false);
    setSaving(true);
    let insertedNewProntuario = false;
    let prontuarioId: string | null = editId;
    try {
      const procTexto = selectedProcIds.map(id => procedimentos.find(pr => pr.id === id)?.nome || "").filter(Boolean).join(", ");
      // Em edição, preserva o profissional original do prontuário (nunca usa user.id/nome).
      const profIdSess = editId ? (form.profissional_id || "") : (user?.id || "");
      const profNomeSess = editId
        ? (form.profissional_nome || funcionarios.find(f => f.id === profIdSess)?.nome || "")
        : (user?.nome || "");
      const dynamicFields = getDynamicFieldsPayload(form);
      const record: any = {
        paciente_id: form.paciente_id || `manual_${Date.now()}`,
        paciente_nome: form.paciente_nome,
        profissional_id: profIdSess,
        profissional_nome: profNomeSess,
        ...(editId ? {} : { unidade_id: user?.unidadeId || "", setor: user?.setor || "" }),
        agendamento_id: form.agendamento_id,
        data_atendimento: form.data_atendimento,
        hora_atendimento: form.hora_atendimento,
        queixa_principal: form.queixa_principal,
        anamnese: form.anamnese,
        sinais_sintomas: form.sinais_sintomas,
        exame_fisico: form.exame_fisico,
        hipotese: form.hipotese,
        conduta: form.conduta,
        prescricao: listaPrescricao.length > 0 ? JSON.stringify({ medicamentos: listaPrescricao }) : form.prescricao,
        solicitacao_exames: listaExames.length > 0 ? JSON.stringify({ exames: listaExames }) : form.solicitacao_exames,
        evolucao: form.evolucao,
        observacoes: JSON.stringify({ especialidade_fields: especialidadeFields, texto: form.observacoes, dynamic_fields: dynamicFields }),
        custom_data: {
          ...getCustomDataObject(form),
          ...dynamicFields,
          ...especialidadeFields,
          ...Object.fromEntries(Object.entries(especialidadeFields || {}).map(([key, value]) => [`esp_${key}`, value])),
        },

        indicacao_retorno: form.indicacao_retorno === "no_indication" ? "" : form.indicacao_retorno || "",
        motivo_alteracao: editId ? form.motivo_alteracao : "",
        procedimentos_texto: procTexto || form.procedimentos_texto || "",
        outro_procedimento: form.outro_procedimento || "",
        tipo_registro: 'sessao',
        soap_subjetivo: soapPayload.subjetivo,
        soap_objetivo: soapPayload.objetivo,
        soap_avaliacao: soapPayload.avaliacao,
        soap_plano: soapPayload.plano,
      };
      if (form.episodio_id && form.episodio_id !== "no_episode") record.episodio_id = form.episodio_id;

      if (editId) {
        if (!record.profissional_id) { delete record.profissional_id; delete record.profissional_nome; }
        const { data: updated, error } = await (supabase as any).from("prontuarios").update(record).eq("id", editId).select("id").maybeSingle();
        if (error) throw error;
        if (!updated?.id) throw new Error("Nenhum prontuário foi atualizado. Verifique o ID do registro e as permissões.");
      } else {
        const { data: inserted, error } = await (supabase as any).from("prontuarios").insert(record).select("id").single();
        if (error) throw error;
        prontuarioId = inserted?.id;
        insertedNewProntuario = true;
      }

      if (prontuarioId) {
        const validLinks = selectedProcIds.map(pid => {
          const proc = procedimentos.find(p => p.id === pid);
          return {
            prontuario_id: prontuarioId,
            procedimento_id: proc?.uuid || pid,
            cids_selecionados: Array.from(new Set(selectedCidsByProc[pid] || [])),
            quantidade: procDetails[pid]?.quantidade || 1,
            observacao: procDetails[pid]?.observacao || "",
          };
        }).filter(l => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(l.procedimento_id));

        const { error: deleteError } = await (supabase as any).from("prontuario_procedimentos").delete().eq("prontuario_id", prontuarioId);
        if (!deleteError && validLinks.length > 0) {
          const { error: insertError } = await (supabase as any).from("prontuario_procedimentos").insert(validLinks);
          if (insertError) {
            console.error("[RegistrarSessao] Erro ao inserir procedimentos:", insertError);
          }
        } else if (deleteError) {
          console.error("[RegistrarSessao] Erro ao remover procedimentos:", deleteError);
        }
      }

      const procedureDone = procTexto || form.procedimentos_texto?.trim() || form.outro_procedimento?.trim() || form.queixa_principal?.trim() || 'Sessão registrada';
      const result = await treatmentService.registerCompletedSession({
        cycle: sessaoCycle,
        session: currentSessionForRegistration,
        soap: soapPayload,
        procedureDone,
        userId: user?.id,
        appointmentId: form.agendamento_id || currentSessionForRegistration.appointment_id || null,
      });

      if (result.cycleStatus === 'concluido') {
        toast.info('🎉 Ciclo de tratamento concluído!');
      }

      await logAction({
        acao: 'sessao_registrada',
        entidade: 'treatment_session',
        entidadeId: currentSessionForRegistration.id,
        modulo: 'prontuario',
        user,
        detalhes: { paciente: form.paciente_nome, sessao_numero: currentSessionForRegistration.session_number, ciclo_id: sessaoCycle.id },
      });
      toast.success(`✅ Sessão ${currentSessionForRegistration.session_number} registrada com sucesso!`);

      if (prontuarioId) setEditId(prontuarioId);

      await Promise.all([
        loadProntuarios(),
        refreshAgendamentos(),
        loadSessaoData(buildTreatmentContext()),
      ]);
      setSessionRegistrationRequested(false);
    } catch (err: any) {
      if (insertedNewProntuario && prontuarioId) {
        try {
          await (supabase as any).from("prontuario_procedimentos").delete().eq("prontuario_id", prontuarioId);
          await (supabase as any).from("prontuarios").delete().eq("id", prontuarioId);
        } catch {}
      }
      console.error("Erro ao registrar sessão:", err);
      toast.error(err?.message?.startsWith('Preencha') ? err.message : '❌ Erro ao registrar sessão. Tente novamente.');
    } finally {
      setSaving(false);
      registeringSessionRef.current = false;
    }
  };

  // Confirm any individual session (including past dates) — no SOAP required, no prontuário close
  const handleConfirmSession = async (session: CycleSession) => {
    if (!sessaoCycle) return;
    setConfirmingSessionId(session.id);
    try {
      // Minimal registration: mark as realizada, update cycle counter
      const result = await treatmentService.registerCompletedSession({
        cycle: sessaoCycle,
        session,
        soap: null, // SOAP not required for simple confirmation
        procedureDone: 'Comparecimento confirmado',
        userId: user?.id,
        appointmentId: session.appointment_id || null,
      });

      if (result.cycleStatus === 'concluido') {
        toast.info('🎉 Ciclo de tratamento concluído!');
      }

      await logAction({
        acao: 'sessao_confirmada',
        entidade: 'treatment_session',
        entidadeId: session.id,
        modulo: 'prontuario',
        user,
        detalhes: { paciente: form.paciente_nome, sessao_numero: session.session_number, ciclo_id: sessaoCycle.id },
      });
      toast.success(`✅ Sessão ${session.session_number} confirmada!`);

      // Refresh data
      await Promise.all([
        loadSessaoData(buildTreatmentContext()),
        refreshAgendamentos(),
      ]);
    } catch (err: any) {
      console.error("Erro ao confirmar sessão:", err);
      toast.error(err?.message?.startsWith('Preencha') ? err.message : '❌ Erro ao confirmar sessão.');
    } finally {
      setConfirmingSessionId(null);
    }
  };

  const handleDesmarcarSessao = async (session: CycleSession) => {
    if (session.status === "realizada") {
      toast.error("Sessão já realizada não pode ser desmarcada.");
      return;
    }

    const confirmed = window.confirm(
      `Desmarcar a sessão ${session.session_number}/${session.total_sessions}?\n\nO agendamento será EXCLUÍDO da agenda (horário liberado) e a sessão voltará para "Aguardando agendamento".`
    );
    if (!confirmed) return;

    try {
      if (session.appointment_id) {
        const { error: delErr } = await supabase.from("agendamentos").delete().eq("id", session.appointment_id);
        if (delErr) throw delErr;
      }

      const { error } = await supabase
        .from("treatment_sessions")
        .update({
          status: "pendente_agendamento",
          appointment_id: null,
        })
        .eq("id", session.id);
      if (error) throw error;

      await logAction({
        acao: "desmarcar_sessao",
        entidade: "treatment_session",
        entidadeId: session.id,
        modulo: "prontuario",
        user,
        detalhes: {
          ciclo: sessaoCycle?.id,
          sessao: session.session_number,
          agendamento_excluido: session.appointment_id,
        },
      });

      toast.success(`Sessão ${session.session_number} desmarcada e horário liberado na agenda.`);
      await Promise.all([
        loadSessaoData(buildTreatmentContext()),
        refreshAgendamentos(),
      ]);
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao desmarcar sessão: " + (err?.message || ""));
    }
  };

  const handleClearRealizada = async (session: CycleSession) => {
    if (!sessaoCycle) return;
    const confirmed = window.confirm(
      `Tem certeza que deseja limpar a sessão ${session.session_number}/${session.total_sessions}?\n\nIsto reverterá o status para "Agendada" e apagará os dados clínicos.`
    );
    if (!confirmed) return;
    try {
      const { error } = await supabase
        .from("treatment_sessions")
        .update({
          status: "agendada",
          clinical_notes: "",
          procedure_done: "",
        })
        .eq("id", session.id);
      if (error) throw error;

      const completedCount = sessaoCycleSessions.filter(s => s.id !== session.id && s.status === 'realizada').length;
      const { error: cycErr } = await supabase
        .from("treatment_cycles")
        .update({
          sessions_done: completedCount,
          status: 'em_andamento',
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessaoCycle.id);
      if (cycErr) throw cycErr;

      await logAction({
        acao: "limpar_sessao_realizada",
        entidade: "treatment_session",
        entidadeId: session.id,
        modulo: "prontuario",
        user,
        detalhes: { ciclo: sessaoCycle.id, sessao: session.session_number },
      });

      toast.success(`Sessão ${session.session_number} retornada ao status Agendada.`);
      await loadSessaoData(buildTreatmentContext());
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao limpar sessão: " + err.message);
    }
  };

  const handleDelete = async (p: ProntuarioDB) => {
    try {
      await (supabase as any).from("prontuario_procedimentos").delete().eq("prontuario_id", p.id);
      await (supabase as any).from("prontuarios").delete().eq("id", p.id);
      await logAction({
        acao: "excluir",
        entidade: "prontuario",
        entidadeId: p.id,
        detalhes: { paciente: p.paciente_nome, profissional: p.profissional_nome, data: p.data_atendimento },
        user,
      });
      // Optimistic local update + cache invalidation to stay in sync with React Query
      queryClient.setQueryData<ProntuarioDB[]>(prontuariosQueryKey, (prev) =>
        (prev || []).filter((pr) => pr.id !== p.id),
      );
      queryClient.invalidateQueries({ queryKey: prontuariosQueryKey });
      toast.success("Prontuário excluído!");
    } catch (err) {
      console.error("Error deleting:", err);
      toast.error("Erro ao excluir prontuário.");
    }
  };

  const handlePrint = (p: ProntuarioDB) => {
    downloadProntuarioPdf(p.id);
    toast.success("Preparando impressão...");
  };

  const handlePrintFullHistory = (pacienteId: string, pacienteNome: string) => {
    const patientRecords = prontuarios
      .filter((p) => p.paciente_id === pacienteId)
      .sort((a, b) => b.data_atendimento.localeCompare(a.data_atendimento));
    if (patientRecords.length === 0) {
      toast.info("Nenhum prontuário encontrado para este paciente.");
      return;
    }
    const pac = pacientes.find((px) => px.id === pacienteId);
    logAction({
      acao: "historico_completo_exportado_pdf",
      entidade: "prontuario",
      entidadeId: pacienteId,
      modulo: "prontuario",
      user,
      detalhes: { paciente_nome: pacienteNome, paciente_cpf: pac?.cpf || "", total_registros: patientRecords.length },
    });

    const allSections = patientRecords.map((p) => {
      const unidadeNome = unidades.find((u) => u.id === p.unidade_id)?.nome || p.unidade_id;
      const fields = [
        { title: "Queixa Principal", content: p.queixa_principal },
        { title: "S — Subjetivo", content: (p as any).soap_subjetivo },
        { title: "O — Objetivo", content: (p as any).soap_objetivo },
        { title: "A — Avaliação", content: (p as any).soap_avaliacao },
        { title: "P — Plano", content: (p as any).soap_plano },
        { title: "Evolução / Conduta", content: p.conduta || p.evolucao },
        { title: "Procedimentos", content: p.procedimentos_texto },
        { title: "Prescrição", content: p.prescricao },
        { title: "Observações", content: p.observacoes },
      ].filter((s) => s.content).map(
        (s) => `<div class="section"><div class="section-title">${s.title}</div><div class="section-content" style="font-size:10pt;">${s.content}</div></div>`
      ).join("");

      return `
        <div style="page-break-inside:avoid;margin-bottom:12px;border-bottom:1px solid #eee;padding-bottom:8px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:9pt;font-weight:700;color:#0369a1;">
            <span>${new Date(p.data_atendimento + "T12:00:00").toLocaleDateString("pt-BR")} ${p.hora_atendimento || ""}</span>
            <span style="color:#666;">Prof. ${p.profissional_nome} &middot; ${unidadeNome}</span>
          </div>
          <div style="padding-left: 8px; border-left: 2px solid #f1f5f9;">
            ${fields}
          </div>
        </div>`;
    }).join("");

    const body = `
      <div class="info-grid">
        <div class="info-item"><span class="info-label">Paciente:</span><span class="info-value">${pacienteNome}</span></div>
        <div class="info-item"><span class="info-label">CPF:</span><span class="info-value">${pac?.cpf || "—"}</span></div>
        <div class="info-item"><span class="info-label">Data Nasc:</span><span class="info-value">${pac?.dataNascimento ? new Date(pac.dataNascimento + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</span></div>
      </div>
      <h3 style="margin:12px 0 8px;font-size:12pt;font-weight:700;color:#0c4a6e;text-transform:uppercase;border-bottom:2px solid #0369a1;">Histórico Clínico Completo</h3>
      ${allSections}`;
    openPrintDocument(`Histórico Clínico — ${pacienteNome}`, body, { Paciente: pacienteNome });
  };

  // ---- PTS inline creation ----
  const handleCreatePTS = async () => {
    if (!form.paciente_id || !ptsForm.diagnostico_funcional || !ptsForm.objetivos_terapeuticos) {
      toast.error("Preencha diagnóstico funcional e objetivos terapêuticos.");
      return;
    }
    setPtsSaving(true);
    try {
      const { data: inserted, error } = await supabase.from("pts").insert({
        patient_id: form.paciente_id,
        professional_id: user?.id || "",
        unit_id: user?.unidadeId || "",
        diagnostico_funcional: ptsForm.diagnostico_funcional,
        objetivos_terapeuticos: ptsForm.objetivos_terapeuticos,
        metas_curto_prazo: ptsForm.metas_curto_prazo,
        metas_medio_prazo: ptsForm.metas_medio_prazo,
        metas_longo_prazo: ptsForm.metas_longo_prazo,
        especialidades_envolvidas: ptsForm.especialidades,
        status: "ativo",
      }).select("id").single();
      if (error) throw error;
      await logAction({
        acao: "criar_pts",
        entidade: "pts",
        entidadeId: inserted?.id || "",
        modulo: "prontuario",
        user,
        detalhes: { paciente: form.paciente_nome },
      });
      toast.success("PTS criado com sucesso!");
      setPtsOpen(false);
      setPtsForm({ diagnostico_funcional: '', objetivos_terapeuticos: '', metas_curto_prazo: '', metas_medio_prazo: '', metas_longo_prazo: '', especialidades: [] });
    } catch (err: any) {
      toast.error("Erro ao criar PTS: " + (err?.message || ""));
    }
    setPtsSaving(false);
  };

  const handleCreateCycle = async () => {
    if (!form.paciente_id || !cycleForm.treatment_type) {
      toast.error("Preencha tipo de tratamento.");
      return;
    }
    if (isWeekdayFrequency(cycleForm.frequency) && cycleForm.weekdays.length !== getMaxWeekdays(cycleForm.frequency)) {
      toast.error(`Selecione exatamente ${getMaxWeekdays(cycleForm.frequency)} dia(s) da semana.`);
      return;
    }
    setCycleSaving(true);
    try {
      const totalSessions = cycleForm.frequency === 'manual'
        ? cycleForm.total_sessions
        : calculateTotalSessions(cycleForm.frequency, cycleForm.duration_months, cycleForm.weekdays);

      const blockedRanges = buildBlockedRanges(bloqueios, user?.id || '', user?.unidadeId || '');
      const { dates: sessionDates, skippedCount } = generateSessionDatesWithInfo(cycleForm.start_date, cycleForm.frequency, cycleForm.weekdays, totalSessions, blockedRanges);
      const endDate = calcEndDateFromSessions(sessionDates);

      if (skippedCount > 0) {
        toast.info(`${skippedCount} sessão(ões) foram realocadas devido a feriados ou bloqueios no calendário.`);
      }

      const { data: cycleData, error: cycleError } = await supabase.from("treatment_cycles").insert({
        patient_id: form.paciente_id,
        professional_id: user?.id || "",
        unit_id: user?.unidadeId || "",
        specialty: user?.profissao || "",
        treatment_type: cycleForm.treatment_type,
        start_date: cycleForm.start_date,
        end_date_predicted: endDate,
        total_sessions: totalSessions,
        sessions_done: 0,
        frequency: cycleForm.frequency,
        status: "em_andamento",
        clinical_notes: cycleForm.clinical_notes,
        created_by: user?.id || "",
      }).select().single();
      if (cycleError) throw cycleError;

      const sessionsToCreate = sessionDates.map((date, i) => ({
        cycle_id: cycleData.id,
        patient_id: form.paciente_id,
        professional_id: user?.id || "",
        session_number: i + 1,
        total_sessions: totalSessions,
        scheduled_date: date,
        status: "pendente_agendamento",
      }));
      await supabase.from("treatment_sessions").insert(sessionsToCreate);

      await logAction({
        acao: "criar_ciclo_tratamento",
        entidade: "treatment_cycle",
        entidadeId: cycleData.id,
        modulo: "prontuario",
        user,
        detalhes: { paciente: form.paciente_nome, tipo: cycleForm.treatment_type, sessoes: totalSessions },
      });
      toast.success(`Ciclo criado com ${totalSessions} sessões! Aguardam agendamento pela recepção.`);
      setCycleOpen(false);
      setCycleForm({ treatment_type: '', total_sessions: 0, frequency: '1x_semana', start_date: todayLocalStr(), clinical_notes: '', weekdays: [], duration_months: 3 });
    } catch (err: any) {
      toast.error("Erro ao criar ciclo: " + (err?.message || ""));
    }
    setCycleSaving(false);
  };

  const queryPacienteId = searchParams.get("pacienteId");
  const deferredSearch = useDeferredValue(search);
  const pacienteByIdMap = useMemo(() => {
    const m = new Map<string, any>();
    pacientes.forEach((p: any) => m.set(p.id, p));
    return m;
  }, [pacientes]);
  const filtered = useMemo(() => {
    return prontuarios.filter((p) => {
      if (queryPacienteId) return p.paciente_id === queryPacienteId;
      if (!deferredSearch) return true;
      const term = deferredSearch.toLowerCase();
      const termDigits = term.replace(/[.\-/]/g, "");
      const pac = pacienteByIdMap.get(p.paciente_id);
      return (
        p.paciente_nome.toLowerCase().includes(term) ||
        p.profissional_nome.toLowerCase().includes(term) ||
        ((pac?.cpf || "").replace(/[.\-/]/g, "").includes(termDigits)) ||
        ((pac?.cns || "").includes(termDigits))
      );
    });
  }, [prontuarios, queryPacienteId, deferredSearch, pacienteByIdMap]);

  // Virtualized list — render only visible rows for instant scroll on huge lists
  const listParentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 132,
    overscan: 8,
    measureElement: (el) => el?.getBoundingClientRect().height ?? 132,
  });
  const queryPacienteNome = searchParams.get("pacienteNome");

  // Stable derived data for the side history panel — prevents re-renders on every keystroke
  const pacienteForPanel = useMemo(() => {
    if (form.paciente_id) {
      return pacienteByIdMap.get(form.paciente_id) || (form.paciente_nome ? { nome: form.paciente_nome } : null);
    }
    return form.paciente_nome ? { nome: form.paciente_nome } : null;
  }, [form.paciente_id, form.paciente_nome, pacienteByIdMap]);

  const funcionariosLight = useMemo(
    () => funcionarios.map(f => ({ id: f.id, nome: f.nome, profissao: f.profissao || "", ativo: f.ativo ?? true })),
    [funcionarios],
  );

  const handleViewProntuarioFromHistory = useCallback((p: any) => {
    loadFullProntuario(p.id)
      .then(setViewerProntuario)
      .catch((err) => {
        console.error("Erro ao carregar prontuário completo:", err);
        toast.error("Não foi possível carregar o prontuário completo.");
      });
  }, [loadFullProntuario]);

  const selectedPacienteCpf = useMemo(() => pacientes.find(p => p.id === form.paciente_id)?.cpf, [pacientes, form.paciente_id]);
  const selectedPacienteCns = useMemo(() => pacientes.find(p => p.id === form.paciente_id)?.cns, [pacientes, form.paciente_id]);
  const unidadeAtualNome = useMemo(() => unidades.find(u => u.id === user?.unidadeId)?.nome, [unidades, user?.unidadeId]);
  const soapValues = useMemo(() => ({
    soap_subjetivo: form.soap_subjetivo,
    soap_objetivo: form.soap_objetivo,
    soap_avaliacao: form.soap_avaliacao,
    soap_plano: form.soap_plano,
  }), [form.soap_avaliacao, form.soap_objetivo, form.soap_plano, form.soap_subjetivo]);
  const triagemHeaderData = useMemo(() => triagem ? {
    pressao_arterial: triagem.pressao_arterial,
    temperatura: triagem.temperatura,
    saturacao_oxigenio: triagem.saturacao_oxigenio,
    frequencia_cardiaca: triagem.frequencia_cardiaca,
    classificacao_risco: (triagem as any).classificacao_risco,
  } : null, [triagem]);
  const handleSoapChange = useCallback((field: keyof typeof soapValues, value: string) => {
    setForm(p => ((p as any)[field] === value ? p : { ...p, [field]: value }));
  }, []);
  const handleClearSoapErrors = useCallback(() => setSoapErrors(false), []);
  const handleEspecialidadeChange = useCallback((key: string, val: string) => {
    setEspecialidadeFields(prev => (prev[key] === val ? prev : { ...prev, [key]: val }));
  }, []);
  const handlePacienteChange = useCallback((id: string, nome: string) => {
    setForm((prev) => prev.paciente_id === id && prev.paciente_nome === nome ? prev : { ...prev, paciente_id: id, paciente_nome: nome });
    if (id) loadEpisodios(id);
  }, []);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">
            {queryPacienteId ? `Prontuários — ${queryPacienteNome || "Paciente"}` : "Prontuários"}
          </h1>
          <p className="text-muted-foreground text-sm">{filtered.length} registro(s)</p>
        </div>
        <div className="flex gap-2 flex-wrap w-full sm:w-auto">
          {queryPacienteId && (
            <>
              <Button variant="outline" onClick={() => setShowHistorico(!showHistorico)}>
                <Activity className="w-4 h-4 mr-2" />
                {showHistorico ? "Ocultar" : "Ver"} Histórico
              </Button>
              <Button variant="default" onClick={() => setHistoricoCompletoOpen(true)} className="gradient-primary text-primary-foreground">
                <FileText className="w-4 h-4 mr-2" />
                Histórico Completo
              </Button>
              <Button
                variant="outline"
                onClick={() => handlePrintFullHistory(queryPacienteId, queryPacienteNome || "Paciente")}
              >
                <Printer className="w-4 h-4 mr-2" />
                Imprimir Histórico Completo
              </Button>
              <Button
                variant="outline"
                onClick={() => setDocModalOpen(true)}
              >
                <Stamp className="w-4 h-4 mr-2" />
                Gerar Documento
              </Button>
              <Button
                variant="outline"
                onClick={() => setEncInternoOpen(true)}
              >
                <Send className="w-4 h-4 mr-2" />
                Encaminhar Paciente
              </Button>
              <Button variant="outline" onClick={() => navigate("/painel/prontuario")}>
                Ver todos
              </Button>
            </>
          )}
          {canEdit && (
            <Button onClick={() => openNew(queryPacienteId || undefined, queryPacienteNome || undefined)} className="gradient-primary text-primary-foreground">
              <Plus className="w-4 h-4 mr-2" />
              Novo Prontuário
            </Button>
          )}
        </div>
      </div>

      {queryPacienteId && showHistorico && (
        <Card className="shadow-card border-0">
          <CardContent className="p-4">
            <HistoricoClinico
              pacienteId={queryPacienteId}
              pacienteNome={queryPacienteNome || ""}
              currentProfissionalId={user?.id}
              unidades={unidades}
            />
          </CardContent>
        </Card>
      )}




      {queryPacienteId && (
        <Card className="shadow-card border-0">
          <CardContent className="p-4">
            <DocumentosHistorico
              pacienteId={queryPacienteId}
              pacienteNome={queryPacienteNome || "Paciente"}
            />
          </CardContent>
        </Card>
      )}

      {!queryPacienteId && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por paciente, profissional, CPF ou CNS..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setActiveAtendimento(null);
            setSessionRegistrationRequested(false);
            setSoapErrors(false);
          }
        }}
      >
        <DialogContent className="w-screen max-w-none h-screen sm:rounded-none p-0 flex flex-col overflow-hidden gap-0" onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader className="px-6 py-3 border-b border-border shrink-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <DialogTitle className="font-display">{editId ? "Editar" : "Novo"} Prontuário</DialogTitle>
              <div className="text-xs flex items-center gap-1.5" aria-live="polite">
                {autosaveStatus === 'saving' && (
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> Salvando…
                  </span>
                )}
                {autosaveStatus === 'saved' && autosaveAt && (
                  <span className="text-success flex items-center gap-1.5">
                    <CheckCircle className="w-3 h-3" /> Salvo automaticamente às {autosaveAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {autosaveStatus === 'error' && (
                  <span className="text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3" /> Falha ao salvar — tentaremos novamente
                  </span>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 grid grid-cols-1 lg:grid-cols-[65%_35%] min-h-0 overflow-hidden">
          <div className="flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {activeAtendimento && (
            <AtendimentoTimer
              horaInicio={activeAtendimento.horaInicio}
              tempoLimite={tempoLimite}
              agendamentoId={activeAtendimento.agendamentoId}
            />
          )}

          {form.paciente_id && (
            <FichaPacienteCabecalho
              pacienteId={form.paciente_id}
              profissionalNome={form.paciente_id ? (funcionarios.find(f => f.id === (searchParams.get("profissionalId") || user?.id))?.nome || user?.nome || "") : ""}
              profissionalId={searchParams.get("profissionalId") || user?.id || ""}
              agendamentoId={form.agendamento_id || undefined}
              triagem={triagemHeaderData}
              funcionarios={funcionariosLight}
              onPacienteUpdated={loadProntuarios}
            />
          )}

          {triagem && (() => {
            const risco = (triagem as any).classificacao_risco as string | undefined;
            const RISCO_LABEL: Record<string, string> = {
              nao_urgente: "Não urgente",
              pouco_urgente: "Pouco urgente",
              urgente: "Urgente",
              muito_urgente: "Muito urgente",
              emergencia: "Emergência",
            };
            const RISCO_BG: Record<string, string> = {
              nao_urgente: "bg-emerald-50 text-emerald-700 border-emerald-200",
              pouco_urgente: "bg-amber-50 text-amber-700 border-amber-200",
              urgente: "bg-orange-50 text-orange-700 border-orange-200",
              muito_urgente: "bg-red-50 text-red-700 border-red-200",
              emergencia: "bg-red-100 text-red-800 border-red-300",
            };
            const vitais: { label: string; value: React.ReactNode }[] = [];
            if (triagem.peso) vitais.push({ label: "Peso", value: <>{triagem.peso} <span className="text-muted-foreground">kg</span></> });
            if (triagem.altura) vitais.push({ label: "Altura", value: <>{triagem.altura} <span className="text-muted-foreground">cm</span></> });
            if (triagem.imc) vitais.push({ label: "IMC", value: <>{triagem.imc} <span className="text-[10px] text-muted-foreground">({classificarIMC(triagem.imc)})</span></> });
            if (triagem.pressao_arterial) vitais.push({ label: "PA", value: <>{triagem.pressao_arterial} <span className="text-muted-foreground">mmHg</span></> });
            if (triagem.temperatura) vitais.push({ label: "Temp", value: <>{triagem.temperatura} <span className="text-muted-foreground">°C</span></> });
            if (triagem.frequencia_cardiaca) vitais.push({ label: "FC", value: <>{triagem.frequencia_cardiaca} <span className="text-muted-foreground">bpm</span></> });
            if (triagem.saturacao_oxigenio) vitais.push({ label: "SatO₂", value: <>{triagem.saturacao_oxigenio} <span className="text-muted-foreground">%</span></> });
            if (triagem.glicemia) vitais.push({ label: "Glicemia", value: <>{triagem.glicemia} <span className="text-muted-foreground">mg/dL</span></> });

            return (
              <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden pointer-events-none select-text">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 bg-muted/40 border-b border-border/40">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Heart className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold font-display text-foreground tracking-wide">
                        Dados da Triagem
                      </h3>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        Somente leitura · atendimento atual
                      </span>
                    </div>
                  </div>
                  {risco && RISCO_LABEL[risco] && (
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${RISCO_BG[risco] || "bg-muted text-muted-foreground border-border"}`}>
                      {RISCO_LABEL[risco]}
                    </span>
                  )}
                </div>

                {/* Body */}
                <div className="px-5 py-4 space-y-3">
                  {/* Alergias destacadas */}
                  {triagem.alergias && triagem.alergias.length > 0 && (
                    <div className="flex items-start gap-2 rounded-lg border-l-4 border-l-destructive bg-destructive/10 p-3">
                      <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <strong className="text-destructive">Alergias:</strong>{" "}
                        <span className="text-foreground">{triagem.alergias.join(", ")}</span>
                      </div>
                    </div>
                  )}

                  {/* Sinais vitais em grade */}
                  {vitais.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Sinais vitais
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {vitais.map((v, i) => (
                          <div key={i} className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{v.label}</p>
                            <p className="text-sm font-semibold text-foreground mt-0.5">{v.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Medicamentos em uso */}
                  {triagem.medicamentos && triagem.medicamentos.length > 0 && (
                    <div className="text-sm">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Medicamentos em uso
                      </p>
                      <p className="text-foreground">{triagem.medicamentos.join(", ")}</p>
                    </div>
                  )}

                  {/* Comorbidades e Sintomas */}
                  {(triagem.custom_data?.comorbidades?.length > 0 || triagem.custom_data?.sintomas_30_dias?.length > 0) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border/40 pt-3">
                      {triagem.custom_data?.comorbidades?.length > 0 && (
                        <div className="text-sm">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                            Comorbidades
                          </p>
                          <p className="text-foreground">{triagem.custom_data.comorbidades.join(", ")}</p>
                        </div>
                      )}
                      {triagem.custom_data?.sintomas_30_dias?.length > 0 && (
                        <div className="text-sm">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                            Sintomas (últimos 30 dias)
                          </p>
                          <p className="text-foreground">{triagem.custom_data.sintomas_30_dias.join(", ")}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Queixa */}
                  {triagem.queixa && (
                    <div className="text-sm">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Queixa principal
                      </p>
                      <p className="text-foreground whitespace-pre-wrap leading-relaxed">{triagem.queixa}</p>
                    </div>
                  )}

                  {/* Rodapé: profissional/data */}
                  {(triagem.tecnico_nome || triagem.confirmado_em) && (
                    <div className="text-[11px] text-muted-foreground pt-2 border-t border-border/40">
                      Realizada por{" "}
                      <strong className="text-foreground">{triagem.tecnico_nome || "—"}</strong>
                      {triagem.tecnico_coren && ` · COREN ${triagem.tecnico_coren}`}
                      {triagem.confirmado_em &&
                        ` · ${new Date(triagem.confirmado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          {form.agendamento_id && !triagem && (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-5 py-4 text-center">
              <p className="text-sm text-muted-foreground italic">
                Nenhuma triagem registrada para este atendimento.
              </p>
            </div>
          )}

          {/* Histórico central removido — exibido apenas no painel lateral direito */}

          {/* form-content (was space-y-4 wrapper, removed for Tabs layout) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Paciente *</Label>
                <BuscaPaciente
                  pacientes={pacientes}
                  value={form.paciente_id}
                  onChange={handlePacienteChange}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Data *</Label>
                  <Input
                    type="date"
                    value={form.data_atendimento}
                    onChange={(e) => setForm((p) => ({ ...p, data_atendimento: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Hora</Label>
                  <Input
                    type="time"
                    value={form.hora_atendimento}
                    onChange={(e) => setForm((p) => ({ ...p, hora_atendimento: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Seletor de Profissional Responsável — somente Master ao editar */}
            {editId && user?.role === 'master' && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <Label className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Profissional Responsável pelo Atendimento *
                </Label>
                <Select
                  value={form.profissional_id || ""}
                  onValueChange={(v) => {
                    const f = funcionarios.find((x) => x.id === v);
                    setForm((p) => ({
                      ...p,
                      profissional_id: v,
                      profissional_nome: f?.nome || p.profissional_nome,
                    }));
                  }}
                >
                  <SelectTrigger className="mt-1 bg-background">
                    <SelectValue placeholder="Selecione o profissional responsável" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {funcionarios
                      .filter((f) => f.ativo !== false)
                      .map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nome}{f.profissao ? ` — ${f.profissao}` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Como Master, você pode corrigir o profissional responsável. A alteração ficará registrada na auditoria. O autor da edição (você) é gravado separadamente.
                </p>
              </div>
            )}

            {episodios.length > 0 && (
              <div>
                <Label>Episódio Clínico / Tratamento Ativo</Label>
                <Select
                  value={form.episodio_id || "no_episode"}
                  onValueChange={(v) => setForm((p) => ({ ...p, episodio_id: v === "no_episode" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Vincular a um tratamento (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_episode">Nenhum</SelectItem>
                    {episodios.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.titulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Tipo de Registro */}
            <div>
              <Label>Tipo de Registro *</Label>
              <Select
                value={form.tipo_registro}
                onValueChange={(v) => {
                  setSessionRegistrationRequested((prev) => (v === 'sessao' ? prev : false));
                  setForm((p) => ({ ...p, tipo_registro: v }));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_REGISTRO.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ===== TYPE-SPECIFIC FORM SECTIONS ===== */}

            {/* SOAP Evolution — ALL 5 types */}
            <SoapFieldsAdaptive
              profissao={effectiveProfissao}
              values={soapValues}
              onChange={handleSoapChange}
              soapErrors={soapErrors}
              onClearErrors={handleClearSoapErrors}
              soapEnabled={soapEnabled}
              onToggleSoap={setSoapEnabled}
              highlightSOAP={sessaoHighlightSOAP}
              soapRef={soapRef as React.RefObject<HTMLDivElement>}
              customOptionsForField={showSoapDropdown ? soapCustom.getOptionsForField : undefined}
              customOptionsWithId={showSoapDropdown ? soapCustom.getOptionWithId : undefined}
              onAddCustomOption={showSoapDropdown ? (campo, opcao) => soapCustom.addOption(campo, opcao, effectiveProfissao || '') : undefined}
              onDeleteCustomOption={showSoapDropdown ? soapCustom.deleteOption : undefined}
            />

            {/* 🟢 PRONTUÁRIO 1 — AVALIAÇÃO INICIAL */}
            {form.tipo_registro === 'avaliacao_inicial' && (
              <div className="space-y-4">
                <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    Avaliação Inicial
                  </h4>
                  <DynamicProntuarioFields
                    fields={structureFields}
                    values={form}
                    onChange={(k, v) => setForm(p => ({ ...p, [k]: v }))}
                  />
                </div>

                {/* Card de Especialidade */}
                {user?.profissao && (
                  <CamposEspecialidade
                    profissao={user.profissao}
                    profissionalId={user.id}
                    tipoProntuario={form.tipo_registro === 'avaliacao_inicial' ? 'avaliacao' : form.tipo_registro as any}
                    values={especialidadeFields}
                    onChange={handleEspecialidadeChange}
                  />
                )}


                {/* Decisão Clínica: PTS / Tratamento */}
                {!editId && form.paciente_id && (
                  <div className="bg-muted/30 rounded-lg p-4 border space-y-3">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Heart className="w-4 h-4 text-primary" /> Decisão Clínica (opcional)
                    </h3>
                    <p className="text-xs text-muted-foreground">Crie PTS ou ciclo de tratamento para este paciente.</p>
                    <div className="flex gap-2 flex-wrap">
                      <Button type="button" variant="outline" size="sm" onClick={() => setPtsOpen(true)}>
                        <ClipboardList className="w-3.5 h-3.5 mr-1" /> Criar PTS
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setCycleOpen(true)}>
                        <Activity className="w-3.5 h-3.5 mr-1" /> Criar Ciclo de Tratamento
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 🔵 PRONTUÁRIO 2 — RETORNO */}
            {form.tipo_registro === 'retorno' && (
              <div className="space-y-4">
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    Retorno
                  </h4>
                  <div className="space-y-4">
                    {patientHistory.length > 0 && (
                      <div className="bg-muted/50 rounded-md p-2 border">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Resumo do último atendimento (somente leitura)</p>
                        <p className="text-sm text-foreground">{patientHistory[0]?.queixa_principal || "Sem queixa registrada"}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(patientHistory[0]?.data_atendimento + "T12:00:00").toLocaleDateString("pt-BR")} — {patientHistory[0]?.profissional_nome}
                        </p>
                      </div>
                    )}
                    <DynamicProntuarioFields
                      fields={structureFields}
                      values={form}
                      onChange={(k, v) => setForm(p => ({ ...p, [k]: v }))}
                    />
                  </div>
                </div>

                {user?.profissao && (
                  <CamposEspecialidade
                    profissao={user.profissao}
                    profissionalId={user.id}
                    tipoProntuario={form.tipo_registro as any}
                    values={especialidadeFields}
                    onChange={handleEspecialidadeChange}
                  />
                )}
              </div>
            )}

            {/* 🟡 PRONTUÁRIO 3 — SESSÃO */}
            {form.tipo_registro === 'sessao' && (
              <div className="space-y-4">
                {sessaoDataLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : (
                  <>
                    {/* 1. CICLO DE TRATAMENTO ATIVO */}
                    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                      <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <Activity className="w-4 h-4 text-primary" /> Ciclo de Tratamento Ativo
                        </h4>
                        {sessaoCycle && (
                          <Badge variant={sessaoCycle.status === 'em_andamento' ? 'default' : sessaoCycle.status === 'concluido' ? 'secondary' : 'outline'} className="text-[10px] h-5">
                            {sessaoCycle.status === 'em_andamento' ? 'Em andamento' : sessaoCycle.status === 'concluido' ? 'Concluído' : sessaoCycle.status}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="p-4 space-y-4">
                        {sessaoCycle ? (
                          <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                              <div className="flex items-start gap-2">
                                <Activity className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                                <div>
                                  <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-semibold">Tratamento</span>
                                  <strong className="text-foreground">{sessaoCycle.treatment_type}</strong>
                                </div>
                              </div>
                              <div className="flex items-start gap-2">
                                <Target className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                                <div>
                                  <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-semibold">Especialidade</span>
                                  <strong className="text-foreground">{sessaoCycle.specialty || '—'}</strong>
                                </div>
                              </div>
                              <div className="flex items-start gap-2">
                                <User className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                                <div>
                                  <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-semibold">Profissional</span>
                                  <strong className="text-foreground">
                                    {funcionarios.find(f => f.id === sessaoCycle.professional_id)?.nome || '—'}
                                  </strong>
                                </div>
                              </div>
                              <div className="flex items-start gap-2">
                                <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                                <div>
                                  <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-semibold">Unidade</span>
                                  <strong className="text-foreground">
                                    {unidades.find(u => u.id === sessaoCycle.unit_id)?.nome || '—'}
                                  </strong>
                                </div>
                              </div>
                              <div className="flex items-start gap-2">
                                <Calendar className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                                <div>
                                  <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-semibold">Início</span>
                                  <strong className="text-foreground">{new Date(sessaoCycle.start_date + 'T12:00:00').toLocaleDateString('pt-BR')}</strong>
                                </div>
                              </div>
                              <div className="flex items-start gap-2">
                                <Clock className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                                <div>
                                  <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-semibold">Previsão</span>
                                  <strong className="text-foreground">{sessaoCycle.end_date_predicted ? new Date(sessaoCycle.end_date_predicted + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</strong>
                                </div>
                              </div>
                            </div>

                             <div className="pt-2 border-t space-y-2">
                               <div className="flex justify-between text-xs items-center">
                                 <span className="font-medium text-muted-foreground uppercase tracking-tight">Progresso do Ciclo</span>
                                 <Badge variant="secondary" className="h-4 text-[10px]">{Math.round((sessaoCycle.sessions_done / sessaoCycle.total_sessions) * 100)}%</Badge>
                               </div>
                               <Progress value={(sessaoCycle.sessions_done / sessaoCycle.total_sessions) * 100} className="h-1.5" />
                               <div className="flex justify-between text-[10px] text-muted-foreground">
                                 <span>{sessaoCycle.sessions_done} realizadas</span>
                                 <span>Total: {sessaoCycle.total_sessions} sessões</span>
                               </div>
                             </div>

                             <div className="pt-2 space-y-2">
                               <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest block mb-1">Sessões do ciclo</span>
                               <div className="max-h-[300px] overflow-y-auto border rounded-lg divide-y bg-background">
                                 {sessaoCycleSessions.map((s) => {
                                   const isPendente = s.status === "pendente_agendamento";
                                   const isAgendada = s.status === "agendada";
                                   const isRealizada = s.status === "realizada";
                                   const isFaltou = s.status === "paciente_faltou";
                                   
                                   const sessionStatusColors: Record<string, string> = {
                                     pendente_agendamento: "bg-warning/10 text-warning",
                                     agendada: "bg-info/10 text-info",
                                     realizada: "bg-success/10 text-success",
                                     paciente_faltou: "bg-destructive/10 text-destructive",
                                     cancelada: "bg-muted text-muted-foreground",
                                     remarcada: "bg-warning/10 text-warning",
                                   };

                                   return (
                                     <div key={s.id} className="p-2.5 flex flex-col gap-1.5">
                                       <div className="flex items-center gap-2">
                                         <span className="text-xs font-mono font-bold text-primary w-8 shrink-0">
                                           {s.session_number}/{s.total_sessions}
                                         </span>
                                         <div className="flex-1 min-w-0">
                                           <p className="text-xs font-medium">
                                             {s.scheduled_date ? new Date(s.scheduled_date + "T12:00:00").toLocaleDateString("pt-BR") : "Sem data"}
                                             {isPendente && <span className="ml-1 text-[10px] text-warning opacity-80">· Pendente</span>}
                                           </p>
                                         </div>
                                         <Badge className={cn("text-[9px] h-4 px-1.5 shrink-0", sessionStatusColors[s.status])}>
                                           {sessionStatusLabels[s.status] || s.status}
                                         </Badge>
                                       </div>
                                       
                                       <div className="flex gap-1.5 flex-wrap">
                                         {(isPendente || isAgendada) && sessaoCycle?.status === 'em_andamento' && (
                                           <Button 
                                             type="button" 
                                             size="sm" 
                                             variant="outline" 
                                             className="h-6 text-[10px] px-2 border-primary text-primary hover:bg-primary/5"
                                             onClick={() => {
                                               setAgendarSessaoTarget(s);
                                               setAgendarSessaoData("");
                                               setAgendarSessaoHora("");
                                               setAgendarSessaoSalaId("");
                                             }}
                                           >
                                             <Calendar className="w-2.5 h-2.5 mr-1" /> Agendar
                                           </Button>
                                         )}
                                         
                                         {isAgendada && sessaoCycle?.status === 'em_andamento' && (
                                           <>
                                             <Button 
                                               type="button" 
                                               size="sm" 
                                               variant="outline" 
                                               className="h-6 text-[10px] px-2 border-warning text-warning hover:bg-warning/5"
                                               onClick={() => setRemarcarTarget(s)}
                                             >
                                               <CalendarClock className="w-2.5 h-2.5 mr-1" /> Remarcar
                                             </Button>
                                             <Button 
                                               type="button" 
                                               size="sm" 
                                               variant="outline" 
                                               className="h-6 text-[10px] px-2 border-destructive text-destructive hover:bg-destructive/5"
                                               onClick={() => handleDesmarcarSessao(s)}
                                             >
                                               <X className="w-2.5 h-2.5 mr-1" /> Desmarcar
                                             </Button>
                                             {s.scheduled_date === todayLocalStr() && (
                                               <Button 
                                                 type="button" 
                                                 size="sm" 
                                                 variant="default" 
                                                 className="h-6 text-[10px] px-2 bg-success hover:bg-success/90"
                                                 onClick={() => handleConfirmSession(s)}
                                                 disabled={confirmingSessionId === s.id}
                                               >
                                                 {confirmingSessionId === s.id ? <Loader2 className="w-2.5 h-2.5 animate-spin mr-1" /> : <CheckCircle className="w-2.5 h-2.5 mr-1" />}
                                                 Confirmar
                                               </Button>
                                             )}
                                           </>
                                         )}

                                         {isRealizada && (
                                           <Button 
                                             type="button" 
                                             size="sm" 
                                             variant="outline" 
                                             className="h-6 text-[10px] px-2"
                                             onClick={() => handleClearRealizada(s)}
                                           >
                                             <Eraser className="w-2.5 h-2.5 mr-1" /> Limpar
                                           </Button>
                                         )}
                                       </div>
                                     </div>
                                   );
                                 })}
                               </div>
                             </div>

                            {(() => {
                              const nextSession = sessaoCycleSessions.find(s => s.status === 'agendada' && s.scheduled_date >= todayLocalStr());
                              const waitingSchedule = sessaoCycleSessions.filter(s => s.status === 'pendente_agendamento' || !s.appointment_id).length;
                              
                              if (!nextSession && waitingSchedule === 0) return null;
                              
                              return (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                                  {nextSession && (
                                    <div className="bg-primary/5 rounded-lg p-2 border border-primary/10">
                                      <span className="text-[9px] text-primary uppercase font-bold tracking-widest block">Próxima Sessão</span>
                                      <div className="flex items-center justify-between mt-1">
                                        <span className="text-xs font-semibold">{new Date(nextSession.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                        <span className="text-[10px] text-muted-foreground font-mono">#{nextSession.session_number}</span>
                                      </div>
                                    </div>
                                  )}
                                  {waitingSchedule > 0 && (
                                    <div className="bg-amber-500/5 rounded-lg p-2 border border-amber-500/10">
                                      <span className="text-[9px] text-amber-600 uppercase font-bold tracking-widest block">Aguardando Agenda</span>
                                      <div className="flex items-center justify-between mt-1">
                                        <span className="text-xs font-semibold">{waitingSchedule} sessões</span>
                                        <span className="text-[10px] text-muted-foreground">Pendente</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            <div className="flex flex-wrap gap-2 pt-2 border-t">
                              <Button 
                                type="button"
                                variant="outline" 
                                size="sm" 
                                className="h-8 text-xs gap-1.5"
                                onClick={() => navigate(`/painel/tratamentos?cycleId=${sessaoCycle.id}`)}
                              >
                                <Eye className="w-3 h-3" /> Detalhes
                              </Button>
                              <Button 
                                type="button"
                                variant="default" 
                                size="sm" 
                                className="h-8 text-xs gap-1.5 gradient-primary"
                                onClick={handleRegistrarSessaoClick}
                              >
                                <CheckCircle className="w-3 h-3" /> Registrar sessão
                              </Button>
                              <Button 
                                type="button"
                                variant="outline" 
                                size="sm" 
                                className="h-8 text-xs gap-1.5"
                                onClick={() => navigate(`/painel/tratamentos?cycleId=${sessaoCycle.id}&action=schedule`)}
                              >
                                <Calendar className="w-3 h-3" /> Agendar
                              </Button>
                              {!sessaoPts && (
                                <Button 
                                  type="button"
                                  variant="outline" 
                                  size="sm" 
                                  className="h-8 text-xs gap-1.5 border-purple-200 text-purple-600 hover:bg-purple-50"
                                  onClick={() => setPtsOpen(true)}
                                >
                                  <Link2 className="w-3 h-3" /> Vincular PTS
                                </Button>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                              <Activity className="w-5 h-5 text-muted-foreground/60" />
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-foreground">Nenhum ciclo de tratamento ativo.</p>
                              <p className="text-xs text-muted-foreground max-w-[280px]">Crie um ciclo para acompanhar o progresso terapêutico.</p>
                            </div>
                            <Button type="button" variant="default" size="sm" className="gradient-primary h-8" onClick={() => setCycleOpen(true)}>
                              <Plus className="w-3.5 h-3.5 mr-1" /> Criar ciclo
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 2. PTS VINCULADO */}
                    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                      <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <ClipboardList className="w-4 h-4 text-primary" /> PTS Vinculado
                        </h4>
                        {sessaoPts && (
                          <Badge variant="outline" className={cn(
                            "text-[10px] h-5",
                            sessaoPts.status === 'ativo' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-muted text-muted-foreground border-border'
                          )}>
                            {sessaoPts.status === 'ativo' ? 'Ativo' : sessaoPts.status}
                          </Badge>
                        )}
                      </div>

                      <div className="p-4 space-y-4">
                        {sessaoPts ? (
                          <>
                            <div className="space-y-3">
                              <div className="flex flex-wrap gap-1.5">
                                {sessaoPts.especialidades_envolvidas.map(e => (
                                  <Badge key={e} variant="secondary" className="text-[10px] h-5 px-2 bg-primary/5 text-primary border-primary/10 hover:bg-primary/10">{e}</Badge>
                                ))}
                              </div>

                              <div className="space-y-1">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest block">Diagnóstico Funcional</span>
                                <p className="text-sm text-foreground leading-relaxed line-clamp-2">{sessaoPts.diagnostico_funcional}</p>
                              </div>

                              <div className="space-y-1">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest block">Objetivos Terapêuticos</span>
                                <p className="text-sm text-foreground leading-relaxed line-clamp-2">{sessaoPts.objetivos_terapeuticos}</p>
                              </div>

                              <div className="grid grid-cols-1 gap-2">
                                <div className="rounded-lg p-2.5 border bg-primary/5 border-primary/10">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Target className="w-3 h-3 text-primary" />
                                    <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Metas de Curto Prazo</span>
                                  </div>
                                  <p className="text-xs text-foreground line-clamp-2">{sessaoPts.metas_curto_prazo || 'Não informada'}</p>
                                </div>
                                <div className="rounded-lg p-2.5 border bg-muted/30 border-border">
                                  <div className="flex items-center gap-2 mb-1">
                                    <ClipboardList className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Metas Médio/Longo Prazo</span>
                                  </div>
                                  <p className="text-xs text-foreground line-clamp-2">{sessaoPts.metas_medio_prazo || sessaoPts.metas_longo_prazo || 'Não informada'}</p>
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-2 text-[10px] text-muted-foreground border-t">
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" /> {new Date(sessaoPts.created_at).toLocaleDateString('pt-BR')}
                                </span>
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3" /> {funcionarios.find(f => f.id === sessaoPts.professional_id)?.nome || '—'}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2 pt-2 border-t">
                              <Button 
                                type="button"
                                variant="outline" 
                                size="sm" 
                                className="h-8 text-xs gap-1.5"
                                onClick={() => navigate(`/painel/pts?id=${sessaoPts.id}`)}
                              >
                                <Eye className="w-3 h-3" /> Ver PTS
                              </Button>
                              <Button 
                                type="button"
                                variant="outline" 
                                size="sm" 
                                className="h-8 text-xs gap-1.5"
                                onClick={() => navigate(`/painel/pts?id=${sessaoPts.id}&edit=true`)}
                              >
                                <Pencil className="w-3 h-3" /> Editar
                              </Button>
                              {!sessaoCycle?.pts_id && sessaoCycle && (
                                <Button 
                                  type="button"
                                  variant="outline" 
                                  size="sm" 
                                  className="h-8 text-xs gap-1.5 border-primary/20 text-primary hover:bg-primary/5"
                                  onClick={async () => {
                                    const { error } = await supabase
                                      .from('treatment_cycles')
                                      .update({ pts_id: sessaoPts.id })
                                      .eq('id', sessaoCycle.id);
                                    if (error) toast.error('Erro ao vincular PTS');
                                    else {
                                      toast.success('PTS vinculado com sucesso');
                                      loadSessaoData(buildTreatmentContext());
                                    }
                                  }}
                                >
                                  <Link2 className="w-3 h-3" /> Vincular ao Ciclo
                                </Button>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                              <ClipboardList className="w-5 h-5 text-muted-foreground/60" />
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-foreground">PTS não cadastrado.</p>
                              <p className="text-xs text-muted-foreground max-w-[280px]">Crie um Projeto Terapêutico Singular para registrar objetivos e metas.</p>
                            </div>
                            <Button type="button" variant="default" size="sm" className="gradient-primary h-8" onClick={() => setPtsOpen(true)}>
                              <Plus className="w-3.5 h-3.5 mr-1" /> Criar PTS
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 3-5. Sessão fields */}
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                      <h4 className="text-sm font-semibold text-foreground mb-3">🟡 Sessão</h4>
                      {currentSessionForRegistration && sessaoHighlightSOAP && (
                        <div className="bg-primary/10 border border-primary/30 rounded-md p-2 mb-3 text-sm text-primary font-medium">
                          Registre os dados da evolução para a Sessão {currentSessionForRegistration.session_number}
                        </div>
                      )}
                      {/* Campos dinâmicos da configuração agora são a fonte única de verdade */}
                    </div>
                    {/* Specific fields for Session */}
                    <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-yellow-500" />
                        Registro de Sessão
                      </h4>
                      <DynamicProntuarioFields
                        fields={structureFields}
                        values={form}
                        onChange={(k, v) => setForm(p => ({ ...p, [k]: v }))}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 🔴 PRONTUÁRIO 4 — URGÊNCIA */}
            {form.tipo_registro === 'urgencia' && (
              <div className="space-y-4">
                <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-destructive" />
                    Atendimento de Urgência
                  </h4>
                  {triagem && (
                    <div className="bg-muted/50 rounded-md p-3 border text-xs space-y-1 mb-4">
                      <p className="font-semibold mb-2">Sinais Vitais (Triagem)</p>
                      <div className="flex flex-wrap gap-4">
                        {triagem.pressao_arterial && <span>PA: <strong>{triagem.pressao_arterial}</strong></span>}
                        {triagem.frequencia_cardiaca && <span>FC: <strong>{triagem.frequencia_cardiaca} bpm</strong></span>}
                        {triagem.temperatura && <span>Temp: <strong>{triagem.temperatura}°C</strong></span>}
                        {triagem.saturacao_oxigenio && <span>SatO₂: <strong>{triagem.saturacao_oxigenio}%</strong></span>}
                        {triagem.glicemia && <span>Glicemia: <strong>{triagem.glicemia} mg/dL</strong></span>}
                      </div>
                    </div>
                  )}
                  <DynamicProntuarioFields
                    fields={structureFields}
                    values={form}
                    onChange={(k, v) => setForm(p => ({ ...p, [k]: v }))}
                  />
                </div>
              </div>
            )}

            {/* 🟣 PRONTUÁRIO 5 — PROCEDIMENTO */}
            {form.tipo_registro === 'procedimento' && (
              <div className="space-y-4">
                <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    Registro de Procedimento
                  </h4>
                  <DynamicProntuarioFields
                    fields={structureFields}
                    values={form}
                    onChange={(k, v) => setForm(p => ({ ...p, [k]: v }))}
                  />
                </div>
              </div>
            )}

            {/* Legacy types: show generic fields */}
            {!['avaliacao_inicial', 'retorno', 'sessao', 'urgencia', 'procedimento'].includes(form.tipo_registro) && (
              <div className="space-y-3">
                <div><Label>Queixa Principal</Label><DebouncedTextarea rows={2} value={form.queixa_principal} onChange={(e) => setForm((p) => ({ ...p, queixa_principal: e.target.value }))} /></div>
                <div><Label>Anamnese</Label><DebouncedTextarea rows={3} value={form.anamnese} onChange={(e) => setForm((p) => ({ ...p, anamnese: e.target.value }))} /></div>
                <div><Label>Sinais e Sintomas</Label><DebouncedTextarea rows={2} value={form.sinais_sintomas} onChange={(e) => setForm((p) => ({ ...p, sinais_sintomas: e.target.value }))} /></div>
                <div><Label>Exame Físico</Label><DebouncedTextarea rows={3} value={form.exame_fisico} onChange={(e) => setForm((p) => ({ ...p, exame_fisico: e.target.value }))} /></div>
                <div><Label>Hipótese / Avaliação</Label><DebouncedTextarea rows={2} value={form.hipotese} onChange={(e) => setForm((p) => ({ ...p, hipotese: e.target.value }))} /></div>
                <div><Label>Conduta</Label><DebouncedTextarea rows={2} value={form.conduta} onChange={(e) => setForm((p) => ({ ...p, conduta: e.target.value }))} /></div>
                <div><Label>Evolução</Label><DebouncedTextarea rows={2} value={form.evolucao} onChange={(e) => setForm((p) => ({ ...p, evolucao: e.target.value }))} /></div>
                <div><Label>Observações Gerais</Label><DebouncedTextarea rows={2} value={form.observacoes} onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))} /></div>
              </div>
            )}

            {/* Histórico de Procedimentos do Paciente */}
            {isProfBlocoVisible('procedimentos') && form.paciente_id && pacienteProcHistory.length > 0 && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <Label className="mb-2 flex items-center gap-2 text-primary">
                  <History className="h-4 w-4" /> Histórico do paciente
                </Label>
                <div className="flex flex-wrap gap-2">
                  {pacienteProcHistory.slice(0, 6).map((h) => (
                    <Button
                      key={h.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-auto py-1 text-xs"
                      onClick={() => {
                        if (!selectedProcIds.includes(h.id)) {
                          setSelectedProcIds((prev) => [...prev, h.id]);
                          setProcDetails(prev => ({ ...prev, [h.id]: { quantidade: 1, observacao: "" } }));
                          setExpandedProcId(h.id);
                          loadCidsForProc(h.id);
                        } else {
                          setExpandedProcId(h.id);
                        }
                      }}
                    >
                      <Clock className="h-3 w-3 mr-1" /> {h.nome}
                      <span className="ml-1 text-muted-foreground">({h.ultima})</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Procedimentos Realizados — checkboxes */}
            {isProfBlocoVisible('procedimentos') && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Procedimentos Realizados</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setNovoProcOpen(true)}>
                    <Plus className="h-3 w-3 mr-1" /> Novo Procedimento
                  </Button>
                </div>
                {/* === Busca Unificada SIGTAP + CID-10 (índices GIN trigram) === */}
                <div className="relative mb-2">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary pointer-events-none" />
                  <Input
                    value={unifiedQuery}
                    onChange={(e) => { setUnifiedQuery(e.target.value); setUnifiedOpen(true); }}
                    onFocus={() => unifiedQuery.trim().length >= 2 && setUnifiedOpen(true)}
                    onBlur={() => setTimeout(() => setUnifiedOpen(false), 150)}
                    placeholder="🔎 Buscar SIGTAP ou CID-10 (código ou descrição)..."
                    className="pl-7 h-9 text-sm border-primary/30 focus-visible:ring-primary"
                  />
                  {unifiedOpen && unifiedQuery.trim().length >= 2 && (
                    <div className="absolute z-50 left-0 right-0 mt-1 rounded-md border bg-popover shadow-lg max-h-[420px] overflow-y-auto">
                      {unifiedLoading && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Buscando em 4.990 procedimentos e 81k+ CIDs...</div>
                      )}
                      {!unifiedLoading && unifiedResults.procedimentos.length === 0 && unifiedResults.cids.length === 0 && (
                        <div className="px-3 py-3 text-xs text-muted-foreground text-center">Nenhum resultado encontrado.</div>
                      )}
                      {unifiedResults.procedimentos.length > 0 && (
                        <div>
                          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide bg-blue-500/10 text-blue-700 dark:text-blue-300 border-b">
                            🔵 Procedimentos SIGTAP ({unifiedResults.procedimentos.length})
                          </div>
                          {unifiedResults.procedimentos.map((p) => {
                            const already = selectedProcIds.includes(p.codigo);
                            const viaCid = p.matched_by === 'cid';
                            return (
                              <button
                                key={`p-${p.codigo}`}
                                type="button"
                                disabled={already}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => !already && handlePickProcedimento(p.codigo, p.nome)}
                                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex items-center gap-2 ${already ? 'opacity-50 cursor-not-allowed' : ''}`}
                                title={viaCid && p.cid_codigo ? `Vinculado pelo CID ${p.cid_codigo} — ${p.cid_descricao ?? ''}` : undefined}
                              >
                                <span className="font-mono text-[10px] text-muted-foreground shrink-0">{p.codigo}</span>
                                <span className="truncate flex-1">{p.nome}</span>
                                {viaCid && (
                                  <Badge variant="secondary" className="h-4 text-[9px] shrink-0">
                                    via CID {p.cid_codigo}
                                  </Badge>
                                )}
                                {already && <Badge variant="outline" className="h-4 text-[9px] shrink-0">já adicionado</Badge>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {unifiedResults.cids.length > 0 && (
                        <div>
                          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-b">
                            🟢 CID-10 ({unifiedResults.cids.length})
                          </div>
                          {unifiedResults.cids.map((c) => (
                            <button
                              key={`c-${c.codigo}`}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handlePickCid(c)}
                              className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex items-center gap-2"
                            >
                              <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-300 shrink-0">{c.codigo}</span>
                              <span className="truncate flex-1">{c.descricao}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Filtro local da lista de procedimentos disponíveis (mantido) */}
                <div className="relative mb-2">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    value={procSearch}
                    onChange={(e) => setProcSearch(e.target.value)}
                    placeholder="Filtrar lista abaixo (nome, código SIGTAP, especialidade)..."
                    className="pl-7 h-8 text-sm"
                  />
                </div>

                {/* Display selected procedures first */}
                {selectedProcIds.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-2 bg-primary/5 rounded-lg p-2 border border-primary/20">
                    <Label className="text-[10px] uppercase text-primary mb-1">Selecionados</Label>
                    {selectedProcIds.map(id => {
                      const proc = procedimentos.find(p => p.id === id);
                      if (!proc) return null;
                      
                      // Check if it's already in the filtered list to avoid duplication if user wants
                      // But for now, showing it here is enough.
                      const isExpanded = expandedProcId === proc.id;
                      const selCids = selectedCidsByProc[proc.id] || [];
                      
                      return (
                        <div key={`sel-${proc.id}`} className="rounded-md border bg-background border-primary/40 p-1.5 flex items-center gap-2">
                           <Checkbox
                              id={`sel-proc-${proc.id}`}
                              checked={true}
                              onCheckedChange={(c) => {
                                if (!c) setSelectedProcIds((prev) => prev.filter((pid) => pid !== id));
                              }}
                            />
                            <div className="flex-1 truncate cursor-pointer" onClick={() => toggleExpandProc(proc.id)}>
                              <span className="text-sm">
                                <span className="font-mono text-[10px] text-muted-foreground mr-2">{proc.id}</span>
                                {proc.nome}
                              </span>
                            </div>
                            {selCids.length > 0 && (
                              <Badge variant="secondary" className="h-5 text-[10px] shrink-0">{selCids.length} CID</Badge>
                            )}
                            {pacienteProcHistory.find(h => h.id === proc.id)?.isGlobal && (
                              <Badge variant="outline" className="h-5 text-[10px] shrink-0 border-primary text-primary">Vínculo Global</Badge>
                            )}
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleExpandProc(proc.id)}>
                              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                            </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {filteredProcedimentos.length > 0 ? (
                  <div className="flex flex-col gap-1.5 bg-muted/20 rounded-lg p-2 border max-h-72 overflow-y-auto">
                    {listedProcedimentos.map((proc) => {
                      const checked = selectedProcIdSet.has(proc.id);
                      const cids = cidsByProc[proc.id] || [];
                      const selCids = selectedCidsByProc[proc.id] || [];
                      const isCustom = proc.origem === 'PERSONALIZADO';
                      const isExpanded = expandedProcId === proc.id;
                      const cidQuery = (cidSearchByProc[proc.id] || '').trim().toLowerCase();
                      const filteredCids = cidQuery
                        ? cids.filter((c) => c.codigo.toLowerCase().includes(cidQuery) || (c.descricao || '').toLowerCase().includes(cidQuery))
                        : cids;
                      const searchResults = cidSearchResults[proc.id] || [];
                      return (
                        <div key={proc.id} className={`rounded-md border bg-background transition-colors ${checked ? 'border-primary/40' : ''}`}>
                          <div
                            className="flex items-center gap-2 cursor-pointer hover:bg-muted/40 rounded-md px-2 py-1.5"
                            onClick={() => toggleExpandProc(proc.id)}
                          >
                            <Checkbox
                              id={`proc-${proc.id}`}
                              checked={checked}
                              onClick={(e) => e.stopPropagation()}
                                onCheckedChange={(c) => {
                                  setSelectedProcIds((prev) => c ? [...prev, proc.id] : prev.filter((id) => id !== proc.id));
                                  if (c) {
                                    loadCidsForProc(proc.id);
                                    setProcDetails(prev => ({
                                      ...prev,
                                      [proc.id]: prev[proc.id] || { quantidade: 1, observacao: "" }
                                    }));
                                  }
                                }}
                            />
                            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0 ${isExpanded ? '' : '-rotate-90'}`} />
                            {isCustom
                              ? <PencilIcon className="h-3 w-3 text-accent-foreground shrink-0" />
                              : <Tag className="h-3 w-3 text-muted-foreground shrink-0" />}
                            <span className="text-sm flex-1 truncate select-none">
                              {!isCustom && (
                                <span className="font-mono text-[11px] text-muted-foreground mr-2">{proc.id}</span>
                              )}
                              {proc.nome}
                            </span>
                            {checked && selCids.length > 0 && (
                              <Badge variant="secondary" className="h-5 text-[10px] shrink-0">{selCids.length} CID</Badge>
                            )}
                          </div>
                          {isExpanded && (
                            <div className="px-3 pb-3 pt-1 border-t bg-muted/10 space-y-3">
                              {proc.especialidade && (
                                <p className="text-[11px] text-muted-foreground">{proc.especialidade}</p>
                              )}

                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label className="text-[10px] uppercase text-muted-foreground">Quantidade</Label>
                                  <Input
                                    type="number"
                                    min={1}
                                    value={procDetails[proc.id]?.quantidade || 1}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value) || 1;
                                      setProcDetails(prev => ({
                                        ...prev,
                                        [proc.id]: { ...(prev[proc.id] || { observacao: "" }), quantidade: val }
                                      }));
                                    }}
                                    className="h-8 text-xs"
                                  />
                                </div>
                                <div>
                                  <Label className="text-[10px] uppercase text-muted-foreground">Observação do Procedimento</Label>
                                  <Input
                                    value={procDetails[proc.id]?.observacao || ""}
                                    onChange={(e) => {
                                      setProcDetails(prev => ({
                                        ...prev,
                                        [proc.id]: { ...(prev[proc.id] || { quantidade: 1 }), observacao: e.target.value }
                                      }));
                                    }}
                                    placeholder="Ex: Lado direito, observação clínica..."
                                    className="h-8 text-xs"
                                  />
                                </div>
                              </div>

                              {!isCustom && !proc.id.includes('.') && (
                                <div className="flex items-center gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                  <p className="text-[10px] text-amber-700">Procedimento sem SIGTAP não será validado para produção BPA-I.</p>
                                </div>
                              )}

                              <div className="relative">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                <Input
                                  value={cidSearchByProc[proc.id] || ''}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setCidSearchByProc((m) => ({ ...m, [proc.id]: v }));
                                    const q = v.trim();
                                    if (q.length < 2) {
                                      setCidSearchResults((m) => ({ ...m, [proc.id]: [] }));
                                      return;
                                    }
                                    setCidSearchLoading((m) => ({ ...m, [proc.id]: true }));
                                    procedureService.searchCids(q).then((res) => {
                                      setCidSearchResults((m) => ({ ...m, [proc.id]: res }));
                                      setCidSearchLoading((m) => ({ ...m, [proc.id]: false }));
                                    });
                                  }}
                                  placeholder="Pesquisar CIDs (filtra sugeridos e busca novos)..."
                                  className="pl-7 h-8 text-xs"
                                />
                              </div>

                              {/* CIDs sugeridos (filtrados) */}
                              <p className="text-[11px] font-medium text-muted-foreground mb-1">📋 Sugeridos</p>
                              {!cidsByProc[proc.id] ? (
                                <p className="text-xs text-muted-foreground italic">Carregando...</p>
                              ) : filteredCids.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">
                                  {cids.length === 0 ? 'Nenhum CID vinculado.' : 'Nenhum CID sugerido corresponde à busca.'}
                                </p>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {filteredCids.map((c) => {
                                    const isSel = selCids.includes(c.codigo);
                                    return (
                                      <button
                                        type="button"
                                        key={c.codigo}
                                        onClick={() => {
                                          setSelectedCidsByProc((m) => ({
                                            ...m,
                                            [proc.id]: isSel
                                              ? (m[proc.id] || []).filter((x) => x !== c.codigo)
                                              : Array.from(new Set([...(m[proc.id] || []), c.codigo])),
                                          }));
                                          // Auto-mark procedure when selecting a CID (rule: no CID without procedure)
                                                if (!isSel && !selectedProcIdSet.has(proc.id)) {
                                                setSelectedProcIds((prev) => [...prev, proc.id]);
                                                setProcDetails(prev => ({
                                                  ...prev,
                                                  [proc.id]: prev[proc.id] || { quantidade: 1, observacao: "" }
                                                }));
                                              }
                                        }}
                                        aria-pressed={isSel}
                                        title={c.descricao || c.codigo}
                                        className={
                                          "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors " +
                                          (isSel
                                            ? "bg-primary text-primary-foreground border-primary shadow-sm hover:bg-primary/90"
                                            : "bg-background text-foreground border-border hover:bg-muted")
                                        }
                                      >
                                        {isSel && <CheckCircle className="h-3 w-3 shrink-0" />}
                                        <span className="font-mono">{c.codigo}</span>
                                        {c.descricao && (
                                          <span className={isSel ? "opacity-90" : "text-muted-foreground"}>
                                            · {c.descricao.slice(0, 36)}
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Resultados externos da busca */}
                              {cidSearchLoading[proc.id] && (
                                <p className="text-xs text-muted-foreground italic mt-2">Buscando no catálogo...</p>
                              )}
                              {searchResults.length > 0 && (
                                <>
                                  <p className="text-[11px] font-medium text-muted-foreground mt-2 mb-1">🔎 Outros resultados</p>
                                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                                    {searchResults
                                      .filter((c) => !cids.some((x) => x.codigo === c.codigo))
                                      .map((c) => {
                                        const isSel = (selectedCidsByProc[proc.id] || []).includes(c.codigo);
                                        return (
                                          <button
                                            type="button"
                                            key={c.codigo}
                                            onClick={() => {
                                              setCidsByProc((m) => ({
                                                ...m,
                                                [proc.id]: (m[proc.id] || []).some((x) => x.codigo === c.codigo)
                                                  ? (m[proc.id] || [])
                                                  : [...(m[proc.id] || []), c],
                                              }));
                                              setSelectedCidsByProc((m) => ({
                                                ...m,
                                                [proc.id]: isSel
                                                  ? (m[proc.id] || []).filter((x) => x !== c.codigo)
                                                  : Array.from(new Set([...(m[proc.id] || []), c.codigo])),
                                              }));
                                          if (!isSel && !selectedProcIdSet.has(proc.id)) {
                                            setSelectedProcIds((prev) => [...prev, proc.id]);
                                            setProcDetails(prev => ({
                                              ...prev,
                                              [proc.id]: prev[proc.id] || { quantidade: 1, observacao: "" }
                                            }));
                                          }
                                            }}
                                            aria-pressed={isSel}
                                            title={c.descricao || c.codigo}
                                            className={
                                              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors " +
                                              (isSel
                                                ? "bg-primary text-primary-foreground border-primary shadow-sm hover:bg-primary/90"
                                                : "bg-secondary text-secondary-foreground border-border hover:bg-muted")
                                            }
                                          >
                                            {isSel ? <CheckCircle className="h-3 w-3 shrink-0" /> : <Plus className="h-3 w-3 shrink-0" />}
                                            <span className="font-mono">{c.codigo}</span>
                                            {c.descricao && (
                                              <span className={isSel ? "opacity-90" : "text-muted-foreground"}>
                                                · {c.descricao.slice(0, 36)}
                                              </span>
                                            )}
                                          </button>
                                        );
                                      })}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhum procedimento disponível para sua profissão.</p>
                )}
              </div>
            )}

            <div>
              <Label>Outro Procedimento</Label>
              <DebouncedInput value={form.outro_procedimento} onChange={(e) => setForm((p) => ({ ...p, outro_procedimento: e.target.value }))} placeholder="Descreva outro procedimento..." />
            </div>

            <NovoProcedimentoModal
              open={novoProcOpen}
              onOpenChange={setNovoProcOpen}
              defaultProfissao={user?.profissao}
              criadoPor={user?.id}
              onCreated={async (codigo) => {
                const list = await procedureService.getActive();
                setProcedimentos(list as any);
                setSelectedProcIds((prev) => prev.includes(codigo) ? prev : [...prev, codigo]);
                setProcDetails(prev => ({ ...prev, [codigo]: { quantidade: 1, observacao: "" } }));
                setExpandedProcId(codigo); // Auto-expand to show details/CIDs
              }}
            />

            {isProfBlocoVisible('indicacao_retorno') && (
            <div>
              <Label>Indicação de Retorno</Label>
              <Select value={form.indicacao_retorno || "no_indication"} onValueChange={(v) => setForm((p) => ({ ...p, indicacao_retorno: v === "no_indication" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {retornoOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            )}

            {/* Prescrição de Medicamentos — ALL types */}
            {isProfBlocoVisible('prescricao') && (
            <PrescricaoMedicamentos
              profissionalId={user?.id || ""}
              value={listaPrescricao}
              onChange={setListaPrescricao}
              pacienteNome={form.paciente_nome}
              pacienteCpf={selectedPacienteCpf}
              pacienteCns={selectedPacienteCns}
              dataAtendimento={form.data_atendimento}
              profissionalNome={user?.nome}
              profissionalConselho={user?.numeroConselho}
              profissionalTipoConselho={user?.tipoConselho}
              profissionalUfConselho={user?.ufConselho}
              unidadeNome={unidadeAtualNome}
            />
            )}

            {/* Solicitação de Exames — ALL types */}
            {isProfBlocoVisible('solicitacao_exames') && (
            <SolicitacaoExames
              profissionalId={user?.id || ""}
              value={listaExames}
              onChange={setListaExames}
              pacienteNome={form.paciente_nome}
              pacienteCpf={selectedPacienteCpf}
              pacienteCns={selectedPacienteCns}
              dataAtendimento={form.data_atendimento}
              profissionalNome={user?.nome}
              profissionalConselho={user?.numeroConselho}
              profissionalTipoConselho={user?.tipoConselho}
              profissionalUfConselho={user?.ufConselho}
              unidadeNome={unidadeAtualNome}
            />
            )}

            {/* Resultado de Exame trazido pelo paciente (transcrição manual) */}
            <div className="bg-muted/30 rounded-lg p-4 border space-y-3 mt-2 mb-2">
              <div className="flex items-start gap-2">
                <FlaskConical className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1">
                  <Label className="text-sm font-semibold text-foreground">Resultado de Exame</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Use este campo para registrar exames trazidos pelo paciente ou analisados durante o atendimento.
                  </p>
                </div>
              </div>
              <DebouncedTextarea
                value={form.resultado_exame}
                onChange={(e) => setForm((p) => ({ ...p, resultado_exame: e.target.value }))}
                placeholder="Registre os resultados de exames apresentados pelo paciente, valores relevantes, alterações encontradas e interpretação clínica..."
                className="min-h-[140px] md:min-h-[160px] bg-background resize-y leading-relaxed"
              />
            </div>

            {/* Decisão Clínica: PTS / Tratamento — only for avaliacao_inicial handled above, and retorno */}
            {!editId && form.paciente_id && form.tipo_registro === 'retorno' && (
              <div className="bg-muted/30 rounded-lg p-4 border space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Heart className="w-4 h-4 text-primary" /> Decisão Clínica (opcional)
                </h3>
                <div className="flex gap-2 flex-wrap">
                  <Button type="button" variant="outline" size="sm" onClick={() => setPtsOpen(true)}>
                    <ClipboardList className="w-3.5 h-3.5 mr-1" /> Criar PTS
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setCycleOpen(true)}>
                    <Activity className="w-3.5 h-3.5 mr-1" /> Criar Ciclo de Tratamento
                  </Button>
                </div>
              </div>
            )}

            {editId && (
              <div>
                <Label className="text-muted-foreground">Motivo da Alteração <span className="text-xs">(opcional)</span></Label>
                <DebouncedTextarea
                  rows={2}
                  value={form.motivo_alteracao}
                  onChange={(e) => setForm((p) => ({ ...p, motivo_alteracao: e.target.value }))}
                  placeholder="Ex: Correção de informação, complemento clínico..."
                  className="border-warning/50"
                />
              </div>
            )}

            {form.paciente_id && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setHistoricoCompletoOpen(true)}
                className="w-full"
              >
                <FileText className="w-4 h-4 mr-2" />
                Ver Histórico Completo do Paciente
              </Button>
            )}

            {/* Alerta inteligente de progresso do tratamento */}
            {sessaoCycle && form.tipo_registro === 'sessao' && (() => {
              const completedCount = sessaoCycleSessions.filter(s => s.status === 'realizada').length;
              const remaining = sessaoCycle.total_sessions - completedCount;
              const progressPercent = sessaoCycle.total_sessions > 0 ? Math.round((completedCount / sessaoCycle.total_sessions) * 100) : 0;
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progresso do tratamento</span>
                    <span className="font-semibold">{completedCount}/{sessaoCycle.total_sessions} sessões</span>
                  </div>
                  <Progress value={progressPercent} className="h-2" />
                  <div className="flex items-center gap-2">
                    {remaining === 0 ? (
                      <Badge className="bg-green-500/10 text-green-700 border-green-500/30">✅ Tratamento concluído</Badge>
                    ) : remaining <= 2 ? (
                      <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Atenção: {remaining === 1 ? 'última sessão' : `faltam ${remaining} sessões`}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Faltam {remaining} sessões</Badge>
                    )}
                  </div>
                </div>
              );
            })()}

          </div>{/* end scroll area */}
          </div>{/* end left column */}

          {/* Painel direito fixo — Histórico do paciente */}
          <HistoricoPacientePanel
            paciente={pacienteForPanel}
            historico={patientHistory}
            currentId={editId || undefined}
            onView={handleViewProntuarioFromHistory}
          />
          </div>{/* end grid split */}

            <div className="flex gap-2 flex-wrap shrink-0 border-t border-border pt-3 -mx-6 px-6 pb-1 bg-background">
              {/* Botão "Registrar Sessão" — só aparece no tipo sessão com sessão disponível */}
              {form.tipo_registro === 'sessao' && currentSessionForRegistration && sessaoCycle && (
                <Button
                  type="button"
                  onClick={handleRegistrarSessaoOnly}
                  disabled={saving}
                  variant="outline"
                  className="flex-1 border-primary/50 text-primary hover:bg-primary/10"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  <Activity className="w-4 h-4 mr-2" />
                  Registrar Sessão {currentSessionForRegistration.session_number}
                </Button>
              )}

              {canFinalize ? (
                <>
                  <Button onClick={() => { void handleSave(); }} disabled={saving} variant="outline" className="flex-1">
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Salvar Rascunho
                  </Button>
                  <Button
                    onClick={handleFinalizarAtendimento}
                    disabled={saving}
                    className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Finalizar Prontuário
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => { void handleSave(); }}
                  disabled={saving}
                  className="flex-1 gradient-primary text-primary-foreground"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {editId ? "Salvar Alterações" : "Registrar Prontuário"}
                </Button>
              )}
            </div>
        </DialogContent>
      </Dialog>

      {/* PTS Dialog */}
      <Dialog open={ptsOpen} onOpenChange={setPtsOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Criar PTS — {form.paciente_nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Diagnóstico Funcional *</Label>
              <Textarea rows={3} value={ptsForm.diagnostico_funcional}
                onChange={(e) => setPtsForm(p => ({ ...p, diagnostico_funcional: e.target.value }))}
                placeholder="Descrição funcional global do paciente..." />
            </div>
            <div>
              <Label>Objetivos Terapêuticos *</Label>
              <Textarea rows={2} value={ptsForm.objetivos_terapeuticos}
                onChange={(e) => setPtsForm(p => ({ ...p, objetivos_terapeuticos: e.target.value }))} />
            </div>
            <div>
              <Label>Metas de Curto Prazo</Label>
              <Textarea rows={2} value={ptsForm.metas_curto_prazo}
                onChange={(e) => setPtsForm(p => ({ ...p, metas_curto_prazo: e.target.value }))} />
            </div>
            <div>
              <Label>Metas de Médio Prazo</Label>
              <Textarea rows={2} value={ptsForm.metas_medio_prazo}
                onChange={(e) => setPtsForm(p => ({ ...p, metas_medio_prazo: e.target.value }))} />
            </div>
            <div>
              <Label>Metas de Longo Prazo</Label>
              <Textarea rows={2} value={ptsForm.metas_longo_prazo}
                onChange={(e) => setPtsForm(p => ({ ...p, metas_longo_prazo: e.target.value }))} />
            </div>
            <div>
              <Label className="mb-2 block">Especialidades Envolvidas</Label>
              <div className="grid grid-cols-2 gap-2">
                {PTS_SPECIALTIES.map(spec => (
                  <div key={spec} className="flex items-center gap-2">
                    <Checkbox id={`pts-spec-${spec}`}
                      checked={ptsForm.especialidades.includes(spec)}
                      onCheckedChange={(checked) => {
                        setPtsForm(p => ({
                          ...p,
                          especialidades: checked
                            ? [...p.especialidades, spec]
                            : p.especialidades.filter(s => s !== spec)
                        }));
                      }} />
                    <label htmlFor={`pts-spec-${spec}`} className="text-sm cursor-pointer">{spec}</label>
                  </div>
                ))}
              </div>
            </div>
            <Button onClick={handleCreatePTS} disabled={ptsSaving} className="w-full gradient-primary text-primary-foreground">
              {ptsSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Criar PTS
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Agendar Sessão */}
      <ModalAgendarSessao
        open={!!agendarSessaoTarget}
        onClose={() => setAgendarSessaoTarget(null)}
        session={agendarSessaoTarget}
        cycle={sessaoCycle}
        pacienteNome={form.paciente_nome}
        profissionalNome={funcionarios.find(f => f.id === sessaoCycle?.professional_id)?.nome || ''}
        salas={(salas || []).filter((s: any) => s.unidadeId === sessaoCycle?.unit_id && s.ativo)}
        availableDates={sessaoCycle ? getAvailableDates(sessaoCycle.professional_id, sessaoCycle.unit_id) : []}
        getAvailableSlots={getAvailableSlots}
        onConfirm={async (data, hora, salaId) => {
          if (!agendarSessaoTarget || !sessaoCycle) return;
          const pac = pacienteByIdMap.get(sessaoCycle.patient_id);
          
          const { isPacienteIsentoBloqueio, isPacienteBloqueadoParaProfissional } = await import('@/lib/faltasUtils');
          if (!isPacienteIsentoBloqueio(pac)) {
            const bloqueado = await isPacienteBloqueadoParaProfissional(sessaoCycle.patient_id, sessaoCycle.professional_id);
            if (bloqueado) {
              toast.error("Paciente bloqueado por faltas injustificadas para este profissional.");
              return;
            }
          }

          const agId = `ag${Date.now()}`;
          await addAgendamento({
            id: agId,
            pacienteId: sessaoCycle.patient_id,
            pacienteNome: form.paciente_nome,
            unidadeId: sessaoCycle.unit_id,
            salaId: salaId || "",
            setorId: "",
            profissionalId: sessaoCycle.professional_id,
            profissionalNome: funcionarios.find(f => f.id === sessaoCycle.professional_id)?.nome || "",
            data,
            hora,
            status: "confirmado",
            tipo: "Sessão de Tratamento",
            observacoes: `Sessão ${agendarSessaoTarget.session_number}/${agendarSessaoTarget.total_sessions} — ${sessaoCycle.treatment_type}`,
            origem: "profissional",
            criadoEm: new Date().toISOString(),
            criadoPor: user?.id || "",
          });

          await supabase
            .from("treatment_sessions")
            .update({ appointment_id: agId, status: "agendada", scheduled_date: data })
            .eq("id", agendarSessaoTarget.id);

          toast.success("Sessão agendada com sucesso!");
          await loadSessaoData(buildTreatmentContext());
          refreshAgendamentos();
        }}
        mode="agendar"
        isMaster={user?.role === 'master' || isProfissional}
      />

      <ModalAgendarSessao
        open={!!remarcarTarget}
        onClose={() => setRemarcarTarget(null)}
        session={remarcarTarget}
        cycle={sessaoCycle}
        pacienteNome={form.paciente_nome}
        profissionalNome={funcionarios.find(f => f.id === sessaoCycle?.professional_id)?.nome || ''}
        salas={(salas || []).filter((s: any) => s.unidadeId === sessaoCycle?.unit_id && s.ativo)}
        availableDates={sessaoCycle ? getAvailableDates(sessaoCycle.professional_id, sessaoCycle.unit_id) : []}
        getAvailableSlots={getAvailableSlots}
        onConfirm={async (data, hora, salaId) => {
          if (!remarcarTarget || !sessaoCycle) return;
          const oldDate = remarcarTarget.scheduled_date;
          
          await supabase
            .from("treatment_sessions")
            .update({ scheduled_date: data })
            .eq("id", remarcarTarget.id);

          if (remarcarTarget.appointment_id) {
            await supabase.from("agendamentos").update({ data, hora, sala_id: salaId }).eq("id", remarcarTarget.appointment_id);
          }

          toast.success(`Sessão remarcada para ${new Date(data + "T12:00:00").toLocaleDateString("pt-BR")}`);
          await loadSessaoData(buildTreatmentContext());
          refreshAgendamentos();
        }}
        mode="remarcar"
        isMaster={user?.role === 'master' || isProfissional}
      />

      <Dialog open={selectSessionOpen} onOpenChange={setSelectSessionOpen}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Selecione a sessão a registrar</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Apenas sessões agendadas para{" "}
              <strong>
                {funcionarios.find((f) => f.id === sessaoCycle?.professional_id)?.nome || "este profissional"}
              </strong>{" "}
              são listadas. Registrar não afeta sessões de outros profissionais.
            </p>
            {(() => {
              const sessoesDisponiveis = sessaoCycleSessions
                .filter(
                  (s) =>
                    ["agendada", "pendente_agendamento"].includes(s.status) &&
                    s.professional_id === sessaoCycle?.professional_id,
                )
                .sort((a, b) => a.session_number - b.session_number);

              if (sessoesDisponiveis.length === 0) {
                return (
                  <div className="p-6 text-center text-sm text-muted-foreground border rounded-lg bg-muted/30">
                    Nenhuma sessão disponível para registrar.
                  </div>
                );
              }

              return sessoesDisponiveis.map((s) => {
                const dataFmt = s.scheduled_date
                  ? new Date(s.scheduled_date + "T12:00:00").toLocaleDateString("pt-BR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                    })
                  : "Sem data";

                // Check for appointment time in agendamentos
                const ag = agendamentos.find(a => 
                  a.pacienteId === s.patient_id && 
                  a.profissionalId === s.professional_id && 
                  a.data === s.scheduled_date &&
                  !["cancelado", "falta", "remarcado"].includes(a.status)
                );

                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelectSessionToRegister(s)}
                    className="w-full text-left p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">
                        Sessão {s.session_number}/{sessaoCycle?.total_sessions}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {dataFmt}
                        {ag?.hora ? ` • ${ag.hora.slice(0, 5)}` : ""}
                      </p>
                    </div>
                    <Badge variant={s.status === "agendada" ? "default" : "secondary"} className="text-xs shrink-0">
                      {sessionStatusLabels[s.status] || s.status}
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                );
              });
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Treatment Cycle Dialog */}
      <Dialog open={cycleOpen} onOpenChange={setCycleOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Criar Ciclo de Tratamento — {form.paciente_nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo de Tratamento *</Label>
              <Input value={cycleForm.treatment_type}
                onChange={(e) => setCycleForm(p => ({ ...p, treatment_type: e.target.value }))}
                placeholder="Ex: Fisioterapia motora, Fonoterapia..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Frequência *</Label>
                <Select value={cycleForm.frequency} onValueChange={(v) => {
                  setCycleForm(p => ({ ...p, frequency: v, weekdays: [] }));
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS_NEW.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Duração (meses)</Label>
                <Input type="number" min={1} max={24} value={cycleForm.duration_months}
                  onChange={(e) => setCycleForm(p => ({ ...p, duration_months: parseInt(e.target.value) || 1 }))} />
              </div>
            </div>

            {isWeekdayFrequency(cycleForm.frequency) && (
              <div>
                <Label className="mb-2 block">Dias da Semana * (selecione {getMaxWeekdays(cycleForm.frequency)})</Label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_LABELS.map(day => {
                    const checked = cycleForm.weekdays.includes(day.value);
                    const maxReached = cycleForm.weekdays.length >= getMaxWeekdays(cycleForm.frequency);
                    return (
                      <label key={day.value} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer text-sm transition-colors ${checked ? 'bg-primary/10 border-primary text-primary' : maxReached ? 'opacity-40 cursor-not-allowed border-border' : 'border-border hover:bg-accent'}`}>
                        <Checkbox
                          checked={checked}
                          disabled={!checked && maxReached}
                          onCheckedChange={(c) => {
                            setCycleForm(p => ({
                              ...p,
                              weekdays: c
                                ? [...p.weekdays, day.value]
                                : p.weekdays.filter(d => d !== day.value),
                            }));
                          }}
                        />
                        {day.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {cycleForm.frequency === 'manual' && (
              <div>
                <Label>Sessões Previstas</Label>
                <Input type="number" min={1} value={cycleForm.total_sessions}
                  onChange={(e) => setCycleForm(p => ({ ...p, total_sessions: parseInt(e.target.value) || 1 }))} />
              </div>
            )}

            <div>
              <Label>Data de Início</Label>
              <Input type="date" value={cycleForm.start_date}
                onChange={(e) => setCycleForm(p => ({ ...p, start_date: e.target.value }))} />
            </div>

            <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
              <div>
                <span className="text-muted-foreground">Sessões previstas: </span>
                <strong>
                  {cycleForm.frequency === 'manual'
                    ? cycleForm.total_sessions
                    : calculateTotalSessions(cycleForm.frequency, cycleForm.duration_months, cycleForm.weekdays)}
                </strong>
              </div>
              <div>
                <span className="text-muted-foreground">Previsão término: </span>
                <strong>
                  {(() => {
                    const total = cycleForm.frequency === 'manual' ? cycleForm.total_sessions : calculateTotalSessions(cycleForm.frequency, cycleForm.duration_months, cycleForm.weekdays);
                    const ranges = buildBlockedRanges(bloqueios, user?.id || '', user?.unidadeId || '');
                    const dates = generateSessionDates(cycleForm.start_date, cycleForm.frequency, cycleForm.weekdays, total, ranges);
                    return dates.length > 0 ? new Date(dates[dates.length - 1] + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
                  })()}
                </strong>
              </div>
            </div>

            <div>
              <Label>Notas Clínicas</Label>
              <Textarea rows={2} value={cycleForm.clinical_notes}
                onChange={(e) => setCycleForm(p => ({ ...p, clinical_notes: e.target.value }))} />
            </div>
            <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg text-xs text-warning">
              ℹ️ As sessões serão criadas com status <strong>Aguardando Agendamento</strong>. A recepção agendará cada sessão individualmente.
            </div>
            <Button onClick={handleCreateCycle} disabled={cycleSaving} className="w-full gradient-primary text-primary-foreground">
              {cycleSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Criar Ciclo de Tratamento
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="space-y-3" aria-label="Carregando prontuários">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={`pr-skel-${i}`} className="shadow-card border-0">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-4 w-24 rounded-full" />
                    </div>
                    <Skeleton className="h-3 w-2/5" />
                    <Skeleton className="h-3 w-3/5" />
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {Array.from({ length: 5 }).map((__, j) => (
                      <Skeleton key={j} className="h-8 w-8 rounded-md" />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="shadow-card border-0">
          <CardContent className="p-8 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhum prontuário encontrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div
          ref={listParentRef}
          className="overflow-auto rounded-lg"
          style={{ height: "calc(100vh - 280px)", minHeight: 420, contain: "strict" }}
        >
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const p = filtered[virtualRow.index];
              if (!p) return null;
              const isOwn = p.profissional_id === user?.id;
              return (
                <div
                  key={p.id}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingBottom: 12,
                  }}
                  onMouseEnter={() => handleProntuarioHover(p.id)}
                  onFocus={() => handleProntuarioHover(p.id)}
                >
                  <Card className="shadow-card border border-transparent hover:border-primary/30 hover:shadow-md transition-all duration-200">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-foreground">{p.paciente_nome}</p>
                            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                              {new Date(p.data_atendimento + "T12:00:00").toLocaleDateString("pt-BR")}
                            </span>
                            {p.hora_atendimento && (
                              <span className="text-xs text-muted-foreground">{p.hora_atendimento}</span>
                            )}
                            {p.indicacao_retorno &&
                              p.indicacao_retorno !== "sem_retorno" &&
                              p.indicacao_retorno !== "no_indication" && (
                                <Badge variant="outline" className="text-xs text-primary border-primary/30">
                                  ↩{" "}
                                  {retornoOptions.find((o) => o.value === p.indicacao_retorno)?.label ||
                                    p.indicacao_retorno}
                                </Badge>
                              )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            Prof. {p.profissional_nome}
                            {p.setor ? ` • ${p.setor}` : ""}
                          </p>
                          {p.procedimentos_texto && (
                            <p className="text-xs text-muted-foreground mt-1">📋 {p.procedimentos_texto}</p>
                          )}
                          {p.queixa_principal && (
                            <p className="text-sm text-foreground mt-1 line-clamp-2">
                              <strong>QP:</strong> {p.queixa_principal}
                            </p>
                          )}
                          {!isOwn && isProfissional && (
                            <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">
                              <Lock className="w-3 h-3" />
                              <span className="font-medium">Prontuário de outro profissional (somente leitura)</span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleViewProntuarioFromHistory(p)}
                            title="Visualizar prontuário"
                            aria-label="Visualizar prontuário"
                          >
                            <Eye className="w-4 h-4 text-primary" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setHistoricoPacienteId({ id: p.paciente_id, nome: p.paciente_nome });
                              setHistoricoCompletoOpen(true);
                            }}
                            title="Histórico do paciente"
                            aria-label="Histórico do paciente"
                          >
                            <History className="w-4 h-4 text-primary" />
                          </Button>
                          {(isProfissional ? isOwn : true) ? (
                            <Button size="icon" variant="ghost" onClick={() => openEdit(p)} title="Editar">
                              <Pencil className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button size="icon" variant="ghost" disabled title="Somente leitura — prontuário de outro profissional">
                              <Pencil className="w-4 h-4 opacity-40" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => { downloadProntuarioPdf(p.id); toast.success("PDF gerado"); }}
                            title="Baixar PDF"
                            aria-label="Baixar PDF"
                          >
                            <FileDown className="w-4 h-4 text-primary" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handlePrint(p)} title="Imprimir">
                            <Printer className="w-4 h-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" title="Mais ações" aria-label="Mais ações">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem
                                onClick={() => {
                                  const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = `prontuario_${p.id}.json`;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                  toast.success("JSON exportado");
                                }}
                              >
                                <Download className="w-3.5 h-3.5 mr-2" /> Exportar JSON
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  const link = `${window.location.origin}/painel/prontuario?pacienteId=${p.paciente_id}&pacienteNome=${encodeURIComponent(p.paciente_nome)}`;
                                  navigator.clipboard.writeText(link);
                                  toast.success("Link copiado");
                                }}
                              >
                                <Link2 className="w-3.5 h-3.5 mr-2" /> Copiar link
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() =>
                                  navigate(
                                    `/painel/prontuario?pacienteId=${p.paciente_id}&pacienteNome=${encodeURIComponent(p.paciente_nome)}`,
                                  )
                                }
                              >
                                <FileText className="w-3.5 h-3.5 mr-2" /> Abrir histórico completo
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {(canDelete || (isProfissional && isOwn)) && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" className="text-destructive">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir prontuário?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Excluir o prontuário de {p.paciente_nome} (
                                    {new Date(p.data_atendimento + "T12:00:00").toLocaleDateString("pt-BR")})?
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(p)}
                                    className="bg-destructive text-destructive-foreground"
                                  >
                                    Excluir
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div ref={printRef} className="hidden" />

      {/* Modal Gerar Documento Clínico */}
      {docModalOpen && (
        <GerarDocumentoModal
          open={docModalOpen}
          onOpenChange={setDocModalOpen}
          paciente={(() => {
            const p = pacientes.find(x => x.id === queryPacienteId);
            return p ? { id: p.id, nome: p.nome, cpf: p.cpf, cns: p.cns, data_nascimento: p.dataNascimento, cid: p.cid, especialidade_destino: '' } : undefined;
          })()}
          profissional={user ? { id: user.id, nome: user.nome, profissao: user.profissao, numero_conselho: user.numeroConselho, tipo_conselho: user.tipoConselho, uf_conselho: user.ufConselho } : undefined}
          unidade={unidades.find(u => u.id === user?.unidadeId)?.nome}
          dataAtendimento={new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
        />
      )}

      {/* Modal Encaminhamento Interno */}
      {encInternoOpen && queryPacienteId && (() => {
        const p = pacientes.find(x => x.id === queryPacienteId);
        if (!p) return null;
        return (
          <EncaminhamentoInternoModal
            open={encInternoOpen}
            onOpenChange={setEncInternoOpen}
            paciente={{
              id: p.id,
              nome: p.nome,
              cpf: p.cpf,
              cns: p.cns,
              data_nascimento: p.dataNascimento,
              cid: p.cid,
              unidadeId: p.unidadeId,
            }}
          />
        );
      })()}

      {/* Histórico Completo Modal */}
      {(historicoPacienteId || queryPacienteId || form.paciente_id) && (
        <HistoricoCompletoModal
          open={historicoCompletoOpen}
          onOpenChange={(open) => {
            setHistoricoCompletoOpen(open);
            if (!open) setHistoricoPacienteId(null);
          }}
          pacienteId={historicoPacienteId?.id || queryPacienteId || form.paciente_id}
          pacienteNome={historicoPacienteId?.nome || queryPacienteNome || form.paciente_nome || "Paciente"}
          unidades={unidades}
          currentProfissionalId={user?.id}
          onViewProntuario={(p) => { setViewerProntuario(p); setHistoricoCompletoOpen(false); }}
        />
      )}

      {/* Drawer de visualização rápida do prontuário */}
      <Sheet open={!!viewerProntuario} onOpenChange={(open) => !open && setViewerProntuario(null)}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          {viewerProntuario && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Prontuário — {viewerProntuario.paciente_nome}
                </SheetTitle>
                <SheetDescription>
                  {new Date(viewerProntuario.data_atendimento + "T12:00:00").toLocaleDateString("pt-BR")}
                  {viewerProntuario.hora_atendimento && ` às ${viewerProntuario.hora_atendimento}`}
                  {" • "}Prof. {viewerProntuario.profissional_nome}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4 text-sm">
                <div className="flex justify-between items-center bg-muted/20 p-3 rounded-lg border border-border/40">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="bg-background font-semibold capitalize">
                      {viewerProntuario.tipo_registro?.replace(/_/g, ' ') || 'Consulta'}
                    </Badge>
                    {viewerProntuario.setor && (
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        {viewerProntuario.setor}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono bg-background px-2 py-0.5 rounded border">
                    ID: {viewerProntuario.id.slice(0, 8)}
                  </div>
                </div>

                {(() => {
                  const renderSection = (label: string, value: any, options: { icon?: React.ReactNode, isWide?: boolean } = {}) => {
                    const text = getObservacoesTexto(value);
                    if (!text || !text.trim()) return null;
                    return (
                      <div key={label} className={cn(
                        "border-b border-border/20 pb-4 last:border-0",
                        options.isWide ? "col-span-full" : ""
                      )}>
                        <div className="flex items-center gap-2 mb-2">
                          {options.icon}
                          <p className="text-[11px] font-bold text-primary/80 uppercase tracking-widest">{label}</p>
                        </div>
                        <div className="text-foreground whitespace-pre-wrap leading-relaxed bg-muted/5 p-3 rounded-md border border-border/10">
                          {text}
                        </div>
                      </div>
                    );
                  };

                  const dynamicContent = [];
                  if (viewerProntuario.custom_data && typeof viewerProntuario.custom_data === 'object') {
                    Object.entries(viewerProntuario.custom_data).forEach(([key, val]) => {
                      if (key.startsWith('esp_')) return; // skip esp_ prefix duplicates
                      
                      // Check if it's already rendered by a static section
                      const staticKeys = ['queixa_principal', 'anamnese', 'soap_subjetivo', 'soap_objetivo', 'soap_avaliacao', 'soap_plano', 'sinais_sintomas', 'exame_fisico', 'hipotese', 'conduta', 'evolucao', 'observacoes', 'procedimentos_texto', 'prescricao', 'solicitacao_exames', 'resultado_exame'];
                      if (staticKeys.includes(key)) return;

                      let label = key.replace(/_/g, ' ');
                      // Try to find label in system_config if possible (optional enhancement)
                      
                      const section = renderSection(label, val, { icon: <Tag className="w-3.5 h-3.5 text-primary" /> });
                      if (section) dynamicContent.push(section);
                    });
                  }


                  const sections = [
                    { key: 'queixa_principal', label: 'Queixa Principal', icon: <Activity className="w-3.5 h-3.5 text-primary" /> },
                    { key: 'anamnese', label: 'Anamnese / Histórico', icon: <ClipboardList className="w-3.5 h-3.5 text-primary" /> },
                    { key: 'soap_subjetivo', label: 'S — Subjetivo', icon: <User className="w-3.5 h-3.5 text-primary" /> },
                    { key: 'soap_objetivo', label: 'O — Objetivo', icon: <Eye className="w-3.5 h-3.5 text-primary" /> },
                    { key: 'soap_avaliacao', label: 'A — Avaliação', icon: <Target className="w-3.5 h-3.5 text-primary" /> },
                    { key: 'soap_plano', label: 'P — Plano', icon: <Calendar className="w-3.5 h-3.5 text-primary" /> },
                    { key: 'sinais_sintomas', label: 'Sinais e Sintomas' },
                    { key: 'exame_fisico', label: 'Exame Físico' },
                    { key: 'hipotese', label: 'Hipótese / Avaliação' },
                    { key: 'conduta', label: 'Conduta', icon: <CheckCircle className="w-3.5 h-3.5 text-primary" /> },
                    { key: 'evolucao', label: 'Evolução', icon: <History className="w-3.5 h-3.5 text-primary" /> },
                    { key: 'observacoes', label: 'Observações Gerais' },
                    { key: 'procedimentos_texto', label: 'Procedimentos Realizados', icon: <Activity className="w-3.5 h-3.5 text-primary" /> },
                    { key: 'prescricao', label: 'Prescrição Médica', icon: <FileText className="w-3.5 h-3.5 text-primary" /> },
                    { key: 'solicitacao_exames', label: 'Solicitação de Exames', icon: <FlaskConical className="w-3.5 h-3.5 text-primary" /> },
                    { key: 'resultado_exame', label: 'Resultados de Exames' },
                    { key: 'indicacao_retorno', label: 'Indicação de Retorno', icon: <CalendarClock className="w-3.5 h-3.5 text-primary" /> },
                  ];

                  const rendered = sections.map(s => renderSection(s.label, (viewerProntuario as any)[s.key], { icon: s.icon }));
                  
                  // Handle custom_data (Dynamic Fields)
                  if (viewerProntuario.custom_data && typeof viewerProntuario.custom_data === 'object') {
                    Object.entries(viewerProntuario.custom_data).forEach(([key, val]) => {
                      if (val && !key.startsWith('esp_') && !sections.some(s => s.key === key)) {
                        const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                        rendered.push(renderSection(label, val, { icon: <Tag className="w-3.5 h-3.5 text-primary" /> }));
                      }
                    });

                    // Specialty fields (esp_ prefix)
                    Object.entries(viewerProntuario.custom_data).forEach(([key, val]) => {
                      if (key.startsWith('esp_') && val) {
                        const label = key.replace('esp_', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                        rendered.push(renderSection(`Especialidade: ${label}`, val, { icon: <Heart className="w-3.5 h-3.5 text-primary" /> }));
                      }
                    });
                  }

                  const filtered = rendered.filter(Boolean);
                  return filtered.length > 0 
                    ? <div className="grid grid-cols-1 gap-4">{filtered}</div>
                    : <div className="text-center py-12 bg-muted/10 rounded-xl border border-dashed border-border/60 mt-4">
                        <AlertTriangle className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                        <p className="text-muted-foreground font-medium italic">Nenhum dado clínico registrado neste prontuário.</p>
                      </div>;
                })()}
              </div>

              <Separator className="my-4" />

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => { downloadProntuarioPdf(viewerProntuario.id); toast.success("PDF gerado"); }}>
                  <FileDown className="w-3.5 h-3.5 mr-1" /> Baixar PDF
                </Button>
                <Button size="sm" variant="outline" onClick={() => handlePrint(viewerProntuario)}>
                  <Printer className="w-3.5 h-3.5 mr-1" /> Imprimir
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setHistoricoPacienteId({ id: viewerProntuario.paciente_id, nome: viewerProntuario.paciente_nome });
                    setHistoricoCompletoOpen(true);
                  }}
                >
                  <History className="w-3.5 h-3.5 mr-1" /> Histórico completo
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default ProntuarioPage;
