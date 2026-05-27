import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue } from "react";
import { cn, todayLocalStr } from "@/lib/utils";
import { ModalAgendarSessao } from "@/components/ModalAgendarSessao";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Skeleton } from "@/components/ui/skeleton";
import FichaPacienteCabecalho from "@/components/FichaPacienteCabecalho";
import { useProntuarioStructure } from "@/hooks/useProntuarioStructure";
import { useProntuarioConfig, getDefaultConfig, mergeAdminAndProfConfig, normalizeProfissao, TIPOS_PRONTUARIO, BlocoConfig, ProntuarioConfigData } from "@/hooks/useProntuarioConfig";
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
  data_atendimento: new Date().toISOString().split("T")[0],
  hora_atendimento: "",
  tipo_registro: "avaliacao_inicial",
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
  soap_subjetivo: "",
  soap_objetivo: "",
  soap_avaliacao: "",
  soap_plano: "",
};

const classificarIMC = (imc: number): string => {
  if (imc < 18.5) return "Abaixo do peso";
  if (imc < 25) return "Normal";
  if (imc < 30) return "Sobrepeso";
  if (imc < 35) return "Obesidade grau I";
  if (imc < 40) return "Obesidade grau II";
  return "Obesidade grau III";
};

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

const sessionStatusLabels: Record<string, string> = {
  pendente_agendamento: "Ag. Agendamento",
  agendada: "Agendada",
  realizada: "Realizada",
  paciente_faltou: "Faltou",
  cancelada: "Cancelada",
  remarcada: "Remarcada",
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
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [autosaveAt, setAutosaveAt] = useState<Date | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutosaveHashRef = useRef<string>('');
  const editIdRef = useRef<string | null>(null);
  const formRef = useRef(emptyForm);
  const autosaveInFlightRef = useRef(false);
  useEffect(() => { editIdRef.current = editId; }, [editId]);
  useEffect(() => { formRef.current = form; }, [form]);
  const [search, setSearch] = useState("");
  const [activeAtendimento, setActiveAtendimento] = useState<{ agendamentoId: string; horaInicio: string } | null>(null);
  const canFinalize = useMemo(() => {
    if (activeAtendimento) return true;
    if (!form.agendamento_id) return false;
    const ag = agendamentos.find((a: any) => a.id === form.agendamento_id);
    return ag && ag.status === 'em_atendimento';
  }, [activeAtendimento, form.agendamento_id, agendamentos]);
  const [triagem, setTriagem] = useState<TriagemData | null>(null);
  const [showHistorico, setShowHistorico] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const [ptsOpen, setPtsOpen] = useState(false);
  const [ptsSaving, setPtsSaving] = useState(false);
  const [ptsForm, setPtsForm] = useState({
    diagnostico_funcional: '', objetivos_terapeuticos: '',
    metas_curto_prazo: '', metas_medio_prazo: '', metas_longo_prazo: '',
    especialidades: [] as string[],
  });
  const [cycleOpen, setCycleOpen] = useState(false);
  const [cycleSaving, setCycleSaving] = useState(false);
  const [cycleForm, setCycleForm] = useState({
    treatment_type: '', total_sessions: 0, frequency: '1x_semana',
    start_date: new Date().toISOString().split("T")[0], clinical_notes: '',
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
  const isProfissional = user?.role === "profissional";
  const canEdit = can('prontuario', 'can_edit');
  const canDelete = can('prontuario', 'can_delete');
  const tempoLimite = user?.tempoAtendimento || 30;
  const [customData, setCustomData] = useState<Record<string, any>>({});
  const soapCustom = useSoapCustomOptions(user?.id);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [encInternoOpen, setEncInternoOpen] = useState(false);
  const [historicoCompletoOpen, setHistoricoCompletoOpen] = useState(false);
  const [viewerProntuario, setViewerProntuario] = useState<any | null>(null);
  const [historicoPacienteId, setHistoricoPacienteId] = useState<{ id: string; nome: string } | null>(null);
  const [listaExames, setListaExames] = useState<{ id: string; nome: string; codigo_sus: string; indicacao: string }[]>([]);
  const [listaPrescricao, setListaPrescricao] = useState<{ id: string; nome: string; dosagem: string; via: string; posologia: string; duracao: string }[]>([]);
  const [especialidadeFields, setEspecialidadeFields] = useState<Record<string, string>>({});
  const [sessaoCycle, setSessaoCycle] = useState<ActiveCycle | null>(null);
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
  const [agendarSessaoTarget, setAgendarSessaoTarget] = useState<CycleSession | null>(null);
  const [remarcarTarget, setRemarcarTarget] = useState<CycleSession | null>(null);
  const [agendarSessaoData, setAgendarSessaoData] = useState("");
  const [agendarSessaoHora, setAgendarSessaoHora] = useState("");
  const [agendarSessaoSalaId, setAgendarSessaoSalaId] = useState("");
  const [agendandoSessao, setAgendandoSessao] = useState(false);
  const [remarcarSaving, setRemarcarSaving] = useState(false);
  const [selectSessionOpen, setSelectSessionOpen] = useState(false);
  const [agendandoCiclo, setAgendandoCiclo] = useState(false);
  const [resumoCiclo, setResumoCiclo] = useState<ResumoSessaoItem[] | null>(null);
  const [addIntermediateOpen, setAddIntermediateOpen] = useState(false);
  const [intermediateDate, setIntermediateDate] = useState("");
  const [intermediateAfterSession, setIntermediateAfterSession] = useState(0);
  const [addingIntermediate, setAddingIntermediate] = useState(false);
  const [editRealizadaOpen, setEditRealizadaOpen] = useState(false);
  const [editRealizadaTarget, setEditRealizadaTarget] = useState<TreatmentSession | null>(null);
  const [editRealizadaDate, setEditRealizadaDate] = useState("");
  const [editRealizadaProcedure, setEditRealizadaProcedure] = useState("");
  const [editRealizadaSoap, setEditRealizadaSoap] = useState({ subjetivo: "", objetivo: "", avaliacao: "", plano: "" });
  const [editRealizadaSaving, setEditRealizadaSaving] = useState(false);
  const [newCycle, setNewCycle] = useState({
    patient_id: "",
    professional_id: "",
    unit_id: "",
    specialty: "",
    treatment_type: "",
    total_sessions: 0,
    frequency: "1x_semana",
    start_date: new Date().toISOString().split("T")[0],
    clinical_notes: "",
    pts_id: "",
    weekdays: [] as number[],
    duration_months: 3,
  });
  const [newSession, setNewSession] = useState({
    clinical_notes: "",
    procedure_done: "",
    status: "realizada",
    absence_type: "",
  });
  const [soapNotes, setSoapNotes] = useState({
    subjetivo: "",
    objetivo: "",
    avaliacao: "",
    plano: "",
  });
  const [extensionOpen, setExtensionOpen] = useState(false);
  const [extensionForm, setExtensionForm] = useState({ new_sessions: 0, reason: "" });
  const [dischargeOpen, setDischargeOpen] = useState(false);
  const [dischargeFutureCount, setDischargeFutureCount] = useState(0);
  const [dischargeLoading, setDischargeLoading] = useState(false);
  const [dischargeForm, setDischargeForm] = useState({ reason: "", final_notes: "" });
  const [vincularPtsOpen, setVincularPtsOpen] = useState(false);
  const [selectedPtsId, setSelectedPtsId] = useState("");
  const [vinculandoPts, setVinculandoPts] = useState(false);
  const [addingFieldTrat, setAddingFieldTrat] = useState<string | null>(null);
  const [newOptionTextTrat, setNewOptionTextTrat] = useState("");
  const [copyingLastSession, setCopyingLastSession] = useState(false);
  const [registeringSession, setRegisteringSession] = useState(false);
  const [agendamentoMap, setAgendamentoMap] = useState<Record<string, { id: string; hora: string; status: string }>>({});
  const [sessions, setSessions] = useState<TreatmentSession[]>([]);
  const [extensions, setExtensions] = useState<TreatmentExtension[]>([]);
  const [loadedSessionsCycleId, setLoadedSessionsCycleId] = useState<string | null>(null);

  const effectiveProfissao = useMemo(() => {
    if (form.tipo_registro === 'sessao' && sessaoCycle?.specialty) return sessaoCycle.specialty;
    return user?.profissao;
  }, [form.tipo_registro, sessaoCycle?.specialty, user?.profissao]);

  const { isBlocoVisible, config: profConfig, visibleBlocks } = useProntuarioConfig(user?.id, form.tipo_registro, effectiveProfissao);
  const cycleProfissao = useMemo(() => {
    if (!selectedCycle) return undefined;
    const prof = funcionarios.find((p: any) => p.id === selectedCycle.professional_id);
    return prof?.profissao;
  }, [selectedCycle, funcionarios]);
  const cycleSoapOptions = useMemo(() => getSoapOptions(cycleProfissao), [cycleProfissao]);
  const cycleHasDropdown = useMemo(() => hasDropdownSoap(cycleProfissao), [cycleProfissao]);

  const loadCidsForProc = useCallback((procId: string) => {
    if (cidsByProc[procId]) return;
    procedureService.getCidsForProcedure(procId).then((list) => {
      setCidsByProc((m) => ({ ...m, [procId]: list }));
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

    const linked = await procedureService.getProceduresForCid(cid.codigo, 5);
    if (linked.length === 0) {
      toast.error("Selecione um procedimento antes de adicionar o CID.");
      return;
    }
    const first = linked[0];
    handlePickProcedimento(first.codigo, first.nome);
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

  const registrationReferenceDate = form.data_atendimento || searchParams.get('data') || new Date().toISOString().split('T')[0];
  const availableSessionsForRegistration = useMemo(() => {
    if (!sessaoCycle || sessaoCycleSessions.length === 0) return [];
    return sessaoCycleSessions.filter(
      (session) => !['realizada', 'paciente_faltou', 'cancelada', 'remarcada'].includes(session.status),
    );
  }, [sessaoCycle, sessaoCycleSessions]);

  const currentSessionForRegistration = useMemo(() => {
    if (!sessaoCycle || availableSessionsForRegistration.length === 0 || !registrationReferenceDate) return null;
    if (form.agendamento_id) {
      const exactAppointmentMatch = availableSessionsForRegistration.find(
        (session) => session.appointment_id === form.agendamento_id && session.scheduled_date === registrationReferenceDate,
      );
      if (exactAppointmentMatch) return exactAppointmentMatch;
    }
    return availableSessionsForRegistration.find((session) => session.scheduled_date === registrationReferenceDate) || null;
  }, [availableSessionsForRegistration, form.agendamento_id, registrationReferenceDate, sessaoCycle]);

  const sessionRegistrationRequested = useMemo(() => form.tipo_registro === 'sessao', [form.tipo_registro]);
  const sessionRegistrationError = useMemo(() => {
    if (form.tipo_registro !== 'sessao') return null;
    if (!sessaoCycle) return null;
    if (!registrationReferenceDate) return 'Defina a data do prontuário para registrar a sessão.';
    return null;
  }, [form.tipo_registro, registrationReferenceDate, sessaoCycle]);

  const sessionSoapPayload = useMemo(() => normalizeSoapPayload({
    subjetivo: form.soap_subjetivo,
    objetivo: form.soap_objetivo,
    avaliacao: form.soap_avaliacao,
    plano: form.soap_plano,
  }), [form.soap_avaliacao, form.soap_objetivo, form.soap_plano, form.soap_subjetivo]);

  const sessionSoapValidationError = useMemo(() => getSoapValidationError(sessionSoapPayload, { required: false }), [sessionSoapPayload, soapEnabled, effectiveProfissao]);

  const handleSave = async (): Promise<boolean> => {
    if (!form.paciente_nome || !form.data_atendimento) {
      toast.error("Paciente e data são obrigatórios.");
      return false;
    }
    const today = new Date().toISOString().split("T")[0];
    if (form.data_atendimento > today && !editId) {
      toast.error("Não é possível registrar prontuário para data futura.");
      return false;
    }
    if (sessionRegistrationError) {
      toast.error(sessionRegistrationError);
      return false;
    }
    setSoapErrors(false);
    setSaving(true);
    
    const effectiveEditId = editId;
    try {
      const procTexto = selectedProcIds.map((id) => {
        const p = procedimentos.find((pr) => pr.id === id);
        const detail = procDetails[id];
        const qtdStr = detail && detail.quantidade > 1 ? ` (${detail.quantidade}x)` : '';
        return p ? `${p.nome}${qtdStr}` : '';
      }).filter(Boolean).join(", ");

      const profIdToSave = effectiveEditId ? (form.profissional_id || user?.id || "") : (user?.id || "");
      const profNomeToSave = effectiveEditId ? (form.profissional_nome || funcionarios.find(f => f.id === profIdToSave)?.nome || user?.nome || "") : (user?.nome || "");

      const record: any = {
        paciente_id: form.paciente_id || `manual_${Date.now()}`,
        paciente_nome: form.paciente_nome,
        profissional_id: profIdToSave,
        profissional_nome: profNomeToSave,
        ...(effectiveEditId ? {} : { unidade_id: user?.unidadeId || "", setor: user?.setor || "" }),
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
        observacoes: Object.keys(especialidadeFields).length > 0 ? JSON.stringify({ especialidade_fields: especialidadeFields, texto: form.observacoes }) : form.observacoes,
        resultado_exame: form.resultado_exame || "",
        indicacao_retorno: form.indicacao_retorno === "no_indication" ? "" : form.indicacao_retorno || "",
        motivo_alteracao: effectiveEditId ? form.motivo_alteracao : "",
        procedimentos_texto: procTexto || form.procedimentos_texto || "",
        outro_procedimento: form.outro_procedimento || "",
        tipo_registro: form.tipo_registro || "consulta",
        soap_subjetivo: sessionSoapPayload.subjetivo,
        soap_objetivo: sessionSoapPayload.objetivo,
        soap_avaliacao: sessionSoapPayload.avaliacao,
        soap_plano: sessionSoapPayload.plano,
        custom_data: { ...customData, ...especialidadeFields },
      };

      if (form.episodio_id && form.episodio_id !== "no_episode") record.episodio_id = form.episodio_id;

      if (effectiveEditId) {
        await supabase.from("prontuarios").update(record).eq("id", effectiveEditId);
      } else {
        const { data: inserted } = await supabase.from("prontuarios").insert(record).select("id").single();
        if (inserted?.id) setEditId(inserted.id);
      }

      if (form.tipo_registro === 'sessao' && currentSessionForRegistration && sessaoCycle) {
        const procedureDone = procTexto || form.procedimentos_texto?.trim() || form.outro_procedimento?.trim() || form.queixa_principal?.trim() || 'Sessão registrada';
        await treatmentService.registerCompletedSession({
          cycle: sessaoCycle,
          session: currentSessionForRegistration,
          soap: sessionSoapPayload,
          procedureDone,
          userId: user?.id,
          appointmentId: form.agendamento_id || currentSessionForRegistration.appointment_id || null,
        });
        toast.success(`✅ Sessão ${currentSessionForRegistration.session_number} registrada!`);
      } else {
        toast.success(effectiveEditId ? "Prontuário atualizado!" : "Prontuário criado!");
      }

      setDialogOpen(false);
      return true;
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err?.message || "erro desconhecido"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const renderDynamicBlocks = () => {
    if (!visibleBlocks || visibleBlocks.length === 0) return null;
    return visibleBlocks.map((bloco) => {
      if (bloco.id === 'soap' || bloco.id === 'especialidade') return null;
      const fieldKey = bloco.id.replace('evolucao.', '');
      if (fieldKey === 'prescricao' || fieldKey === 'solicitacao_exames' || fieldKey === 'procedimentos') return null;
      return (
        <div key={bloco.id} className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider">
            {bloco.label} 
            {(bloco.obrigatorio || bloco.admin_obrigatorio) && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <DebouncedTextarea 
            rows={2}
            value={getFieldValue(fieldKey)} 
            onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
            placeholder={`${bloco.label}...`}
            className="text-sm"
          />
        </div>
      );
    });
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Prontuários</h1>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registro de Atendimento</DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              <div className="bg-muted/30 p-4 rounded-lg space-y-4">
                {renderDynamicBlocks()}
                
                {isBlocoVisible('especialidade') && user?.profissao && (
                  <CamposEspecialidade
                    profissao={user.profissao}
                    profissionalId={user.id}
                    tipoProntuario={form.tipo_registro}
                    values={especialidadeFields}
                    onChange={(k, v) => setEspecialidadeFields(p => ({ ...p, [k]: v }))}
                  />
                )}
              </div>
            </div>
            
            <div className="space-y-4">
              <Button className="w-full" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                Salvar Atendimento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProntuarioPage;
