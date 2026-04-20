import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import FichaPacienteCabecalho from "@/components/FichaPacienteCabecalho";
import { useProntuarioStructure } from "@/hooks/useProntuarioStructure";
import { useProntuarioConfig } from "@/hooks/useProntuarioConfig";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useData } from "@/contexts/DataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Loader2, Plus, FileText, Printer, Pencil, Search, CheckCircle, History, Trash2, Activity, ClipboardList, Heart, AlertTriangle, Clock, ChevronDown, Settings, X, Tag, Pencil as PencilIcon, Eye, MoreVertical, Download, Link2, Send } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
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
  agendamento_id: "",
  data_atendimento: new Date().toISOString().split("T")[0],
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

const ProntuarioPage: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const { pacientes, unidades, agendamentos, updateAgendamento, logAction, refreshAgendamentos, funcionarios, addAgendamento, getAvailableSlots, bloqueios } = useData();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [prontuarios, setProntuarios] = useState<ProntuarioDB[]>([]);
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
    start_date: new Date().toISOString().split("T")[0], clinical_notes: '',
    weekdays: [] as number[], duration_months: 3,
  });

  const [procedimentos, setProcedimentos] = useState<ProcedimentoDB[]>([]);
  const [selectedProcIds, setSelectedProcIds] = useState<string[]>([]);
  const [episodios, setEpisodios] = useState<{ id: string; titulo: string; status: string }[]>([]);
  const [cidsByProc, setCidsByProc] = useState<Record<string, { codigo: string; descricao: string }[]>>({});
  const [selectedCidsByProc, setSelectedCidsByProc] = useState<Record<string, string[]>>({});
  const [pacienteProcHistory, setPacienteProcHistory] = useState<{ id: string; nome: string; ultima: string }[]>([]);
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
      setSelectedCidsByProc((m) => ({ ...m, [procId]: m[procId] ?? list.map((x) => x.codigo) }));
    });
  }, [cidsByProc]);

  const toggleExpandProc = useCallback((procId: string) => {
    setExpandedProcId((prev) => {
      const next = prev === procId ? null : procId;
      if (next) loadCidsForProc(next);
      return next;
    });
  }, [loadCidsForProc]);

  const isProfissional = user?.role === "profissional";
  const canEdit = can('prontuario', 'can_edit');
  const canDelete = can('prontuario', 'can_delete');
  const tempoLimite = user?.tempoAtendimento || 30;
  const { getEnabledFields: getStructureSections } = useProntuarioStructure();
  const structureSections = getStructureSections();
  const { isBlocoVisible: isProfBlocoVisible, config: profConfig } = useProntuarioConfig(user?.id, form.tipo_registro);
  // Custom fields storage (for fields not in DB columns)
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  const soapCustom = useSoapCustomOptions(user?.id);
  const showSoapDropdown = hasDropdownSoap(user?.profissao);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [encInternoOpen, setEncInternoOpen] = useState(false);
  const [historicoCompletoOpen, setHistoricoCompletoOpen] = useState(false);
  const [viewerProntuario, setViewerProntuario] = useState<any | null>(null);
  const [historicoPacienteId, setHistoricoPacienteId] = useState<{ id: string; nome: string } | null>(null);
  const [listaExames, setListaExames] = useState<{ id: string; nome: string; codigo_sus: string; indicacao: string }[]>([]);
  const [listaPrescricao, setListaPrescricao] = useState<{ id: string; nome: string; dosagem: string; via: string; posologia: string; duracao: string }[]>([]);
  const [especialidadeFields, setEspecialidadeFields] = useState<Record<string, string>>({});

  // Sessão: cycle + PTS state
  interface CycleSession { id: string; cycle_id: string; patient_id: string; professional_id: string; session_number: number; total_sessions: number; scheduled_date: string; status: string; clinical_notes: string; procedure_done?: string; absence_type?: string | null; appointment_id: string | null; }
  interface ActiveCycle { id: string; treatment_type: string; professional_id: string; start_date: string; end_date_predicted: string | null; frequency: string; status: string; total_sessions: number; sessions_done: number; created_at: string; }
  interface ActivePTS { id: string; diagnostico_funcional: string; objetivos_terapeuticos: string; metas_curto_prazo: string; metas_medio_prazo: string; metas_longo_prazo: string; especialidades_envolvidas: string[]; created_at: string; professional_id: string; status: string; }
  const [sessaoCycle, setSessaoCycle] = useState<ActiveCycle | null>(null);
  const [sessaoCycleSessions, setSessaoCycleSessions] = useState<CycleSession[]>([]);
  const [sessaoPts, setSessaoPts] = useState<ActivePTS | null>(null);
  const [sessaoDataLoading, setSessaoDataLoading] = useState(false);
  const [sessaoHighlightSOAP, setSessaoHighlightSOAP] = useState(false);
  const [soapErrors, setSoapErrors] = useState(false);
  const [soapEnabled, setSoapEnabled] = useState(true);
  const [sessionRegistrationRequested, setSessionRegistrationRequested] = useState(false);
  const [confirmingSessionId, setConfirmingSessionId] = useState<string | null>(null);
  const soapRef = useRef<HTMLDivElement>(null);

  const loadSessaoData = async (patientId: string, _professionalId?: string) => {
    setSessaoDataLoading(true);
    try {
      // Search for ANY active cycle for this patient (not filtered by professional)
      // so cycles created by other professionals are also detected
      let cycleQuery = (supabase as any).from('treatment_cycles').select('*')
        .eq('patient_id', patientId)
        .in('status', ['em_andamento', 'ativo'])
        .order('created_at', { ascending: false })
        .limit(1);

      const [cycleRes, ptsRes] = await Promise.all([
        cycleQuery.maybeSingle(),
        supabase.from('pts').select('*')
          .eq('patient_id', patientId)
          .eq('status', 'ativo')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const cycle = cycleRes.data;
      setSessaoCycle(cycle || null);
      if (cycle) {
        const { data: sessions } = await (supabase as any).from('treatment_sessions').select('*')
          .eq('cycle_id', cycle.id)
          .order('session_number', { ascending: true });
        setSessaoCycleSessions(sessions || []);
      } else {
        setSessaoCycleSessions([]);
      }
      setSessaoPts(ptsRes.data as ActivePTS | null);
    } catch (err) {
      console.error('[loadSessaoData]', err);
    }
    setSessaoDataLoading(false);
  };

  const registrationReferenceDate =
    form.data_atendimento || searchParams.get('data') || new Date().toISOString().split('T')[0];
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
    if (sessionRegistrationError) {
      toast.error(sessionRegistrationError);
      return;
    }

    if (!currentSessionForRegistration) {
      toast.error(`Nenhuma sessão disponível para ${registrationReferenceDateLabel}.`);
      return;
    }

    const shouldSubmitSession = sessionRegistrationRequested || form.tipo_registro === 'sessao';

    setSessionRegistrationRequested(true);
    setSoapErrors(false);
    setForm((prev) => ({
      ...prev,
      tipo_registro: 'sessao',
      data_atendimento: registrationReferenceDate,
      agendamento_id: prev.agendamento_id || currentSessionForRegistration.appointment_id || '',
    }));

    if (shouldSubmitSession) {
      const effectiveError = soapEnabled && !isMedico(user?.profissao) ? sessionSoapValidationError : null;
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

      void handleSave();
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
    () => getSoapValidationError(sessionSoapPayload, { required: soapEnabled && !isMedico(user?.profissao) }),
    [sessionSoapPayload, soapEnabled, user?.profissao],
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
      const [procsList, medsRes, prefsRes] = await Promise.all([
        procedureService.getActive(),
        (supabase as any).from("medications").select("*").or(`is_global.eq.true,profissional_id.eq.${profId}`),
        supabase.from("professional_preferences").select("tipo,item_id,desabilitado").eq("profissional_id", profId),
      ]);
      setProcedimentos(procsList as any as ProcedimentoDB[]);
      if (medsRes.data) setMedications(medsRes.data as MedicationDB[]);
      if (prefsRes.data) setProfPreferences(prefsRes.data as any[]);
    };
    loadAll();
  }, [user?.id]);

  const filteredProcedimentos = useMemo(() => {
    if (!user) return [];
    const q = procSearch.trim().toLowerCase();
    return procedimentos.filter((p) => {
      if (user.profissao && p.profissao && p.profissao.toLowerCase() !== user.profissao.toLowerCase()) return false;
      if (p.profissionais_ids && p.profissionais_ids.length > 0 && !p.profissionais_ids.includes(user.id)) return false;
      if (q) {
        const hay = `${p.nome} ${p.id} ${p.especialidade}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [procedimentos, user, procSearch]);

  const loadProntuarios = async () => {
    setLoading(true);
    try {
      // All professionals can VIEW all prontuários — edit is restricted in the UI
      let query = (supabase as any).from("prontuarios").select("*").order("data_atendimento", { ascending: false });
      if (user?.unidadeId && user?.usuario !== 'admin.sms') query = query.eq("unidade_id", user.unidadeId);
      const { data, error } = await query;
      if (data) setProntuarios(data);
      if (error) console.error("Error loading prontuarios:", error);
    } catch (err) {
      console.error("Error:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadProntuarios();
  }, [user?.id, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const dialogOpenRef = useRef(false);
  useEffect(() => { dialogOpenRef.current = dialogOpen; }, [dialogOpen]);

  const silentRefreshProntuarios = useCallback(() => {
    // Don't refresh while user is editing — it resets form state (SOAP fields)
    if (dialogOpenRef.current) return;
    loadProntuarios();
  }, [user?.id, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  useRealtimeSubscription({
    tables: ['prontuarios', 'treatment_cycles', 'treatment_sessions'],
    onchange: silentRefreshProntuarios,
  });

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

  const loadProntuarioProcedimentos = async (prontuarioId: string) => {
    const { data } = await (supabase as any)
      .from("prontuario_procedimentos")
      .select("procedimento_id")
      .eq("prontuario_id", prontuarioId);
    if (data) setSelectedProcIds(data.map((d: any) => d.procedimento_id));
    else setSelectedProcIds([]);
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
        setForm({
          ...emptyForm,
          paciente_id: pacienteId,
          paciente_nome: pacienteNome,
          agendamento_id: agendamentoId || "",
          data_atendimento: data || new Date().toISOString().split("T")[0],
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
      loadSessaoData(form.paciente_id);
    }
  }, [form.tipo_registro, form.paciente_id, form.agendamento_id]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const { data } = await (supabase as any)
        .from("prontuario_procedimentos")
        .select("procedimento_id, prontuarios!inner(paciente_id, data_atendimento)")
        .eq("prontuarios.paciente_id", form.paciente_id)
        .order("criado_em", { ascending: false })
        .limit(50);
      const seen = new Map<string, { id: string; nome: string; ultima: string }>();
      (data || []).forEach((r: any) => {
        const proc = procedimentos.find((p) => p.id === r.procedimento_id);
        if (proc && !seen.has(proc.id)) {
          const dt = r.prontuarios?.data_atendimento || '';
          const ultima = dt ? new Date(dt).toLocaleDateString('pt-BR') : '';
          seen.set(proc.id, { id: proc.id, nome: proc.nome, ultima });
        }
      });
      setPacienteProcHistory(Array.from(seen.values()));
    })();
  }, [form.paciente_id, procedimentos]);

  const openNew = () => {
    setEditId(null);
    setActiveAtendimento(null);
    setSessionRegistrationRequested(false);
    setSelectedProcIds([]);
    setEpisodios([]);
    setListaExames([]);
    setListaPrescricao([]);
    setEspecialidadeFields({});
    setSoapErrors(false);
    setSoapEnabled(true);
    setForm({ ...emptyForm, data_atendimento: new Date().toISOString().split("T")[0], tipo_registro: "avaliacao_inicial" });
    setDialogOpen(true);
  };

  const openEdit = (p: ProntuarioDB) => {
    setEditId(p.id);
    setActiveAtendimento(null);
    setSessionRegistrationRequested(false);
    loadProntuarioProcedimentos(p.id);
    loadEpisodios(p.paciente_id);
    const formData = {
      paciente_id: p.paciente_id,
      paciente_nome: p.paciente_nome,
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
      observacoes: p.observacoes || "",
      indicacao_retorno: p.indicacao_retorno || "",
      motivo_alteracao: "",
      procedimentos_texto: p.procedimentos_texto || "",
      outro_procedimento: p.outro_procedimento || "",
      episodio_id: p.episodio_id || "",
      soap_subjetivo: (p as any).soap_subjetivo || "",
      soap_objetivo: (p as any).soap_objetivo || "",
      soap_avaliacao: (p as any).soap_avaliacao || "",
      soap_plano: (p as any).soap_plano || "",
    };
    setForm(formData);
    setPreviousForm(formData);
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
    // Load specialty fields from observacoes JSON
    try {
      const parsed = p.observacoes ? JSON.parse(p.observacoes) : null;
      if (parsed?.especialidade_fields && typeof parsed.especialidade_fields === 'object') {
        setEspecialidadeFields(parsed.especialidade_fields);
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

  const handleSave = async (): Promise<boolean> => {
    if (!form.paciente_nome || !form.data_atendimento) {
      toast.error("Paciente e data são obrigatórios.");
      return false;
    }
    // Prevent creating/editing prontuários for future dates
    const today = new Date().toISOString().split("T")[0];
    if (form.data_atendimento > today && !editId) {
      toast.error("Não é possível registrar prontuário para data futura. O atendimento precisa ocorrer primeiro.");
      return false;
    }
    if (editId && !form.motivo_alteracao && !isSessionRegistrationFlow) {
      toast.error("Informe o motivo da alteração para salvar.");
      return false;
    }
    if (sessionRegistrationError) {
      toast.error(sessionRegistrationError);
      return false;
    }
    const soapPayload = sessionSoapPayload;
    const soapValidationError = soapEnabled && !isMedico(user?.profissao) ? sessionSoapValidationError : null;
    if (soapValidationError) {
      setSoapErrors(true);
      soapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast.error(soapValidationError);
      return false;
    }
    setSoapErrors(false);
    setSaving(true);
    let insertedNewProntuario = false;
    let prontuarioId: string | null = editId;
    try {
      const procTexto = selectedProcIds
        .map((id) => {
          const p = procedimentos.find((pr) => pr.id === id);
          return p?.nome || "";
        })
        .filter(Boolean)
        .join(", ");

      const record: any = {
        paciente_id: form.paciente_id || `manual_${Date.now()}`,
        paciente_nome: form.paciente_nome,
        profissional_id: user?.id || "",
        profissional_nome: user?.nome || "",
        unidade_id: user?.unidadeId || "",
        setor: user?.setor || "",
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
        observacoes: Object.keys(especialidadeFields).length > 0
          ? JSON.stringify({ especialidade_fields: especialidadeFields, texto: form.observacoes })
          : form.observacoes,
        // CORRIGIDO: converte 'no_indication' para '' antes de salvar no banco
        indicacao_retorno: form.indicacao_retorno === "no_indication" ? "" : form.indicacao_retorno || "",
        motivo_alteracao: editId ? form.motivo_alteracao : "",
        procedimentos_texto: procTexto || form.procedimentos_texto || "",
        outro_procedimento: form.outro_procedimento || "",
        tipo_registro: form.tipo_registro || "consulta",
        soap_subjetivo: soapPayload.subjetivo,
        soap_objetivo: soapPayload.objetivo,
        soap_avaliacao: soapPayload.avaliacao,
        soap_plano: soapPayload.plano,
      };

      // CORRIGIDO: não salva 'no_episode' no banco
      if (form.episodio_id && form.episodio_id !== "no_episode") {
        record.episodio_id = form.episodio_id;
      }

      const pac = pacientes.find((px) => px.id === (form.paciente_id || record.paciente_id));
      if (editId) {
        const { error } = await (supabase as any).from("prontuarios").update(record).eq("id", editId);
        if (error) throw error;
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
        await logAction({
          acao: "prontuario_editado",
          entidade: "prontuario",
          entidadeId: editId,
          modulo: "prontuario",
          user,
          detalhes: {
            paciente_nome: form.paciente_nome,
            paciente_cpf: pac?.cpf || "",
            motivo_alteracao: form.motivo_alteracao,
            campos_alterados: camposAlterados,
          },
        });
      } else {
        const { data: inserted, error } = await (supabase as any)
          .from("prontuarios")
          .insert(record)
          .select("id")
          .single();
        if (error) throw error;
        prontuarioId = inserted?.id;
        insertedNewProntuario = true;
      }

      if (prontuarioId) {
        await (supabase as any).from("prontuario_procedimentos").delete().eq("prontuario_id", prontuarioId);
        if (selectedProcIds.length > 0) {
          const links = selectedProcIds.map((pid) => ({ prontuario_id: prontuarioId, procedimento_id: pid }));
          await (supabase as any).from("prontuario_procedimentos").insert(links);
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
        toast.success(editId ? "Prontuário atualizado!" : "Prontuário criado!");
      }

      if (!editId) {
        await logAction({
          acao: "prontuario_criado",
          entidade: "prontuario",
          entidadeId: prontuarioId || "",
          modulo: "prontuario",
          user,
          detalhes: { paciente_nome: form.paciente_nome, paciente_cpf: pac?.cpf || "" },
        });
      }

      await Promise.all([
        loadProntuarios(),
        refreshAgendamentos(),
        form.tipo_registro === 'sessao' && form.paciente_id
          ? loadSessaoData(form.paciente_id)
          : Promise.resolve(),
      ]);

      setSessionRegistrationRequested(false);
      // Only close dialog if NOT a session registration flow — keep prontuário open after session registration
      if (!shouldRegisterSession) {
        setDialogOpen(false);
      } else {
        // Session registered: update editId to the saved prontuário so user can continue editing
        if (prontuarioId) {
          setEditId(prontuarioId);
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
    }
  };

  const handleFinalizarAtendimento = async () => {
    const saved = await handleSave();
    if (!saved) return;

    // Resolve the agendamento ID — from activeAtendimento or form
    const agendamentoId = activeAtendimento?.agendamentoId || form.agendamento_id;
    if (!agendamentoId) {
      toast.error("Nenhum agendamento vinculado para finalizar.");
      return;
    }

    const now = new Date();
    const horaFim = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    let duracaoMinutos = 0;
    if (activeAtendimento?.horaInicio) {
      const [hi, mi] = activeAtendimento.horaInicio.split(":").map(Number);
      const [hf, mf] = horaFim.split(":").map(Number);
      duracaoMinutos = hf * 60 + mf - (hi * 60 + mi);
    }
    const pac = pacientes.find((px) => px.id === form.paciente_id);
    try {
      await (supabase as any)
        .from("atendimentos")
        .update({ hora_fim: horaFim, duracao_minutos: Math.max(0, duracaoMinutos), status: "finalizado" })
        .eq("agendamento_id", agendamentoId);
    } catch (err) {
      console.error("Error finalizing atendimento:", err);
    }

    // Auto-discharge: if cycle completed, register discharge
    if (sessaoCycle && form.tipo_registro === 'sessao') {
      const completedCount = sessaoCycleSessions.filter(s => s.status === 'realizada').length;
      if (completedCount >= sessaoCycle.total_sessions) {
        try {
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
        } catch (err) {
          console.error("Erro ao registrar alta automática:", err);
        }
      }
    }

    await logAction({
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
    });
    localStorage.removeItem(`timer_${agendamentoId}`);
    updateAgendamento(agendamentoId, { status: "concluido" });
    setActiveAtendimento(null);
    toast.success(`Atendimento finalizado!${duracaoMinutos > 0 ? ` Duração: ${Math.max(0, duracaoMinutos)} minutos.` : ''}`);
    navigate("/painel/agenda");
  };

  // Dedicated handler: register session only (no close)
  const handleRegistrarSessaoOnly = async () => {
    if (!currentSessionForRegistration || !sessaoCycle) {
      toast.error("Nenhuma sessão disponível para registro.");
      return;
    }
    if (sessionRegistrationError) {
      toast.error(sessionRegistrationError);
      return;
    }
    const soapPayload = sessionSoapPayload;
    const soapError = soapEnabled && !isMedico(user?.profissao) ? sessionSoapValidationError : null;
    if (soapError) {
      setSoapErrors(true);
      soapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast.error(soapError);
      return;
    }
    setSoapErrors(false);
    setSaving(true);
    let insertedNewProntuario = false;
    let prontuarioId: string | null = editId;
    try {
      const procTexto = selectedProcIds.map(id => procedimentos.find(pr => pr.id === id)?.nome || "").filter(Boolean).join(", ");
      const record: any = {
        paciente_id: form.paciente_id || `manual_${Date.now()}`,
        paciente_nome: form.paciente_nome,
        profissional_id: user?.id || "",
        profissional_nome: user?.nome || "",
        unidade_id: user?.unidadeId || "",
        setor: user?.setor || "",
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
        const { error } = await (supabase as any).from("prontuarios").update(record).eq("id", editId);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await (supabase as any).from("prontuarios").insert(record).select("id").single();
        if (error) throw error;
        prontuarioId = inserted?.id;
        insertedNewProntuario = true;
      }

      if (prontuarioId) {
        await (supabase as any).from("prontuario_procedimentos").delete().eq("prontuario_id", prontuarioId);
        if (selectedProcIds.length > 0) {
          const links = selectedProcIds.map(pid => ({ prontuario_id: prontuarioId, procedimento_id: pid }));
          await (supabase as any).from("prontuario_procedimentos").insert(links);
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
        loadSessaoData(form.paciente_id),
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
        loadSessaoData(form.paciente_id),
        refreshAgendamentos(),
      ]);
    } catch (err: any) {
      console.error("Erro ao confirmar sessão:", err);
      toast.error(err?.message?.startsWith('Preencha') ? err.message : '❌ Erro ao confirmar sessão.');
    } finally {
      setConfirmingSessionId(null);
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
      setProntuarios((prev) => prev.filter((pr) => pr.id !== p.id));
      toast.success("Prontuário excluído!");
    } catch (err) {
      console.error("Error deleting:", err);
      toast.error("Erro ao excluir prontuário.");
    }
  };

  const handlePrint = (p: ProntuarioDB) => {
    const pac = pacientes.find((px) => px.id === p.paciente_id);
    logAction({
      acao: "prontuario_exportado_pdf",
      entidade: "prontuario",
      entidadeId: p.id,
      modulo: "prontuario",
      user,
      detalhes: { paciente_nome: p.paciente_nome, paciente_cpf: pac?.cpf || "" },
    });
    const unidadeNome = unidades.find((u) => u.id === p.unidade_id)?.nome || p.unidade_id;
    const sections = [
      { title: "Queixa Principal", content: p.queixa_principal },
      { title: "Anamnese", content: p.anamnese },
      { title: "Sinais e Sintomas", content: p.sinais_sintomas },
      { title: "Exame Físico", content: p.exame_fisico },
      { title: "Hipótese / Avaliação", content: p.hipotese },
      { title: "Conduta", content: p.conduta },
      { title: "Prescrição / Orientações", content: p.prescricao },
      { title: "Solicitação de Exames", content: p.solicitacao_exames },
      { title: "Evolução", content: p.evolucao },
      { title: "Procedimentos", content: p.procedimentos_texto },
      { title: "Observações Gerais", content: p.observacoes },
      { title: "Indicação de Retorno", content: p.indicacao_retorno },
    ]
      .filter((s) => s.content)
      .map(
        (s) =>
          `<div class="section"><div class="section-title">${s.title}</div><div class="section-content">${s.content}</div></div>`,
      )
      .join("");
    const body = `
      <div class="info-grid">
        <div><span class="info-label">Paciente:</span><br/><span class="info-value">${p.paciente_nome}</span></div>
        <div><span class="info-label">Data:</span><br/><span class="info-value">${new Date(p.data_atendimento + "T12:00:00").toLocaleDateString("pt-BR")}</span></div>
        <div><span class="info-label">Profissional:</span><br/><span class="info-value">${p.profissional_nome}</span></div>
        <div><span class="info-label">Hora:</span><br/><span class="info-value">${p.hora_atendimento || "-"}</span></div>
        <div><span class="info-label">Unidade:</span><br/><span class="info-value">${unidadeNome}</span></div>
        <div><span class="info-label">Setor:</span><br/><span class="info-value">${p.setor || "-"}</span></div>
      </div>
      ${sections}
      <div class="signature">
        <div class="signature-line"></div>
        <div class="name">${p.profissional_nome}</div>
        <div class="role">${p.setor || ""}</div>
      </div>`;
    openPrintDocument("Prontuário de Atendimento", body, { Unidade: unidadeNome });
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
        { title: "Anamnese", content: p.anamnese },
        { title: "Sinais e Sintomas", content: p.sinais_sintomas },
        { title: "Exame Físico", content: p.exame_fisico },
        { title: "Hipótese / Avaliação", content: p.hipotese },
        { title: "Conduta", content: p.conduta },
        { title: "Prescrição", content: p.prescricao },
        { title: "Evolução", content: p.evolucao },
        { title: "Procedimentos", content: p.procedimentos_texto },
        { title: "Observações", content: p.observacoes },
      ].filter((s) => s.content).map(
        (s) => `<div class="section"><div class="section-title">${s.title}</div><div class="section-content">${s.content}</div></div>`
      ).join("");
      return `
        <div style="page-break-inside:avoid;margin-bottom:24px;border:1px solid #ddd;border-radius:8px;padding:16px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <strong>${new Date(p.data_atendimento + "T12:00:00").toLocaleDateString("pt-BR")} ${p.hora_atendimento || ""}</strong>
            <span style="color:#666;">Prof. ${p.profissional_nome} • ${unidadeNome}</span>
          </div>
          ${fields}
        </div>`;
    }).join("");

    const body = `
      <div class="info-grid">
        <div><span class="info-label">Paciente:</span><br/><span class="info-value">${pacienteNome}</span></div>
        <div><span class="info-label">CPF:</span><br/><span class="info-value">${pac?.cpf || "—"}</span></div>
        <div><span class="info-label">CNS:</span><br/><span class="info-value">${(pac as any)?.cns || "—"}</span></div>
        <div><span class="info-label">Total de Registros:</span><br/><span class="info-value">${patientRecords.length}</span></div>
      </div>
      <h3 style="margin:16px 0 8px;font-size:14px;font-weight:bold;">Histórico Clínico Completo</h3>
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
      setCycleForm({ treatment_type: '', total_sessions: 0, frequency: '1x_semana', start_date: new Date().toISOString().split("T")[0], clinical_notes: '', weekdays: [], duration_months: 3 });
    } catch (err: any) {
      toast.error("Erro ao criar ciclo: " + (err?.message || ""));
    }
    setCycleSaving(false);
  };

  const queryPacienteId = searchParams.get("pacienteId");
  const filtered = prontuarios.filter((p) => {
    if (queryPacienteId) return p.paciente_id === queryPacienteId;
    if (!search) return true;
    const term = search.toLowerCase();
    // Search by patient name, professional name, CPF or CNS
    const pac = pacientes.find((px) => px.id === p.paciente_id);
    return (
      p.paciente_nome.toLowerCase().includes(term) ||
      p.profissional_nome.toLowerCase().includes(term) ||
      (pac?.cpf || "").replace(/[.\-/]/g, "").includes(term.replace(/[.\-/]/g, "")) ||
      ((pac as any)?.cns || "").includes(term)
    );
  });
  const queryPacienteNome = searchParams.get("pacienteNome");

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
            <Button onClick={openNew} className="gradient-primary text-primary-foreground">
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="font-display">{editId ? "Editar" : "Novo"} Prontuário</DialogTitle>
          </DialogHeader>

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
              triagem={triagem ? {
                pressao_arterial: triagem.pressao_arterial,
                temperatura: triagem.temperatura,
                saturacao_oxigenio: triagem.saturacao_oxigenio,
                frequencia_cardiaca: triagem.frequencia_cardiaca,
                classificacao_risco: (triagem as any).classificacao_risco,
              } : null}
              funcionarios={funcionarios.map(f => ({ id: f.id, nome: f.nome, profissao: f.profissao || "", ativo: f.ativo ?? true }))}
              onPacienteUpdated={() => {
                loadProntuarios();
              }}
            />
          )}

          {triagem && (
            <div className="space-y-3 pointer-events-none select-text">
              {triagem.alergias && triagem.alergias.length > 0 && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                  <strong className="text-destructive">⚠️ ALERGIAS:</strong> {triagem.alergias.join(", ")}
                </div>
              )}
              <div className="text-sm text-muted-foreground">
                Triagem realizada por: <strong className="text-foreground">{triagem.tecnico_nome}</strong>
                {triagem.tecnico_coren && ` | COREN: ${triagem.tecnico_coren}`}
                {triagem.confirmado_em &&
                  ` às ${new Date(triagem.confirmado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm bg-muted/50 rounded-lg p-3 border">
                {triagem.peso && (
                  <span>
                    Peso: <strong>{triagem.peso}kg</strong>
                  </span>
                )}
                {triagem.altura && (
                  <span>
                    Altura: <strong>{triagem.altura}cm</strong>
                  </span>
                )}
                {triagem.imc && (
                  <span>
                    IMC:{" "}
                    <strong>
                      {triagem.imc} ({classificarIMC(triagem.imc)})
                    </strong>
                  </span>
                )}
                {triagem.pressao_arterial && (
                  <span>
                    PA: <strong>{triagem.pressao_arterial} mmHg</strong>
                  </span>
                )}
                {triagem.temperatura && (
                  <span>
                    Temp: <strong>{triagem.temperatura}°C</strong>
                  </span>
                )}
                {triagem.frequencia_cardiaca && (
                  <span>
                    FC: <strong>{triagem.frequencia_cardiaca} bpm</strong>
                  </span>
                )}
                {triagem.saturacao_oxigenio && (
                  <span>
                    SatO₂: <strong>{triagem.saturacao_oxigenio}%</strong>
                  </span>
                )}
                {triagem.glicemia && (
                  <span>
                    Glicemia: <strong>{triagem.glicemia} mg/dL</strong>
                  </span>
                )}
              </div>
              {triagem.medicamentos && triagem.medicamentos.length > 0 && (
                <div className="text-sm">
                  <strong>Medicamentos em uso:</strong> {triagem.medicamentos.join(", ")}
                </div>
              )}
              {triagem.queixa && (
                <div className="text-sm">
                  <strong>Queixa (triagem):</strong> {triagem.queixa}
                </div>
              )}
            </div>
          )}
          {form.agendamento_id && !triagem && (
            <p className="text-xs text-muted-foreground italic">Triagem não realizada para este atendimento.</p>
          )}

          {patientHistory.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-3 border">
              <div className="flex items-center gap-2 mb-2">
                <History className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">
                  Histórico do Paciente ({patientHistory.length} anterior(es))
                </span>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {patientHistory.slice(0, 5).map((ph) => (
                  <div
                    key={ph.id}
                    className="flex items-center justify-between text-xs text-muted-foreground bg-background rounded px-2 py-1.5"
                  >
                    <span>
                      {new Date(ph.data_atendimento + "T12:00:00").toLocaleDateString("pt-BR")} — {ph.profissional_nome}
                    </span>
                    <span className="truncate ml-2 max-w-[200px]">
                      {ph.queixa_principal || "Sem queixa registrada"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Paciente *</Label>
                <BuscaPaciente
                  pacientes={pacientes}
                  value={form.paciente_id}
                  onChange={(id, nome) => {
                    setForm((prev) => ({ ...prev, paciente_id: id, paciente_nome: nome }));
                    if (id) loadEpisodios(id);
                  }}
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
              <div className="flex items-center justify-end mt-1">
                <Button type="button" variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" onClick={() => navigate('/painel/meu-prontuario')}>
                  <Settings className="w-3 h-3" /> Personalizar meu prontuário
                </Button>
              </div>
            </div>

            {/* ===== TYPE-SPECIFIC FORM SECTIONS ===== */}

            {/* SOAP Evolution — ALL 5 types */}
            <SoapFieldsAdaptive
              profissao={user?.profissao}
              values={{
                soap_subjetivo: form.soap_subjetivo,
                soap_objetivo: form.soap_objetivo,
                soap_avaliacao: form.soap_avaliacao,
                soap_plano: form.soap_plano,
              }}
              onChange={(field, value) => setForm(p => ({ ...p, [field]: value }))}
              soapErrors={soapErrors}
              onClearErrors={() => setSoapErrors(false)}
              soapEnabled={soapEnabled}
              onToggleSoap={setSoapEnabled}
              highlightSOAP={sessaoHighlightSOAP}
              soapRef={soapRef as React.RefObject<HTMLDivElement>}
              customOptionsForField={showSoapDropdown ? soapCustom.getOptionsForField : undefined}
              customOptionsWithId={showSoapDropdown ? soapCustom.getOptionWithId : undefined}
              onAddCustomOption={showSoapDropdown ? (campo, opcao) => soapCustom.addOption(campo, opcao, user?.profissao || '') : undefined}
              onDeleteCustomOption={showSoapDropdown ? soapCustom.deleteOption : undefined}
            />

            {/* 🟢 PRONTUÁRIO 1 — AVALIAÇÃO INICIAL */}
            {form.tipo_registro === 'avaliacao_inicial' && (
              <div className="space-y-4">
                <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                  <h4 className="text-sm font-semibold text-foreground mb-3">🟢 Avaliação Inicial</h4>
                  <div className="space-y-3">
                    <div><Label>Queixa Principal <span className="text-destructive">*</span></Label><DebouncedTextarea rows={2} value={form.queixa_principal} onChange={(e) => setForm((p) => ({ ...p, queixa_principal: e.target.value }))} /></div>
                    <div><Label>História da Doença Atual <span className="text-destructive">*</span></Label><DebouncedTextarea rows={3} value={form.anamnese} onChange={(e) => setForm((p) => ({ ...p, anamnese: e.target.value }))} placeholder="HDA detalhada..." /></div>
                    <div><Label>Histórico de Saúde</Label><DebouncedTextarea rows={2} value={form.sinais_sintomas} onChange={(e) => setForm((p) => ({ ...p, sinais_sintomas: e.target.value }))} placeholder="Antecedentes pessoais, familiares..." /></div>
                    <div><Label>Medicações em Uso</Label><DebouncedTextarea rows={2} value={form.exame_fisico} onChange={(e) => setForm((p) => ({ ...p, exame_fisico: e.target.value }))} placeholder="Medicações atuais do paciente..." /></div>
                    <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3">
                      <Label className="flex items-center gap-1">⚠️ Alergias</Label>
                      <DebouncedTextarea rows={1} value={form.hipotese} onChange={(e) => setForm((p) => ({ ...p, hipotese: e.target.value }))} placeholder="Listar alergias conhecidas..." className="border-destructive/30" />
                    </div>
                  </div>
                </div>

                {/* Card de Especialidade */}
                {user?.profissao && (
                  <CamposEspecialidade
                    profissao={user.profissao}
                    profissionalId={user.id}
                    tipoProntuario={form.tipo_registro as any}
                    values={especialidadeFields}
                    onChange={(key, val) => setEspecialidadeFields(prev => ({ ...prev, [key]: val }))}
                  />
                )}

                <div><Label>Diagnóstico Funcional</Label><DebouncedTextarea rows={2} value={form.conduta} onChange={(e) => setForm((p) => ({ ...p, conduta: e.target.value }))} placeholder="Diagnóstico funcional baseado na avaliação..." /></div>
                <div><Label>Conduta Inicial</Label><DebouncedTextarea rows={2} value={form.evolucao} onChange={(e) => setForm((p) => ({ ...p, evolucao: e.target.value }))} placeholder="Conduta clínica inicial..." /></div>

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
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                  <h4 className="text-sm font-semibold text-foreground mb-3">🔵 Retorno</h4>
                  <div className="space-y-3">
                    {patientHistory.length > 0 && (
                      <div className="bg-muted/50 rounded-md p-2 border">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Resumo do último atendimento (somente leitura)</p>
                        <p className="text-sm text-foreground">{patientHistory[0]?.queixa_principal || "Sem queixa registrada"}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(patientHistory[0]?.data_atendimento + "T12:00:00").toLocaleDateString("pt-BR")} — {patientHistory[0]?.profissional_nome}
                        </p>
                      </div>
                    )}
                    <div><Label>Reavaliação</Label><DebouncedTextarea rows={2} value={form.queixa_principal} onChange={(e) => setForm((p) => ({ ...p, queixa_principal: e.target.value }))} placeholder="Reavaliação do quadro clínico..." /></div>
                    <div><Label>Evolução Clínica</Label><DebouncedTextarea rows={2} value={form.anamnese} onChange={(e) => setForm((p) => ({ ...p, anamnese: e.target.value }))} placeholder="Como o paciente evoluiu desde o último atendimento..." /></div>
                    <div><Label>Ajuste de Conduta</Label><DebouncedTextarea rows={2} value={form.conduta} onChange={(e) => setForm((p) => ({ ...p, conduta: e.target.value }))} placeholder="Mudanças na conduta terapêutica..." /></div>
                  </div>
                </div>

                {user?.profissao && (
                  <CamposEspecialidade
                    profissao={user.profissao}
                    profissionalId={user.id}
                    tipoProntuario={form.tipo_registro as any}
                    values={especialidadeFields}
                    onChange={(key, val) => setEspecialidadeFields(prev => ({ ...prev, [key]: val }))}
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
                    <div className="rounded-lg border bg-card p-4 space-y-3">
                      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Activity className="w-4 h-4 text-primary" /> Ciclo de Tratamento Ativo
                      </h4>
                      {sessaoCycle ? (
                        <>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div><span className="text-muted-foreground">Tipo:</span> <strong>{sessaoCycle.treatment_type}</strong></div>
                            <div><span className="text-muted-foreground">Status:</span>{' '}
                              <Badge variant={sessaoCycle.status === 'em_andamento' ? 'default' : sessaoCycle.status === 'concluido' ? 'secondary' : 'outline'} className="text-xs">
                                {sessaoCycle.status === 'em_andamento' ? 'Ativo' : sessaoCycle.status === 'concluido' ? 'Concluído' : sessaoCycle.status}
                              </Badge>
                            </div>
                            <div><span className="text-muted-foreground">Início:</span> <strong>{new Date(sessaoCycle.start_date + 'T12:00:00').toLocaleDateString('pt-BR')}</strong></div>
                            <div><span className="text-muted-foreground">Previsão:</span> <strong>{sessaoCycle.end_date_predicted ? new Date(sessaoCycle.end_date_predicted + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</strong></div>
                            <div><span className="text-muted-foreground">Frequência:</span> <strong>{sessaoCycle.frequency}</strong></div>
                          </div>
                          {/* Progress bar */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Sessão {sessaoCycle.sessions_done} de {sessaoCycle.total_sessions} realizadas</span>
                              <span>{Math.round((sessaoCycle.sessions_done / sessaoCycle.total_sessions) * 100)}%</span>
                            </div>
                            <Progress value={(sessaoCycle.sessions_done / sessaoCycle.total_sessions) * 100} className="h-2" />
                          </div>
                          {/* Session list */}
                          {sessaoCycleSessions.length > 0 && (
                            <div className="border rounded-md overflow-hidden">
                              <table className="w-full text-xs">
                                <thead className="bg-muted/50">
                                  <tr>
                                    <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Nº</th>
                                    <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Data</th>
                                    <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Status</th>
                                    <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Ação</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sessaoCycleSessions.map(s => {
                                    const isCurrent = currentSessionForRegistration?.id === s.id;
                                    const isRealizada = s.status === 'realizada';
                                    const isPending = !['realizada', 'paciente_faltou', 'cancelada', 'remarcada'].includes(s.status);
                                    const isConfirming = confirmingSessionId === s.id;
                                    const statusIcon = isRealizada ? '✅' : isCurrent ? '🔵' : isPending ? '⏳' : '❌';
                                    const statusLabel = isRealizada ? 'Realizada' : isCurrent ? 'Atual' : s.status === 'falta' || s.status === 'paciente_faltou' ? 'Falta' : s.status === 'cancelada' ? 'Cancelada' : 'Aguardando';
                                    return (
                                      <tr key={s.id} className={`border-t ${isCurrent ? 'bg-primary/5' : ''}`}>
                                        <td className="px-2 py-1.5 font-mono">{s.session_number}</td>
                                        <td className="px-2 py-1.5">{new Date(s.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                                        <td className="px-2 py-1.5">{statusIcon} {statusLabel}</td>
                                        <td className="px-2 py-1.5 text-right">
                                          {isPending && !isRealizada && (
                                            <Button
                                              size="sm"
                                              variant={isCurrent ? "default" : "outline"}
                                              className="h-6 text-xs px-2"
                                              onClick={() => handleConfirmSession(s)}
                                              disabled={isConfirming || saving}
                                            >
                                              {isConfirming ? 'Confirmando...' : '✓ Confirmar'}
                                            </Button>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="space-y-2">
                          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">Nenhum ciclo ativo</Badge>
                          <div>
                            <Button type="button" variant="outline" size="sm" onClick={() => setCycleOpen(true)}>
                              <Activity className="w-3.5 h-3.5 mr-1" /> Criar ciclo de tratamento
                            </Button>
                          </div>
                        </div>
                      )}
                      {sessaoCycle?.status === 'concluido' && (
                        <div className="space-y-2">
                          <Badge variant="secondary" className="bg-green-500/10 text-green-700 border-green-500/30">Ciclo concluído</Badge>
                          <div>
                            <Button type="button" variant="outline" size="sm" onClick={() => setCycleOpen(true)}>
                              <Activity className="w-3.5 h-3.5 mr-1" /> Iniciar novo ciclo
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 2. PTS VINCULADO */}
                    <div className="rounded-lg border bg-card p-4 space-y-3">
                      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-primary" /> PTS Vinculado
                      </h4>
                      {sessaoPts ? (() => {
                        const createdAt = new Date(sessaoPts.created_at);
                        const now = new Date();
                        const monthsDiff = (now.getFullYear() - createdAt.getFullYear()) * 12 + (now.getMonth() - createdAt.getMonth());
                        const isOutdated = monthsDiff >= 12;
                        const metaPeriod = monthsDiff < 3 ? 'curto' : monthsDiff < 6 ? 'medio' : 'longo';
                        const profName = funcionarios.find(f => f.id === sessaoPts.professional_id)?.nome || '';
                        return (
                          <>
                            {isOutdated && (
                              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
                                <AlertTriangle className="w-3 h-3 mr-1" /> PTS desatualizado — revisar
                              </Badge>
                            )}
                            <div className="text-sm space-y-2">
                              <div><span className="text-muted-foreground">Diagnóstico Funcional:</span><p className="text-foreground">{sessaoPts.diagnostico_funcional}</p></div>
                              <div><span className="text-muted-foreground">Objetivos Terapêuticos:</span><p className="text-foreground">{sessaoPts.objetivos_terapeuticos}</p></div>
                              {/* Highlighted meta based on period */}
                              <div className={`rounded-md p-2 border ${metaPeriod === 'curto' ? 'bg-primary/5 border-primary/20' : metaPeriod === 'medio' ? 'bg-accent border-accent-foreground/10' : 'bg-muted/50 border-border'}`}>
                                <span className="text-xs font-semibold text-muted-foreground">
                                  {metaPeriod === 'curto' ? '🎯 Metas Curto Prazo (1-3 meses)' : metaPeriod === 'medio' ? '📋 Metas Médio Prazo (3-6 meses)' : '🔭 Metas Longo Prazo (6+ meses)'}
                                </span>
                                <p className="text-foreground text-sm mt-1">
                                  {metaPeriod === 'curto' ? sessaoPts.metas_curto_prazo : metaPeriod === 'medio' ? sessaoPts.metas_medio_prazo : sessaoPts.metas_longo_prazo}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {sessaoPts.especialidades_envolvidas.map(e => (
                                  <Badge key={e} variant="secondary" className="text-xs">{e}</Badge>
                                ))}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Criado em {new Date(sessaoPts.created_at).toLocaleDateString('pt-BR')}
                                {profName && ` por ${profName}`}
                              </div>
                            </div>
                          </>
                        );
                      })() : (
                        <div className="space-y-2">
                          <Badge variant="outline">PTS não cadastrado</Badge>
                          <div>
                            <Button type="button" variant="outline" size="sm" onClick={() => setPtsOpen(true)}>
                              <ClipboardList className="w-3.5 h-3.5 mr-1" /> Criar PTS
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 3-5. Sessão fields */}
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                      <h4 className="text-sm font-semibold text-foreground mb-3">🟡 Sessão</h4>
                      {currentSessionForRegistration && sessaoHighlightSOAP && (
                        <div className="bg-primary/10 border border-primary/30 rounded-md p-2 mb-3 text-sm text-primary font-medium">
                          Preencha a evolução para registrar esta sessão (Sessão {currentSessionForRegistration.session_number})
                        </div>
                      )}
                      <div className="space-y-3">
                        <div><Label>Procedimentos Realizados</Label><DebouncedTextarea rows={2} value={form.queixa_principal} onChange={(e) => setForm((p) => ({ ...p, queixa_principal: e.target.value }))} placeholder="Procedimentos realizados nesta sessão..." /></div>
                        <div><Label>Resposta do Paciente</Label><DebouncedTextarea rows={2} value={form.anamnese} onChange={(e) => setForm((p) => ({ ...p, anamnese: e.target.value }))} placeholder="Como o paciente respondeu à intervenção..." /></div>
                        <div><Label>Intercorrências</Label><DebouncedTextarea rows={2} value={form.sinais_sintomas} onChange={(e) => setForm((p) => ({ ...p, sinais_sintomas: e.target.value }))} placeholder="Sem intercorrências" /></div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 🔴 PRONTUÁRIO 4 — URGÊNCIA */}
            {form.tipo_registro === 'urgencia' && (
              <div className="space-y-4">
                <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3">
                  <h4 className="text-sm font-semibold text-foreground mb-3">🔴 Urgência</h4>
                  <div className="space-y-3">
                    {triagem && (
                      <div className="bg-muted/50 rounded-md p-2 border text-xs space-y-1">
                        <p className="font-semibold">Sinais Vitais (Triagem)</p>
                        <div className="flex flex-wrap gap-3">
                          {triagem.pressao_arterial && <span>PA: <strong>{triagem.pressao_arterial}</strong></span>}
                          {triagem.frequencia_cardiaca && <span>FC: <strong>{triagem.frequencia_cardiaca} bpm</strong></span>}
                          {triagem.temperatura && <span>Temp: <strong>{triagem.temperatura}°C</strong></span>}
                          {triagem.saturacao_oxigenio && <span>SatO₂: <strong>{triagem.saturacao_oxigenio}%</strong></span>}
                          {triagem.glicemia && <span>Glicemia: <strong>{triagem.glicemia} mg/dL</strong></span>}
                        </div>
                      </div>
                    )}
                    <div><Label>Queixa Imediata <span className="text-destructive">*</span></Label><DebouncedTextarea rows={2} value={form.queixa_principal} onChange={(e) => setForm((p) => ({ ...p, queixa_principal: e.target.value }))} placeholder="Queixa principal de urgência..." /></div>
                    <div><Label>Conduta Rápida</Label><DebouncedTextarea rows={2} value={form.conduta} onChange={(e) => setForm((p) => ({ ...p, conduta: e.target.value }))} placeholder="Conduta imediata adotada..." /></div>
                    <div><Label>Encaminhamento</Label><DebouncedTextarea rows={2} value={form.anamnese} onChange={(e) => setForm((p) => ({ ...p, anamnese: e.target.value }))} placeholder="Encaminhamento realizado (se aplicável)..." /></div>
                  </div>
                </div>
              </div>
            )}

            {/* 🟣 PRONTUÁRIO 5 — PROCEDIMENTO */}
            {form.tipo_registro === 'procedimento' && (
              <div className="space-y-4">
                <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-3">
                  <h4 className="text-sm font-semibold text-foreground mb-3">🟣 Procedimento</h4>
                  <div className="space-y-3">
                    <div><Label>Tipo de Exame/Procedimento</Label><DebouncedTextarea rows={2} value={form.queixa_principal} onChange={(e) => setForm((p) => ({ ...p, queixa_principal: e.target.value }))} placeholder="Tipo de procedimento realizado..." /></div>
                    <div><Label>Resultado</Label><DebouncedTextarea rows={2} value={form.anamnese} onChange={(e) => setForm((p) => ({ ...p, anamnese: e.target.value }))} placeholder="Resultado do procedimento/exame..." /></div>
                    <div><Label>Observações</Label><DebouncedTextarea rows={2} value={form.sinais_sintomas} onChange={(e) => setForm((p) => ({ ...p, sinais_sintomas: e.target.value }))} placeholder="Observações durante o procedimento..." /></div>
                    <div><Label>Conduta Pós-Procedimento</Label><DebouncedTextarea rows={2} value={form.conduta} onChange={(e) => setForm((p) => ({ ...p, conduta: e.target.value }))} placeholder="Orientações pós-procedimento..." /></div>
                  </div>
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
                        if (!selectedProcIds.includes(h.id)) setSelectedProcIds((prev) => [...prev, h.id]);
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
                  {user?.role === 'master' && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setNovoProcOpen(true)}>
                      <Plus className="h-3 w-3 mr-1" /> Novo Procedimento
                    </Button>
                  )}
                </div>
                <div className="relative mb-2">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    value={procSearch}
                    onChange={(e) => setProcSearch(e.target.value)}
                    placeholder="Pesquisar procedimento (nome, código SIGTAP, especialidade)..."
                    className="pl-7 h-8 text-sm"
                  />
                </div>
                {filteredProcedimentos.length > 0 ? (
                  <div className="flex flex-col gap-1.5 bg-muted/20 rounded-lg p-2 border max-h-72 overflow-y-auto">
                    {filteredProcedimentos.map((proc) => {
                      const checked = selectedProcIds.includes(proc.id);
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
                                if (c) loadCidsForProc(proc.id);
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
                            <div className="px-3 pb-3 pt-1 border-t bg-muted/10">
                              {proc.especialidade && (
                                <p className="text-[11px] text-muted-foreground mb-2">{proc.especialidade}</p>
                              )}
                              {/* Lupa unificada de CIDs */}
                              <div className="relative mb-2">
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
                                <div className="flex flex-wrap gap-1">
                                  {filteredCids.map((c) => {
                                    const isSel = selCids.includes(c.codigo);
                                    return (
                                      <Badge
                                        key={c.codigo}
                                        variant={isSel ? "default" : "outline"}
                                        className="cursor-pointer text-[11px] font-normal"
                                        onClick={() => {
                                          setSelectedCidsByProc((m) => ({
                                            ...m,
                                            [proc.id]: isSel ? (m[proc.id] || []).filter((x) => x !== c.codigo) : [...(m[proc.id] || []), c.codigo],
                                          }));
                                        }}
                                      >
                                        {c.codigo}{c.descricao ? ` · ${c.descricao.slice(0, 36)}` : ''}
                                      </Badge>
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
                                  <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                                    {searchResults
                                      .filter((c) => !cids.some((x) => x.codigo === c.codigo))
                                      .map((c) => {
                                        const isSel = (selectedCidsByProc[proc.id] || []).includes(c.codigo);
                                        return (
                                          <Badge
                                            key={c.codigo}
                                            variant={isSel ? "default" : "secondary"}
                                            className="cursor-pointer text-[11px] font-normal"
                                            onClick={() => {
                                              setCidsByProc((m) => ({ ...m, [proc.id]: [...(m[proc.id] || []), c] }));
                                              setSelectedCidsByProc((m) => ({
                                                ...m,
                                                [proc.id]: isSel ? (m[proc.id] || []).filter((x) => x !== c.codigo) : [...(m[proc.id] || []), c.codigo],
                                              }));
                                            }}
                                          >
                                            + {c.codigo}{c.descricao ? ` · ${c.descricao.slice(0, 36)}` : ''}
                                          </Badge>
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
              <Input value={form.outro_procedimento} onChange={(e) => setForm((p) => ({ ...p, outro_procedimento: e.target.value }))} placeholder="Descreva outro procedimento..." />
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
              pacienteCpf={pacientes.find(p => p.id === form.paciente_id)?.cpf}
              pacienteCns={pacientes.find(p => p.id === form.paciente_id)?.cns}
              dataAtendimento={form.data_atendimento}
              profissionalNome={user?.nome}
              profissionalConselho={user?.numeroConselho}
              profissionalTipoConselho={user?.tipoConselho}
              profissionalUfConselho={user?.ufConselho}
              unidadeNome={unidades.find(u => u.id === user?.unidadeId)?.nome}
            />
            )}

            {/* Solicitação de Exames — ALL types */}
            {isProfBlocoVisible('solicitacao_exames') && (
            <SolicitacaoExames
              profissionalId={user?.id || ""}
              value={listaExames}
              onChange={setListaExames}
              pacienteNome={form.paciente_nome}
              pacienteCpf={pacientes.find(p => p.id === form.paciente_id)?.cpf}
              pacienteCns={pacientes.find(p => p.id === form.paciente_id)?.cns}
              dataAtendimento={form.data_atendimento}
              profissionalNome={user?.nome}
              profissionalConselho={user?.numeroConselho}
              profissionalTipoConselho={user?.tipoConselho}
              profissionalUfConselho={user?.ufConselho}
              unidadeNome={unidades.find(u => u.id === user?.unidadeId)?.nome}
            />
            )}

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
                <Label className="text-warning">Motivo da Alteração *</Label>
                <Textarea
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

            <div className="flex gap-2 flex-wrap">
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
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="shadow-card border-0">
          <CardContent className="p-8 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhum prontuário encontrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const isOwn = p.profissional_id === user?.id;
            return (
              <Card
                key={p.id}
                className="shadow-card border border-transparent hover:border-primary/30 hover:shadow-md transition-all duration-200"
              >
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
                        onClick={() => setViewerProntuario(p)}
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
                        onClick={() => { downloadProntuarioPdf(p); toast.success("PDF gerado"); }}
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
            );
          })}
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
          dataAtendimento={new Date().toLocaleDateString('pt-BR')}
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
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
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
                {viewerProntuario.queixa_principal && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Queixa Principal</p>
                    <p className="text-foreground whitespace-pre-wrap">{viewerProntuario.queixa_principal}</p>
                  </div>
                )}
                {viewerProntuario.soap_subjetivo && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">S — Subjetivo</p>
                    <p className="text-foreground whitespace-pre-wrap">{viewerProntuario.soap_subjetivo}</p>
                  </div>
                )}
                {viewerProntuario.soap_objetivo && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">O — Objetivo</p>
                    <p className="text-foreground whitespace-pre-wrap">{viewerProntuario.soap_objetivo}</p>
                  </div>
                )}
                {viewerProntuario.soap_avaliacao && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">A — Avaliação</p>
                    <p className="text-foreground whitespace-pre-wrap">{viewerProntuario.soap_avaliacao}</p>
                  </div>
                )}
                {viewerProntuario.soap_plano && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">P — Plano</p>
                    <p className="text-foreground whitespace-pre-wrap">{viewerProntuario.soap_plano}</p>
                  </div>
                )}
                {viewerProntuario.evolucao && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Evolução</p>
                    <p className="text-foreground whitespace-pre-wrap">{viewerProntuario.evolucao}</p>
                  </div>
                )}
                {viewerProntuario.conduta && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Conduta</p>
                    <p className="text-foreground whitespace-pre-wrap">{viewerProntuario.conduta}</p>
                  </div>
                )}
                {viewerProntuario.procedimentos_texto && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Procedimentos</p>
                    <p className="text-foreground whitespace-pre-wrap">{viewerProntuario.procedimentos_texto}</p>
                  </div>
                )}
                {viewerProntuario.prescricao && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Prescrição</p>
                    <p className="text-foreground whitespace-pre-wrap">{viewerProntuario.prescricao}</p>
                  </div>
                )}
                {viewerProntuario.solicitacao_exames && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Exames Solicitados</p>
                    <p className="text-foreground whitespace-pre-wrap">{viewerProntuario.solicitacao_exames}</p>
                  </div>
                )}
              </div>

              <Separator className="my-4" />

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => { downloadProntuarioPdf(viewerProntuario); toast.success("PDF gerado"); }}>
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
