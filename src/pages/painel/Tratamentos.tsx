import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { procedureService, ProcedimentoDB } from "@/services/procedureService";
import { BuscaPaciente } from "@/components/BuscaPaciente";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
} from "lucide-react";
import { toast } from "sonner";
import { useUnidadeFilter } from "@/hooks/useUnidadeFilter";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { FREQUENCY_OPTIONS_NEW, WEEKDAY_LABELS, getMaxWeekdays, isWeekdayFrequency, calculateTotalSessions, generateSessionDates, calcEndDateFromSessions } from "@/lib/treatmentSessionGenerator";

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
  aguardando_vaga: "bg-warning/15 text-warning border-warning/30",
  em_fila: "bg-info/15 text-info border-info/30",
  finalizado_alta: "bg-muted text-muted-foreground border-border",
  suspenso: "bg-destructive/15 text-destructive border-destructive/30",
  em_reavaliacao: "bg-purple-500/15 text-purple-600 border-purple-500/30",
};

const statusLabels: Record<string, string> = {
  em_andamento: "Em Andamento",
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
  const {
    pacientes,
    funcionarios,
    unidades,
    fila,
    salas,
    addToFila,
    logAction,
    getAvailableSlots,
    getAvailableDates,
    addAgendamento,
  } = useData();
  const { user, hasPermission } = useAuth();
  const { unidadesVisiveis, profissionaisVisiveis } = useUnidadeFilter();
  const profissionais = profissionaisVisiveis;

  const [cycles, setCycles] = useState<TreatmentCycle[]>([]);
  const [sessions, setSessions] = useState<TreatmentSession[]>([]);
  const [extensions, setExtensions] = useState<TreatmentExtension[]>([]);
  const [procedimentos, setProcedimentos] = useState<ProcedimentoDB[]>([]);
  const [ptsList, setPtsList] = useState<PTSRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCycle, setSelectedCycle] = useState<TreatmentCycle | null>(null);
  const [ptsVinculado, setPtsVinculado] = useState<PTSRecord | null>(null);
  const [vincularPtsOpen, setVincularPtsOpen] = useState(false);
  const [selectedPtsId, setSelectedPtsId] = useState("");
  const [vinculandoPts, setVinculandoPts] = useState(false);

  const [filterProf, setFilterProf] = useState("all");
  const [filterUnit, setFilterUnit] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

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

  const [newCycle, setNewCycle] = useState({
    patient_id: "",
    professional_id: "",
    unit_id: "",
    specialty: "",
    treatment_type: "",
    total_sessions: 6,
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

  const [extensionForm, setExtensionForm] = useState({ new_sessions: 0, reason: "" });
  const [dischargeForm, setDischargeForm] = useState({ reason: "", final_notes: "" });

  const canManageFull = hasPermission(["master", "coordenador"]);
  const isProfissional = user?.role === "profissional";
  const canAgendarSessao =
    user?.role === "master" || user?.role === "recepcao" || user?.role === "coordenador" || user?.role === "gestao";

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let qCycles = supabase.from("treatment_cycles").select("*").order("created_at", { ascending: false });
      if (user?.role === "profissional") qCycles = qCycles.eq("professional_id", user.id);
      if (user?.role === "coordenador" && user.unidadeId) qCycles = qCycles.eq("unit_id", user.unidadeId);

      const [{ data: cData }, { data: sData }, { data: eData }, procsData, { data: ptsData }] = await Promise.all([
        qCycles,
        supabase.from("treatment_sessions").select("*").order("session_number", { ascending: true }),
        supabase.from("treatment_extensions").select("*").order("changed_at", { ascending: false }),
        procedureService.getActive(),
        supabase.from("pts").select("*").order("created_at", { ascending: false }),
      ]);

      if (cData) setCycles(cData as TreatmentCycle[]);
      if (sData) setSessions(sData as TreatmentSession[]);
      if (eData) setExtensions(eData as TreatmentExtension[]);
      setProcedimentos(procsData);
      if (ptsData) setPtsList(ptsData as PTSRecord[]);
    } catch (err) {
      console.error("Error loading treatments:", err);
      toast.error("Erro ao carregar dados de tratamento.");
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredCycles = useMemo(() => {
    return cycles.filter((c) => {
      if (filterProf !== "all" && c.professional_id !== filterProf) return false;
      if (filterUnit !== "all" && c.unit_id !== filterUnit) return false;
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      return true;
    });
  }, [cycles, filterProf, filterUnit, filterStatus]);

  useEffect(() => {
    if (selectedCycle?.pts_id) {
      const pts = ptsList.find((p) => p.id === selectedCycle.pts_id);
      setPtsVinculado(pts || null);
    } else {
      setPtsVinculado(null);
    }
  }, [selectedCycle, ptsList]);

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

  const calcEndDate = (startDate: string, totalSessions: number, frequency: string) => {
    const d = new Date(startDate + "T12:00:00");
    const weeksMap: Record<string, number> = { diário: 1 / 7, semanal: 1, bisemanal: 0.5, quinzenal: 2, mensal: 4 };
    const weeks = (weeksMap[frequency] || 1) * totalSessions;
    d.setDate(d.getDate() + Math.ceil(weeks * 7));
    return d.toISOString().split("T")[0];
  };

  const handleCreateCycle = async () => {
    if (!newCycle.patient_id || !newCycle.professional_id || !newCycle.treatment_type) {
      toast.error("Preencha paciente, profissional e tipo de tratamento.");
      return;
    }
    const prof = profissionais.find((p) => p.id === newCycle.professional_id);
    const pac = pacientes.find((p) => p.id === newCycle.patient_id);

    const existingActive = cycles.find(
      (c) =>
        c.patient_id === newCycle.patient_id &&
        c.status === "em_andamento" &&
        c.treatment_type === newCycle.treatment_type,
    );
    if (existingActive) {
      toast.error("Paciente já possui tratamento ativo deste tipo.");
      return;
    }

    const endDate = calcEndDate(newCycle.start_date, newCycle.total_sessions, newCycle.frequency);

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
          total_sessions: newCycle.total_sessions,
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

      const sessionsToCreate = [];
      const startD = new Date(newCycle.start_date + "T12:00:00");
      const weeksDelta: Record<string, number> = { diário: 1, semanal: 7, bisemanal: 3.5, quinzenal: 14, mensal: 30 };
      const delta = weeksDelta[newCycle.frequency] || 7;

      for (let i = 0; i < newCycle.total_sessions; i++) {
        const sessionDate = new Date(startD);
        sessionDate.setDate(startD.getDate() + Math.round(i * delta));
        sessionsToCreate.push({
          cycle_id: cycleData.id,
          patient_id: newCycle.patient_id,
          professional_id: newCycle.professional_id,
          session_number: i + 1,
          total_sessions: newCycle.total_sessions,
          scheduled_date: sessionDate.toISOString().split("T")[0],
          status: "pendente_agendamento",
        });
      }

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
          sessoes: newCycle.total_sessions,
          pts_vinculado: newCycle.pts_id || null,
        },
      });

      toast.success("Ciclo criado! As sessões aguardam agendamento pela recepção.");
      setCreateOpen(false);
      loadData();
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
      loadData();
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao excluir ciclo.");
    }
  };

  const handleRegisterSession = async () => {
    if (!selectedCycle) return;

    if (newSession.status === "realizada") {
      if (
        !soapNotes.subjetivo?.trim() ||
        !soapNotes.objetivo?.trim() ||
        !soapNotes.avaliacao?.trim() ||
        !soapNotes.plano?.trim()
      ) {
        toast.error("Sessão realizada exige preenchimento completo do SOAP (Subjetivo, Objetivo, Avaliação, Plano).");
        return;
      }
      if (!newSession.procedure_done) {
        toast.error("Selecione o procedimento realizado.");
        return;
      }
    }

    if (newSession.status === "paciente_faltou" && !newSession.absence_type) {
      toast.error("Informe o tipo de falta (justificada ou injustificada).");
      return;
    }

    const nextSession = sessions
      .filter((s) => s.cycle_id === selectedCycle.id && ["agendada", "pendente_agendamento"].includes(s.status))
      .sort((a, b) => a.session_number - b.session_number)[0];

    if (!nextSession) {
      toast.error("Não há sessões pendentes neste ciclo.");
      return;
    }

    const clinicalNotesJson =
      newSession.status === "realizada"
        ? JSON.stringify({
            tipo: "soap",
            subjetivo: soapNotes.subjetivo,
            objetivo: soapNotes.objetivo,
            avaliacao: soapNotes.avaliacao,
            plano: soapNotes.plano,
            registrado_em: new Date().toISOString(),
            registrado_por: user?.id,
          })
        : newSession.clinical_notes;

    try {
      await supabase
        .from("treatment_sessions")
        .update({
          status: newSession.status,
          clinical_notes: clinicalNotesJson,
          procedure_done: newSession.procedure_done,
          absence_type: newSession.status === "paciente_faltou" ? newSession.absence_type : null,
        })
        .eq("id", nextSession.id);

      const newDone = newSession.status === "realizada" ? selectedCycle.sessions_done + 1 : selectedCycle.sessions_done;
      const isComplete = newDone >= selectedCycle.total_sessions;

      await supabase
        .from("treatment_cycles")
        .update({
          sessions_done: newDone,
          ...(isComplete ? { status: "finalizado_alta" } : {}),
        })
        .eq("id", selectedCycle.id);

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

      toast.success(`Sessão ${nextSession.session_number}/${selectedCycle.total_sessions} registrada!`);
      setSessionOpen(false);
      setNewSession({ clinical_notes: "", procedure_done: "", status: "realizada", absence_type: "" });
      setSoapNotes({ subjetivo: "", objetivo: "", avaliacao: "", plano: "" });
      loadData();
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao registrar sessão: " + err.message);
    }
  };

  const handleAgendarSessao = async () => {
    if (!agendarSessaoTarget || !agendarSessaoData || !agendarSessaoHora || !selectedCycle) {
      toast.error("Selecione data e horário.");
      return;
    }
    setAgendandoSessao(true);
    try {
      const prof = funcionarios.find((f) => f.id === selectedCycle.professional_id);
      const pac = pacientes.find((p) => p.id === selectedCycle.patient_id);
      if (!prof || !pac) throw new Error("Profissional ou paciente não encontrado.");

      const agId = `ag${Date.now()}`;
      await addAgendamento({
        id: agId,
        pacienteId: selectedCycle.patient_id,
        pacienteNome: pac.nome,
        unidadeId: selectedCycle.unit_id,
        salaId: agendarSessaoSalaId || "",
        setorId: "",
        profissionalId: selectedCycle.professional_id,
        profissionalNome: prof.nome,
        data: agendarSessaoData,
        hora: agendarSessaoHora,
        status: "confirmado",
        tipo: "Sessão de Tratamento",
        observacoes: `Sessão ${agendarSessaoTarget.session_number}/${agendarSessaoTarget.total_sessions} — ${selectedCycle.treatment_type}`,
        origem: "recepcao",
        criadoEm: new Date().toISOString(),
        criadoPor: user?.id || "",
      });

      const { error: updateError } = await supabase
        .from("treatment_sessions")
        .update({
          appointment_id: agId,
          status: "agendada",
          scheduled_date: agendarSessaoData,
        })
        .eq("id", agendarSessaoTarget.id);

      if (updateError) throw updateError;

      await logAction({
        acao: "agendar_sessao_tratamento",
        entidade: "treatment_session",
        entidadeId: agendarSessaoTarget.id,
        modulo: "tratamentos",
        user,
        detalhes: {
          ciclo: selectedCycle.id,
          sessao: agendarSessaoTarget.session_number,
          data: agendarSessaoData,
          hora: agendarSessaoHora,
          agendamento_id: agId,
        },
      });

      toast.success(
        `Sessão ${agendarSessaoTarget.session_number} agendada para ${new Date(agendarSessaoData + "T12:00:00").toLocaleDateString("pt-BR")} às ${agendarSessaoHora}!`,
      );
      setAgendarSessaoTarget(null);
      setAgendarSessaoData("");
      setAgendarSessaoHora("");
      setAgendarSessaoSalaId("");
      loadData();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Erro ao agendar sessão.");
    } finally {
      setAgendandoSessao(false);
    }
  };

  const handleCheckRemarcarDate = async (newDate: string) => {
    setRemarcarData(newDate);
    setRemarcarBlockedMsg("");
    if (!newDate || !selectedCycle) return;
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

  const handleRemarcarSessao = async () => {
    if (!remarcarTarget || !remarcarData || !selectedCycle || remarcarBlockedMsg) return;
    setRemarcarSaving(true);
    try {
      const oldDate = remarcarTarget.scheduled_date;
      const { data: blocked } = await supabase.rpc("is_date_blocked", {
        p_date: remarcarData,
        p_profissional_id: selectedCycle.professional_id,
        p_unidade_id: selectedCycle.unit_id,
      });
      if (blocked === true) {
        toast.error("Data bloqueada.");
        setRemarcarSaving(false);
        return;
      }

      const { error } = await supabase
        .from("treatment_sessions")
        .update({ scheduled_date: remarcarData })
        .eq("id", remarcarTarget.id);
      if (error) throw error;

      if (remarcarTarget.appointment_id) {
        await supabase.from("agendamentos").update({ data: remarcarData }).eq("id", remarcarTarget.appointment_id);
      }

      await logAction({
        acao: "remarcar_sessao",
        entidade: "treatment_session",
        entidadeId: remarcarTarget.id,
        modulo: "tratamentos",
        user,
        detalhes: {
          ciclo: selectedCycle.id,
          sessao: remarcarTarget.session_number,
          data_anterior: oldDate,
          data_nova: remarcarData,
          agendamento_vinculado: remarcarTarget.appointment_id || null,
          old_value: { scheduled_date: oldDate },
          new_value: { scheduled_date: remarcarData },
        },
      });

      toast.success(
        `Sessão ${remarcarTarget.session_number} remarcada de ${new Date(oldDate + "T12:00:00").toLocaleDateString("pt-BR")} para ${new Date(remarcarData + "T12:00:00").toLocaleDateString("pt-BR")}`,
      );
      setRemarcarTarget(null);
      setRemarcarData("");
      loadData();
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao remarcar sessão: " + (err?.message || ""));
    } finally {
      setRemarcarSaving(false);
    }
  };

  const handleExtension = async () => {
    if (!selectedCycle || !extensionForm.reason || extensionForm.new_sessions <= 0) {
      toast.error("Informe a quantidade de sessões e o motivo.");
      return;
    }
    try {
      const newTotal = selectedCycle.total_sessions + extensionForm.new_sessions;
      const newEndDate = calcEndDate(selectedCycle.start_date, newTotal, selectedCycle.frequency);

      await supabase.from("treatment_extensions").insert({
        cycle_id: selectedCycle.id,
        previous_sessions: selectedCycle.total_sessions,
        new_sessions: newTotal,
        previous_end_date: selectedCycle.end_date_predicted,
        new_end_date: newEndDate,
        reason: extensionForm.reason,
        changed_by: user?.id || "",
      });

      const startD = new Date(selectedCycle.start_date + "T12:00:00");
      const weeksDelta: Record<string, number> = { diário: 1, semanal: 7, bisemanal: 3.5, quinzenal: 14, mensal: 30 };
      const delta = weeksDelta[selectedCycle.frequency] || 7;
      const newSessions = [];
      for (let i = selectedCycle.total_sessions; i < newTotal; i++) {
        const sessionDate = new Date(startD);
        sessionDate.setDate(startD.getDate() + Math.round(i * delta));
        newSessions.push({
          cycle_id: selectedCycle.id,
          patient_id: selectedCycle.patient_id,
          professional_id: selectedCycle.professional_id,
          session_number: i + 1,
          total_sessions: newTotal,
          scheduled_date: sessionDate.toISOString().split("T")[0],
          status: "pendente_agendamento",
        });
      }
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
      loadData();
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao registrar extensão: " + err.message);
    }
  };

  const handleDischarge = async () => {
    if (!selectedCycle || !dischargeForm.reason) {
      toast.error("Informe o motivo da alta.");
      return;
    }
    try {
      await supabase.from("patient_discharges").insert({
        cycle_id: selectedCycle.id,
        patient_id: selectedCycle.patient_id,
        professional_id: user?.id || "",
        discharge_date: new Date().toISOString().split("T")[0],
        reason: dischargeForm.reason,
        final_notes: dischargeForm.final_notes,
      });

      await supabase.from("treatment_cycles").update({ status: "finalizado_alta" }).eq("id", selectedCycle.id);

      await logAction({
        acao: "alta_paciente",
        entidade: "treatment_cycle",
        entidadeId: selectedCycle.id,
        modulo: "tratamentos",
        user,
        detalhes: { paciente: selectedCycle.patient_id, motivo: dischargeForm.reason },
      });

      toast.success("Alta registrada com sucesso!");
      setDischargeOpen(false);
      setDischargeForm({ reason: "", final_notes: "" });
      loadData();
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao registrar alta: " + err.message);
    }
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
      loadData();
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
      loadData();
    } catch (err: any) {
      toast.error("Erro ao desvincular: " + (err?.message || ""));
    }
  };

  const renderSessionNotes = (notes: string) => {
    if (!notes) return null;
    try {
      const parsed = JSON.parse(notes);
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
    return <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{notes}</p>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (selectedCycle) {
    const pac = pacientes.find((p) => p.id === selectedCycle.patient_id);
    const prof = funcionarios.find((f) => f.id === selectedCycle.professional_id);
    const unidade = unidades.find((u) => u.id === selectedCycle.unit_id);
    const progressPct =
      selectedCycle.total_sessions > 0
        ? Math.round((selectedCycle.sessions_done / selectedCycle.total_sessions) * 100)
        : 0;
    const pendingCount = cycleSessions.filter((s) => s.status === "pendente_agendamento").length;
    const scheduledCount = cycleSessions.filter((s) => s.status === "agendada").length;

    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedCycle(null)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <h1 className="text-xl font-bold font-display text-foreground">Detalhe do Ciclo</h1>
        </div>

        <Card className="shadow-card border-0">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-foreground">{selectedCycle.treatment_type}</h2>
                <p className="text-sm text-muted-foreground">{selectedCycle.specialty}</p>
              </div>
              <Badge className={cn("border", statusColors[selectedCycle.status])}>
                {statusLabels[selectedCycle.status]}
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Paciente</span>
                <p className="font-medium">{pac?.nome || "—"}</p>
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
              {selectedCycle.status === "em_andamento" && (isProfissional || canManageFull) && (
                <>
                  <Button
                    size="sm"
                    onClick={() => {
                      setNewSession({ clinical_notes: "", procedure_done: "", status: "realizada", absence_type: "" });
                      setSoapNotes({ subjetivo: "", objetivo: "", avaliacao: "", plano: "" });
                      setSessionOpen(true);
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
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive text-destructive"
                    onClick={() => {
                      setDischargeForm({ reason: "", final_notes: "" });
                      setDischargeOpen(true);
                    }}
                  >
                    <CheckCircle className="w-3.5 h-3.5 mr-1" /> Dar Alta
                  </Button>
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

        {ptsVinculado ? (
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
                      Criado em {new Date(ptsVinculado.created_at).toLocaleDateString("pt-BR")}
                      {" • "}
                      {funcionarios.find((f) => f.id === ptsVinculado.professional_id)?.nome || "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    className={cn(
                      "border text-xs",
                      ptsVinculado.status === "ativo"
                        ? "bg-success/15 text-success border-success/30"
                        : "bg-muted text-muted-foreground border-border",
                    )}
                  >
                    {ptsVinculado.status === "ativo" ? "Ativo" : "Encerrado"}
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
                <p className="text-sm text-foreground bg-muted/30 p-2 rounded">{ptsVinculado.diagnostico_funcional}</p>
              </div>

              <div className="mb-3">
                <p className="text-xs text-muted-foreground font-semibold mb-1">Objetivos Terapêuticos</p>
                <p className="text-sm text-foreground bg-muted/30 p-2 rounded">{ptsVinculado.objetivos_terapeuticos}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                {ptsVinculado.metas_curto_prazo && (
                  <div className="p-2 rounded bg-blue-500/5 border border-blue-500/20">
                    <p className="text-xs font-semibold text-blue-600 mb-1">📌 Curto Prazo</p>
                    <p className="text-xs text-foreground">{ptsVinculado.metas_curto_prazo}</p>
                  </div>
                )}
                {ptsVinculado.metas_medio_prazo && (
                  <div className="p-2 rounded bg-orange-500/5 border border-orange-500/20">
                    <p className="text-xs font-semibold text-orange-600 mb-1">📋 Médio Prazo</p>
                    <p className="text-xs text-foreground">{ptsVinculado.metas_medio_prazo}</p>
                  </div>
                )}
                {ptsVinculado.metas_longo_prazo && (
                  <div className="p-2 rounded bg-green-500/5 border border-green-500/20">
                    <p className="text-xs font-semibold text-green-600 mb-1">🎯 Longo Prazo</p>
                    <p className="text-xs text-foreground">{ptsVinculado.metas_longo_prazo}</p>
                  </div>
                )}
              </div>

              {ptsVinculado.especialidades_envolvidas && ptsVinculado.especialidades_envolvidas.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground font-semibold mb-1">Especialidades Envolvidas</p>
                  <div className="flex flex-wrap gap-1">
                    {ptsVinculado.especialidades_envolvidas.map((spec, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {spec}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : selectedCycle.status === "em_andamento" && (isProfissional || canManageFull) ? (
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
                {ptsDosPacienteCiclo.length > 0 ? (
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
            <h3 className="font-semibold text-foreground mb-3">Sessões</h3>
            <ScrollArea className="max-h-[500px]">
              <div className="space-y-2">
                {cycleSessions.map((s) => {
                  const isPendente = s.status === "pendente_agendamento";
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        "flex flex-col gap-1 p-3 rounded-lg",
                        isPendente ? "bg-warning/5 border border-warning/20" : "bg-muted/30",
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
                            {isPendente && <span className="ml-2 text-xs text-warning">· Aguarda agendamento</span>}
                          </p>
                          {s.procedure_done && <p className="text-xs text-muted-foreground">{s.procedure_done}</p>}
                        </div>
                        <Badge className={cn("text-xs shrink-0", sessionStatusColors[s.status])}>
                          {sessionStatusLabels[s.status] || s.status}
                        </Badge>

                        {canAgendarSessao && isPendente && selectedCycle.status === "em_andamento" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-primary text-primary hover:bg-primary/10 shrink-0"
                            onClick={() => {
                              setAgendarSessaoTarget(s);
                              setAgendarSessaoData("");
                              setAgendarSessaoHora("");
                              setAgendarSessaoSalaId("");
                            }}
                          >
                            <Calendar className="w-3 h-3 mr-1" /> Agendar
                          </Button>
                        )}

                        {canAgendarSessao &&
                          ["agendada", "pendente_agendamento"].includes(s.status) &&
                          selectedCycle.status === "em_andamento" && (
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
                      </div>
                      {s.clinical_notes && renderSessionNotes(s.clinical_notes)}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
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

        <Dialog open={sessionOpen} onOpenChange={setSessionOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
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
                  <Label>Procedimento Realizado *</Label>
                  {sessionProcedimentos.length > 0 ? (
                    <Select
                      value={newSession.procedure_done}
                      onValueChange={(v) => setNewSession((p) => ({ ...p, procedure_done: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o procedimento" />
                      </SelectTrigger>
                      <SelectContent>
                        {sessionProcedimentos.map((proc) => (
                          <SelectItem key={proc.id} value={proc.nome}>
                            {proc.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={newSession.procedure_done}
                      onChange={(e) => setNewSession((p) => ({ ...p, procedure_done: e.target.value }))}
                      placeholder="Nome do procedimento"
                    />
                  )}
                </div>
              )}

              {newSession.status === "realizada" && (
                <div className="space-y-3 border-t pt-3">
                  <p className="text-sm font-semibold text-foreground">
                    Prontuário SOAP <span className="text-destructive">*</span>
                  </p>
                  <div>
                    <Label className="text-xs font-semibold">
                      S — Subjetivo <span className="text-destructive">*</span>
                    </Label>
                    <p className="text-xs text-muted-foreground mb-1">
                      Relato do paciente, queixas, sintomas referidos
                    </p>
                    <Textarea
                      value={soapNotes.subjetivo}
                      onChange={(e) => setSoapNotes((p) => ({ ...p, subjetivo: e.target.value }))}
                      rows={2}
                      placeholder="Ex: Paciente relata melhora da dor no joelho direito..."
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">
                      O — Objetivo <span className="text-destructive">*</span>
                    </Label>
                    <p className="text-xs text-muted-foreground mb-1">Achados do exame, medições, testes realizados</p>
                    <Textarea
                      value={soapNotes.objetivo}
                      onChange={(e) => setSoapNotes((p) => ({ ...p, objetivo: e.target.value }))}
                      rows={2}
                      placeholder="Ex: ADM flexão joelho D: 95° (anterior: 80°)..."
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">
                      A — Avaliação <span className="text-destructive">*</span>
                    </Label>
                    <p className="text-xs text-muted-foreground mb-1">Análise clínica, evolução do quadro</p>
                    <Textarea
                      value={soapNotes.avaliacao}
                      onChange={(e) => setSoapNotes((p) => ({ ...p, avaliacao: e.target.value }))}
                      rows={2}
                      placeholder="Ex: Evolução favorável, ganho funcional progressivo..."
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">
                      P — Plano <span className="text-destructive">*</span>
                    </Label>
                    <p className="text-xs text-muted-foreground mb-1">
                      Conduta terapêutica, orientações, próximos passos
                    </p>
                    <Textarea
                      value={soapNotes.plano}
                      onChange={(e) => setSoapNotes((p) => ({ ...p, plano: e.target.value }))}
                      rows={2}
                      placeholder="Ex: Manter protocolo atual, progredir carga na próxima sessão..."
                    />
                  </div>
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

              <Button onClick={handleRegisterSession} className="w-full gradient-primary text-primary-foreground">
                Registrar
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
                disabled={!dischargeForm.reason}
              >
                Confirmar Alta
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Após a alta, você poderá encaminhar o paciente para a fila de espera.
              </p>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!agendarSessaoTarget}
          onOpenChange={(open) => {
            if (!open) {
              setAgendarSessaoTarget(null);
              setAgendarSessaoData("");
              setAgendarSessaoHora("");
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                Agendar Sessão {agendarSessaoTarget?.session_number}/{agendarSessaoTarget?.total_sessions}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-3 bg-muted/30 rounded-lg text-sm space-y-1">
                <p>
                  <strong>Paciente:</strong> {pacientes.find((p) => p.id === selectedCycle.patient_id)?.nome}
                </p>
                <p>
                  <strong>Profissional:</strong>{" "}
                  {funcionarios.find((f) => f.id === selectedCycle.professional_id)?.nome}
                </p>
                <p>
                  <strong>Tratamento:</strong> {selectedCycle.treatment_type}
                </p>
              </div>
              <div>
                <Label>Data *</Label>
                {agendarSessaoDatesDisponiveis.length === 0 ? (
                  <p className="text-sm text-warning mt-1">Não há datas disponíveis para este profissional.</p>
                ) : (
                  <Select
                    value={agendarSessaoData}
                    onValueChange={(v) => {
                      setAgendarSessaoData(v);
                      setAgendarSessaoHora("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a data" />
                    </SelectTrigger>
                    <SelectContent>
                      {agendarSessaoDatesDisponiveis.slice(0, 60).map((d) => {
                        const dateObj = new Date(d + "T12:00:00");
                        const label = dateObj.toLocaleDateString("pt-BR", {
                          weekday: "short",
                          day: "2-digit",
                          month: "2-digit",
                        });
                        return (
                          <SelectItem key={d} value={d}>
                            {label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {agendarSessaoData && (
                <div>
                  <Label>Horário *</Label>
                  {agendarSessaoSlots.length === 0 ? (
                    <p className="text-sm text-warning mt-1">Sem horários disponíveis nesta data.</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      {agendarSessaoSlots.map((slot) => (
                        <Button
                          key={slot}
                          size="sm"
                          variant={agendarSessaoHora === slot ? "default" : "outline"}
                          className={agendarSessaoHora === slot ? "gradient-primary text-primary-foreground" : ""}
                          onClick={() => setAgendarSessaoHora(slot)}
                        >
                          {slot}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {salasDisponiveis.length > 0 && (
                <div>
                  <Label>Sala (opcional)</Label>
                  <Select
                    value={agendarSessaoSalaId || "none"}
                    onValueChange={(v) => setAgendarSessaoSalaId(v === "none" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {salasDisponiveis.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button
                onClick={handleAgendarSessao}
                className="w-full gradient-primary text-primary-foreground"
                disabled={!agendarSessaoData || !agendarSessaoHora || agendandoSessao}
              >
                <Calendar className="w-4 h-4 mr-2" />
                {agendandoSessao ? "Agendando..." : "Confirmar Agendamento"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!remarcarTarget}
          onOpenChange={(open) => {
            if (!open) {
              setRemarcarTarget(null);
              setRemarcarData("");
              setRemarcarBlockedMsg("");
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                Remarcar Sessão {remarcarTarget?.session_number}/{remarcarTarget?.total_sessions}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-3 bg-muted/30 rounded-lg text-sm space-y-1">
                <p>
                  <strong>Data atual:</strong>{" "}
                  {remarcarTarget?.scheduled_date
                    ? new Date(remarcarTarget.scheduled_date + "T12:00:00").toLocaleDateString("pt-BR")
                    : "—"}
                </p>
                <p>
                  <strong>Paciente:</strong> {pacientes.find((p) => p.id === selectedCycle?.patient_id)?.nome}
                </p>
                <p>
                  <strong>Profissional:</strong>{" "}
                  {funcionarios.find((f) => f.id === selectedCycle?.professional_id)?.nome}
                </p>
              </div>
              <div>
                <Label>Nova Data *</Label>
                <Input
                  type="date"
                  value={remarcarData}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => handleCheckRemarcarDate(e.target.value)}
                />
              </div>
              {remarcarBlockedMsg && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{remarcarBlockedMsg}</span>
                </div>
              )}
              <Button
                onClick={handleRemarcarSessao}
                className="w-full gradient-primary text-primary-foreground"
                disabled={!remarcarData || !!remarcarBlockedMsg || remarcarSaving}
              >
                <CalendarClock className="w-4 h-4 mr-2" />
                {remarcarSaving ? "Salvando..." : "Confirmar Remarcação"}
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
                Selecione um PTS ativo do paciente <strong>{pac?.nome}</strong> para vincular a este ciclo de
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
              setNewCycle({
                patient_id: "",
                professional_id: isProfissional ? user?.id || "" : "",
                unit_id: user?.unidadeId || "",
                specialty: user?.profissao || "",
                treatment_type: "",
                total_sessions: 6,
                frequency: "semanal",
                start_date: new Date().toISOString().split("T")[0],
                clinical_notes: "",
                pts_id: "",
              });
              setCreateOpen(true);
            }}
            className="gradient-primary text-primary-foreground"
          >
            <Plus className="w-4 h-4 mr-2" /> Novo Ciclo
          </Button>
        )}
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={filterProf} onValueChange={setFilterProf}>
          <SelectTrigger className="w-44">
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
        <Select value={filterUnit} onValueChange={setFilterUnit}>
          <SelectTrigger className="w-44">
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
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(statusLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredCycles.length === 0 ? (
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
        <div className="space-y-2">
          {filteredCycles.map((cycle) => {
            const pac = pacientes.find((p) => p.id === cycle.patient_id);
            const prof = funcionarios.find((f) => f.id === cycle.professional_id);
            const progressPct =
              cycle.total_sessions > 0 ? Math.round((cycle.sessions_done / cycle.total_sessions) * 100) : 0;
            const cycleSess = sessions.filter((s) => s.cycle_id === cycle.id);
            const pendingAg = cycleSess.filter((s) => s.status === "pendente_agendamento").length;
            const cycleFaltasCount = cycleSess.filter((s) => s.status === "paciente_faltou").length;

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
                    <p className="font-semibold text-foreground">{pac?.nome || "—"}</p>
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
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Sessões</p>
                      <p className="text-sm font-bold">
                        {cycle.sessions_done}/{cycle.total_sessions}
                      </p>
                    </div>
                    <div className="w-24">
                      <Progress value={progressPct} className="h-2" />
                    </div>
                    <div className="text-center">
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
                    {user?.role === "master" && (
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
                <Select
                  value={newCycle.patient_id}
                  onValueChange={(v) => setNewCycle((p) => ({ ...p, patient_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {pacientes.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                        {p.cpf ? ` — ${p.cpf}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  <Label>Sessões Previstas</Label>
                  <Input
                    type="number"
                    min={1}
                    value={newCycle.total_sessions}
                    onChange={(e) => setNewCycle((p) => ({ ...p, total_sessions: parseInt(e.target.value) || 1 }))}
                  />
                </div>
                <div>
                  <Label>Frequência</Label>
                  <Select
                    value={newCycle.frequency}
                    onValueChange={(v) => setNewCycle((p) => ({ ...p, frequency: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {frequencyOptions.map((f) => (
                        <SelectItem key={f} value={f} className="capitalize">
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Data de Início</Label>
                <Input
                  type="date"
                  value={newCycle.start_date}
                  onChange={(e) => setNewCycle((p) => ({ ...p, start_date: e.target.value }))}
                />
              </div>
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <span className="text-muted-foreground">Previsão término: </span>
                <strong>
                  {new Date(
                    calcEndDate(newCycle.start_date, newCycle.total_sessions, newCycle.frequency) + "T12:00:00",
                  ).toLocaleDateString("pt-BR")}
                </strong>
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
