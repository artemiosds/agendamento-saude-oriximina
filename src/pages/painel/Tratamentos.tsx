import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { isSessionFalta } from "@/lib/sessionFalta";
import { usePacientes } from "@/contexts/PacientesContext";
import { useOperacional } from "@/contexts/OperacionalContext";
import { useFila } from "@/contexts/FilaContext";
import { useAgendamentos } from "@/contexts/AgendamentosContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { supabase } from "@/integrations/supabase/client";
import { normalizeSoapPayload, treatmentService } from "@/services/treatmentService";
import { createTreatmentSessionOperations, type TreatmentOperationRpcClient } from "@/services/treatmentSessionOperations";
import { getSoapOptions, hasDropdownSoap, isMedico, normalizeProfissaoForSoap } from "@/data/soapOptionsByProfession";
import { useSoapCustomOptions } from "@/hooks/useSoapCustomOptions";

import { BuscaPaciente } from "@/components/BuscaPaciente";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  ArrowLeft,
  Play,
  CheckCircle,
  RotateCcw,
  ChevronRight,
  Loader2,
  ListOrdered,
  X,
  Calendar,
  CalendarClock,
  AlertTriangle,
  FileText,
  Link2,
  Unlink,
  Pencil,
  Eraser,
  Search,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { useUnidadeFilter } from "@/hooks/useUnidadeFilter";
import { addDaysToDateStr, cn, isoDayOfWeek, todayLocalStr } from "@/lib/utils";
import { isTimeWithinTurnWindow } from "@/lib/appointmentTimeSelection";
import { Checkbox } from "@/components/ui/checkbox";
import { FREQUENCY_OPTIONS_NEW, WEEKDAY_LABELS, getMaxWeekdays, isWeekdayFrequency, calculateTotalSessions, generateSessionDatesWithInfo, calcEndDateFromSessions, buildBlockedRanges, generateSessionDates, isInvalidSessionDate } from "@/lib/treatmentSessionGenerator";
import { autoFixInvalidTreatmentSessions } from "@/lib/treatmentSessionAutoFix";
import { ModalAgendarSessao } from "@/components/ModalAgendarSessao";
import { AltaTratamentoDialog } from "@/components/tratamentos/AltaTratamentoDialog";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { ResumoAgendamentoCiclo, type ResumoSessaoItem } from "@/components/ResumoAgendamentoCiclo";
import { CalendarCheck } from "lucide-react";
import { CardListSkeleton } from "@/components/skeletons/CardListSkeleton";
import { createRequestGeneration, isRequestCurrent } from "@/lib/requestGeneration";
import { useTreatmentPtsData, type TreatmentPtsRecord } from "@/hooks/useTreatmentPtsData";
import { resolveTreatmentSessionIntegrity, type TreatmentAppointmentSnapshot } from "@/lib/treatmentSessionIntegrity";
import type { Agendamento } from "@/types";
import type { TreatmentDischargeResult } from "@/services/treatmentDischargeService";

interface TreatmentCycle {
  id: string;
  patient_id: string;
  professional_id: string;
  unit_id: string;
  specialty: string;
  treatment_type: string;
  start_date: string;
  end_date_predicted: string | null;
  total_sessions: number;
  sessions_done: number;
  frequency: string;
  status: string;
  clinical_notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  pts_id: string | null;
  // Lightweight stats from server-side RPC
  pending_ag?: number;
  faltas?: number;
  // Snapshot do nome do paciente vindo do RPC (fallback)
  paciente_nome?: string;
}

// Older app versions marked a cycle "concluido" as soon as its planned
// sessions were recorded. A real clinical discharge is stored separately as
// "finalizado_alta", so keep these legacy full cycles actionable until the
// professional explicitly records the discharge or requests an extension.
const ACTIVE_DUPLICATE_STATUSES: string[] = ["em_andamento", "aguardando_vaga", "em_fila"];

function isLegacyCycleAwaitingDischarge(cycle: Pick<TreatmentCycle, "status" | "sessions_done" | "total_sessions">) {
  return cycle.status === "concluido" && cycle.total_sessions > 0 && cycle.sessions_done >= cycle.total_sessions;
}

interface TreatmentSession {
  id: string;
  cycle_id: string;
  patient_id: string;
  professional_id: string;
  appointment_id: string | null;
  session_number: number;
  total_sessions: number;
  scheduled_date: string;
  status: string;
  absence_type: string | null;
  clinical_notes: string;
  procedure_done: string;
  created_at: string;
}

function treatmentAppointmentKey(patientId: string, professionalId: string, unitId: string, date: string) {
  return `${patientId}|${professionalId}|${unitId}|${date}`;
}

function appointmentSnapshot(appointment: Pick<Agendamento, "id" | "pacienteId" | "profissionalId" | "unidadeId" | "data" | "hora" | "status">): TreatmentAppointmentSnapshot {
  return {
    id: appointment.id,
    paciente_id: appointment.pacienteId,
    profissional_id: appointment.profissionalId,
    unidade_id: appointment.unidadeId,
    data: appointment.data,
    hora: appointment.hora,
    status: appointment.status,
  };
}

interface TreatmentExtension {
  id: string;
  cycle_id: string;
  previous_sessions: number;
  new_sessions: number;
  previous_end_date: string | null;
  new_end_date: string | null;
  reason: string;
  changed_by: string;
  changed_at: string;
}

const statusColors: Record<string, string> = {
  em_andamento: "bg-success/15 text-success border-success/30",
  concluido: "bg-success/10 text-success border-success/30",
  aguardando_vaga: "bg-warning/15 text-warning border-warning/30",
  em_fila: "bg-info/15 text-info border-info/30",
  finalizado_alta: "bg-muted text-muted-foreground border-border",
  suspenso: "bg-destructive/15 text-destructive border-destructive/30",
  em_reavaliacao: "bg-purple-500/15 text-purple-600 border-purple-500/30",
};

const statusLabels: Record<string, string> = {
  em_andamento: "Em Andamento",
  concluido: "Concluído",
  aguardando_vaga: "Aguardando Vaga",
  em_fila: "Em Fila",
  finalizado_alta: "Finalizado (Alta)",
  suspenso: "Suspenso",
  em_reavaliacao: "Em Reavaliação",
};

// frequency options moved to treatmentSessionGenerator

const sessionStatusColors: Record<string, string> = {
  pendente_agendamento: "bg-warning/10 text-warning",
  agendada: "bg-info/10 text-info",
  realizada: "bg-success/10 text-success",
  paciente_faltou: "bg-destructive/10 text-destructive",
  falta: "bg-destructive/10 text-destructive",
  cancelada: "bg-muted text-muted-foreground",
  remarcada: "bg-warning/10 text-warning",
};

const sessionStatusLabels: Record<string, string> = {
  pendente_agendamento: "Ag. Agendamento",
  agendada: "Agendada",
  realizada: "Realizada",
  paciente_faltou: "Faltou",
  falta: "Faltou",
  cancelada: "Cancelada",
  remarcada: "Remarcada",
};

