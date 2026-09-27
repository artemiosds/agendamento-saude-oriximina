Warning: truncated output (original token count: 38756)
Total output lines: 3695

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { usePacientes } from "@/contexts/PacientesContext";
import { useOperacional } from "@/contexts/OperacionalContext";
import { useFila } from "@/contexts/FilaContext";
import { useAgendamentos } from "@/contexts/AgendamentosContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { supabase } from "@/integrations/supabase/client";
import { procedureService, ProcedimentoDB } from "@/services/procedureService";
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
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { FREQUENCY_OPTIONS_NEW, WEEKDAY_LABELS, getMaxWeekdays, isWeekdayFrequency, calculateTotalSessions, generateSessionDatesWithInfo, calcEndDateFromSessions, buildBlockedRanges, generateSessionDates } from "@/lib/treatmentSessionGenerator";
import { autoFixInvalidTreatmentSessions } from "@/lib/treatmentSessionAutoFix";
import { ModalAgendarSessao } from "@/components/ModalAgendarSessao";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { ResumoAgendamentoCiclo, type ResumoSessaoItem } from "@/components/ResumoAgendamentoCiclo";
import { CalendarCheck } from "lucide-react";
import { CardListSkeleton } from "@/components/skeletons/CardListSkeleton";

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
  cancelada: "bg-muted text-muted-foreground",
  remarcada: "bg-warning/10 text-warning",
};

const sessionStatusLabels: Record<string, string> = {
  pendente_agendamento: "Ag. Agendamento",
  agendada: "Agendada",
  realizada: "Realizada",
  paciente_faltou: "Faltou",
  cancelada: "Cancelada",
  remarcada: "Remarcada",
};