const Tratamentos: React.FC = () => {
  const { pacientes } = usePacientes();
  const { funcionarios, unidades, salas, disponibilidades, bloqueios, logAction, getAvailableSlots, getAvailableDates, getTurnoInfo } = useOperacional();
  const { fila, addToFila } = useFila();
  const {
    addAgendamentoTransactionally,
    cancelAgendamento,
    deleteAgendamentoTransactionally,
    applyTreatmentAgendamentoUpdate,
  } = useAgendamentos();
  const { user } = useAuth();
  const restrictTreatmentUnit = !!(user?.unidadeId && user?.usuario !== "admin.sms");
  const treatmentUnitId = restrictTreatmentUnit ? user?.unidadeId : undefined;
  const { can } = usePermissions();
  const { unidadesVisiveis, profissionaisVisiveis } = useUnidadeFilter();
  const profissionais = profissionaisVisiveis;

  const [cycles, setCycles] = useState<TreatmentCycle[]>([]);
  const [sessions, setSessions] = useState<TreatmentSession[]>([]);
  const [extensions, setExtensions] = useState<TreatmentExtension[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCycle, setSelectedCycle] = useState<TreatmentCycle | null>(null);
  // Map: "patientId|profId|date" -> { id, hora, status }
  const [agendamentoMap, setAgendamentoMap] = useState<Record<string, TreatmentAppointmentSnapshot[]>>({});
  const [appointmentByIdMap, setAppointmentByIdMap] = useState<Record<string, TreatmentAppointmentSnapshot>>({});
  const [vincularPtsOpen, setVincularPtsOpen] = useState(false);
  const [selectedPtsId, setSelectedPtsId] = useState("");
  const [vinculandoPts, setVinculandoPts] = useState(false);

  const [filterProf, setFilterProf] = useState("all");
  const [filterUnit, setFilterUnit] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  // Debounce search input — evita recarregar a página/spinner a cada tecla
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearchTerm(searchTerm.trim()), 350);
    return () => window.clearTimeout(t);
  }, [searchTerm]);

  // Pagination
  const PAGE_SIZE = 20;
  const [currentPage, setCurrentPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [extensionOpen, setExtensionOpen] = useState(false);
  const [dischargeOpen, setDischargeOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TreatmentCycle | null>(null);
  const [duplicateConfirm, setDuplicateConfirm] = useState<TreatmentCycle[]>([]);

  const [agendarSessaoTarget, setAgendarSessaoTarget] = useState<TreatmentSession | null>(null);
  const [agendarSessaoData, setAgendarSessaoData] = useState("");
  const [agendarSessaoHora, setAgendarSessaoHora] = useState("");
  const [agendarSessaoSalaId, setAgendarSessaoSalaId] = useState("");
  const [agendandoSessao, setAgendandoSessao] = useState(false);

  const [remarcarTarget, setRemarcarTarget] = useState<TreatmentSession | null>(null);
  const [remarcarData, setRemarcarData] = useState("");
  const [remarcarBlockedMsg, setRemarcarBlockedMsg] = useState("");
  const [remarcarSaving, setRemarcarSaving] = useState(false);

  // Agendar ciclo completo
  const [agendandoCiclo, setAgendandoCiclo] = useState(false);
  const [corrigindoDatasInvalidas, setCorrigindoDatasInvalidas] = useState(false);
  const agendarCicloInFlightRef = useRef(false);
  const [resumoCiclo, setResumoCiclo] = useState<ResumoSessaoItem[] | null>(null);

  // Master: add intermediate session
  const [addIntermediateOpen, setAddIntermediateOpen] = useState(false);
  const [intermediateDate, setIntermediateDate] = useState("");
  const [intermediateAfterSession, setIntermediateAfterSession] = useState(0);
  const [addingIntermediate, setAddingIntermediate] = useState(false);

  // Submission lock for "Registrar Sessão" to prevent double-clicks
  const [registeringSession, setRegisteringSession] = useState(false);

  // Master: edit realized session
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

  const activeDuplicates = useMemo(() => {
    if (!newCycle.patient_id || !newCycle.professional_id) return [] as TreatmentCycle[];
    return cycles.filter(
      (c) =>
        c.patient_id === newCycle.patient_id &&
        c.professional_id === newCycle.professional_id &&
        ACTIVE_DUPLICATE_STATUSES.includes(c.status as string),
    );
  }, [cycles, newCycle.patient_id, newCycle.professional_id]);

  const handlePtsLoadError = useCallback((error: unknown) => {
    console.error("Error loading treatment PTS:", error);
    toast.error("Erro ao carregar PTS do paciente.");
  }, []);

  const loadActivePtsForPatient = useCallback(async (patientId: string) => {
    let query = supabase
      .from("pts")
      .select("*")
      .eq("patient_id", patientId)
      .eq("status", "ativo")
      .order("created_at", { ascending: false });
    if (treatmentUnitId) query = query.eq("unit_id", treatmentUnitId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as TreatmentPtsRecord[];
  }, [treatmentUnitId]);

  const loadPtsById = useCallback(async (ptsId: string) => {
    let query = supabase.from("pts").select("*").eq("id", ptsId);
    if (treatmentUnitId) query = query.eq("unit_id", treatmentUnitId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return (data as TreatmentPtsRecord | null) || null;
  }, [treatmentUnitId]);

  const { createPts, cyclePts, linkedPts, createPtsLoading, cyclePtsLoading, linkedPtsLoading } = useTreatmentPtsData({
    createOpen,
    createPatientId: createOpen ? newCycle.patient_id || null : null,
    cyclePatientId:
      selectedCycle && (selectedCycle.status === "em_andamento" || isLegacyCycleAwaitingDischarge(selectedCycle)) && !selectedCycle.pts_id && (user?.role === "profissional" || can("tratamento", "can_delete"))
        ? selectedCycle.patient_id
        : null,
    linkedPtsId: selectedCycle?.pts_id || null,
    scopeKey: `${user?.id || ""}|${user?.role || ""}|${user?.unidadeId || ""}|${user?.usuario || ""}`,
    loadActivePtsForPatient,
    loadPtsById,
    onError: handlePtsLoadError,
  });

  const [newSession, setNewSession] = useState({
    clinical_notes: "",
    procedure_done: "",
    status: "realizada",
    absence_type: "",
  });

  // Etapa 1: seleção da sessão a registrar (escopo individual por profissional)
  const [selectSessionOpen, setSelectSessionOpen] = useState(false);
  const [selectedSessionForRegister, setSelectedSessionForRegister] = useState<TreatmentSession | null>(null);

  const [soapNotes, setSoapNotes] = useState({
    subjetivo: "",
    objetivo: "",
    avaliacao: "",
    plano: "",
  });

  const [extensionForm, setExtensionForm] = useState({ new_sessions: 0, reason: "" });

  const canManageFull = can('tratamento', 'can_delete');
  const isProfissional = user?.role === "profissional";
  const canAgendarSessao = can('tratamento', 'can_execute');

  const treatmentSessionOperations = useMemo(() => createTreatmentSessionOperations({
    client: supabase as unknown as TreatmentOperationRpcClient,
    agenda: {
      addAgendamentoTransactionally,
      deleteAgendamentoTransactionally,
      applyTreatmentAgendamentoUpdate,
    },
    findDuplicate: async ({ patientId, professionalId, date, time, exceptAppointmentId }) => {
      let query = (supabase as any)
        .from('agendamentos')
        .select('id, profissional_nome')
        .eq('paciente_id', patientId)
        .eq('data', date)
        .eq('hora', time)
        .not('status', 'in', '("cancelado","falta","remarcado")');
      if (professionalId) query = query.eq('profissional_id', professionalId);
      if (exceptAppointmentId) query = query.neq('id', exceptAppointmentId);
      const { data, error } = await query.limit(1).maybeSingle();
      if (error) throw error;
      return data ? { professionalName: data.profissional_nome || undefined } : null;
    },
    ensurePatientCanBeScheduled: async (patientId, professionalId) => {
      const { isPacienteIsentoBloqueio, isPacienteBloqueadoParaProfissional, MSG_BLOQUEIO_FALTAS } = await import('@/lib/faltasUtils');
      let patient: any = pacientes.find((item) => item.id === patientId);
      const { data: flags } = await supabase
        .from('pacientes')
        .select('is_tfd, possui_ordem_judicial')
        .eq('id', patientId)
        .maybeSingle();
      if (!patient && !flags) throw new Error('Paciente não encontrado.');
      patient = { ...(patient || {}), ...(flags || {}) };
      if (isPacienteIsentoBloqueio(patient)) {
        toast.info('Paciente possui exceção administrativa (TFD/Ordem Judicial). Agendamento permitido.');
        return;
      }
      if (await isPacienteBloqueadoParaProfissional(patientId, professionalId)) {
        throw new Error(MSG_BLOQUEIO_FALTAS);
      }
    },
    isDateBlocked: async (date, professionalId, unitId) => {
      const { data, error } = await (supabase as any).rpc('is_date_blocked', {
        p_date: date,
        p_profissional_id: professionalId,
        p_unidade_id: unitId,
      });
      if (error) throw error;
      return data === true;
    },
  }), [addAgendamentoTransactionally, deleteAgendamentoTransactionally, applyTreatmentAgendamentoUpdate, pacientes]);

  // Total of cycles (server-side count)
  const [totalCycles, setTotalCycles] = useState(0);
  // Tracks which cycle has had its sessions loaded (lazy load)
  const [loadedSessionsCycleId, setLoadedSessionsCycleId] = useState<string | null>(null);
  const loadDataRequestsRef = useRef(createRequestGeneration());
  const loadSessionsRequestsRef = useRef(createRequestGeneration());
  const pageMountedRef = useRef(false);
  const selectedCycleIdRef = useRef<string | null>(selectedCycle?.id || null);
  const loadDataScopeRef = useRef("");
  const sessionsScopeRef = useRef("");
  selectedCycleIdRef.current = selectedCycle?.id || null;
  loadDataScopeRef.current = JSON.stringify([
    user?.id,
    user?.role,
    user?.unidadeId,
    user?.usuario,
    currentPage,
    filterProf,
    filterUnit,
    filterStatus,
    debouncedSearchTerm,
  ]);
  sessionsScopeRef.current = JSON.stringify([
    selectedCycle?.id,
    user?.id,
    user?.role,
    user?.unidadeId,
    user?.usuario,
  ]);

  useEffect(() => {
    const loadDataGeneration = loadDataRequestsRef.current;
    const loadSessionsGeneration = loadSessionsRequestsRef.current;
    pageMountedRef.current = true;
    return () => {
      pageMountedRef.current = false;
      loadDataGeneration.invalidate();
      loadSessionsGeneration.invalidate();
    };
  }, []);

  const loadData = useCallback(async (silent = false) => {
    if (!pageMountedRef.current) return;
    const requestId = loadDataRequestsRef.current.next();
    const requestScope = loadDataScopeRef.current;
    const isCurrentRequest = () =>
      isRequestCurrent(loadDataRequestsRef.current, requestId, requestScope, loadDataScopeRef.current, pageMountedRef.current);
    if (!silent) setLoading(true);
    try {
      // Server-side paginated cycles via RPC (lightweight, with stats only)
      const isProf = user?.role === "profissional";

      const { data: rpcData, error: rpcError } = await (supabase as any).rpc('get_treatment_cycles_paginated', {
        p_page: currentPage,
        p_page_size: PAGE_SIZE,
        p_professional_id: filterProf !== 'all' ? filterProf : (isProf ? user?.id : null),
        p_unit_id: filterUnit !== 'all' ? filterUnit : (restrictTreatmentUnit ? user?.unidadeId : null),
        p_status: filterStatus !== 'all' ? filterStatus : null,
        p_search: debouncedSearchTerm || null,
        p_only_own_professional: false, // already handled via p_professional_id
      });

      if (rpcError) throw rpcError;
      if (!isCurrentRequest()) return;

      const cyclesData = (rpcData?.cycles || []) as TreatmentCycle[];
      setCycles(cyclesData);
      setTotalCycles(rpcData?.total || 0);
      setSelectedCycle((current) => (current ? cyclesData.find((cycle) => cycle.id === current.id) || current : current));
    } catch (err: any) {
      if (!isCurrentRequest()) return;
      console.error("Error loading treatments:", err);
      toast.error(`Erro ao carregar dados de tratamento: ${err.message || 'Erro desconhecido'}`);
    } finally {
      if (isCurrentRequest()) setLoading(false);
    }
  }, [user, restrictTreatmentUnit, currentPage, filterProf, filterUnit, filterStatus, debouncedSearchTerm]);

  // Lazy load: sessions, extensions and agendamento map only for the selected cycle
  const loadSessionsForCycle = useCallback(async (cycle: TreatmentCycle, silent = true) => {
    if (!pageMountedRef.current) return;
    const requestId = loadSessionsRequestsRef.current.next();
    const requestScope = JSON.stringify([cycle.id, user?.id, user?.role, user?.unidadeId, user?.usuario]);
    const isCurrentRequest = () =>
      isRequestCurrent(loadSessionsRequestsRef.current, requestId, requestScope, sessionsScopeRef.current, pageMountedRef.current) &&
      selectedCycleIdRef.current === cycle.id;
    if (!isCurrentRequest()) return;
    try {
      const [sData, eData] = await Promise.all([
        treatmentService.getSessions(cycle.id),
        supabase.from("treatment_extensions").select("*").eq("cycle_id", cycle.id).order("changed_at", { ascending: false }),
      ]);
      if (!isCurrentRequest()) return;
      const sessionsData = (sData || []) as TreatmentSession[];
      // Replace only this cycle's sessions in the global state
      setSessions((prev) => {
        const others = prev.filter((s) => s.cycle_id !== cycle.id);
        return [...others, ...sessionsData];
      });
      setExtensions((prev) => {
        const others = prev.filter((x) => x.cycle_id !== cycle.id);
        return [...others, ...((eData.data || []) as TreatmentExtension[])];
      });
      setLoadedSessionsCycleId(cycle.id);

      // Cross-reference agendamentos for this cycle's sessions only
      if (sessionsData.length > 0) {
        const patientIds = [...new Set(sessionsData.map((s) => s.patient_id))];
        const linkedAppointmentIds = [...new Set(sessionsData.map((s) => s.appointment_id).filter((id): id is string => !!id))];
        let agQuery = supabase
          .from("agendamentos")
          .select("id, data, hora, status, paciente_id, profissional_id, unidade_id")
          .in("paciente_id", patientIds)
          .not("status", "in", '("cancelado","falta","remarcado")');
        if (user?.unidadeId && user?.usuario !== 'admin.sms') {
          agQuery = agQuery.eq("unidade_id", user.unidadeId);
        }
        const linkedQuery = linkedAppointmentIds.length > 0
          ? supabase.from("agendamentos").select("id, data, hora, status, paciente_id, profissional_id, unidade_id").in("id", linkedAppointmentIds)
          : null;
        const [activeResult, linkedResult] = await Promise.all([
          agQuery,
          linkedQuery || Promise.resolve({ data: [], error: null }),
        ]);
        if (activeResult.error) throw activeResult.error;
        if (linkedResult.error) throw linkedResult.error;
        const agData = (activeResult.data || []) as TreatmentAppointmentSnapshot[];
        const linkedData = (linkedResult.data || []) as TreatmentAppointmentSnapshot[];
        if (isCurrentRequest()) {
          const groupedCandidates: Record<string, TreatmentAppointmentSnapshot[]> = {};
          for (const appointment of agData) {
            const key = treatmentAppointmentKey(appointment.paciente_id, appointment.profissional_id, appointment.unidade_id, appointment.data);
            groupedCandidates[key] = [...(groupedCandidates[key] || []), appointment];
          }
          const scopedAppointmentIds = new Set(linkedAppointmentIds);
          const byId = [...agData, ...linkedData].reduce<Record<string, TreatmentAppointmentSnapshot>>((result, appointment) => {
            result[appointment.id] = appointment;
            return result;
          }, {});
          setAgendamentoMap((prev) => {
            const next = { ...prev };
            const cycleScopes = new Set(sessionsData.map((session) => `${session.patient_id}|${session.professional_id}|${cycle.unit_id}|`));
            for (const key of Object.keys(next)) {
              if ([...cycleScopes].some((scope) => key.startsWith(scope))) delete next[key];
            }
            return { ...next, ...groupedCandidates };
          });
          setAppointmentByIdMap((prev) => {
            const next = { ...prev };
            for (const id of scopedAppointmentIds) delete next[id];
            return { ...next, ...byId };
          });
        }
      }
    } catch (err) {
      if (!isCurrentRequest()) return;
      console.error("Error loading cycle sessions:", err);
      if (!silent) toast.error("Erro ao carregar sessões do ciclo.");
    }
  }, [user]);

  // Primeiro load: com spinner. Re-loads (filtros/busca/paginação): silencioso, sem spinner.
  const firstLoadRef = React.useRef(true);
  // Re-load data when pagination or search/filters change
  useEffect(() => {
    // Ao mudar qualquer filtro ou termo de busca, voltamos para a página 1
    // Isso evita ficar em uma página inexistente para o novo filtro
    const isFirstRender = firstLoadRef.current;
    
    if (!isFirstRender) {
      // Se algum filtro mudou e não estamos na página 1, resetamos
      // O reset da página disparará este useEffect novamente via dependência currentPage
      if (currentPage !== 1) {
        setCurrentPage(1);
        return; 
      }
    }
    
    const wasFirst = firstLoadRef.current;
    firstLoadRef.current = false;
    // Primeiro load: com spinner. Re-loads (busca/filtros/paginação): silencioso
    // para não desmontar o input de busca e causar perda de foco a cada tecla.
    loadData(!wasFirst);
  }, [filterProf, filterUnit, filterStatus, debouncedSearchTerm, currentPage, loadData]);

  // Datas inválidas só são reparadas por uma ação explícita; abrir a página é leitura.
  const handleCorrigirDatasInvalidas = async () => {
    if (!window.confirm('Verificar sessões em fim de semana ou bloqueadas? As sessões afetadas voltarão para “Aguardando agendamento” e seus agendamentos serão cancelados.')) return;
    setCorrigindoDatasInvalidas(true);
    try {
      const result = await autoFixInvalidTreatmentSessions();
      if (result.fixed > 0) {
        toast.success(`${result.fixed} sessão(ões) inválida(s) foram devolvidas para “Aguardando agendamento”.`);
        await loadData(true);
      } else {
        toast.info('Nenhuma sessão agendada em fim de semana ou bloqueio foi encontrada.');
      }
      if (result.errors > 0) toast.error(`Falha ao corrigir ${result.errors} sessão(ões).`);
    } catch (error: any) {
      if (error?.result?.fixed > 0) await loadData(true);
      toast.error(error?.message || 'Erro ao corrigir sessões em datas inválidas.');
    } finally {
      setCorrigindoDatasInvalidas(false);
    }
  };

  // Lazy load sessions when a cycle is selected
  useEffect(() => {
    if (selectedCycle && selectedCycle.id !== loadedSessionsCycleId) {
      loadSessionsForCycle(selectedCycle, true);
    }
  }, [selectedCycle, loadedSessionsCycleId, loadSessionsForCycle]);

  // ESC key to clear scheduling state
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && agendarSessaoTarget) {
        setAgendarSessaoTarget(null);
        setAgendarSessaoData("");
        setAgendarSessaoHora("");
        setAgendarSessaoSalaId("");
        toast("Campos limpos", { icon: "🧹" });
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [agendarSessaoTarget]);

  // Silent background refresh on realtime changes — no loading spinner
  const silentRefresh = useCallback(() => {
    loadData(true);
    if (selectedCycle) loadSessionsForCycle(selectedCycle, true);
  }, [loadData, loadSessionsForCycle, selectedCycle]);

  useRealtimeSubscription({
    tables: ['agendamentos', 'treatment_sessions', 'treatment_cycles'],
    onchange: silentRefresh,
    enabled: true,
    debounceMs: 400,
  });

  // O(1) lookup maps to avoid .find() per row
  const pacientesMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of pacientes) m.set(p.id, p);
    return m;
  }, [pacientes]);

  const funcionariosMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const f of funcionarios) m.set(f.id, f);
    return m;
  }, [funcionarios]);

  // Pre-aggregate session counts per cycle (now sourced from server-side RPC)
  const sessionStatsByCycle = useMemo(() => {
    const stats = new Map<string, { pendingAg: number; faltas: number }>();
    for (const c of cycles) {
      stats.set(c.id, { pendingAg: c.pending_ag || 0, faltas: c.faltas || 0 });
    }
    return stats;
  }, [cycles]);

  // Server-side pagination: cycles are already filtered/paginated by RPC.
  // Keep filteredCycles/paginatedCycles aliases for minimal UI changes.
  const filteredCycles = cycles;
  const paginatedCycles = cycles;
  const totalPages = Math.max(1, Math.ceil(totalCycles / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  // Reset pagination when filters/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterProf, filterUnit, filterStatus, debouncedSearchTerm]);

  // Remove sync filters that cause auto-resetting bugs when lists load asynchronously
  // The Select component handles missing values gracefully by showing placeholder/Todos

  const faltaStats = useMemo(() => {
    if (!selectedCycle) return null;
    const cycleSess = sessions
      .filter((s) => s.cycle_id === selectedCycle.id)
      .sort((a, b) => a.session_number - b.session_number);
    const faltas = cycleSess.filter((s) => isSessionFalta(s.status));
    const faltasTotal = faltas.length;

    let maxConsecutivas = 0;
    let currentStreak = 0;
    for (const s of cycleSess) {
      if (isSessionFalta(s.status)) {
        currentStreak++;
        maxConsecutivas = Math.max(maxConsecutivas, currentStreak);
      } else if (s.status === "realizada") {
        currentStreak = 0;
      }
    }

    return {
      total: faltasTotal,
      consecutivas: maxConsecutivas,
      alerta: maxConsecutivas >= 2 ? "consecutivas" : faltasTotal >= 3 ? "alternadas" : null,
      critico: faltasTotal >= 5,
    };
  }, [selectedCycle, sessions]);

  const cycleSessions = useMemo(() => {
    if (!selectedCycle) return [];
    return sessions.filter((s) => s.cycle_id === selectedCycle.id).sort((a, b) => a.session_number - b.session_number);
  }, [selectedCycle, sessions]);

  const getSessionIntegrity = useCallback((session: TreatmentSession, cycle: TreatmentCycle) =>
    resolveTreatmentSessionIntegrity({
      session: {
        status: session.status,
        appointment_id: session.appointment_id,
        patient_id: session.patient_id,
        professional_id: session.professional_id,
        scheduled_date: session.scheduled_date,
      },
      unitId: cycle.unit_id,
      appointmentById: session.appointment_id ? appointmentByIdMap[session.appointment_id] || null : null,
      sameDayCandidates: agendamentoMap[treatmentAppointmentKey(session.patient_id, session.professional_id, cycle.unit_id, session.scheduled_date)] || [],
    }), [agendamentoMap, appointmentByIdMap]);

  const cycleExtensions = useMemo(() => {
    if (!selectedCycle) return [];
    return extensions.filter((e) => e.cycle_id === selectedCycle.id);
  }, [selectedCycle, extensions]);

  const agendarSessaoSlots = useMemo(() => {
    if (!agendarSessaoTarget || !selectedCycle || !agendarSessaoData) return [];
    return getAvailableSlots(selectedCycle.professional_id, selectedCycle.unit_id, agendarSessaoData);
  }, [agendarSessaoTarget, selectedCycle, agendarSessaoData, getAvailableSlots]);

  const agendarSessaoDatesDisponiveis = useMemo(() => {
    if ((!agendarSessaoTarget && !remarcarTarget) || !selectedCycle) return [];
    if (user?.role !== 'master' && user?.role !== 'profissional') {
      return getAvailableDates(selectedCycle.professional_id, selectedCycle.unit_id).filter((d) => d >= todayLocalStr());
    }
    const dates = new Set<string>();
    const today = todayLocalStr();
    const horizon = addDaysToDateStr(today, 365);
    for (const availability of disponibilidades) {
      if (availability.profissionalId !== selectedCycle.professional_id || availability.unidadeId !== selectedCycle.unit_id) continue;
      for (let date = availability.dataInicio > today ? availability.dataInicio : today;
        date <= availability.dataFim && date <= horizon; date = addDaysToDateStr(date, 1)) {
        if (isoDayOfWeek(date) === 0 || isoDayOfWeek(date) === 6) continue;
        if (!availability.diasSemana.includes(isoDayOfWeek(date))) continue;
        const blockedAllDay = bloqueios.some((block) => date >= block.dataInicio && date <= block.dataFim
          && (block.diaInteiro || !block.horaInicio)
          && ((!block.unidadeId && !block.profissionalId)
            || (block.unidadeId === selectedCycle.unit_id && !block.profissionalId)
            || block.profissionalId === selectedCycle.professional_id));
        if (!blockedAllDay) dates.add(date);
      }
    }
    return [...dates].sort();
  }, [agendarSessaoTarget, remarcarTarget, selectedCycle, getAvailableDates, disponibilidades, bloqueios, user?.role]);

  const getTreatmentConfiguredWindows = useCallback((professionalId: string, unitId: string, date: string) =>
    disponibilidades.filter((availability) => availability.profissionalId === professionalId
      && availability.unidadeId === unitId
      && availability.dataInicio <= date && availability.dataFim >= date
      && availability.diasSemana.includes(isoDayOfWeek(date)))
      .map(({ horaInicio, horaFim, vagasPorHora, duracaoConsulta }) => ({ horaInicio, horaFim, vagasPorHora, duracaoConsulta })),
  [disponibilidades]);

  const salasDisponiveis = useMemo(() => {
    if (!selectedCycle || !salas) return [];
    return salas.filter((s: any) => s.unidadeId === selectedCycle.unit_id && s.ativo);
  }, [selectedCycle, salas]);

  const sessionRegisterHint = useMemo(() => {
    if (newSession.status !== "realizada") return null;
    return null;
  }, [newSession.status]);

  const canSubmitSessionRegistration = useMemo(() => {
    if (newSession.status === "paciente_faltou") {
      return !!newSession.absence_type;
    }
    return true;
  }, [newSession.absence_type, newSession.status]);

  // Get current cycle's professional profissão for SOAP adaptation
  const cycleProfissao = useMemo(() => {
    if (!selectedCycle) return undefined;
    const prof = profissionais.find((p: any) => p.id === selectedCycle.professional_id);
    return prof?.profissao;
  }, [selectedCycle, profissionais]);

  const cycleSoapOptions = useMemo(() => getSoapOptions(cycleProfissao), [cycleProfissao]);
  const cycleHasDropdown = useMemo(() => hasDropdownSoap(cycleProfissao), [cycleProfissao]);

  // Custom SOAP options for the cycle's professional
  const cycleProfId = selectedCycle?.professional_id;
  const soapCustom = useSoapCustomOptions(cycleProfId);

  const [addingFieldTrat, setAddingFieldTrat] = useState<string | null>(null);
  const [newOptionTextTrat, setNewOptionTextTrat] = useState("");

  const [copyingLastSession, setCopyingLastSession] = useState(false);

  const handleCopyLastSession = async () => {
    if (!selectedCycle) return;
    setCopyingLastSession(true);
    try {
      const { data, error } = await supabase
        .from("treatment_sessions")
        .select("clinical_notes")
        .eq("cycle_id", selectedCycle.id)
        .eq("status", "realizada")
        .order("session_number", { ascending: false })
        .limit(1);
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.info("Nenhuma sessão anterior encontrada para este ciclo.");
        return;
      }
      try {
        const parsed = JSON.parse(data[0].clinical_notes);
        if (parsed.subjetivo || parsed.objetivo || parsed.avaliacao || parsed.plano) {
          setSoapNotes({
            subjetivo: parsed.subjetivo || "",
            objetivo: parsed.objetivo || "",
            avaliacao: parsed.avaliacao || "",
            plano: parsed.plano || "",
          });
          toast.success("SOAP da sessão anterior copiado!");
          return;
        }
      } catch {}
      toast.info("Sessão anterior não possui dados SOAP para copiar.");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao buscar sessão anterior.");
    } finally {
      setCopyingLastSession(false);
    }
  };

  const handleCreateCycle = async (force = false) => {
    if (!newCycle.patient_id || !newCycle.professional_id || !newCycle.treatment_type) {
      toast.error("Preencha paciente, profissional e tipo de tratamento.");
      return;
    }
    if (isWeekdayFrequency(newCycle.frequency) && newCycle.weekdays.length !== getMaxWeekdays(newCycle.frequency)) {
      toast.error(`Selecione exatamente ${getMaxWeekdays(newCycle.frequency)} dia(s) da semana.`);
      return;
    }

    if (loading) return; // Guard
    
    // Aviso de duplicidade: mesmo paciente + mesmo profissional com ciclo não concluído
    if (!force) {
      const { data: existingCycles, error: checkError } = await supabase
        .from("treatment_cycles")
        .select("*")
        .eq("patient_id", newCycle.patient_id)
        .eq("professional_id", newCycle.professional_id)
        .in("status", ACTIVE_DUPLICATE_STATUSES);

      if (checkError) {
        console.error("Erro ao verificar duplicidade:", checkError);
      } else if (existingCycles && existingCycles.length > 0) {
        setDuplicateConfirm(existingCycles as TreatmentCycle[]);
        return;
      }
    }

    const prof = profissionais.find((p) => p.id === newCycle.professional_id);
    const pac = pacientes.find((p) => p.id === newCycle.patient_id);


    // Total de sessões é o controle principal para TODAS as frequências
    const MAX_SESSIONS = 200;
    const totalSessions = parseInt(String(newCycle.total_sessions)) || 0;
    if (!totalSessions || totalSessions < 1) {
      toast.error("Informe o total de sessões (mínimo 1).");
      return;
    }
    if (totalSessions > MAX_SESSIONS) {
      toast.error(`Total de sessões excede o limite permitido (máximo ${MAX_SESSIONS}).`);
      return;
    }
    if (isWeekdayFrequency(newCycle.frequency)) {
      const need = getMaxWeekdays(newCycle.frequency);
      if (newCycle.weekdays.length !== need) {
        toast.error(`Selecione exatamente ${need} dia(s) da semana para esta frequência.`);
        return;
      }
    }

    const blockedRanges = buildBlockedRanges(bloqueios, newCycle.professional_id, newCycle.unit_id);
    const { dates: sessionDates, skippedCount } = generateSessionDatesWithInfo(newCycle.start_date, newCycle.frequency, newCycle.weekdays, totalSessions, blockedRanges);
    const endDate = calcEndDateFromSessions(sessionDates);

    if (skippedCount > 0) {
      toast.info(`${skippedCount} sessão(ões) foram realocadas devido a feriados ou bloqueios no calendário.`);
    }

    try {
      const { data: cycleData, error: cycleError } = await supabase
        .from("treatment_cycles")
        .insert({
          patient_id: newCycle.patient_id,
          professional_id: newCycle.professional_id,
          unit_id: newCycle.unit_id || prof?.unidadeId || "",
          specialty: newCycle.specialty || prof?.profissao || "",
          treatment_type: newCycle.treatment_type,
          start_date: newCycle.start_date,
          end_date_predicted: endDate,
          total_sessions: totalSessions,
          sessions_done: 0,
          frequency: newCycle.frequency,
          status: "em_andamento",
          clinical_notes: newCycle.clinical_notes,
          created_by: user?.id || "",
          pts_id: newCycle.pts_id || null,
        })
        .select()
        .single();

      if (cycleError) throw cycleError;

      const sessionsToCreate = sessionDates.map((date, i) => ({
        cycle_id: cycleData.id,
        patient_id: newCycle.patient_id,
        professional_id: newCycle.professional_id,
        session_number: i + 1,
        total_sessions: totalSessions,
        scheduled_date: date,
        status: "pendente_agendamento",
      }));

      const { error: sessionsError } = await supabase.from("treatment_sessions").insert(sessionsToCreate).select();
      if (sessionsError) {
        console.error("Erro ao criar sessões:", sessionsError);
        toast.error("Erro ao criar sessões: " + sessionsError.message);
      }

      await logAction({
        acao: "criar",
        entidade: "treatment_cycle",
        entidadeId: cycleData.id,
        modulo: "tratamentos",
        user,
        detalhes: {
          paciente: pac?.nome,
          profissional: prof?.nome,
          tipo: newCycle.treatment_type,
          sessoes: totalSessions,
          pts_vinculado: newCycle.pts_id || null,
        },
      });

      toast.success(`Ciclo criado com ${totalSessions} sessões! Aguardam agendamento pela recepção.`);
      setCreateOpen(false);
      loadData(true);
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao criar ciclo de tratamento: " + err.message);
    }
  };

  const handleDeleteCycle = async () => {
    if (!deleteTarget) return;
    try {
      await supabase.from("treatment_sessions").delete().eq("cycle_id", deleteTarget.id);
      await supabase.from("treatment_extensions").delete().eq("cycle_id", deleteTarget.id);
      await supabase.from("patient_discharges").delete().eq("cycle_id", deleteTarget.id);
      const { error } = await supabase.from("treatment_cycles").delete().eq("id", deleteTarget.id);
      if (error) throw error;

      await logAction({
        acao: "excluir",
        entidade: "treatment_cycle",
        entidadeId: deleteTarget.id,
        modulo: "tratamentos",
        user,
        detalhes: { tipo: deleteTarget.treatment_type, paciente: deleteTarget.patient_id },
      });

      toast.success("Ciclo excluído com sucesso.");
      setDeleteTarget(null);
      loadData(true);
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao excluir ciclo.");
    }
  };

  const handleRegisterSession = async () => {
    if (!selectedCycle) return;
    if (registeringSession) return; // Double-click guard

    // Usa a sessão escolhida na Etapa 1; fallback para a próxima pendente
    const nextSession =
      selectedSessionForRegister ||
      cycleSessions
        .filter((s) => ["agendada", "pendente_agendamento"].includes(s.status))
        .sort((a, b) => a.session_number - b.session_number)[0];

    if (!nextSession) {
      toast.error("Não há sessões pendentes neste ciclo.");
      return;
    }

    // Bloqueio de duplicidade: sessão já concluída
    if (nextSession.status === "realizada") {
      toast.error("Esta sessão já foi registrada.");
      return;
    }

    // Garantia de escopo: a sessão deve pertencer ao profissional do ciclo
    if (nextSession.professional_id !== selectedCycle.professional_id) {
      toast.error("Esta sessão pertence a outro profissional e não pode ser registrada aqui.");
      return;
    }

    // procedure_done is optional — no validation needed

    if (newSession.status === "paciente_faltou" && !newSession.absence_type) {
      toast.error("Informe o tipo de falta (justificada ou injustificada).");
      return;
    }

    if (registeringSession) return;
    setRegisteringSession(true);
    
    // Final duplicity check for the session itself
    const { data: freshSession, error: freshErr } = await supabase
      .from("treatment_sessions")
      .select("status")
      .eq("id", nextSession.id)
      .single();
    
    if (freshErr || (freshSession && freshSession.status === "realizada")) {
      toast.error("Esta sessão já foi registrada recentemente.");
      setRegisteringSession(false);
      return;
    }

    try {

      if (newSession.status === "realizada") {
        const soapPayload = normalizeSoapPayload(soapNotes);
        const result = await treatmentService.registerCompletedSession({
          cycle: selectedCycle,
          session: nextSession,
          soap: soapPayload,
          procedureDone: newSession.procedure_done,
          userId: user?.id,
          appointmentId: nextSession.appointment_id,
        });

        if (result.sessionsDone >= selectedCycle.total_sessions && selectedCycle.total_sessions > 0) {
          toast.info("Todas as sessões previstas foram registradas. Avalie se deve solicitar extensão ou dar alta.");
        }
      } else {
        await supabase
          .from("treatment_sessions")
          .update({
            status: newSession.status,
            clinical_notes: newSession.clinical_notes,
            procedure_done: newSession.procedure_done,
            absence_type: newSession.status === "paciente_faltou" ? newSession.absence_type : null,
            tipo_falta: newSession.status === "paciente_faltou" ? (newSession.absence_type || 'injustificada') : null,
            falta_justificativa: newSession.status === "paciente_faltou" ? (newSession.clinical_notes || null) : null,
          } as any)
          .eq("id", nextSession.id);

        // Recalcula status do paciente
        if (newSession.status === "paciente_faltou") {
          try {
            await (supabase as any).rpc('atualizar_status_falta', { p_paciente_id: nextSession.patient_id });
          } catch (err) {
            console.error('[Faltosos] Erro na regra de faltas/exceção', {
              pacienteId: nextSession.patient_id,
              acao: 'atualizar_status_falta_tratamento',
              errorMessage: (err as any)?.message,
            });
          }
        }
      }

      await logAction({
        acao: "registrar_sessao",
        entidade: "treatment_session",
        entidadeId: nextSession.id,
        modulo: "tratamentos",
        user,
        detalhes: {
          ciclo: selectedCycle.id,
          sessao: nextSession.session_number,
          status: newSession.status,
        },
      });

      // Optimistic refresh: reload only this cycle's sessions + silent cycle stats refresh
      await Promise.all([
        loadSessionsForCycle(selectedCycle, true),
        loadData(true),
      ]);

      toast.success(
        newSession.status === "realizada"
          ? `✅ Sessão ${nextSession.session_number} registrada com sucesso!`
          : `Sessão ${nextSession.session_number}/${selectedCycle.total_sessions} registrada!`,
      );
      setSessionOpen(false);
      setSelectedSessionForRegister(null);
      setNewSession({ clinical_notes: "", procedure_done: "", status: "realizada", absence_type: "" });
      setSoapNotes({ subjetivo: "", objetivo: "", avaliacao: "", plano: "" });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message?.startsWith('Preencha') ? err.message : "❌ Erro ao registrar sessão. Tente novamente.");
    } finally {
      setRegisteringSession(false);
    }
  };

  const handleEditRealizada = async () => {
    if (!editRealizadaTarget || !selectedCycle) return;
    // procedure_done is optional
    setEditRealizadaSaving(true);
    try {
      const clinicalNotesJson = JSON.stringify({
        tipo: "soap",
        subjetivo: editRealizadaSoap.subjetivo,
        objetivo: editRealizadaSoap.objetivo,
        avaliacao: editRealizadaSoap.avaliacao,
        plano: editRealizadaSoap.plano,
        editado_em: new Date().toISOString(),
        editado_por: user?.id,
      });

      const updatePayload: any = {
        clinical_notes: clinicalNotesJson,
        procedure_done: editRealizadaProcedure,
      };
      if (editRealizadaDate && editRealizadaDate !== editRealizadaTarget.scheduled_date) {
        updatePayload.scheduled_date = editRealizadaDate;
      }

      const { error } = await supabase
        .from("treatment_sessions")
        .update(updatePayload)
        .eq("id", editRealizadaTarget.id);

      if (error) throw error;

      await logAction({
        acao: "editar_sessao_realizada",
        entidade: "treatment_session",
        entidadeId: editRealizadaTarget.id,
        modulo: "tratamentos",
        user,
        detalhes: { ciclo: selectedCycle.id, sessao: editRealizadaTarget.session_number },
      });

      toast.success(`Sessão ${editRealizadaTarget.session_number} atualizada.`);
      setEditRealizadaOpen(false);
      setEditRealizadaTarget(null);
      loadData(true);
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao editar sessão: " + err.message);
    } finally {
      setEditRealizadaSaving(false);
    }
  };

  const handleClearRealizada = async (session: TreatmentSession) => {
    if (!selectedCycle) return;
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
          absence_type: null,
        })
        .eq("id", session.id);

      if (error) throw error;

      // Decrement sessions_done
      const newDone = Math.max(0, selectedCycle.sessions_done - 1);
      await supabase
        .from("treatment_cycles")
        .update({
          sessions_done: newDone,
          status: "em_andamento",
        })
        .eq("id", selectedCycle.id);

      await logAction({
        acao: "limpar_sessao_realizada",
        entidade: "treatment_session",
        entidadeId: session.id,
        modulo: "tratamentos",
        user,
        detalhes: { ciclo: selectedCycle.id, sessao: session.session_number },
      });

      toast.success(`Sessão ${session.session_number} revertida para "Agendada".`);
      loadData(true);
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao limpar sessão: " + err.message);
    }
  };

  const scheduleTreatmentSession = async (
    session: TreatmentSession,
    cycle: TreatmentCycle,
    data: string,
    hora: string,
    salaId: string,
    duplicateScope: 'patient' | 'patient_professional',
    checkPatientAbsenceBlock = false,
    manualCapacityOverride = false,
  ) => {
    if (getSessionIntegrity(session, cycle).kind !== "pendente") {
      throw new Error("Esta sessão não está pendente para agendamento. Recarregue o ciclo e revise o vínculo com a Agenda.");
    }
    const prof = funcionarios.find((f) => f.id === cycle.professional_id);
    const pac = pacientes.find((p) => p.id === cycle.patient_id);
    if (!prof || !pac) throw new Error('Profissional ou paciente não encontrado.');

    const appointment: import('@/types').Agendamento = {
      id: `ag${Date.now()}`,
      pacienteId: cycle.patient_id,
      pacienteNome: pac.nome,
      unidadeId: cycle.unit_id,
      salaId: salaId || '',
      setorId: '',
      profissionalId: cycle.professional_id,
      profissionalNome: prof.nome,
      data,
      hora,
      status: 'confirmado',
      tipo: 'Sessão de Tratamento',
      observacoes: `Sessão ${session.session_number}/${session.total_sessions} — ${cycle.treatment_type}`,
      origem: 'recepcao',
      criadoEm: new Date().toISOString(),
      criadoPor: user?.id || '',
    };

    const result = await treatmentSessionOperations.schedule({
      session,
      cycle,
      appointment,
      duplicateScope,
      checkPatientAbsenceBlock,
      manualCapacityOverride,
    });
    const appointmentId = result.appointment?.id || null;
    if (result.appointment) {
      const snapshot = appointmentSnapshot(result.appointment);
      setAppointmentByIdMap((previous) => ({ ...previous, [snapshot.id]: snapshot }));
      setAgendamentoMap((previous) => {
        const key = treatmentAppointmentKey(snapshot.paciente_id, snapshot.profissional_id, snapshot.unidade_id, snapshot.data);
        return { ...previous, [key]: [snapshot, ...(previous[key] || []).filter((item) => item.id !== snapshot.id)] };
      });
    }
    setSessions((previous) => previous.map((item) => item.id === session.id
      ? {
          ...item,
          status: result.session.status || 'agendada',
          appointment_id: result.session.appointment_id ?? appointmentId,
          scheduled_date: result.session.scheduled_date || data,
        }
      : item));

    if (result.status === 'agendado') {
      await logAction({
        acao: 'agendar_sessao_tratamento',
        entidade: 'treatment_session',
        entidadeId: session.id,
        modulo: 'tratamentos',
        user,
        detalhes: {
          ciclo: cycle.id,
          sessao: session.session_number,
          data,
          hora,
          agendamento_id: appointmentId,
        },
      });
      toast.success(`Sessão ${session.session_number} agendada para ${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')} às ${hora}!`);
    } else {
      toast.info(`Sessão ${session.session_number} já estava agendada.`);
    }

    setAgendarSessaoTarget(null);
    setAgendarSessaoData('');
    setAgendarSessaoHora('');
    setAgendarSessaoSalaId('');
    await loadData(true);
    return result;
  };

  const handleDesmarcarSessao = async (session: TreatmentSession) => {
    if (!selectedCycle) return;

    if (!session.appointment_id || getSessionIntegrity(session, selectedCycle).kind !== "agendada") {
      toast.error("A sessão ainda não tem vínculo confirmado com um agendamento da Agenda.");
      return;
    }

    // Validação: sessão concluída não pode ser desmarcada
    if (session.status === "realizada") {
      toast.error("Sessão já realizada não pode ser desmarcada.");
      return;
    }

    const confirmed = window.confirm(
      `Desmarcar a sessão ${session.session_number}/${session.total_sessions}?\n\nO agendamento será EXCLUÍDO da agenda (horário liberado) e a sessão voltará para "Aguardando agendamento".`
    );
    if (!confirmed) return;

    try {
      const result = await treatmentSessionOperations.unschedule({ session, cycle: selectedCycle });

      await logAction({
        acao: "desmarcar_sessao",
        entidade: "treatment_session",
        entidadeId: session.id,
        modulo: "tratamentos",
        user,
        detalhes: {
          ciclo: selectedCycle.id,
          sessao: session.session_number,
          agendamento_excluido: session.appointment_id,
        },
      });

      // A exclusão otimista e seu rollback são mantidos pelo AgendamentosContext.
      if (session.appointment_id) {
        setAppointmentByIdMap((previous) => {
          const next = { ...previous };
          delete next[session.appointment_id!];
          return next;
        });
        setAgendamentoMap((prev) => {
          const next = { ...prev };
          const key = treatmentAppointmentKey(session.patient_id, session.professional_id, selectedCycle.unit_id, session.scheduled_date);
          next[key] = (next[key] || []).filter((appointment) => appointment.id !== session.appointment_id);
          if (next[key].length === 0) delete next[key];
          return next;
        });
      }
      setSessions((prev) =>
        prev.map((x) =>
          x.id === session.id
            ? { ...x, status: result.session.status || "pendente_agendamento", appointment_id: result.session.appointment_id ?? null }
            : x,
        ),
      );

      toast.success(`Sessão ${session.session_number} desmarcada e horário liberado na agenda.`);
      // Refresh em background
      loadData(true);
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao desmarcar sessão: " + (err?.message || ""));
    }
  };

  const openEditRealizada = (session: TreatmentSession) => {
    setEditRealizadaTarget(session);
    setEditRealizadaDate(session.scheduled_date);
    setEditRealizadaProcedure(session.procedure_done || "");
    // Parse existing SOAP notes
    try {
      const parsed = JSON.parse(session.clinical_notes);
      if (parsed.tipo === "soap") {
        setEditRealizadaSoap({
          subjetivo: parsed.subjetivo || "",
          objetivo: parsed.objetivo || "",
          avaliacao: parsed.avaliacao || "",
          plano: parsed.plano || "",
        });
      } else {
        setEditRealizadaSoap({ subjetivo: "", objetivo: "", avaliacao: "", plano: "" });
      }
    } catch {
      setEditRealizadaSoap({ subjetivo: session.clinical_notes || "", objetivo: "", avaliacao: "", plano: "" });
    }
    setEditRealizadaOpen(true);
  };

  const handleAgendarSessao = async () => {
    if (!agendarSessaoTarget || !agendarSessaoData || !agendarSessaoHora || !selectedCycle) {
      toast.error("Selecione data e horário.");
      return;
    }
    if (agendandoSessao) return; // Idempotency
    setAgendandoSessao(true);
    try {
      await scheduleTreatmentSession(
        agendarSessaoTarget,
        selectedCycle,
        agendarSessaoData,
        agendarSessaoHora,
        agendarSessaoSalaId,
        "patient_professional",
        true,
      );
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Erro ao agendar sessão.");
    } finally {
      setAgendandoSessao(false);
    }
  };

  /**
   * Agenda em lote todas as sessões pendentes do ciclo selecionado.
   * - Verifica duplicidade por (paciente_id, profissional_id, data) na tabela `agendamentos`
   * - Se já existe um possível agendamento sem vínculo: não vincula; informa que precisa de revisão
   * - Se não existe: insere agendamento e atualiza a sessão para "agendada"
   * - Mostra resumo no fim com opção de notificar paciente via WhatsApp
   */
  const handleAgendarCicloCompleto = async () => {
    const cycle = selectedCycle;
    if (!cycle || agendarCicloInFlightRef.current) return;
    const pac = pacientes.find((p) => p.id === cycle.patient_id);
    const prof = funcionarios.find((f) => f.id === cycle.professional_id);
    if (!pac || !prof) {
      toast.error("Paciente ou profissional não encontrado.");
      return;
    }

    const pendentes = cycleSessions
      .filter((s) => getSessionIntegrity(s, cycle).kind === "pendente" && !!s.scheduled_date)
      .sort((a, b) => a.session_number - b.session_number);

    if (pendentes.length === 0) {
      toast.info("Não há sessões pendentes para agendar.");
      return;
    }

    // Bloqueio síncrono: evita duas execuções antes que o botão seja desabilitado no próximo render.
    agendarCicloInFlightRef.current = true;
    setAgendandoCiclo(true);

    const resumo: ResumoSessaoItem[] = [];

    // Track horários já usados nesta execução em lote (evita conflito entre as próprias sessões do lote)
    const horariosUsadosLote: Record<string, Set<string>> = {};
    const usar = (data: string, hora: string) => {
      if (!horariosUsadosLote[data]) horariosUsadosLote[data] = new Set();
      horariosUsadosLote[data].add(hora);
    };
    const estaLivreNoLote = (data: string, hora: string) =>
      !(horariosUsadosLote[data] && horariosUsadosLote[data].has(hora));
    const bloqueiosDoCiclo = buildBlockedRanges(bloqueios, cycle.professional_id, cycle.unit_id);

    /**
     * Mantém ESTRITAMENTE a data planejada da sessão (dias da semana do ciclo).
     * - Data com feriado/bloqueio/fim de semana: não agenda e não desvia para outro dia.
     * - Horário livre na grade: usa o primeiro livre (sem colidir com o próprio lote).
     * - Turno lotado: encaixe no mesmo dia, no início do turno do profissional.
     */
    const encontrarSlotValido = (
      dataSugerida: string,
      profId: string,
      unidadeId: string,
    ): { data: string; hora: string; encaixe: boolean } | null => {
      if (isInvalidSessionDate(dataSugerida, bloqueiosDoCiclo)) return null;
      const slots = getAvailableSlots(profId, unidadeId, dataSugerida);
      const slotLivre = slots.find((s) => estaLivreNoLote(dataSugerida, s));
      if (slotLivre) return { data: dataSugerida, hora: slotLivre, encaixe: false };
      const turnos = getTurnoInfo(profId, unidadeId, dataSugerida) || [];
      const horaTurno = turnos.find((t: any) => t?.horaInicio)?.horaInicio;
      if (horaTurno) return { data: dataSugerida, hora: String(horaTurno).slice(0, 5), encaixe: true };
      return null;
    };

    // 1) Verificar se o paciente está bloqueado por faltas para este profissional
    try {
      const { isPacienteBloqueadoParaProfissional } = await import('@/lib/faltasUtils');
      const bloqueado = await isPacienteBloqueadoParaProfissional(cycle.patient_id, cycle.professional_id);
      if (bloqueado) {
        toast.error("Paciente bloqueado por faltas injustificadas para este profissional. Agendamento em lote cancelado. Regularize na página de Pacientes Faltosos com o responsável da unidade.");
        agendarCicloInFlightRef.current = false;
        setAgendandoCiclo(false);
        return;
      }
    } catch {}

    try {
      for (const sess of pendentes) {
        try {
          // Um registro semelhante precisa de revisão explícita; não vinculamos histórico automaticamente.
          const originalDateValida = !isInvalidSessionDate(sess.scheduled_date, bloqueiosDoCiclo);
          const { data: existente, error: checkErr } = originalDateValida ? await supabase
            .from("agendamentos")
            .select("id, hora, status")
            .eq("paciente_id", sess.patient_id)
            .eq("profissional_id", sess.professional_id)
            .eq("unidade_id", cycle.unit_id)
            .eq("data", sess.scheduled_date)
            .not("status", "in", '("cancelado","falta","remarcado")')
            .order("criado_em", { ascending: false })
            .limit(1)
            .maybeSingle() : { data: null, error: null };

          if (checkErr) throw checkErr;

          if (existente) {
            resumo.push({
              numero: sess.session_number,
              data: sess.scheduled_date,
              status: "erro",
              mensagem: "Possível agendamento já existente sem vínculo confirmado. Revisão necessária; nenhum vínculo foi criado.",
            });
            continue;
          }

          // 3) Encontrar slot válido respeitando disponibilidade do profissional e ocupação da agenda
          const slot = encontrarSlotValido(
            sess.scheduled_date,
            sess.professional_id,
            cycle.unit_id,
          );

          if (!slot) {
            resumo.push({
              numero: sess.session_number,
              data: sess.scheduled_date,
              status: "erro",
              mensagem: "Agenda lotada ou sem disponibilidade cadastrada (próximos 30 dias)",
            });
            continue;
          }

          // 4) Inserir novo agendamento no horário válido
          const newAgData: Agendamento = {
            id: `ag${crypto.randomUUID()}`,
            pacienteId: sess.patient_id,
            pacienteNome: pac.nome,
            unidadeId: cycle.unit_id,
            salaId: "",
            setorId: "",
            profissionalId: sess.professional_id,
            profissionalNome: prof.nome,
            data: slot.data,
            hora: slot.hora,
            status: "confirmado" as const,
            tipo: "Sessão de Tratamento" as const,
            observacoes: `Sessão ${sess.session_number}/${sess.total_sessions} — ${cycle.treatment_type} (lote)`,
            origem: "recepcao" as const,
            criadoEm: new Date().toISOString(),
            criadoPor: user?.id || "",
          };

          // A operação transacional grava sessão + agendamento; o bridge mantém cotas, auditoria e cache da Agenda.
          const scheduled = await treatmentSessionOperations.schedule({
            session: sess,
            cycle,
            appointment: newAgData,
            duplicateScope: "patient_professional",
          });
          const scheduledAppointment = scheduled.appointment;
          if (!scheduledAppointment) throw new Error("A operação não retornou o agendamento confirmado.");

          setSessions((prev) =>
            prev.map((x) =>
              x.id === sess.id
                ? {
                    ...x,
                    appointment_id: scheduled.session.appointment_id || scheduledAppointment.id,
                    status: scheduled.session.status || "agendada",
                    scheduled_date: scheduled.session.scheduled_date || scheduledAppointment.data,
                  }
                : x,
            ),
          );
          setAgendamentoMap((prev) => {
            const key = treatmentAppointmentKey(sess.patient_id, sess.professional_id, cycle.unit_id, scheduledAppointment.data);
            return { ...prev, [key]: [appointmentSnapshot(scheduledAppointment), ...(prev[key] || []).filter((item) => item.id !== scheduledAppointment.id)] };
          });
          setAppointmentByIdMap((prev) => ({ ...prev, [scheduledAppointment.id]: appointmentSnapshot(scheduledAppointment) }));

          usar(scheduledAppointment.data, scheduledAppointment.hora);
          resumo.push({
            numero: sess.session_number,
            data: scheduledAppointment.data,
            hora: scheduledAppointment.hora,
            status: scheduled.status === "agendado" ? "agendada" : "ja_agendada",
          });
        } catch (innerErr: any) {
          console.error(`[AgendarCiclo] sessão ${sess.session_number}:`, innerErr);
          resumo.push({
            numero: sess.session_number,
            data: sess.scheduled_date,
            status: "erro",
            mensagem: innerErr?.message || "falha ao agendar",
          });
        }
      }

      const novas = resumo.filter((r) => r.status === "agendada").length;
      const jaExist = resumo.filter((r) => r.status === "ja_agendada").length;
      const erros = resumo.filter((r) => r.status === "erro").length;

      await logAction({
        acao: "agendar_ciclo_completo",
        entidade: "treatment_cycle",
        entidadeId: cycle.id,
        modulo: "tratamentos",
        user,
        detalhes: { total: pendentes.length, novas, ja_existiam: jaExist, erros },
      });

      if (erros > 0) {
        toast.warning(
          `${novas} sessão(ões) agendada(s). ${erros} não pôde(ram) ser agendada(s) por falta de horário disponível na agenda do profissional.`,
        );
      } else {
        toast.success(`Ciclo agendado: ${novas} nova(s), ${jaExist} já existia(m).`);
      }

      setResumoCiclo(resumo);
      // Refresh em background para sincronização final
      loadData(true);
    } catch (err: any) {
      console.error("[AgendarCiclo] erro geral:", err);
      toast.error(err?.message || "Erro ao agendar ciclo completo.");
    } finally {
      setAgendandoCiclo(false);
      agendarCicloInFlightRef.current = false;
    }
  };

  const isMaster = user?.role === 'master';
  const canControlSessions = isMaster || isProfissional;

  const remarcationTreatmentSession = async (
    session: TreatmentSession,
    cycle: TreatmentCycle,
    newDate: string,
    newTime?: string,
    checkPatientConflict = false,
  ) => {
    if (getSessionIntegrity(session, cycle).kind !== "agendada") {
      throw new Error("A remarcação exige um vínculo ativo e confirmado entre a sessão e a Agenda.");
    }
    if (newTime) {
      const availableSlots = getAvailableSlots(cycle.professional_id, cycle.unit_id, newDate);
      const turnWindows = getTurnoInfo(cycle.professional_id, cycle.unit_id, newDate);
      const existingAppointment = session.appointment_id ? appointmentByIdMap[session.appointment_id] : null;
      const sameOccupiedTurn = !!existingAppointment && session.scheduled_date === newDate
        && isTimeWithinTurnWindow(existingAppointment.hora, turnWindows)
        && isTimeWithinTurnWindow(newTime, turnWindows);
      const hasFreeTurnCapacity = turnWindows.some((turn) => turn.vagasLivresInternas > 0);
      const isAvailable = availableSlots.includes(newTime)
        || (hasFreeTurnCapacity && isTimeWithinTurnWindow(newTime, turnWindows))
        || sameOccupiedTurn
        || (canControlSessions && getTreatmentConfiguredWindows(cycle.professional_id, cycle.unit_id, newDate)
          .some((window) => window.vagasPorHora === 0 && isTimeWithinTurnWindow(newTime, [window])));
      if (!isAvailable && !canControlSessions) {
        throw new Error("O horário escolhido não está disponível na grade atual do profissional.");
      }
    }
    const oldDate = session.scheduled_date;
    const result = await treatmentSessionOperations.reschedule({
      session,
      cycle,
      newDate,
      newTime,
      checkPatientConflict,
      bypassBlockCheck: false,
      manualCapacityOverride: canControlSessions,
    });
    setSessions((previous) => previous.map((item) => item.id === session.id
      ? { ...item, scheduled_date: result.session.scheduled_date || newDate }
      : item));
    if (result.appointment) {
      setAgendamentoMap((previous) => {
        const next = { ...previous };
        const snapshot = appointmentSnapshot(result.appointment!);
        const oldKey = treatmentAppointmentKey(session.patient_id, session.professional_id, cycle.unit_id, oldDate);
        next[oldKey] = (next[oldKey] || []).filter((item) => item.id !== snapshot.id);
        if (next[oldKey].length === 0) delete next[oldKey];
        const key = treatmentAppointmentKey(session.patient_id, session.professional_id, cycle.unit_id, result.appointment!.data);
        next[key] = [snapshot, ...(next[key] || []).filter((item) => item.id !== snapshot.id)];
        return next;
      });
      const snapshot = appointmentSnapshot(result.appointment);
      setAppointmentByIdMap((previous) => ({ ...previous, [snapshot.id]: snapshot }));
    }
    await logAction({
      acao: "remarcar_sessao",
      entidade: "treatment_session",
      entidadeId: session.id,
      modulo: "tratamentos",
      user,
        detalhes: {
          ciclo: cycle.id,
          sessao: session.session_number,
          data_anterior: oldDate,
          data_nova: newDate,
          agendamento_vinculado: session.appointment_id || null,
          ...(!checkPatientConflict ? {
            old_value: { scheduled_date: oldDate },
            new_value: { scheduled_date: newDate },
          } : {}),
        },
    });
    toast.success(`Sessão ${session.session_number} remarcada de ${new Date(oldDate + "T12:00:00").toLocaleDateString("pt-BR")} para ${new Date(newDate + "T12:00:00").toLocaleDateString("pt-BR")}`);
    setRemarcarTarget(null);
    setRemarcarData("");
    loadData(true);
    return result;
  };

  const handleAddIntermediateSession = async () => {
    if (!selectedCycle) {
      toast.error("Selecione um ciclo.");
      return;
    }
    if (!intermediateDate) {
      toast.error("Informe a data da nova sessão.");
      return;
    }
    if (intermediateAfterSession < 0) {
      toast.error("Selecione onde a sessão será inserida.");
      return;
    }
    if (addingIntermediate) return; // Double-click guard
    setAddingIntermediate(true);
    try {
      // SEMPRE busca sessões REAIS do banco (não confia no estado local)
      // para evitar duplicações causadas por estado defasado/otimista.
      const { data: freshSessions, error: fetchErr } = await supabase
        .from("treatment_sessions")
        .select("id, session_number, scheduled_date")
        .eq("cycle_id", selectedCycle.id)
        .order("session_number", { ascending: true });
      if (fetchErr) throw fetchErr;

      const currentSessions = (freshSessions || []) as Array<{
        id: string;
        session_number: number;
        scheduled_date: string;
      }>;

      const insertPos = intermediateAfterSession; // posição-base: 0 = antes da 1ª
      const novaNumeroSessao = insertPos + 1;
      const newTotal = currentSessions.length + 1;

      // Guard anti-duplicidade: já existe sessão neste ciclo, na mesma data
      // e mesma numeração calculada? Aborta para não duplicar.
      const possibleDup = currentSessions.find(
        (s) => s.scheduled_date === intermediateDate && s.session_number === novaNumeroSessao,
      );
      if (possibleDup) {
        toast.error("Já existe uma sessão registrada nesta data e posição.");
        setAddingIntermediate(false);
        return;
      }

      // 1) Renumera APENAS sessões >= novaNumeroSessao, em ordem DESC para
      //    evitar colisões temporárias (sem unique constraint, mas é a
      //    ordem segura caso seja adicionada futuramente).
      const toRenumber = currentSessions
        .filter((s) => s.session_number >= novaNumeroSessao)
        .sort((a, b) => b.session_number - a.session_number);

      for (const s of toRenumber) {
        const { error: upErr } = await supabase
          .from("treatment_sessions")
          .update({ session_number: s.session_number + 1, total_sessions: newTotal })
          .eq("id", s.id);
        if (upErr) throw upErr;
      }

      // 2) Atualiza total_sessions nas sessões que ficaram antes da nova
      const toUpdateTotal = currentSessions.filter((s) => s.session_number < novaNumeroSessao);
      for (const s of toUpdateTotal) {
        const { error: upErr } = await supabase
          .from("treatment_sessions")
          .update({ total_sessions: newTotal })
          .eq("id", s.id);
        if (upErr) throw upErr;
      }

      // 3) Insere UMA ÚNICA sessão intermediária na posição escolhida.
      //    NÃO chama nenhuma função de "próxima sessão" e NÃO cria nada
      //    extra no final.
      const { error: insertError } = await supabase.from("treatment_sessions").insert({
        cycle_id: selectedCycle.id,
        patient_id: selectedCycle.patient_id,
        professional_id: selectedCycle.professional_id,
        session_number: novaNumeroSessao,
        total_sessions: newTotal,
        scheduled_date: intermediateDate,
        status: "pendente_agendamento",
      });
      if (insertError) throw insertError;

      // 4) Atualiza total do ciclo (apenas +1, nunca mais)
      const { error: cycleErr } = await supabase
        .from("treatment_cycles")
        .update({ total_sessions: newTotal })
        .eq("id", selectedCycle.id);
      if (cycleErr) throw cycleErr;

      await logAction({
        acao: "adicionar_sessao_intermediaria",
        entidade: "treatment_session",
        entidadeId: selectedCycle.id,
        modulo: "tratamentos",
        user,
        detalhes: {
          ciclo: selectedCycle.id,
          posicao: novaNumeroSessao,
          data: intermediateDate,
          total_anterior: currentSessions.length,
          total_novo: newTotal,
        },
      });

      toast.success("Sessão intermediária criada com sucesso.");
      setAddIntermediateOpen(false);
      setIntermediateDate("");
      setIntermediateAfterSession(0);

      // Atualiza UI com dados REAIS do banco (evita estado otimista duplicado)
      await loadSessionsForCycle(selectedCycle, true);
      await loadData(true);
    } catch (err: any) {
      console.error(err);
      toast.error(
        "Não foi possível criar a sessão intermediária. Nenhuma alteração foi salva. " +
          (err?.message || ""),
      );
    } finally {
      setAddingIntermediate(false);
    }
  };
  const handleExtension = async () => {
    if (!selectedCycle || !extensionForm.reason || extensionForm.new_sessions <= 0) {
      toast.error("Informe a quantidade de sessões e o motivo.");
      return;
    }
    try {
      const newTotal = selectedCycle.total_sessions + extensionForm.new_sessions;

      // Determine weekdays from existing sessions or fallback
      const existingSessions = sessions.filter(s => s.cycle_id === selectedCycle.id);
      const weekdaysFromExisting = [...new Set(existingSessions.map(s => {
        const d = new Date(s.scheduled_date + 'T12:00:00');
        const dow = d.getDay();
        return dow === 0 ? 7 : dow;
      }))].sort((a, b) => a - b);

      // Find last existing session date as start for new sessions
      const lastSessionDate = existingSessions.length > 0
        ? existingSessions.sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))[0].scheduled_date
        : selectedCycle.start_date;

      const nextDay = new Date(lastSessionDate + 'T12:00:00');
      nextDay.setDate(nextDay.getDate() + 1);
      const startForNew = nextDay.toISOString().split('T')[0];

      const blockedRanges = buildBlockedRanges(bloqueios, selectedCycle.professional_id, selectedCycle.unit_id);
      const { dates: newDates, skippedCount } = generateSessionDatesWithInfo(
        startForNew,
        selectedCycle.frequency,
        weekdaysFromExisting.length > 0 ? weekdaysFromExisting : [],
        extensionForm.new_sessions,
        blockedRanges,
      );

      if (skippedCount > 0) {
        toast.info(`${skippedCount} sessão(ões) da extensão foram realocadas devido a feriados ou bloqueios.`);
      }

      const newEndDate = newDates.length > 0 ? newDates[newDates.length - 1] : selectedCycle.end_date_predicted || new Date().toISOString().split('T')[0];

      await supabase.from("treatment_extensions").insert({
        cycle_id: selectedCycle.id,
        previous_sessions: selectedCycle.total_sessions,
        new_sessions: newTotal,
        previous_end_date: selectedCycle.end_date_predicted,
        new_end_date: newEndDate,
        reason: extensionForm.reason,
        changed_by: user?.id || "",
      });

      const newSessions = newDates.map((date, idx) => ({
        cycle_id: selectedCycle.id,
        patient_id: selectedCycle.patient_id,
        professional_id: selectedCycle.professional_id,
        session_number: selectedCycle.total_sessions + idx + 1,
        total_sessions: newTotal,
        scheduled_date: date,
        status: "pendente_agendamento",
      }));
      await supabase.from("treatment_sessions").insert(newSessions);

      await supabase
        .from("treatment_cycles")
        .update({
          total_sessions: newTotal,
          end_date_predicted: newEndDate,
          status: "em_andamento",
        })
        .eq("id", selectedCycle.id);

      await logAction({
        acao: "extensao_tratamento",
        entidade: "treatment_cycle",
        entidadeId: selectedCycle.id,
        modulo: "tratamentos",
        user,
        detalhes: { anterior: selectedCycle.total_sessions, novo: newTotal, motivo: extensionForm.reason },
      });

      toast.success("Extensão registrada com sucesso!");
      setExtensionOpen(false);
      setExtensionForm({ new_sessions: 0, reason: "" });
      loadData(true);
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao registrar extensão: " + err.message);
    }
  };

  const handleDischargeSuccess = async (
    result: TreatmentDischargeResult,
    details: { type: string; reason: string },
  ) => {
    if (!selectedCycle) return;
    logAction({
      acao: "alta_paciente",
      entidade: "treatment_cycle",
      entidadeId: selectedCycle.id,
      modulo: "tratamentos",
      user,
      detalhes: {
        paciente: selectedCycle.patient_id,
        tipo_alta: details.type,
        motivo: details.reason,
        sessoes_futuras_removidas: result.removed_sessions,
        agendamentos_futuros_removidos: result.removed_appointments,
        observacao: "Alta manual registrada de forma transacional.",
      },
    });
    toast.success(
      result.removed_sessions > 0 || result.removed_appointments > 0
        ? `Alta realizada. ${result.removed_sessions} sessão(ões) e ${result.removed_appointments} agendamento(s) futuro(s) do ciclo removido(s).`
        : "Alta registrada com sucesso!",
    );
    setSelectedCycle({ ...selectedCycle, status: "finalizado_alta" });
    await loadData(true);
  };

  const handleSendToQueue = async (cycle: TreatmentCycle) => {
    const alreadyInQueue = fila.find(
      (f) => f.pacienteId === cycle.patient_id && ["aguardando", "chamado"].includes(f.status),
    );
    if (alreadyInQueue) {
      toast.error("Paciente já está na fila de espera.");
      return;
    }

    const pac = pacientes.find((p) => p.id === cycle.patient_id);
    const newId = `f${Date.now()}`;
    await addToFila({
      id: newId,
      pacienteId: cycle.patient_id,
      pacienteNome: pac?.nome || "",
      unidadeId: cycle.unit_id,
      profissionalId: cycle.professional_id,
      setor: cycle.specialty,
      prioridade: "normal",
      status: "aguardando",
      posicao: fila.length + 1,
      horaChegada: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      criadoPor: user?.id || "sistema",
      observacoes: `Reencaminhado após alta do tratamento: ${cycle.treatment_type}`,
    });

    await logAction({
      acao: "reencaminhar_fila",
      entidade: "fila_espera",
      entidadeId: newId,
      modulo: "tratamentos",
      user,
      detalhes: { ciclo: cycle.id, paciente: pac?.nome },
    });
    toast.success("Paciente encaminhado para a fila de espera!");
  };

  const handleVincularPts = async () => {
    if (!selectedCycle || !selectedPtsId) {
      toast.error("Selecione um PTS.");
      return;
    }
    setVinculandoPts(true);
    try {
      const { error } = await supabase
        .from("treatment_cycles")
        .update({ pts_id: selectedPtsId } as any)
        .eq("id", selectedCycle.id);
      if (error) throw error;

      await logAction({
        acao: "vincular_pts",
        entidade: "treatment_cycle",
        entidadeId: selectedCycle.id,
        modulo: "tratamentos",
        user,
        detalhes: { pts_id: selectedPtsId, paciente: selectedCycle.patient_id },
      });

      toast.success("PTS vinculado ao ciclo de tratamento!");
      setVincularPtsOpen(false);
      setSelectedPtsId("");
      loadData(true);
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao vincular PTS: " + (err?.message || ""));
    } finally {
      setVinculandoPts(false);
    }
  };

  const handleDesvincularPts = async () => {
    if (!selectedCycle) return;
    try {
      const { error } = await supabase
        .from("treatment_cycles")
        .update({ pts_id: null } as any)
        .eq("id", selectedCycle.id);
      if (error) throw error;

      await logAction({
        acao: "desvincular_pts",
        entidade: "treatment_cycle",
        entidadeId: selectedCycle.id,
        modulo: "tratamentos",
        user,
        detalhes: { pts_id_anterior: selectedCycle.pts_id, paciente: selectedCycle.patient_id },
      });

      toast.success("PTS desvinculado do ciclo.");
      loadData(true);
    } catch (err: any) {
      toast.error("Erro ao desvincular: " + (err?.message || ""));
    }
  };

  const renderSessionNotes = (notes: string) => {
    if (!notes) return null;
    try {
      const parsed = JSON.parse(notes);
      if (parsed && parsed.tipo === "falta") {
        const tipo = parsed.tipo_falta === "justificada" ? "Falta justificada" : "Falta injustificada";
        let quando = "";
        if (parsed.registrado_em) {
          const d = new Date(parsed.registrado_em);
          if (!isNaN(d.getTime())) quando = ` em ${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
        }
        return (
          <div className="text-xs mt-1 space-y-0.5">
            <p className="text-destructive font-medium">
              {tipo}
              {parsed.registrado_por ? ` · Registrada por ${parsed.registrado_por}` : ""}
              {quando}
            </p>
            {parsed.documento && <p className="text-muted-foreground">Documento: {parsed.documento}</p>}
            {parsed.descricao && <p className="text-muted-foreground">{parsed.descricao}</p>}
          </div>
        );
      }
      if (parsed.tipo === "soap") {
        return (
          <div className="text-xs space-y-0.5 mt-1">
            <p>
              <span className="font-semibold text-blue-600">S:</span>{" "}
              <span className="text-muted-foreground">{parsed.subjetivo}</span>
            </p>
            <p>
              <span className="font-semibold text-green-600">O:</span>{" "}
              <span className="text-muted-foreground">{parsed.objetivo}</span>
            </p>
            <p>
              <span className="font-semibold text-orange-600">A:</span>{" "}
              <span className="text-muted-foreground">{parsed.avaliacao}</span>
            </p>
            <p>
              <span className="font-semibold text-purple-600">P:</span>{" "}
              <span className="text-muted-foreground">{parsed.plano}</span>
            </p>
          </div>
        );
      }
    } catch {
      /* not JSON, render as text */
    }
    return <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{notes}</p>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (selectedCycle) {
    const awaitingManualDischarge = isLegacyCycleAwaitingDischarge(selectedCycle);
    const cycleIsClinicallyActive = ["em_andamento", "ativo"].includes(selectedCycle.status) || awaitingManualDischarge;
    const canDischargeSelectedCycle = canManageFull || (isProfissional && selectedCycle.professional_id === user?.id);
    const pac = pacientes.find((p) => p.id === selectedCycle.patient_id);
    const prof = funcionarios.find((f) => f.id === selectedCycle.professional_id);
    const unidade = unidades.find((u) => u.id === selectedCycle.unit_id);
    const progressPct =
      selectedCycle.total_sessions > 0
        ? Math.round((selectedCycle.sessions_done / selectedCycle.total_sessions) * 100)
        : 0;
    const pendingCount = cycleSessions.filter((s) => getSessionIntegrity(s, selectedCycle).kind === "pendente").length;
    const scheduledCount = cycleSessions.filter((s) => getSessionIntegrity(s, selectedCycle).kind === "agendada").length;

    return (
      <div className="space-y-4 animate-fade-in overflow-y-auto max-h-[calc(100vh-80px)] pr-1">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => setSelectedCycle(null)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <h1 className="text-xl font-bold font-display text-foreground">Detalhe do Ciclo</h1>
          {can('tratamento', 'can_view') && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleCorrigirDatasInvalidas}
              disabled={corrigindoDatasInvalidas || agendandoCiclo}
              className={!canAgendarSessao || !cycleIsClinicallyActive || pendingCount === 0 ? "ml-auto" : ""}
            >
              {corrigindoDatasInvalidas && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Verificar datas inválidas
            </Button>
          )}
          {canAgendarSessao && cycleIsClinicallyActive && pendingCount > 0 && (
            <Button
              size="sm"
              onClick={handleAgendarCicloCompleto}
              disabled={agendandoCiclo}
              className="bg-primary hover:bg-primary/90"
            >
              {agendandoCiclo ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CalendarCheck className="w-4 h-4 mr-2" />
              )}
              {agendandoCiclo
                ? "Agendando..."
                : `Agendar Todas as Sessões (${pendingCount})`}
            </Button>
          )}
        </div>

        {resumoCiclo && (
          <ResumoAgendamentoCiclo
            pacienteNome={pac?.nome || "Paciente"}
            pacienteTelefone={(pac as any)?.telefone}
            profissionalNome={prof?.nome || "Profissional"}
            tratamento={selectedCycle.treatment_type}
            itens={resumoCiclo}
            onClose={() => setResumoCiclo(null)}
          />
        )}


        <Card className="shadow-card border-0">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-foreground">{selectedCycle.treatment_type}</h2>
                <p className="text-sm text-muted-foreground">{selectedCycle.specialty}</p>
              </div>
              <Badge className={cn("border", awaitingManualDischarge ? "bg-warning/15 text-warning border-warning/30" : statusColors[selectedCycle.status])}>
                {awaitingManualDischarge ? "Alta pendente" : statusLabels[selectedCycle.status]}
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Paciente</span>
                <p className="font-medium">{pac?.nome || selectedCycle.paciente_nome || "Paciente não encontrado"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Profissional</span>
                <p className="font-medium">{prof?.nome || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Unidade</span>
                <p className="font-medium">{unidade?.nome || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Frequência</span>
                <p className="font-medium capitalize">{selectedCycle.frequency}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Início</span>
                <p className="font-medium">
                  {new Date(selectedCycle.start_date + "T12:00:00").toLocaleDateString("pt-BR")}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Previsão Término</span>
                <p className="font-medium">
                  {selectedCycle.end_date_predicted
                    ? new Date(selectedCycle.end_date_predicted + "T12:00:00").toLocaleDateString("pt-BR")
                    : "—"}
                </p>
              </div>
            </div>
            {selectedCycle.clinical_notes && (
              <p className="text-sm text-muted-foreground border-t pt-2">{selectedCycle.clinical_notes}</p>
            )}

            {selectedCycle.total_sessions > 0 && selectedCycle.sessions_done >= selectedCycle.total_sessions && (
              <div className="p-3 rounded-lg bg-info/10 border border-info/25 text-sm text-info flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>
                  Todas as sessões previstas deste ciclo foram registradas. Avalie a evolução do paciente: utilize
                  {' '}'Solicitar Extensão' se houver indicação de novas sessões ou clique em 'Dar Alta' para finalizar o tratamento.
                </p>
              </div>
            )}

            {faltaStats?.alerta && (
              <div
                className={cn(
                  "p-3 rounded-lg border text-sm flex items-start gap-2",
                  faltaStats.critico
                    ? "bg-destructive/10 border-destructive/30 text-destructive"
                    : "bg-warning/10 border-warning/30 text-warning",
                )}
              >
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  {faltaStats.critico ? (
                    <p>
                      <strong>⚠️ ATENÇÃO:</strong> {faltaStats.total} faltas — considerar desligamento do tratamento.
                    </p>
                  ) : faltaStats.alerta === "consecutivas" ? (
                    <p>
                      <strong>Alerta:</strong> {faltaStats.consecutivas} faltas consecutivas — entrar em contato com
                      paciente.
                    </p>
                  ) : (
                    <p>
                      <strong>Alerta:</strong> {faltaStats.total} faltas alternadas — revisar adesão ao tratamento.
                    </p>
                  )}
                </div>
              </div>
            )}

            {pendingCount > 0 && (
              <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-sm text-warning">
                ⏳ <strong>{pendingCount} sessão(ões)</strong> aguardando agendamento pela recepção.
                {scheduledCount > 0 && ` • ${scheduledCount} já agendada(s).`}
                {canAgendarSessao && (
                  <span className="block text-xs mt-0.5 text-warning/80">
                    Clique em "Agendar" em cada sessão abaixo para confirmar na agenda.
                  </span>
                )}
              </div>
            )}

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progresso</span>
                <span>
                  {selectedCycle.sessions_done}/{selectedCycle.total_sessions} sessões ({progressPct}%)
                </span>
              </div>
              <Progress value={progressPct} className="h-3" />
            </div>

            <div className="flex gap-2 flex-wrap pt-2">
              {cycleIsClinicallyActive && (isProfissional || canManageFull) && (
                <>
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedSessionForRegister(null);
                      setSelectSessionOpen(true);
                    }}
                  >
                    <Play className="w-3.5 h-3.5 mr-1" /> Registrar Sessão
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setExtensionForm({ new_sessions: 0, reason: "" });
                      setExtensionOpen(true);
                    }}
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" /> Solicitar Extensão
                  </Button>
                  {canDischargeSelectedCycle && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-destructive text-destructive"
                      onClick={() => setDischargeOpen(true)}
                    >
                      <CheckCircle className="w-3.5 h-3.5 mr-1" /> Dar Alta
                    </Button>
                  )}
                </>
              )}
              {selectedCycle.status === "finalizado_alta" && canManageFull && (
                <Button size="sm" variant="outline" onClick={() => handleSendToQueue(selectedCycle)}>
                  <ListOrdered className="w-3.5 h-3.5 mr-1" /> Encaminhar para Fila
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {selectedCycle.pts_id && linkedPtsLoading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando PTS vinculado...
          </div>
        ) : linkedPts ? (
          <Card className="shadow-card border-0 border-l-4 border-l-purple-500">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">PTS Vinculado</h3>
                    <p className="text-xs text-muted-foreground">
                      Criado em {new Date(linkedPts.created_at).toLocaleDateString("pt-BR")}
                      {" • "}
                      {funcionarios.find((f) => f.id === linkedPts.professional_id)?.nome || "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    className={cn(
                      "border text-xs",
                      linkedPts.status === "ativo"
                        ? "bg-success/15 text-success border-success/30"
                        : "bg-muted text-muted-foreground border-border",
                    )}
                  >
                    {linkedPts.status === "ativo" ? "Ativo" : "Encerrado"}
                  </Badge>
                  {(isProfissional || canManageFull) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={handleDesvincularPts}
                      title="Desvincular PTS"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="mb-3">
                <p className="text-xs text-muted-foreground font-semibold mb-1">Diagnóstico Funcional</p>
                <p className="text-sm text-foreground bg-muted/30 p-2 rounded">{linkedPts.diagnostico_funcional}</p>
              </div>

              <div className="mb-3">
                <p className="text-xs text-muted-foreground font-semibold mb-1">Objetivos Terapêuticos</p>
                <p className="text-sm text-foreground bg-muted/30 p-2 rounded">{linkedPts.objetivos_terapeuticos}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                {linkedPts.metas_curto_prazo && (
                  <div className="p-2 rounded bg-blue-500/5 border border-blue-500/20">
                    <p className="text-xs font-semibold text-blue-600 mb-1">📌 Curto Prazo</p>
                    <p className="text-xs text-foreground">{linkedPts.metas_curto_prazo}</p>
                  </div>
                )}
                {linkedPts.metas_medio_prazo && (
                  <div className="p-2 rounded bg-orange-500/5 border border-orange-500/20">
                    <p className="text-xs font-semibold text-orange-600 mb-1">📋 Médio Prazo</p>
                    <p className="text-xs text-foreground">{linkedPts.metas_medio_prazo}</p>
                  </div>
                )}
                {linkedPts.metas_longo_prazo && (
                  <div className="p-2 rounded bg-green-500/5 border border-green-500/20">
                    <p className="text-xs font-semibold text-green-600 mb-1">🎯 Longo Prazo</p>
                    <p className="text-xs text-foreground">{linkedPts.metas_longo_prazo}</p>
                  </div>
                )}
              </div>

              {linkedPts.especialidades_envolvidas && linkedPts.especialidades_envolvidas.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground font-semibold mb-1">Especialidades Envolvidas</p>
                  <div className="flex flex-wrap gap-1">
                    {linkedPts.especialidades_envolvidas.map((spec, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {spec}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : cycleIsClinicallyActive && (isProfissional || canManageFull) ? (
          <Card className="shadow-card border-0 border-dashed border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Nenhum PTS vinculado</p>
                  <p className="text-xs text-muted-foreground">
                    Vincule um Projeto Terapêutico Singular para acompanhar objetivos e metas.
                  </p>
                </div>
                {cyclePtsLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                ) : cyclePts.length > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedPtsId("");
                      setVincularPtsOpen(true);
                    }}
                  >
                    <Link2 className="w-3 h-3 mr-1" /> Vincular PTS
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhum PTS ativo para este paciente.</p>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card className="shadow-card border-0">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-foreground">Sessões</h3>
              {canControlSessions && cycleIsClinicallyActive && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setAddIntermediateOpen(true)}
                >
                  <Plus className="w-3 h-3 mr-1" /> Sessão Intermediária
                </Button>
              )}
            </div>
            <div className="max-h-[500px] overflow-y-auto border rounded-lg">
              <div className="space-y-2">
                {cycleSessions.map((s) => {
                  const integrity = getSessionIntegrity(s, selectedCycle);
                  const isPendente = integrity.kind === "pendente";
                  const isAgendada = integrity.kind === "agendada";
                  const isInconsistent = integrity.kind === "possivel_sem_vinculo" || integrity.kind === "appointment_id_inexistente" || integrity.kind === "vinculo_divergente";
                  const effectiveStatus = isAgendada ? "agendada" : isPendente ? "pendente_agendamento" : s.status;
                  const effectiveIsPendente = isPendente;
                  const canRemarcarThis = canAgendarSessao && isAgendada && cycleIsClinicallyActive;
                  const isRealizada = s.status === "realizada";

                  return (
                    <div
                      key={s.id}
                      className={cn(
                        "flex flex-col gap-1 p-3 rounded-lg",
                        effectiveIsPendente ? "bg-warning/5 border border-warning/20"
                          : isAgendada ? "bg-info/5 border border-info/20"
                          : "bg-muted/30",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono font-bold text-primary w-10 text-center shrink-0">
                          {s.session_number}/{s.total_sessions}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground">
                            {s.scheduled_date
                              ? new Date(s.scheduled_date + "T12:00:00").toLocaleDateString("pt-BR")
                              : "—"}
                            {effectiveIsPendente && <span className="ml-2 text-xs text-warning">· Aguarda agendamento</span>}
                            {integrity.kind === "possivel_sem_vinculo" && (
                              <span className="ml-2 text-xs text-warning font-medium">· Possível agendamento sem vínculo — regularização necessária</span>
                            )}
                            {integrity.kind === "appointment_id_inexistente" && (
                              <span className="ml-2 text-xs text-destructive font-medium">· Agendamento vinculado não encontrado — revisão necessária</span>
                            )}
                            {integrity.kind === "vinculo_divergente" && (
                              <span className="ml-2 text-xs text-destructive font-medium">
                                · Vínculo inconsistente — revisão necessária
                                {integrity.appointment?.data && integrity.appointment.data !== s.scheduled_date
                                  ? ` (Agenda: ${new Date(integrity.appointment.data + "T12:00:00").toLocaleDateString("pt-BR")} às ${integrity.appointment.hora})`
                                  : ""}
                              </span>
                            )}
                            {isAgendada && (
                              <span className="ml-2 text-xs text-info font-medium">· Agendada</span>
                            )}
                          </p>
                          {s.procedure_done && <p className="text-xs text-muted-foreground">{s.procedure_done}</p>}
                        </div>
                        <Badge className={cn("text-xs shrink-0", isInconsistent ? "bg-warning/15 text-warning border-warning/30" : sessionStatusColors[effectiveStatus])}>
                          {isInconsistent ? "Revisão necessária" : sessionStatusLabels[effectiveStatus] || effectiveStatus}
                        </Badge>
                        {canAgendarSessao && effectiveIsPendente && cycleIsClinicallyActive && (
                          <div className="flex gap-1 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-primary text-primary hover:bg-primary/10"
                              onClick={() => {
                                setAgendarSessaoTarget(s);
                                setAgendarSessaoData("");
                                setAgendarSessaoHora("");
                                setAgendarSessaoSalaId("");
                              }}
                            >
                              <Calendar className="w-3 h-3 mr-1" /> Agendar
                            </Button>
                            {agendarSessaoTarget?.id === s.id && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-muted-foreground hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAgendarSessaoTarget(null);
                                  setAgendarSessaoData("");
                                  setAgendarSessaoHora("");
                                  setAgendarSessaoSalaId("");
                                  toast("Campos limpos", { icon: "🧹" });
                                }}
                              >
                                <Eraser className="w-3 h-3 mr-1" /> Limpar
                              </Button>
                            )}
                          </div>
                        )}

                        {canRemarcarThis && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-warning text-warning hover:bg-warning/10 shrink-0"
                            onClick={() => {
                              setRemarcarTarget(s);
                              setRemarcarData("");
                              setRemarcarBlockedMsg("");
                            }}
                          >
                            <CalendarClock className="w-3 h-3 mr-1" /> Remarcar
                          </Button>
                        )}
                        {canAgendarSessao && isAgendada && s.appointment_id && cycleIsClinicallyActive && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-destructive text-destructive hover:bg-destructive/10 shrink-0"
                            onClick={() => handleDesmarcarSessao(s)}
                          >
                            <X className="w-3 h-3 mr-1" /> Desmarcar
                          </Button>
                        )}
                        {canControlSessions && isRealizada && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-primary text-primary hover:bg-primary/10 shrink-0"
                              onClick={() => openEditRealizada(s)}
                            >
                              <Pencil className="w-3 h-3 mr-1" /> Editar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-destructive text-destructive hover:bg-destructive/10 shrink-0"
                              onClick={() => handleClearRealizada(s)}
                            >
                              <Eraser className="w-3 h-3 mr-1" /> Limpar
                            </Button>
                          </>
                        )}
                      </div>
                      {s.clinical_notes && renderSessionNotes(s.clinical_notes)}
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {cycleExtensions.length > 0 && (
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <h3 className="font-semibold text-foreground mb-3">Histórico de Extensões</h3>
              <div className="space-y-2">
                {cycleExtensions.map((e) => {
                  const changedByName = funcionarios.find((f) => f.id === e.changed_by)?.nome || "";
                  return (
                    <div key={e.id} className="p-3 rounded-lg bg-muted/30 text-sm">
                      <p className="font-medium">
                        {e.previous_sessions} → {e.new_sessions} sessões
                      </p>
                      <p className="text-xs text-muted-foreground">Motivo: {e.reason}</p>
                      <p className="text-xs text-muted-foreground">
                        {changedByName} • {new Date(e.changed_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Etapa 1: Seleção da sessão a ser registrada (escopo individual por profissional) */}
        <Dialog open={selectSessionOpen} onOpenChange={setSelectSessionOpen}>
          <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Selecione a sessão a registrar</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Apenas sessões agendadas para{" "}
                <strong>
                  {funcionarios.find((f) => f.id === selectedCycle?.professional_id)?.nome || "este profissional"}
                </strong>{" "}
                são listadas. Registrar não afeta sessões de outros profissionais.
              </p>
              {(() => {
                const sessoesDisponiveis = cycleSessions
                  .filter(
                    (s) =>
                      ["agendada", "pendente_agendamento"].includes(s.status) &&
                      s.professional_id === selectedCycle?.professional_id,
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
                  const agKey = treatmentAppointmentKey(s.patient_id, s.professional_id, selectedCycle.unit_id, s.scheduled_date);
                  const ag = s.appointment_id
                    ? appointmentByIdMap[s.appointment_id]
                    : agendamentoMap[agKey]?.[0];
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSelectedSessionForRegister(s);
                        setSelectSessionOpen(false);
                        setNewSession({
                          clinical_notes: "",
                          procedure_done: "",
                          status: "realizada",
                          absence_type: "",
                        });
                        setSoapNotes({ subjetivo: "", objetivo: "", avaliacao: "", plano: "" });
                        setSessionOpen(true);
                      }}
                      className="w-full text-left p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">
                          Sessão {s.session_number}/{selectedCycle?.total_sessions}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {dataFmt}
                          {ag?.hora ? ` • ${ag.hora.slice(0, 5)}` : ""}
                        </p>
                      </div>
                      <Badge variant={s.status === "agendada" ? "default" : "secondary"} className="text-xs shrink-0">
                        {statusLabels[s.status] || s.status}
                      </Badge>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </button>
                  );
                });
              })()}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={sessionOpen} onOpenChange={setSessionOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>Registrar Sessão</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Status</Label>
                <Select value={newSession.status} onValueChange={(v) => setNewSession((p) => ({ ...p, status: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="realizada">Realizada</SelectItem>
                    <SelectItem value="paciente_faltou">Paciente Faltou</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                    <SelectItem value="remarcada">Remarcada</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newSession.status === "paciente_faltou" && (
                <div>
                  <Label>Tipo de Falta *</Label>
                  <Select
                    value={newSession.absence_type}
                    onValueChange={(v) => setNewSession((p) => ({ ...p, absence_type: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="justificada">Justificada</SelectItem>
                      <SelectItem value="injustificada">Injustificada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {newSession.status === "realizada" && (
                <div>
                  <Label>Procedimento Realizado</Label>
                  <Input
                    value={newSession.procedure_done}
                    onChange={(e) => setNewSession((p) => ({ ...p, procedure_done: e.target.value }))}
                    placeholder="Descreva o procedimento (opcional)"
                  />
                </div>
              )}

              {newSession.status === "realizada" && (
                <div className="space-y-3 border-t pt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">
                      Prontuário SOAP <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopyLastSession}
                      disabled={copyingLastSession}
                      className="text-xs"
                    >
                      {copyingLastSession ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                      Copiar da sessão anterior
                    </Button>
                  </div>
                  {[
                    { key: "subjetivo" as const, label: "S — Subjetivo", placeholder: "Relato do paciente, queixas..." },
                    { key: "objetivo" as const, label: "O — Objetivo", placeholder: "Achados do exame, medições..." },
                    { key: "avaliacao" as const, label: "A — Avaliação", placeholder: "Análise clínica, evolução..." },
                    { key: "plano" as const, label: "P — Plano", placeholder: "Conduta, orientações, próximos passos..." },
                  ].map((field) => {
                    const defaultOpts = cycleSoapOptions?.[field.key] || [];
                    const customOpts = soapCustom.getOptionsForField(field.key);
                    const allOpts = [...defaultOpts, ...customOpts];
                    const customWithIds = soapCustom.getOptionWithId(field.key);

                    return (
                    <div key={field.key}>
                      <Label className="text-xs font-semibold">{field.label}</Label>
                      {cycleHasDropdown && allOpts.length > 0 && (
                        <div className="space-y-1 my-1">
                          <div className="flex flex-wrap gap-1">
                            {allOpts.map((opt) => {
                              const isSelected = soapNotes[field.key]?.includes(opt);
                              const isCustom = customOpts.includes(opt);
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => {
                                    setSoapNotes((p) => {
                                      const current = p[field.key] || "";
                                      if (current.includes(opt)) {
                                        return { ...p, [field.key]: current.replace(`• ${opt}\n`, "").replace(`• ${opt}`, "").trim() };
                                      }
                                      return { ...p, [field.key]: current ? `${current}\n• ${opt}` : `• ${opt}` };
                                    });
                                  }}
                                  className={cn(
                                    "text-xs px-2 py-0.5 rounded-full border transition-colors",
                                    isSelected
                                      ? "bg-primary/15 text-primary border-primary/40"
                                      : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
                                    isCustom && "border-dashed"
                                  )}
                                >
                                  {opt}
                                </button>
                              );
                            })}
                            <button
                              type="button"
                              onClick={() => { setAddingFieldTrat(addingFieldTrat === field.key ? null : field.key); setNewOptionTextTrat(""); }}
                              className="text-xs px-2 py-0.5 rounded-full border border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-colors flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" /> Adicionar
                            </button>
                          </div>
                          {addingFieldTrat === field.key && (
                            <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border">
                              <Input
                                value={newOptionTextTrat}
                                onChange={(e) => setNewOptionTextTrat(e.target.value)}
                                placeholder="Nova opção..."
                                className="h-7 text-xs flex-1"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") { e.preventDefault(); if (newOptionTextTrat.trim()) { soapCustom.addOption(field.key, newOptionTextTrat.trim(), cycleProfissao || ''); setNewOptionTextTrat(""); setAddingFieldTrat(null); } }
                                  if (e.key === "Escape") { setAddingFieldTrat(null); setNewOptionTextTrat(""); }
                                }}
                              />
                              <Button type="button" size="sm" className="h-7 text-xs px-2" onClick={() => { if (newOptionTextTrat.trim()) { soapCustom.addOption(field.key, newOptionTextTrat.trim(), cycleProfissao || ''); setNewOptionTextTrat(""); setAddingFieldTrat(null); } }} disabled={!newOptionTextTrat.trim()}>Salvar</Button>
                              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => { setAddingFieldTrat(null); setNewOptionTextTrat(""); }}><X className="w-3 h-3" /></Button>
                            </div>
                          )}
                          {customWithIds.length > 0 && (
                            <details className="text-xs">
                              <summary className="text-muted-foreground cursor-pointer hover:text-foreground">Gerenciar minhas opções ({customWithIds.length})</summary>
                              <div className="mt-1 space-y-1 p-2 rounded-md bg-muted/50 border">
                                {customWithIds.map((opt) => (
                                  <div key={opt.id} className="flex items-center justify-between gap-2">
                                    <span className="truncate">{opt.opcao}</span>
                                    <button type="button" onClick={() => soapCustom.deleteOption(opt.id)} className="text-destructive hover:text-destructive/80 p-0.5"><X className="w-3 h-3" /></button>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      )}
                      <Textarea
                        value={soapNotes[field.key]}
                        onChange={(e) => { const val = e.target.value; setSoapNotes((p) => ({ ...p, [field.key]: val })); }}
                        rows={2}
                        placeholder={field.placeholder}
                      />
                    </div>
                    );
                  })}
                </div>
              )}

              {newSession.status !== "realizada" && (
                <div>
                  <Label>Observações</Label>
                  <Textarea
                    value={newSession.clinical_notes}
                    onChange={(e) => setNewSession((p) => ({ ...p, clinical_notes: e.target.value }))}
                    rows={3}
                    placeholder="Motivo da falta, cancelamento ou remarcação..."
                  />
                </div>
              )}

              {sessionRegisterHint && (
                <p className={cn("text-xs", sessionRegisterHint.startsWith("✔") ? "text-success" : "text-destructive")}>
                  {sessionRegisterHint}
                </p>
              )}

              <Button
                onClick={handleRegisterSession}
                disabled={!canSubmitSessionRegistration || registeringSession}
                className="w-full gradient-primary text-primary-foreground"
              >
                {registeringSession ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Registrando...</>
                ) : (
                  "Registrar"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={editRealizadaOpen} onOpenChange={(open) => { if (!open) { setEditRealizadaOpen(false); setEditRealizadaTarget(null); } }}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Sessão Realizada</DialogTitle>
            </DialogHeader>
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-sm text-warning mb-2">
              <AlertTriangle className="w-4 h-4 inline mr-1" />
              Você está editando uma sessão já finalizada{isMaster ? " (Modo Master)" : ""}
            </div>
            <div className="space-y-4">
              <div>
                <Label>Data da Sessão</Label>
                <Input
                  type="date"
                  value={editRealizadaDate}
                  onChange={(e) => setEditRealizadaDate(e.target.value)}
                />
              </div>
              <div>
                <Label>Procedimento Realizado</Label>
                <Input
                  value={editRealizadaProcedure}
                  onChange={(e) => setEditRealizadaProcedure(e.target.value)}
                  placeholder="Descreva o procedimento (opcional)"
                />
              </div>
              <div className="space-y-3 border-t pt-3">
                <p className="text-sm font-semibold text-foreground">Prontuário SOAP <span className="text-destructive">*</span></p>
                <div>
                  <Label className="text-xs font-semibold">S — Subjetivo <span className="text-destructive">*</span></Label>
                  <Textarea value={editRealizadaSoap.subjetivo} onChange={(e) => setEditRealizadaSoap(p => ({ ...p, subjetivo: e.target.value }))} rows={2} />
                </div>
                <div>
                  <Label className="text-xs font-semibold">O — Objetivo <span className="text-destructive">*</span></Label>
                  <Textarea value={editRealizadaSoap.objetivo} onChange={(e) => setEditRealizadaSoap(p => ({ ...p, objetivo: e.target.value }))} rows={2} />
                </div>
                <div>
                  <Label className="text-xs font-semibold">A — Avaliação <span className="text-destructive">*</span></Label>
                  <Textarea value={editRealizadaSoap.avaliacao} onChange={(e) => setEditRealizadaSoap(p => ({ ...p, avaliacao: e.target.value }))} rows={2} />
                </div>
                <div>
                  <Label className="text-xs font-semibold">P — Plano <span className="text-destructive">*</span></Label>
                  <Textarea value={editRealizadaSoap.plano} onChange={(e) => setEditRealizadaSoap(p => ({ ...p, plano: e.target.value }))} rows={2} />
                </div>
              </div>
              <Button onClick={handleEditRealizada} disabled={editRealizadaSaving} className="w-full gradient-primary text-primary-foreground">
                {editRealizadaSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                Salvar Alterações
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={extensionOpen} onOpenChange={setExtensionOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Solicitar Extensão</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Sessões atuais: <strong>{selectedCycle.total_sessions}</strong>
              </p>
              <div>
                <Label>Sessões adicionais</Label>
                <Input
                  type="number"
                  min={1}
                  value={extensionForm.new_sessions || ""}
                  onChange={(e) => setExtensionForm((p) => ({ ...p, new_sessions: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label>Motivo da extensão *</Label>
                <Textarea
                  value={extensionForm.reason}
                  onChange={(e) => setExtensionForm((p) => ({ ...p, reason: e.target.value }))}
                  rows={3}
                />
              </div>
              <Button
                onClick={handleExtension}
                className="w-full gradient-primary text-primary-foreground"
                disabled={!extensionForm.reason || extensionForm.new_sessions <= 0}
              >
                Confirmar Extensão
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <AltaTratamentoDialog
          open={dischargeOpen}
          onOpenChange={setDischargeOpen}
          cycle={selectedCycle}
          patientName={pacientes.find((p) => p.id === selectedCycle?.patient_id)?.nome || selectedCycle?.paciente_nome || "Paciente"}
          onSuccess={handleDischargeSuccess}
        />

        <ModalAgendarSessao
          open={!!agendarSessaoTarget}
          onClose={() => {
            setAgendarSessaoTarget(null);
            setAgendarSessaoData("");
            setAgendarSessaoHora("");
            setAgendarSessaoSalaId("");
          }}
          session={agendarSessaoTarget}
          cycle={selectedCycle ? {
            id: selectedCycle.id,
            patient_id: selectedCycle.patient_id,
            professional_id: selectedCycle.professional_id,
            unit_id: selectedCycle.unit_id,
            treatment_type: selectedCycle.treatment_type,
          } : null}
          pacienteNome={pacientes.find(p => p.id === selectedCycle?.patient_id)?.nome || ''}
          profissionalNome={funcionarios.find(f => f.id === selectedCycle?.professional_id)?.nome || ''}
          salas={salasDisponiveis}
          availableDates={agendarSessaoDatesDisponiveis}
          getAvailableSlots={getAvailableSlots}
          getTurnoInfo={getTurnoInfo}
          getConfiguredWindows={getTreatmentConfiguredWindows}
          allowCapacityOverride={canControlSessions}
          onConfirm={async (data, hora, salaId) => {
            if (!agendarSessaoTarget || !selectedCycle || agendandoSessao) return;
            setAgendarSessaoData(data);
            setAgendarSessaoHora(hora);
            setAgendarSessaoSalaId(salaId);
            setAgendandoSessao(true);
            try {
              await scheduleTreatmentSession(
                agendarSessaoTarget,
                selectedCycle,
                data,
                hora,
                salaId,
                "patient",
                true,
                canControlSessions,
              );
            } finally {
              setAgendandoSessao(false);
            }
          }}
          mode="agendar"
          isMaster={isMaster}
        />

        <ModalAgendarSessao
          open={!!remarcarTarget}
          onClose={() => {
            setRemarcarTarget(null);
            setRemarcarData("");
            setRemarcarBlockedMsg("");
          }}
          session={remarcarTarget}
          currentAppointment={remarcarTarget?.appointment_id
            ? (() => { const ap = appointmentByIdMap[remarcarTarget.appointment_id]; return ap ? { id: ap.id, data: ap.data, hora: ap.hora || "" } : null; })()
            : null}
          cycle={selectedCycle ? {
            id: selectedCycle.id,
            patient_id: selectedCycle.patient_id,
            professional_id: selectedCycle.professional_id,
            unit_id: selectedCycle.unit_id,
            treatment_type: selectedCycle.treatment_type,
          } : null}
          pacienteNome={pacientes.find(p => p.id === selectedCycle?.patient_id)?.nome || ''}
          profissionalNome={funcionarios.find(f => f.id === selectedCycle?.professional_id)?.nome || ''}
          salas={salasDisponiveis}
          availableDates={agendarSessaoDatesDisponiveis}
          getAvailableSlots={getAvailableSlots}
          getTurnoInfo={getTurnoInfo}
          getConfiguredWindows={getTreatmentConfiguredWindows}
          allowCapacityOverride={canControlSessions}
          onConfirm={async (data, hora, _salaId) => {
            if (!remarcarTarget || !selectedCycle || remarcarSaving) return;
            setRemarcarSaving(true);
            try {
              await remarcationTreatmentSession(remarcarTarget, selectedCycle, data, hora, true);
            } finally {
              setRemarcarSaving(false);
            }
          }}
          mode="remarcar"
          isMaster={isMaster}
        />

        {/* Dialog: Adicionar Sessão Intermediária (Master) */}
        <Dialog open={addIntermediateOpen} onOpenChange={setAddIntermediateOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Adicionar Sessão Intermediária</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Insira uma nova sessão entre as existentes. A numeração será ajustada automaticamente.
              </p>
              <div>
                <Label>Inserir após sessão nº</Label>
                <Select
                  value={String(intermediateAfterSession)}
                  onValueChange={(v) => setIntermediateAfterSession(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Antes da 1ª sessão</SelectItem>
                    {cycleSessions.map((s) => (
                      <SelectItem key={s.session_number} value={String(s.session_number)}>
                        Após sessão {s.session_number} — {new Date(s.scheduled_date + "T12:00:00").toLocaleDateString("pt-BR")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data da nova sessão</Label>
                <Input
                  type="date"
                  value={intermediateDate}
                  onChange={(e) => setIntermediateDate(e.target.value)}
                />
              </div>
              <Button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleAddIntermediateSession();
                }}
                className="w-full gradient-primary text-primary-foreground"
                disabled={!intermediateDate || addingIntermediate}
              >
                {addingIntermediate ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</>
                ) : (
                  <><Plus className="w-4 h-4 mr-2" /> Adicionar Sessão</>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={vincularPtsOpen} onOpenChange={setVincularPtsOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Vincular PTS ao Ciclo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Selecione um PTS ativo do paciente <strong>{pac?.nome || selectedCycle?.paciente_nome || "Paciente não encontrado"}</strong> para vincular a este ciclo de
                tratamento.
              </p>
              {cyclePtsLoading ? (
                <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando PTS do paciente...
                </div>
              ) : cyclePts.length === 0 ? (
                <div className="p-4 bg-muted/30 rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">Nenhum PTS ativo encontrado para este paciente.</p>
                  <p className="text-xs text-muted-foreground mt-1">Crie um PTS no módulo PTS primeiro.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {cyclePts.map((pts) => {
                    const ptsProfName = funcionarios.find((f) => f.id === pts.professional_id)?.nome || "—";
                    return (
                      <div
                        key={pts.id}
                        className={cn(
                          "p-3 rounded-lg border cursor-pointer transition-all",
                          selectedPtsId === pts.id
                            ? "border-purple-500 bg-purple-500/5 ring-1 ring-purple-500/30"
                            : "border-border hover:border-purple-500/30",
                        )}
                        onClick={() => setSelectedPtsId(pts.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground line-clamp-1">
                              {pts.diagnostico_funcional}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Prof. {ptsProfName} • {new Date(pts.created_at).toLocaleDateString("pt-BR")}
                            </p>
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                              {pts.objetivos_terapeuticos}
                            </p>
                            {pts.especialidades_envolvidas.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {pts.especialidades_envolvidas.map((spec, idx) => (
                                  <Badge key={idx} variant="outline" className="text-[10px] h-4">
                                    {spec}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          <div
                            className={cn(
                              "w-5 h-5 rounded-full border flex items-center justify-center",
                              selectedPtsId === pts.id ? "border-purple-500 bg-purple-500" : "border-muted-foreground",
                            )}
                          >
                            {selectedPtsId === pts.id && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <Button
                onClick={handleVincularPts}
                className="w-full gradient-primary text-primary-foreground"
                disabled={!selectedPtsId || vinculandoPts}
              >
                {vinculandoPts ? "Vinculando..." : "Vincular PTS"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Gestão de Tratamentos</h1>
          <p className="text-muted-foreground text-sm">{filteredCycles.length} ciclo(s) de tratamento</p>
        </div>
        {(isProfissional || canManageFull) && (
          <Button
            onClick={() => {
              const userIsProf = profissionais.some((p) => p.id === user?.id);
              setNewCycle({
                patient_id: "",
                professional_id: userIsProf ? user?.id || "" : "",
                unit_id: user?.unidadeId || "",
                specialty: user?.profissao || "",
                treatment_type: "",
                total_sessions: 0,
                frequency: "1x_semana",
                start_date: new Date().toISOString().split("T")[0],
                clinical_notes: "",
                pts_id: "",
                weekdays: [],
                duration_months: 3,
              });
              setCreateOpen(true);
            }}
            className="gradient-primary text-primary-foreground"
          >
            <Plus className="w-4 h-4 mr-2" /> Novo Ciclo
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por paciente, CPF, CNS, tratamento ou status..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Select value={filterProf} onValueChange={(v) => {
          setFilterProf(v);
        }}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Profissional" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {profissionais.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterUnit} onValueChange={(v) => {
          setFilterUnit(v);
        }}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Unidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {unidadesVisiveis.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => {
          setFilterStatus(v);
        }}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="aguardando_agendamento">Aguardando Agendamento</SelectItem>
            {Object.entries(statusLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button 
          variant="outline" 
          onClick={() => {
            setSearchTerm("");
            setFilterProf("all");
            setFilterUnit("all");
            setFilterStatus("all");
            setCurrentPage(1);
          }}
          className="w-full sm:w-auto"
        >
          Limpar Filtros
        </Button>
      </div>

      {loading ? (
        <CardListSkeleton count={6} showSearch={false} />
      ) : filteredCycles.length === 0 ? (
        <Card className="shadow-card border-0">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-3">Nenhum ciclo de tratamento encontrado.</p>
            {(isProfissional || canManageFull) && (
              <Button variant="outline" onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> Criar Primeiro Ciclo
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>
              Exibindo <strong>{(safePage - 1) * PAGE_SIZE + 1}</strong>–
              <strong>{Math.min(safePage * PAGE_SIZE, totalCycles)}</strong> de{" "}
              <strong>{totalCycles}</strong> ciclo(s)
            </span>
            <span>
              Página {safePage} de {totalPages}
            </span>
          </div>
          <div className="space-y-2">
            {paginatedCycles.map((cycle) => {
              const awaitingManualDischarge = isLegacyCycleAwaitingDischarge(cycle);
              const pac = pacientesMap.get(cycle.patient_id);
              const prof = funcionariosMap.get(cycle.professional_id);
              const progressPct =
                cycle.total_sessions > 0 ? Math.round((cycle.sessions_done / cycle.total_sessions) * 100) : 0;
              const stats = sessionStatsByCycle.get(cycle.id) || { pendingAg: 0, faltas: 0 };
              const pendingAg = stats.pendingAg;
              const cycleFaltasCount = stats.faltas;

              return (
                <Card
                  key={cycle.id}
                  className={cn(
                    "shadow-card border-0 cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all",
                    cycleFaltasCount >= 3 && "border-l-4 border-l-warning",
                    cycleFaltasCount >= 5 && "border-l-4 border-l-destructive",
                  )}
                  onClick={() => setSelectedCycle(cycle)}
                >
                  <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">{pac?.nome || cycle.paciente_nome || "Paciente não encontrado"}</p>
                      <p className="text-sm text-muted-foreground">
                        {prof?.nome || "—"} • {cycle.treatment_type}
                      </p>
                      {pendingAg > 0 && (
                        <p className="text-xs text-warning mt-0.5">⏳ {pendingAg} sessão(ões) aguardando agendamento</p>
                      )}
                      {cycleFaltasCount > 0 && (
                        <p className="text-xs text-destructive mt-0.5">⚠️ {cycleFaltasCount} falta(s) registrada(s)</p>
                      )}
                      {cycle.pts_id && <p className="text-xs text-purple-500 mt-0.5">📋 PTS vinculado</p>}
                    </div>
                    <div className="flex items-center gap-3 flex-nowrap shrink-0">
                      <div className="text-center min-w-[60px]">
                        <p className="text-xs text-muted-foreground">Sessões</p>
                        <p className="text-sm font-bold">
                          {cycle.sessions_done}/{cycle.total_sessions}
                        </p>
                      </div>
                      <div className="w-24">
                        <Progress value={progressPct} className="h-2" />
                      </div>
                      <div className="text-center min-w-[50px]">
                        <p className="text-xs text-muted-foreground">Início</p>
                        <p className="text-sm">
                          {new Date(cycle.start_date + "T12:00:00").toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </p>
                      </div>
                      <Badge className={cn("border text-xs", awaitingManualDischarge ? "bg-warning/15 text-warning border-warning/30" : statusColors[cycle.status])}>
                        {awaitingManualDischarge ? "Alta pendente" : statusLabels[cycle.status]}
                      </Badge>
                      {(user?.role === "master" || user?.role === "profissional") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 h-7 w-7 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(cycle);
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
              >
                <ChevronRight className="w-4 h-4 mr-1 rotate-180" /> Anterior
              </Button>
              <span className="text-sm text-muted-foreground px-3">
                {safePage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
              >
                Próxima <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Ciclo de Tratamento</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-4 pr-2">
              <div>
                <Label>Paciente *</Label>
                <BuscaPaciente
                  pacientes={pacientes}
                  value={newCycle.patient_id}
                  onChange={(id, nome) => setNewCycle((p) => ({ ...p, patient_id: id }))}
                />
              </div>
              {activeDuplicates.length > 0 && (
                <div className="p-3 rounded-lg border border-warning/40 bg-warning/10 text-xs space-y-1">
                  <div className="font-semibold text-foreground">⚠️ Já existe tratamento não concluído com este profissional</div>
                  {activeDuplicates.map((c) => (
                    <div key={c.id} className="text-muted-foreground">
                      • {c.treatment_type || "—"} — início {c.start_date ? new Date(c.start_date + "T12:00:00").toLocaleDateString("pt-BR") : "—"} ({c.sessions_done ?? 0}/{c.total_sessions ?? 0} sessões)
                    </div>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-1"
                    onClick={() => { setCreateOpen(false); setSelectedCycle(activeDuplicates[0]); }}
                  >
                    Abrir tratamento existente
                  </Button>
                </div>
              )}
              {!isProfissional && (
                <div>
                  <Label>Profissional *</Label>
                  <Select
                    value={newCycle.professional_id}
                    onValueChange={(v) => {
                      const prof = profissionais.find((p) => p.id === v);
                      setNewCycle((p) => ({
                        ...p,
                        professional_id: v,
                        unit_id: prof?.unidadeId || p.unit_id,
                        specialty: prof?.profissao || p.specialty,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {profissionais.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome} — {p.profissao}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {newCycle.professional_id && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {profissionais.find((p) => p.id === newCycle.professional_id)?.nome || ""}
                    </p>
                  )}
                </div>
              )}
              <div>
                <Label>Tipo de Tratamento *</Label>
                <Input
                  value={newCycle.treatment_type}
                  onChange={(e) => setNewCycle((p) => ({ ...p, treatment_type: e.target.value }))}
                  placeholder="Ex: Reabilitação Joelho Direito"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Frequência *</Label>
                  <Select
                    value={newCycle.frequency}
                    onValueChange={(v) => setNewCycle((p) => ({ ...p, frequency: v, weekdays: [] }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCY_OPTIONS_NEW.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Total de sessões *</Label>
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={newCycle.total_sessions}
                    onChange={(e) => {
                      const v = parseInt(e.target.value) || 1;
                      setNewCycle((p) => ({ ...p, total_sessions: Math.min(200, Math.max(1, v)) }));
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Controla a quantidade exata de sessões geradas (máximo 200).
                  </p>
                </div>
              </div>

              {isWeekdayFrequency(newCycle.frequency) && (
                <div>
                  <Label className="mb-2 block">Dias da Semana * (selecione {getMaxWeekdays(newCycle.frequency)})</Label>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAY_LABELS.map((day) => {
                      const checked = newCycle.weekdays.includes(day.value);
                      const maxReached = newCycle.weekdays.length >= getMaxWeekdays(newCycle.frequency);
                      return (
                        <label key={day.value} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer text-sm transition-colors ${checked ? 'bg-primary/10 border-primary text-primary' : maxReached ? 'opacity-40 cursor-not-allowed border-border' : 'border-border hover:bg-accent'}`}>
                          <Checkbox
                            checked={checked}
                            disabled={!checked && maxReached}
                            onCheckedChange={(c) => {
                              setNewCycle((p) => ({
                                ...p,
                                weekdays: c
                                  ? [...p.weekdays, day.value]
                                  : p.weekdays.filter((d) => d !== day.value),
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

              <div>
                <Label>Data de Início</Label>
                <Input
                  type="date"
                  value={newCycle.start_date}
                  onChange={(e) => setNewCycle((p) => ({ ...p, start_date: e.target.value }))}
                />
              </div>

              <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
                <div>
                  <span className="text-muted-foreground">Total de sessões: </span>
                  <strong>{newCycle.total_sessions}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Previsão da última sessão: </span>
                  <strong>
                    {(() => {
                      const total = Math.max(1, newCycle.total_sessions || 0);
                      const ranges = buildBlockedRanges(bloqueios, newCycle.professional_id, newCycle.unit_id);
                      const dates = generateSessionDates(newCycle.start_date, newCycle.frequency, newCycle.weekdays, total, ranges);
                      return dates.length > 0 ? new Date(dates[dates.length - 1] + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
                    })()}
                  </strong>
                </div>
                <div className="text-xs text-muted-foreground">
                  Status inicial das sessões: Aguardando Agendamento
                </div>
              </div>



              {newCycle.patient_id && createPtsLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando PTS do paciente...
                </div>
              )}

              {newCycle.patient_id && !createPtsLoading && createPts.length > 0 && (
                <div>
                  <Label>Vincular ao PTS (opcional)</Label>
                  <Select
                    value={newCycle.pts_id || "none"}
                    onValueChange={(v) => setNewCycle((p) => ({ ...p, pts_id: v === "none" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um PTS" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {createPts.map((pts) => (
                        <SelectItem key={pts.id} value={pts.id}>
                          {pts.diagnostico_funcional.substring(0, 60)} —{" "}
                          {new Date(pts.created_at).toLocaleDateString("pt-BR")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Vincular um PTS permite acompanhar os objetivos terapêuticos diretamente no ciclo de tratamento.
                  </p>
                </div>
              )}

              {newCycle.patient_id && !createPtsLoading && createPts.length === 0 && (
                <div className="p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground">
                  ℹ️ Este paciente não possui PTS ativo. Você pode criar um no módulo PTS e vincular depois.
                </div>
              )}

              <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg text-xs text-warning">
                ℹ️ As sessões serão criadas com status <strong>Aguardando Agendamento</strong>. A recepção ou master
                precisará agendar cada sessão respeitando as vagas disponíveis.
              </div>
              <div>
                <Label>Observações Clínicas</Label>
                <Textarea
                  value={newCycle.clinical_notes}
                  onChange={(e) => setNewCycle((p) => ({ ...p, clinical_notes: e.target.value }))}
                  rows={3}
                />
              </div>
              <Button onClick={() => handleCreateCycle()} className="w-full gradient-primary text-primary-foreground">
                Criar Ciclo
              </Button>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={duplicateConfirm.length > 0} onOpenChange={(open) => { if (!open) setDuplicateConfirm([]); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tratamento já em andamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Este paciente já possui {duplicateConfirm.length === 1 ? "um tratamento não concluído" : `${duplicateConfirm.length} tratamentos não concluídos`} com este profissional:
            </p>
            {duplicateConfirm.map((c) => (
              <div key={c.id} className="p-3 rounded-lg border border-warning/40 bg-warning/10">
                <div className="font-medium text-foreground">{c.treatment_type || "—"}</div>
                <div className="text-xs text-muted-foreground">
                  Início: {c.start_date ? new Date(c.start_date + "T12:00:00").toLocaleDateString("pt-BR") : "—"} • Sessões: {c.sessions_done ?? 0}/{c.total_sessions ?? 0}
                </div>
              </div>
            ))}
            <p className="text-muted-foreground">Deseja usar o tratamento existente ou prosseguir criando um novo?</p>
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => {
                  const target = duplicateConfirm[0];
                  setDuplicateConfirm([]);
                  setCreateOpen(false);
                  if (target) setSelectedCycle(target);
                }}
              >
                Usar tratamento existente
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDuplicateConfirm([]);
                  handleCreateCycle(true);
                }}
              >
                Prosseguir e criar mesmo assim
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Você está prestes a excluir o ciclo de{" "}
              <strong className="text-foreground">
                {pacientes.find((p) => p.id === deleteTarget?.patient_id)?.nome}
              </strong>
              {deleteTarget?.treatment_type ? ` — ${deleteTarget.treatment_type}` : ""}.
            </p>
            <p className="text-sm text-destructive font-medium">
              Todas as sessões, extensões e vínculos com PTS serão removidos permanentemente.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
                Cancelar
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDeleteCycle}>
                Confirmar exclusão
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Tratamentos;