const Tratamentos: React.FC = () => {
  const { pacientes } = usePacientes();
  const { funcionarios, unidades, salas, bloqueios, logAction, getAvailableSlots, getAvailableDates } = useOperacional();
  const { fila, addToFila } = useFila();
  const {
    addAgendamento,
    addAgendamentoTransactionally,
    cancelAgendamento,
    deleteAgendamentoTransactionally,
    applyTreatmentAgendamentoUpdate,
  } = useAgendamentos();
  const { user } = useAuth();
  const { can } = usePermissions();
  const { unidadesVisiveis, profissionaisVisiveis } = useUnidadeFilter();
  const profissionais = profissionaisVisiveis;

  const [cycles, setCycles] = useState<TreatmentCycle[]>([]);
  const [sessions, setSessions] = useState<TreatmentSession[]>([]);
  const [extensions, setExtensions] = useState<TreatmentExtension[]>([]);
  const [procedimentos, setProcedimentos] = useState<ProcedimentoDB[]>([]);
  const [ptsList, setPtsList] = useState<PTSRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCycle, setSelectedCycle] = useState<TreatmentCycle | null>(null);
  // Map: "patientId|profId|date" -> { id, hora, status }
  const [agendamentoMap, setAgendamentoMap] = useState<Record<string, { id: string; hora: string; status: string }>>({}); 
  const [ptsVinculado, setPtsVinculado] = useState<PTSRecord | null>(null);
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
  const [dischargeForm, setDischargeForm] = useState({ reason: "", final_notes: "" });
  const [dischargeFutureCount, setDischargeFutureCount] = useState(0);
  const [dischargeLoading, setDischargeLoading] = useState(false);

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
      const patient = pacientes.find((item) => item.id === patientId);
      if (!patient) throw new Error('Paciente não encontrado.');
      const { isPacienteIsentoBloqueio, isPacienteBloqueadoParaProfissional } = await import('@/lib/faltasUtils');
      if (isPacienteIsentoBloqueio(patient)) {
        toast.info('Paciente possui exceção administrativa (TFD/Ordem Judicial). Agendamento permitido.');
        return;
      }
      if (await isPacienteBloqueadoParaProfissional(patientId, professionalId)) {
        throw new Error('Paciente bloqueado por faltas injustificadas para este profissional.');
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

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Server-side paginated cycles via RPC (lightweight, with stats only)
      const isProf = user?.role === "profissional";
      const restrictUnit = !!(user?.unidadeId && user?.usuario !== 'admin.sms');

      const { data: rpcData, error: rpcError } = await (supabase as any).rpc('get_treatment_cycles_paginated', {
        p_page: currentPage,
        p_page_size: PAGE_SIZE,
        p_professional_id: filterProf !== 'all' ? filterProf : (isProf ? user?.id : null),
        p_unit_id: filterUnit !== 'all' ? filterUnit : (restrictUnit ? user?.unidadeId : null),
        p_status: filterStatus !== 'all' ? filterStatus : null,
        p_search: debouncedSearchTerm || null,
        p_only_own_professional: false, // already handled via p_professional_id
      });

      if (rpcError) throw rpcError;

      const cyclesData = (rpcData?.cycles || []) as TreatmentCycle[];
      setCycles(cyclesData);
      setTotalCycles(rpcData?.total || 0);
      setSelectedCycle((current) => (current ? cyclesData.find((cycle) => cycle.id === current.id) || current : current));

      // PTS list (lightweight, scoped by unit)
      let qPts = supabase.from("pts").select("*").order("created_at", { ascending: false });
      if (restrictUnit) qPts = qPts.eq("unit_id", user!.unidadeId!);
      const [{ data: ptsData }, procsData] = await Promise.all([
        qPts,
        procedureService.getActive(),
      ]);

      setProcedimentos(procsData);
      if (ptsData) setPtsList(ptsData as PTSRecord[]);
    } catch (err: any) {
      console.error("Error loading treatments:", err);
      toast.error(`Erro ao carregar dados de tratamento: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setLoading(false);
    }
  }, [user, currentPage, filterProf, filterUnit, filterStatus, debouncedSearchTerm]);

  // Lazy load: sessions, extensions and agendamento map only for the selected cycle
  const loadSessionsForCycle = useCallback(async (cycle: TreatmentCycle, silent = true) => {
    try {
      const [sData, eData] = await Promise.all([
        treatmentService.getSessions(cycle.id),
        supabase.from("treatment_extensions").select("*").eq("cycle_id", cycle.id).order("changed_at", { ascending: false }),
      ]);
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
        let agQuery = supabase
          .from("agendamentos")
          .select("id, data, hora, status, paciente_id, profissional_id")
          .in("paciente_id", patientIds)
          .not("status", "in", '("cancelado","falta","remarcado")');
        if (user?.unidadeId && user?.usuario !== 'admin.sms') {
          agQuery = agQuery.eq("unidade_id", user.unidadeId);
        }
        const { data: agData } = await agQuery;
        if (agData) {
          setAgendamentoMap((prev) => {
            const next = { ...prev };
            for (const ag of agData) {
              const key = `${ag.paciente_id}|${ag.profissional_id}|${ag.data}`;
              next[key] = { id: ag.id, hora: ag.hora, status: ag.status };
            }
            return next;
          });
        }
      }
    } catch (err) {
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

  // Auto-fix: detect treatment_sessions agendadas/pendentes em datas inválidas
  // (sábado, domingo, feriado, bloqueio manual) e devolve para "pendente_agendamento".
  // Roda uma vez após identificar o usuário; a função consulta bloqueios no banco.
  const autoFixRanRef = React.useRef(false);
  useEffect(() => {
    if (autoFixRanRef.current) return;
    if (!user) return;
    autoFixRanRef.current = true;
    autoFixInvalidTreatmentSessions().then((res) => {
      if (res.fixed > 0) {
        toast.info(`${res.fixed} sessão(ões) em datas inválidas foram devolvidas para "Aguardando agendamento".`);
        loadData(true);
      }
      if (res.errors > 0) toast.error(`Falha ao corrigir ${res.errors} sessão(ões).`);
    }).catch((error) => {
      if (error?.result?.fixed > 0) loadData(true);
      toast.error(error?.message || 'Erro ao corrigir sessões em datas inválidas.');
    });
  }, [user, loadData]);

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

  useEffect(() => {
    if (selectedCycle?.pts_id) {
      const pts = ptsList.find((p) => p.id === selectedCycle.pts_id);
      setPtsVinculado(pts || null);
    } else {
      setPtsVinculado(null);
    }
  }, [selectedCycle, ptsList]);

  // Remove sync filters that cause auto-resetting bugs when lists load asynchronously
  // The Select component handles missing values gracefully by showing placeholder/Todos

  const ptsDosPacienteCiclo = useMemo(() => {
    if (!selectedCycle) return [];
    return ptsList.filter((pts) => pts.patient_id === selectedCycle.patient_id && pts.status === "ativo");
  }, [selectedCycle, ptsList]);

  const ptsDisponiveis = useMemo(() => {
    if (!newCycle.patient_id) return [];
    return ptsList.filter((pts) => pts.patient_id === newCycle.patient_id && pts.status === "ativo");
  }, [newCycle.patient_id, ptsList]);

  const faltaStats = useMemo(() => {
    if (!selectedCycle) return null;
    const cycleSess = sessions
      .filter((s) => s.cycle_id === selectedCycle.id)
      .sort((a, b) => a.session_number - b.session_number);
    const faltas = cycleSess.filter((s) => s.status === "paciente_faltou");
    const faltasTotal = faltas.length;

    let maxConsecutivas = 0;
    let currentStreak = 0;
    for (const s of cycleSess) {
      if (s.status === "paciente_faltou") {
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

  const cycleExtensions = useMemo(() => {
    if (!selectedCycle) return [];
    return extensions.filter((e) => e.cycle_id === selectedCycle.id);
  }, [selectedCycle, extensions]);

  const agendarSessaoSlots = useMemo(() => {
    if (!agendarSessaoTarget || !selectedCycle || !agendarSessaoData) return [];
    return getAvailableSlots(selectedCycle.professional_id, selectedCycle.unit_id, agendarSessaoData);
  }, [agendarSessaoTarget, selectedCycle, agendarSessaoData, getAvailableSlots]);

  const agendarSessaoDatesDisponiveis = useMemo(() => {
    if (!agendarSessaoTarget || !selectedCycle) return [];
    return getAvailableDates(selectedCycle.professional_id, selectedCycle.unit_id).filter(
      (d) => d >= new Date().toISOString().split("T")[0],
    );
  }, [agendarSessaoTarget, selectedCycle, getAvailableDates]);

  const salasDisponiveis = useMemo(() => {
    if (!selectedCycle || !salas) return [];
    return salas.filter((s: any) => s.unidadeId === selectedCycle.unit_id && s.ativo);
  }, [selectedCycle, salas]);

  const filteredProcedimentos = useMemo(() => {
    const profId = newCycle.professional_id || (isProfissional ? user?.id : "");
    const prof = profissionais.find((p) => p.id === profId);
    if (!prof?.profissao) return procedimentos;
    const profNorm = prof.profissao.toLowerCase().trim();
    return procedimentos.filter((p) => {
      const pNorm = p.profissao.toLowerCase().trim();
      return (
        (pNorm === profNorm || pNorm.includes(profNorm) || profNorm.includes(pNorm)) &&
        (!p.profissional_id || p.profissional_id === profId)
      );
    });
  }, [procedimentos, newCycle.professional_id, profissionais, user, isProfissional]);

  const sessionProcedimentos = useMemo(() => {
    if (!selectedCycle) return procedimentos;
    const prof = profissionais.find((p) => p.id === selectedCycle.professional_id);
    if (!prof?.profissao) return procedimentos;
    const profNorm = prof.profissao.toLowerCase().trim();
    return procedimentos.filter((p) => {
      const pNorm = p.profissao.toLowerCase().trim();
      return (
        (pNorm === profNorm || pNorm.includes(profNorm) || profNorm.includes(pNorm)) &&
        (!p.profissional_id || p.profissional_id === selectedCycle.professional_id)
      );
    });
  }, [procedimentos, selectedCycle, profissionais]);

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

  const handleCreateCycle = async () => {
    if (!newCycle.patient_id || !newCycle.professional_id || !newCycle.treatment_type) {
      toast.error("Preencha paciente, profissional e tipo de tratamento.");
      return;
    }
    if (isWeekdayFrequency(newCycle.frequency) && newCycle.weekdays.length !== getMaxWeekdays(newCycle.frequency)) {
      toast.error(`Selecione exatamente ${getMaxWeekdays(newCycle.frequency)} dia(s) da semana.`);
      return;
    }

    if (loading) return; // Guard
    
    // Check for duplicates before creating
    const { data: existingCycles, error: checkError } = await supabase
      .from("treatment_cycles")
      .select("id, treatment_type, status")
      .eq("patient_id", newCycle.patient_id)
      .eq("professional_id", newCycle.professional_id)
      .eq("specialty", newCycle.specialty || "")
      .eq("unit_id", newCycle.unit_id || "")
      .in("status", ["em_andamento", "aguardando_vaga", "em_fila"]);

    if (checkError) {
      console.error("Erro ao verificar duplicidade:", checkError);
    } else if (existingCycles && existingCycles.length > 0) {
      const sameType = existingCycles.find(c => c.treatment_type === newCycle.treatment_type);
      if (sameType) {
        toast.error("Já existe um ciclo de tratamento ativo para este paciente com este profissional/especialidade.");
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

        if (result.cycleStatus === "concluido") {
          toast.info("🎉 Ciclo de tratamento concluído!");
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
  ) => {
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
    });
    const appointmentId = result.appointment?.id || null;
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
        setAgendamentoMap((prev) => {
          const next = { ...prev };
          const key = `${session.patient_id}|${session.professional_id}|${session.scheduled_date}`;
          delete next[key];
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
   * - Se já existe: marca como "ja_agendada" no resumo (e vincula appointment_id na sessão se faltar)
   * - Se não existe: insere agendamento e atualiza a sessão para "agendada"
   * - Mostra resumo no fim com opção de notificar paciente via WhatsApp
   */
  const handleAgendarCicloCompleto = async () => {
    if (!selectedCycle) return;
    const pac = pacientes.find((p) => p.id === selectedCycle.patient_id);
    const prof = funcionarios.find((f) => f.id === selectedCycle.professional_id);
    if (!pac || !prof) {
      toast.error("Paciente ou profissional não encontrado.");
      return;
    }

    const pendentes = cycleSessions
      .filter((s) => s.status === "pendente_agendamento" && !!s.scheduled_date)
      .sort((a, b) => a.session_number - b.session_number);

    if (pendentes.length === 0) {
      toast.info("Não há sessões pendentes para agendar.");
      return;
    }

    // 1) Verificar se o paciente está bloqueado por faltas para este profissional
    try {
      const { isPacienteBloqueadoParaProfissional } = await import('@/lib/faltasUtils');
      const bloqueado = await isPacienteBloqueadoParaProfissional(selectedCycle.patient_id, selectedCycle.professional_id);
      if (bloqueado) {
        toast.error("Paciente bloqueado por faltas injustificadas para este profissional. Agendamento em lote cancelado.");
        return;
      }
    } catch {}

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

    /**
     * Encontra o próximo slot válido para a sessão respeitando:
     * - Disponibilidade configurada do profissional (getAvailableSlots)
     * - Conflitos com agendamentos existentes (já filtrado por getAvailableSlots)
     * - Conflitos com horários alocados anteriormente neste mesmo lote
     * - Avança até 30 dias se a data sugerida estiver totalmente cheia
     */
    const encontrarSlotValido = (
      dataSugerida: string,
      profId: string,
      unidadeId: string,
    ): { data: string; hora: string } | null => {
      let dataAtual = dataSugerida;
      for (let tentativa = 0; tentativa < 30; tentativa++) {
        const slots = getAvailableSlots(profId, unidadeId, dataAtual);
        // Filtrar slots que já foram pegos por outras sessões NESTE lote
        const slotLivre = slots.find((s) => estaLivreNoLote(dataAtual, s));
        if (slotLivre) return { data: dataAtual, hora: slotLivre };
        // Avança 1 dia
        const d = new Date(dataAtual + "T12:00:00");
        d.setDate(d.getDate() + 1);
        dataAtual = d.toISOString().split("T")[0];
      }
      return null;
    };

    try {
      for (const sess of pendentes) {
        // Sessões pendentes sem agendamento devem ser processadas
        // Se a sessão já tiver um appointment_id (mesmo se vindo do cycleSessions), pulamos do lote mas reportamos no resumo
        if (sess.appointment_id) {
          resumo.push({
            numero: sess.session_number,
            data: sess.scheduled_date,
            status: "ja_agendada",
          });
          continue;
        }

        try {
          // 2) Verificar duplicidade no Supabase (mesmo paciente/prof/data ativo)
          // Isso garante que se o usuário agendou manualmente na agenda mas não vinculou aqui, a gente vincule em vez de duplicar.
          const { data: existente, error: checkErr } = await supabase
            .from("agendamentos")
            .select("id, hora, status")
            .eq("paciente_id", sess.patient_id)
            .eq("profissional_id", sess.professional_id)
            .eq("data", sess.scheduled_date)
            .not("status", "in", '("cancelado","falta","remarcado")')
            .order("criado_em", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (checkErr) throw checkErr;

          if (existente) {
            // Se já existe um agendamento manual para este paciente/prof/data, apenas vincula
            const { error: linkErr } = await supabase
              .from("treatment_sessions")
              .update({ appointment_id: existente.id, status: "agendada" })
              .eq("id", sess.id);
            
            if (linkErr) throw linkErr;

            // Atualização local imediata para o resumo
            setSessions((prev) =>
              prev.map((x) =>
                x.id === sess.id ? { ...x, appointment_id: existente.id, status: "agendada" } : x
              )
            );

            usar(sess.scheduled_date, existente.hora);
            resumo.push({
              numero: sess.session_number,
              data: sess.scheduled_date,
              hora: existente.hora,
              status: "ja_agendada",
            });
            continue;
          }

          // 3) Encontrar slot válido respeitando disponibilidade do profissional e ocupação da agenda
          const slot = encontrarSlotValido(
            sess.scheduled_date,
            sess.professional_id,
            selectedCycle.unit_id,
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
          const agId = `ag${Date.now()}${sess.session_number}`;
          const newAgData = {
            id: agId,
            pacienteId: sess.patient_id,
            pacienteNome: pac.nome,
            unidadeId: selectedCycle.unit_id,
            salaId: "",
            setorId: "",
            profissionalId: sess.professional_id,
            profissionalNome: prof.nome,
            data: slot.data,
            hora: slot.hora,
            status: "confirmado" as const,
            tipo: "Sessão de Tratamento" as const,
            observacoes: `Sessão ${sess.session_number}/${sess.total_sessions} — ${selectedCycle.treatment_type} (lote)`,
            origem: "recepcao" as const,
            criadoEm: new Date().toISOString(),
            criadoPor: user?.id || "",
          };

          // Usa o service addAgendamento do DataContext para garantir que a Agenda atualize em tempo real
          await addAgendamento(newAgData);

          // 5) Atualizar sessão como agendada
          const updates: any = { appointment_id: agId, status: "agendada" };
          if (slot.data !== sess.scheduled_date) updates.scheduled_date = slot.data;
          
          const { error: updErr } = await supabase
            .from("treatment_sessions")
            .update(updates)
            .eq("id", sess.id);
          
          if (updErr) throw updErr;


          // 5) Atualização otimista da UI
          setSessions((prev) =>
            prev.map((x) =>
              x.id === sess.id
                ? { ...x, appointment_id: agId, status: "agendada", scheduled_date: slot.data }
                : x,
            ),
          );
          setAgendamentoMap((prev) => ({
            ...prev,
            [`${sess.patient_id}|${sess.professional_id}|${slot.data}`]: {
              id: agId,
              hora: slot.hora,
              status: "confirmado",
            },
          }));

          usar(slot.data, slot.hora);
          resumo.push({
            numero: sess.session_number,
            data: slot.data,
            hora: slot.hora,
            status: "agendada",
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
        entidadeId: selectedCycle.id,
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
    }
  };

  const isMaster = user?.role === 'master';
  const canControlSessions = isMaster || isProfissional;

  const handleCheckRemarcarDate = async (newDate: string) => {
    setRemarcarData(newDate);
    setRemarcarBlockedMsg("");
    if (!newDate || !selectedCycle) return;
    if (canControlSessions) return; // Master and profissional bypass block checks
    try {
      const { data: result } = await supabase.rpc("is_date_blocked", {
        p_date: newDate,
        p_profissional_id: selectedCycle.professional_id,
        p_unidade_id: selectedCycle.unit_id,
      });
      if (result === true) {
        setRemarcarBlockedMsg("Esta data está bloqueada (feriado, férias ou indisponibilidade). Escolha outra data.");
      }
    } catch {
      /* ignore */
    }
  };

  const remarcationTreatmentSession = async (
    session: TreatmentSession,
    cycle: TreatmentCycle,
    newDate: string,
    newTime?: string,
    checkPatientConflict = false,
  ) => {
    const oldDate = session.scheduled_date;
    const result = await treatmentSessionOperations.reschedule({
      session,
      cycle,
      newDate,
      newTime,
      checkPatientConflict,
      bypassBlockCheck: canControlSessions,
    });
    setSessions((previous) => previous.map((item) => item.id === session.id
      ? { ...item, scheduled_date: result.session.scheduled_date || newDate }
      : item));
    await logAction({
      acao: "remar…8756 tokens truncated…dente = effectiveStatus === "pendente_agendamento";
                  const isAgendada = effectiveStatus === "agendada";

                  // Master can reschedule ANY session (including realizada)
                  const canRemarcarThis = canControlSessions
                    ? true
                    : canAgendarSessao && (isAgendada || effectiveIsPendente) && selectedCycle.status === "em_andamento";
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
                            {isAgendada && matchedAg && (
                              <span className="ml-2 text-xs text-info font-medium">· Agendada às {matchedAg.hora}</span>
                            )}
                            {isAgendada && !matchedAg && s.appointment_id && (
                              <span className="ml-2 text-xs text-info font-medium">· Agendada</span>
                            )}
                          </p>
                          {s.procedure_done && <p className="text-xs text-muted-foreground">{s.procedure_done}</p>}
                        </div>
                        <Badge className={cn("text-xs shrink-0", sessionStatusColors[effectiveStatus])}>
                          {sessionStatusLabels[effectiveStatus] || effectiveStatus}
                        </Badge>

                        {canAgendarSessao && effectiveIsPendente && selectedCycle.status === "em_andamento" && (
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
                        {canAgendarSessao && isAgendada && selectedCycle.status === "em_andamento" && (
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
                  const agKey = `${s.patient_id}|${s.professional_id}|${s.scheduled_date}`;
                  const ag = agendamentoMap[agKey];
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

        <Dialog open={dischargeOpen} onOpenChange={setDischargeOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Dar Alta</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {dischargeFutureCount > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
                  <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                  <p className="text-sm text-warning">
                    Este paciente possui <strong>{dischargeFutureCount}</strong> agendamento(s) futuro(s) com você.
                    Ao confirmar a alta, essas sessões serão <strong>removidas da agenda</strong> e <strong>não serão contabilizadas como cancelamento</strong>.
                    <br />
                    <span className="text-xs opacity-80">Sessões já realizadas, faltas e agendamentos com outros profissionais não serão afetados.</span>
                  </p>
                </div>
              )}
              <div>
                <Label>Motivo da alta *</Label>
                <Input
                  value={dischargeForm.reason}
                  onChange={(e) => setDischargeForm((p) => ({ ...p, reason: e.target.value }))}
                />
              </div>
              <div>
                <Label>Observações finais</Label>
                <Textarea
                  value={dischargeForm.final_notes}
                  onChange={(e) => setDischargeForm((p) => ({ ...p, final_notes: e.target.value }))}
                  rows={3}
                />
              </div>
              <Button
                onClick={handleDischarge}
                className="w-full"
                variant="destructive"
                disabled={!dischargeForm.reason || dischargeLoading}
              >
                {dischargeLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Confirmar Alta
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Após a alta, você poderá encaminhar o paciente para a fila de espera.
              </p>
            </div>
          </DialogContent>
        </Dialog>

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
              );
            } finally {
              setAgendandoSessao(false);
            }
          }}
          mode="agendar"
          isMaster={canControlSessions}
        />

        <ModalAgendarSessao
          open={!!remarcarTarget}
          onClose={() => {
            setRemarcarTarget(null);
            setRemarcarData("");
            setRemarcarBlockedMsg("");
          }}
          session={remarcarTarget}
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
          isMaster={canControlSessions}
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
              {ptsDosPacienteCiclo.length === 0 ? (
                <div className="p-4 bg-muted/30 rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">Nenhum PTS ativo encontrado para este paciente.</p>
                  <p className="text-xs text-muted-foreground mt-1">Crie um PTS no módulo PTS primeiro.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {ptsDosPacienteCiclo.map((pts) => {
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
                      <Badge className={cn("border text-xs", statusColors[cycle.status])}>
                        {statusLabels[cycle.status]}
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



              {newCycle.patient_id && ptsDisponiveis.length > 0 && (
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
                      {ptsDisponiveis.map((pts) => (
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

              {newCycle.patient_id && ptsDisponiveis.length === 0 && (
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
              <Button onClick={handleCreateCycle} className="w-full gradient-primary text-primary-foreground">
                Criar Ciclo
              </Button>
            </div>
          </ScrollArea>
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
