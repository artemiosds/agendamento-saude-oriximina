import React, { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { useWebhookNotify } from "@/hooks/useWebhookNotify";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Clock,
  UserCheck,
  RotateCcw,
  Play,
  LogIn,
  Trash2,
  CalendarOff,
  Calendar as CalendarIcon,
  Eye,
  FileText,
  CheckCircle2,
  XCircle,
  Paperclip,
  Bell,
} from "lucide-react";
import DetalheDrawer, { Secao, Campo, StatusBadge, calcularIdade, formatarData } from "@/components/DetalheDrawer";
import ContactActionButton from "@/components/ContactActionButton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useFilaAutomatica } from "@/hooks/useFilaAutomatica";
import { useEnsurePortalAccess } from "@/hooks/useEnsurePortalAccess";
import { BuscaPaciente } from "@/components/BuscaPaciente";
import { useUnidadeFilter } from "@/hooks/useUnidadeFilter";
import { SlotInfoBadge } from "@/components/SlotInfoBadge";
import { CalendarioAgenda } from "./CalendarioAgenda";

const statusActions = [
  { key: "confirmado_chegada", label: "Confirmar Chegada", icon: LogIn, color: "bg-success text-success-foreground" },
  { key: "atraso", label: "Atrasou", icon: Clock, color: "bg-warning text-warning-foreground" },
  { key: "falta", label: "Faltou", icon: X, color: "bg-destructive text-destructive-foreground" },
  { key: "concluido", label: "Atendido", icon: UserCheck, color: "bg-info text-info-foreground" },
  { key: "remarcado", label: "Remarcou", icon: RotateCcw, color: "bg-muted text-muted-foreground" },
] as const;

const statusLabels: Record<string, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  confirmado_chegada: "Chegou",
  cancelado: "Cancelado",
  concluido: "Concluído",
  falta: "Falta",
  atraso: "Atraso",
  remarcado: "Remarcado",
  em_atendimento: "Em Atendimento",
  aguardando_triagem: "Aguard. Triagem",
  aguardando_atendimento: "Aguard. Atendimento",
  aguardando_enfermagem: "Aguard. Enfermagem",
  apto_agendamento: "Apto p/ Agendamento",
  aguardando_multiprofissional: "Aguard. Multiprofissional",
  indeferido: "Indeferido",
};

const statusBadgeClass: Record<string, string> = {
  pendente: "bg-warning/10 text-warning",
  confirmado: "bg-success/10 text-success",
  confirmado_chegada: "bg-emerald-500/10 text-emerald-600",
  cancelado: "bg-destructive/10 text-destructive",
  concluido: "bg-info/10 text-info",
  falta: "bg-destructive/10 text-destructive",
  atraso: "bg-warning/10 text-warning",
  remarcado: "bg-muted text-muted-foreground",
  em_atendimento: "bg-primary/10 text-primary",
  aguardando_triagem: "bg-warning/10 text-warning",
  aguardando_atendimento: "bg-emerald-500/10 text-emerald-600",
  aguardando_enfermagem: "bg-orange-500/10 text-orange-600",
  apto_agendamento: "bg-success/10 text-success",
  aguardando_multiprofissional: "bg-purple-500/10 text-purple-600",
  indeferido: "bg-destructive/10 text-destructive",
};

const tipoBadge: Record<string, { label: string; class: string; icon: string }> = {
  Consulta: { label: "1ª Consulta", class: "bg-success/15 text-success border border-success/30", icon: "🟢" },
  Retorno: { label: "Retorno", class: "bg-info/15 text-info border border-info/30", icon: "🔵" },
  Exame: { label: "Exame", class: "bg-warning/15 text-warning border border-warning/30", icon: "🟡" },
  Procedimento: {
    label: "Procedimento",
    class: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30",
    icon: "🟣",
  },
  Urgência: { label: "Urgência", class: "bg-destructive/15 text-destructive border border-destructive/30", icon: "🔴" },
  "Sessão de Tratamento": {
    label: "Sessão",
    class: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30",
    icon: "🟠",
  },
};

const Agenda: React.FC = () => {
  const {
    agendamentos,
    updateAgendamento,
    pacientes,
    funcionarios,
    unidades,
    salas,
    addAgendamento,
    configuracoes,
    addAtendimento,
    logAction,
    refreshAgendamentos,
    fila,
    disponibilidades,
    getAvailableSlots,
    getAvailableDates,
    bloqueios,
  } = useData();
  const [lastProntuarios, setLastProntuarios] = React.useState<
    Record<string, { data: string; profissional: string; procedimentos: string; queixa: string; tipo: string }>
  >({});
  const { user, hasPermission } = useAuth();
  const { can } = usePermissions();
  const gcal = useGoogleCalendar();
  const { notify } = useWebhookNotify();
  const { handleVagaLiberada } = useFilaAutomatica();
  const { ensurePortalAccess } = useEnsurePortalAccess();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [filterUnit, setFilterUnit] = useState("all");
  const [filterProf, setFilterProf] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [retornoDialogOpen, setRetornoDialogOpen] = useState(false);
  const [retornoAg, setRetornoAg] = useState<{ pacienteId: string; pacienteNome: string } | null>(null);
  const [retornoForm, setRetornoForm] = useState({ data: "", hora: "" });
  const [newAg, setNewAg] = useState({
    pacienteId: "",
    profissionalId: filterProf !== "all" ? filterProf : "",
    salaId: "",
    hora: "",
    tipo: "Consulta",
    obs: "",
  });
  const [detalheOpen, setDetalheOpen] = useState(false);
  const [detalheAg, setDetalheAg] = useState<(typeof agendamentos)[0] | null>(null);

  // NOVO: rejeição com motivo
  const [rejeicaoTarget, setRejeicaoTarget] = useState<(typeof agendamentos)[0] | null>(null);
  const [rejeicaoMotivo, setRejeicaoMotivo] = useState("");

  // NOVO: aba pendentes / agenda
  const [abaAtiva, setAbaAtiva] = useState<"agenda" | "pendentes">("agenda");

  const { unidadesVisiveis, profissionaisVisiveis, salasVisiveis, showUnitSelector } = useUnidadeFilter();
  const isProfissional = user?.role === "profissional";
  const canRetorno = isProfissional && user?.podeAgendarRetorno === true;
  const canAprovar = hasPermission(["master", "coordenador", "recepcao"]);
  const profissionais = profissionaisVisiveis;

  // NOVO: agendamentos online pendentes de aprovação
  const agendamentosPendentesOnline = React.useMemo(() => {
    return agendamentos
      .filter((a) => {
        if (a.origem !== "online" || a.status !== "pendente") return false;
        if (user?.role === "coordenador" && user.unidadeId && a.unidadeId !== user.unidadeId) return false;
        if (user?.role === "recepcao" && user.unidadeId && a.unidadeId !== user.unidadeId) return false;
        return true;
      })
      .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  }, [agendamentos, user]);

  const blockedForDate = React.useMemo(() => {
    const dateRef = new Date(`${selectedDate}T00:00:00`).getTime();
    return bloqueios.filter((b) => {
      const ini = new Date(`${b.dataInicio}T00:00:00`).getTime();
      const fim = new Date(`${b.dataFim}T00:00:00`).getTime();
      return dateRef >= ini && dateRef <= fim && b.diaInteiro;
    });
  }, [selectedDate, bloqueios]);

  const weekendInfo = React.useMemo(() => {
    const dateObj = new Date(`${selectedDate}T12:00:00`);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (!isWeekend) return { isWeekend: false, hasAvailability: true };
    const hasAvailability = disponibilidades.some(
      (d) => d.diasSemana.includes(dayOfWeek) && selectedDate >= d.dataInicio && selectedDate <= d.dataFim,
    );
    return { isWeekend, hasAvailability };
  }, [selectedDate, disponibilidades]);

  const newAgSlots = React.useMemo(() => {
    if (!newAg.profissionalId) return [];
    const prof = profissionais.find((p) => p.id === newAg.profissionalId);
    if (!prof?.unidadeId) return [];
    return getAvailableSlots(newAg.profissionalId, prof.unidadeId, selectedDate);
  }, [newAg.profissionalId, selectedDate, profissionais, getAvailableSlots]);

  const retornoAvailableDates = React.useMemo(() => {
    if (!user || !retornoDialogOpen) return [];
    return getAvailableDates(user.id, user.unidadeId);
  }, [user, retornoDialogOpen, getAvailableDates]);

  const retornoAvailableSlots = React.useMemo(() => {
    if (!user || !retornoForm.data) return [];
    return getAvailableSlots(user.id, user.unidadeId, retornoForm.data);
  }, [user, retornoForm.data, getAvailableSlots]);

  const filteredProfissionais = React.useMemo(() => {
    if (filterUnit === "all") return profissionais;
    return profissionais.filter((p) => p.unidadeId === filterUnit || !p.unidadeId);
  }, [profissionais, filterUnit]);

  const filtered = agendamentos
    .filter((a) => {
      if (a.data !== selectedDate) return false;
      if (filterUnit !== "all" && a.unidadeId !== filterUnit) return false;
      if (filterProf !== "all" && a.profissionalId !== filterProf) return false;
      if (isProfissional && user) {
        if (a.profissionalId !== user.id) return false;
      }
      if (user?.role === "coordenador" && user.unidadeId && a.unidadeId !== user.unidadeId) return false;
      if (user?.role === "recepcao" && user.unidadeId && a.unidadeId !== user.unidadeId) return false;
      return true;
    })
    .sort((a, b) => a.hora.localeCompare(b.hora));

  React.useEffect(() => {
    const pacienteIds = [...new Set(filtered.map((a) => a.pacienteId))];
    if (pacienteIds.length === 0) return;
    const loadLast = async () => {
      const results: typeof lastProntuarios = {};
      const { data } = await (supabase as any)
        .from("prontuarios")
        .select("paciente_id,data_atendimento,profissional_nome,procedimentos_texto,queixa_principal")
        .in("paciente_id", pacienteIds)
        .order("data_atendimento", { ascending: false });
      if (data) {
        for (const row of data) {
          if (!results[row.paciente_id]) {
            results[row.paciente_id] = {
              data: row.data_atendimento,
              profissional: row.profissional_nome,
              procedimentos: row.procedimentos_texto || "",
              queixa: row.queixa_principal || "",
              tipo: "",
            };
          }
        }
      }
      setLastProntuarios(results);
    };
    loadLast();
  }, [filtered.map((f) => f.pacienteId).join(",")]); // eslint-disable-line

  const changeDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const syncToGoogleCalendar = async (ag: {
    pacienteNome: string;
    profissionalNome: string;
    data: string;
    hora: string;
    tipo: string;
    unidadeId: string;
    pacienteId?: string;
  }) => {
    if (!configuracoes.googleCalendar.conectado || !configuracoes.googleCalendar.criarEvento) return null;
    try {
      const unidade = unidades.find((u) => u.id === ag.unidadeId);
      const paciente = pacientes.find((p) => p.nome === ag.pacienteNome || p.id === ag.pacienteId);
      const startDateTime = `${ag.data}T${ag.hora}:00`;
      const [h, m] = ag.hora.split(":").map(Number);
      const endH = m + 30 >= 60 ? h + 1 : h;
      const endM = (m + 30) % 60;
      const endDateTime = `${ag.data}T${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00`;
      const description = [
        `Paciente: ${ag.pacienteNome}`,
        paciente?.telefone ? `Telefone: ${paciente.telefone}` : "",
        paciente?.email ? `E-mail: ${paciente.email}` : "",
        `Profissional: ${ag.profissionalNome}`,
        `Tipo: ${ag.tipo}`,
        unidade ? `Unidade: ${unidade.nome}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const attendees = paciente?.email ? [{ email: paciente.email }] : undefined;
      const result = await gcal.createEvent({
        summary: `${ag.tipo} - ${ag.pacienteNome}`,
        description,
        start: { dateTime: startDateTime, timeZone: "America/Belem" },
        end: { dateTime: endDateTime, timeZone: "America/Belem" },
        attendees,
      });
      return result?.eventId || null;
    } catch (err) {
      console.error("Google Calendar sync failed:", err);
      return null;
    }
  };

  const handleCreate = async () => {
    const pac = pacientes.find((p) => p.id === newAg.pacienteId);
    const prof = profissionais.find((p) => p.id === newAg.profissionalId);
    if (!pac || !prof || !newAg.hora) return;
    if (weekendInfo.isWeekend && !weekendInfo.hasAvailability) {
      if (user?.role === "recepcao") {
        toast.error("Não é possível agendar em fim de semana sem disponibilidade cadastrada.");
        return;
      }
      if (user && ["master", "coordenador"].includes(user.role)) {
        const confirmou = window.confirm(
          "Este dia é fim de semana sem disponibilidade cadastrada. Deseja criar um encaixe mesmo assim?",
        );
        if (!confirmou) return;
      }
    }
    const unidade = unidades.find((u) => u.id === prof.unidadeId);
    const agId = `ag${Date.now()}`;
    const agData = {
      id: agId,
      pacienteId: pac.id,
      pacienteNome: pac.nome,
      unidadeId: prof.unidadeId,
      salaId: newAg.salaId,
      setorId: "",
      profissionalId: prof.id,
      profissionalNome: prof.nome,
      data: selectedDate,
      hora: newAg.hora,
      status: "confirmado" as const,
      tipo: newAg.tipo,
      observacoes: newAg.obs,
      origem: "recepcao" as const,
      criadoEm: new Date().toISOString(),
      criadoPor: "current",
    };
    await addAgendamento(agData);
    ensurePortalAccess({
      pacienteId: pac.id,
      contexto: "agendamento",
      data: selectedDate,
      hora: newAg.hora,
      unidade: unidade?.nome || "",
      profissional: prof.nome,
      tipo: newAg.tipo,
    })
      .then((result) => {
        if (result.created)
          toast.info(`Acesso ao portal criado para ${pac.nome}. ${result.emailSent ? "E-mail enviado." : ""}`);
      })
      .catch(() => {});
    const googleEventId = await syncToGoogleCalendar({ ...agData, pacienteId: pac.id });
    if (googleEventId) {
      await updateAgendamento(agId, { googleEventId, syncStatus: "ok" });
      toast.success("Agendamento criado e sincronizado com Google Agenda!");
    } else {
      toast.success("Agendamento criado!");
    }
    await notify({
      evento: "novo_agendamento",
      paciente_nome: pac.nome,
      telefone: pac.telefone,
      email: pac.email,
      data_consulta: selectedDate,
      hora_consulta: newAg.hora,
      unidade: unidade?.nome || "",
      profissional: prof.nome,
      tipo_atendimento: newAg.tipo,
      status_agendamento: "confirmado",
      id_agendamento: agId,
      observacoes: newAg.obs,
    });
    setDialogOpen(false);
    setNewAg({
      pacienteId: "",
      profissionalId: filterProf !== "all" ? filterProf : "",
      salaId: "",
      hora: "",
      tipo: "Consulta",
      obs: "",
    });
  };

  // NOVO: aprovar agendamento online
  const handleAprovar = async (ag: (typeof agendamentos)[0]) => {
    try {
      await updateAgendamento(ag.id, { status: "confirmado" } as any);
      await (supabase as any)
        .from("agendamentos")
        .update({
          aprovado_por: user?.id || "",
          aprovado_em: new Date().toISOString(),
        })
        .eq("id", ag.id);

      const paciente = pacientes.find((p) => p.id === ag.pacienteId);
      const unidade = unidades.find((u) => u.id === ag.unidadeId);

      await notify({
        evento: "confirmacao",
        paciente_nome: ag.pacienteNome,
        telefone: paciente?.telefone || "",
        email: paciente?.email || "",
        data_consulta: ag.data,
        hora_consulta: ag.hora,
        unidade: unidade?.nome || "",
        profissional: ag.profissionalNome,
        tipo_atendimento: ag.tipo,
        status_agendamento: "confirmado",
        id_agendamento: ag.id,
        observacoes: "Agendamento aprovado pela recepção.",
      });

      await logAction({
        acao: "aprovar_agendamento_online",
        entidade: "agendamento",
        entidadeId: ag.id,
        modulo: "agenda",
        user,
        detalhes: { paciente: ag.pacienteNome, data: ag.data, hora: ag.hora },
      });

      toast.success(`Agendamento de ${ag.pacienteNome} aprovado! E-mail de confirmação enviado.`);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao aprovar agendamento.");
    }
  };

  // NOVO: rejeitar agendamento online
  const handleRejeitar = async () => {
    if (!rejeicaoTarget || !rejeicaoMotivo.trim()) {
      toast.error("Informe o motivo da rejeição.");
      return;
    }
    try {
      await updateAgendamento(rejeicaoTarget.id, { status: "cancelado" } as any);
      await (supabase as any)
        .from("agendamentos")
        .update({
          rejeitado_motivo: rejeicaoMotivo,
        })
        .eq("id", rejeicaoTarget.id);

      const paciente = pacientes.find((p) => p.id === rejeicaoTarget.pacienteId);
      const unidade = unidades.find((u) => u.id === rejeicaoTarget.unidadeId);

      await notify({
        evento: "cancelamento",
        paciente_nome: rejeicaoTarget.pacienteNome,
        telefone: paciente?.telefone || "",
        email: paciente?.email || "",
        data_consulta: rejeicaoTarget.data,
        hora_consulta: rejeicaoTarget.hora,
        unidade: unidade?.nome || "",
        profissional: rejeicaoTarget.profissionalNome,
        tipo_atendimento: rejeicaoTarget.tipo,
        status_agendamento: "cancelado",
        id_agendamento: rejeicaoTarget.id,
        observacoes: `Motivo da rejeição: ${rejeicaoMotivo}`,
      });

      await logAction({
        acao: "rejeitar_agendamento_online",
        entidade: "agendamento",
        entidadeId: rejeicaoTarget.id,
        modulo: "agenda",
        user,
        detalhes: { paciente: rejeicaoTarget.pacienteNome, motivo: rejeicaoMotivo },
      });

      toast.success("Agendamento rejeitado. Paciente notificado por e-mail.");
      setRejeicaoTarget(null);
      setRejeicaoMotivo("");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao rejeitar agendamento.");
    }
  };

  const handleStatusChange = async (agId: string, newStatus: string) => {
    const ag = agendamentos.find((a) => a.id === agId);
    if (!ag) return;

    // Block closing atendimento without prontuário
    if (newStatus === "concluido") {
      try {
        const { count } = await supabase
          .from("prontuarios")
          .select("*", { count: "exact", head: true })
          .eq("agendamento_id", agId)
          .not("tipo_registro", "in", '("triagem","avaliacao_enfermagem","avaliacao_multiprofissional")');
        if (!count || count === 0) {
          toast.error("⚠️ Não é possível concluir sem registro no prontuário. Preencha o prontuário primeiro.");
          return;
        }
      } catch (err) {
        console.error("Error checking prontuário:", err);
      }
    }

    if (newStatus === "confirmado_chegada") {
      try {
        const { data: setting } = await (supabase as any)
          .from("triage_settings")
          .select("enabled")
          .or(`unidade_id.eq.${ag.unidadeId},unidade_id.is.null`)
          .eq("enabled", true)
          .limit(1)
          .maybeSingle();
        if (setting) {
          const { count } = await supabase
            .from("funcionarios")
            .select("*", { count: "exact", head: true })
            .eq("role", "tecnico")
            .eq("unidade_id", ag.unidadeId)
            .eq("ativo", true);
          if ((count ?? 0) > 0) {
            await updateAgendamento(agId, { status: "aguardando_triagem" as any });
            // Also insert into fila_espera so triagem screen can find the patient
            try {
              const filaId = `fila_${Date.now()}`;
              const pacienteData = pacientes.find((p) => p.id === ag.pacienteId);
              const profData = funcionarios.find((f) => f.id === ag.profissionalId);
              await supabase.from("fila_espera").insert({
                id: filaId,
                paciente_id: ag.pacienteId,
                paciente_nome: ag.pacienteNome,
                unidade_id: ag.unidadeId,
                profissional_id: ag.profissionalId,
                status: "aguardando_triagem",
                prioridade: (ag as any).prioridadePerfil || "normal",
                prioridade_perfil: (ag as any).prioridadePerfil || "normal",
                hora_chegada: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
                setor: "",
                especialidade_destino: pacienteData?.especialidadeDestino || profData?.profissao || "",
                descricao_clinica: pacienteData?.descricaoClinica || "",
                cid: pacienteData?.cid || "",
                criado_por: user?.id || "recepcao",
              });
            } catch (filaErr) {
              console.error("Error inserting fila_espera for triage:", filaErr);
            }
            toast.success(`Chegada de ${ag.pacienteNome} confirmada! Encaminhado para triagem.`);
            return;
          }
        }
      } catch (err) {
        console.error("Error checking triage settings:", err);
      }
    }
    await updateAgendamento(agId, { status: newStatus as any });
    const paciente = pacientes.find((p) => p.id === ag.pacienteId || p.nome === ag.pacienteNome);
    const unidade = unidades.find((u) => u.id === ag.unidadeId);
    if (newStatus === "confirmado_chegada") toast.success(`Chegada de ${ag.pacienteNome} confirmada!`);
    const statusToEvento: Record<string, string> = {
      cancelado: "cancelamento",
      remarcado: "reagendamento",
      falta: "nao_compareceu",
      confirmado: "confirmacao",
      confirmado_chegada: "confirmacao",
      concluido: "atendimento_finalizado",
    };
    const evento = statusToEvento[newStatus];
    if (evento) {
      await notify({
        evento: evento as any,
        paciente_nome: ag.pacienteNome,
        telefone: paciente?.telefone || "",
        email: paciente?.email || "",
        data_consulta: ag.data,
        hora_consulta: ag.hora,
        unidade: unidade?.nome || "",
        profissional: ag.profissionalNome,
        tipo_atendimento: ag.tipo,
        status_agendamento: newStatus,
        id_agendamento: agId,
      });
    }
    if (newStatus === "cancelado" || newStatus === "falta") {
      await handleVagaLiberada(
        {
          id: agId,
          data: ag.data,
          hora: ag.hora,
          profissionalId: ag.profissionalId,
          profissionalNome: ag.profissionalNome,
          unidadeId: ag.unidadeId,
          salaId: ag.salaId,
          tipo: ag.tipo,
        },
        newStatus === "cancelado" ? "cancelamento" : "falta",
        user,
      );
    }
    if (ag.googleEventId) {
      try {
        if (newStatus === "cancelado" && configuracoes.googleCalendar.removerCancelar) {
          await gcal.deleteEvent(ag.googleEventId);
          await updateAgendamento(agId, { syncStatus: "ok" });
          toast.success("Evento removido do Google Agenda.");
        } else if (newStatus === "remarcado" && configuracoes.googleCalendar.atualizarRemarcar) {
          toast.info("Remarcação registrada.");
        }
      } catch (err) {
        console.error("Google Calendar sync error:", err);
        await updateAgendamento(agId, { syncStatus: "erro" });
      }
    }
  };

  const handleDeleteAgendamento = async (agId: string) => {
    if (!can("agenda", "can_delete")) {
      toast.error("Sem permissão para excluir.");
      return;
    }
    try {
      await (supabase as any).from("agendamentos").delete().eq("id", agId);
      await logAction({
        acao: "excluir",
        entidade: "agendamento",
        entidadeId: agId,
        detalhes: { acao: "exclusão de agendamento" },
        user,
      });
      toast.success("Agendamento excluído!");
      await refreshAgendamentos();
    } catch (err) {
      console.error("Error deleting:", err);
      toast.error("Erro ao excluir agendamento.");
    }
  };

  const handleIniciarAtendimento = async (ag: (typeof agendamentos)[0]) => {
    try {
      const { error: rpcError } = await supabase.rpc("iniciar_atendimento", {
        p_agendamento_id: ag.id,
        p_profissional_id: user?.id || "",
      });
      if (rpcError) {
        if (rpcError.message.includes("arrival_not_confirmed"))
          toast.error("A chegada do paciente ainda não foi confirmada pela recepção.");
        else if (rpcError.message.includes("not_authorized"))
          toast.error("Você não tem permissão para este agendamento.");
        else toast.error("Não foi possível iniciar o atendimento.");
        return;
      }
    } catch (err) {
      toast.error("Erro ao validar início do atendimento.");
      return;
    }

    const now = new Date();
    const horaInicio = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    localStorage.setItem(
      `timer_${ag.id}`,
      JSON.stringify({
        agendamentoId: ag.id,
        horaInicio,
        tempoLimite: user?.tempoAtendimento || 30,
        startTimestamp: Date.now(),
      }),
    );

    await refreshAgendamentos();
    const pac = pacientes.find((p) => p.id === ag.pacienteId);

    await addAtendimento({
      id: `at${Date.now()}`,
      agendamentoId: ag.id,
      pacienteId: ag.pacienteId,
      pacienteNome: ag.pacienteNome,
      profissionalId: ag.profissionalId,
      profissionalNome: ag.profissionalNome,
      unidadeId: ag.unidadeId,
      salaId: ag.salaId,
      setor: user?.setor || "",
      procedimento: ag.tipo,
      observacoes: "",
      data: ag.data,
      horaInicio,
      horaFim: "",
      status: "em_atendimento",
    });

    await logAction({
      acao: "atendimento_iniciado",
      entidade: "atendimento",
      entidadeId: ag.id,
      modulo: "atendimento",
      user,
      detalhes: {
        paciente_nome: ag.pacienteNome,
        paciente_cpf: pac?.cpf || "",
        hora_inicio: horaInicio,
        unidade: ag.unidadeId,
        sala: ag.salaId || "",
      },
    });

    toast.success("Atendimento iniciado!");
    const prof = funcionarios.find(f => f.id === ag.profissionalId);
    const params = new URLSearchParams({
      pacienteId: ag.pacienteId,
      pacienteNome: ag.pacienteNome,
      agendamentoId: ag.id,
      horaInicio,
      data: ag.data,
      tipoAtendimento: ag.tipo || "Consulta",
      especialidade: prof?.profissao || prof?.cargo || "",
      profissionalId: ag.profissionalId,
      origemFluxo: "agenda",
    });
    navigate(`/painel/prontuario?${params.toString()}`);
  };

  const handleAgendarRetorno = async () => {
    if (!retornoAg || !retornoForm.data || !retornoForm.hora || !user) return;
    const agId = `ag${Date.now()}`;
    const pac = pacientes.find((p) => p.id === retornoAg.pacienteId);
    const unidade = unidades.find((u) => u.id === user.unidadeId);
    const agData = {
      id: agId,
      pacienteId: retornoAg.pacienteId,
      pacienteNome: retornoAg.pacienteNome,
      unidadeId: user.unidadeId,
      salaId: user.salaId || "",
      setorId: "",
      profissionalId: user.id,
      profissionalNome: user.nome,
      data: retornoForm.data,
      hora: retornoForm.hora,
      status: "confirmado" as const,
      tipo: "Retorno",
      observacoes: "Retorno agendado pelo profissional",
      origem: "profissional" as const,
      criadoEm: new Date().toISOString(),
      criadoPor: user.id,
    };
    await addAgendamento(agData);
    await logAction({
      acao: "agendar_retorno",
      entidade: "agendamento",
      entidadeId: agId,
      modulo: "agendamento",
      detalhes: { paciente: retornoAg.pacienteNome, data: retornoForm.data, hora: retornoForm.hora },
      user,
    });
    if (pac) {
      await notify({
        evento: "novo_agendamento",
        paciente_nome: pac.nome,
        telefone: pac.telefone,
        email: pac.email,
        data_consulta: retornoForm.data,
        hora_consulta: retornoForm.hora,
        unidade: unidade?.nome || "",
        profissional: user.nome,
        tipo_atendimento: "Retorno",
        status_agendamento: "confirmado",
        id_agendamento: agId,
        observacoes: "Retorno agendado pelo profissional",
      });
      ensurePortalAccess({
        pacienteId: pac.id,
        contexto: "agendamento",
        data: retornoForm.data,
        hora: retornoForm.hora,
        unidade: unidade?.nome || "",
        profissional: user.nome,
        tipo: "Retorno",
      }).catch(() => {});
    }
    toast.success("Retorno agendado com sucesso!");
    setRetornoDialogOpen(false);
    setRetornoAg(null);
    setRetornoForm({ data: "", hora: "" });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Agenda</h1>
          <p className="text-muted-foreground text-sm">
            {isProfissional ? "Pacientes confirmados para atendimento" : "Gerenciar agendamentos"}
          </p>
        </div>
        {!isProfissional && (
          <div className="flex gap-2 flex-wrap">
            {/* NOVO: botão Pendentes Online com badge */}
            {canAprovar && agendamentosPendentesOnline.length > 0 && (
              <Button
                variant={abaAtiva === "pendentes" ? "default" : "outline"}
                onClick={() => setAbaAtiva(abaAtiva === "pendentes" ? "agenda" : "pendentes")}
              >
                <Bell className="w-4 h-4 mr-2" />
                Pendentes Online
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full bg-destructive text-destructive-foreground">
                  {agendamentosPendentesOnline.length}
                </span>
              </Button>
            )}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-primary text-primary-foreground">
                  <Plus className="w-4 h-4 mr-2" /> Novo Agendamento
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-display">Novo Agendamento</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Paciente</Label>
                    <BuscaPaciente
                      pacientes={pacientes}
                      value={newAg.pacienteId}
                      onChange={(id) => setNewAg((p) => ({ ...p, pacienteId: id }))}
                    />
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="flex-1 h-px bg-border" />
                      <span>ou selecione pela lista</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    <Select value={newAg.pacienteId} onValueChange={(v) => setNewAg((p) => ({ ...p, pacienteId: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um paciente..." />
                      </SelectTrigger>
                      <SelectContent>
                        {pacientes.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nome}
                            {p.cpf ? ` — ${p.cpf}` : ""}
                            {p.telefone ? ` — ${p.telefone}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Profissional</Label>
                    <Select
                      value={newAg.profissionalId}
                      onValueChange={(v) => setNewAg((p) => ({ ...p, profissionalId: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {profissionais.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Sala</Label>
                    <Select value={newAg.salaId} onValueChange={(v) => setNewAg((p) => ({ ...p, salaId: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {salasVisiveis.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Tipo</Label>
                    <Select value={newAg.tipo} onValueChange={(v) => setNewAg((p) => ({ ...p, tipo: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Consulta">Primeira Consulta</SelectItem>
                        <SelectItem value="Retorno">Retorno</SelectItem>
                        <SelectItem value="Exame">Exame</SelectItem>
                        <SelectItem value="Procedimento">Procedimento</SelectItem>
                        <SelectItem value="Sessão de Tratamento">Sessão de Tratamento</SelectItem>
                        <SelectItem value="Urgência">Urgência</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Horário Disponível</Label>
                    {newAg.profissionalId && (
                      <SlotInfoBadge
                        profissionalId={newAg.profissionalId}
                        unidadeId={profissionais.find((p) => p.id === newAg.profissionalId)?.unidadeId || ""}
                        date={selectedDate}
                        hora={newAg.hora}
                        className="mt-1 mb-2"
                      />
                    )}
                    {newAgSlots.length === 0 ? (
                      <p className="text-sm text-warning mt-1">
                        {!newAg.profissionalId
                          ? "Selecione um profissional."
                          : "Não há horários disponíveis para hoje. Selecione outro dia."}
                      </p>
                    ) : (
                      <div className="grid grid-cols-4 gap-2 mt-2">
                        {newAgSlots.map((slot) => (
                          <Button
                            key={slot}
                            variant={newAg.hora === slot ? "default" : "outline"}
                            className={newAg.hora === slot ? "gradient-primary text-primary-foreground" : ""}
                            size="sm"
                            onClick={() => setNewAg((p) => ({ ...p, hora: slot }))}
                          >
                            {slot}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={handleCreate}
                    className="w-full gradient-primary text-primary-foreground"
                    disabled={!newAg.hora || !newAg.pacienteId || !newAg.profissionalId}
                  >
                    Agendar
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* NOVO: Painel de aprovação */}
      {abaAtiva === "pendentes" && canAprovar && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">Agendamentos Online Pendentes</h2>
            <span className="text-xs bg-warning/10 text-warning px-2 py-0.5 rounded-full font-medium">
              {agendamentosPendentesOnline.length} aguardando
            </span>
          </div>
          {agendamentosPendentesOnline.length === 0 ? (
            <Card className="shadow-card border-0">
              <CardContent className="p-8 text-center text-muted-foreground">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-success/40" />
                <p>Nenhum agendamento online pendente.</p>
              </CardContent>
            </Card>
          ) : (
            agendamentosPendentesOnline.map((ag) => {
              const pac = pacientes.find((p) => p.id === ag.pacienteId);
              const unidade = unidades.find((u) => u.id === ag.unidadeId);
              const prof = funcionarios.find((f) => f.id === ag.profissionalId);
              const tipoAnexoLabel: Record<string, string> = {
                laudo: "Laudo Médico",
                encaminhamento: "Encaminhamento",
                audio: "Áudio",
                outro: "Documento",
              };
              const anexoUrl = (ag as any).attachment_url || ag.attachmentUrl;
              const anexoNome = (ag as any).attachment_name || ag.attachmentName;
              const anexoTipo = (ag as any).attachment_type || ag.attachmentType;

              return (
                <Card key={ag.id} className="shadow-card border-0 border-l-4 border-l-warning">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-foreground">{ag.pacienteNome}</p>
                        <p className="text-sm text-muted-foreground">
                          {prof?.nome || ag.profissionalNome} • {unidade?.nome} • {ag.tipo}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          📅 {new Date(ag.data + "T12:00:00").toLocaleDateString("pt-BR")} às {ag.hora}
                        </p>
                        {pac?.telefone && <p className="text-xs text-muted-foreground">📞 {pac.telefone}</p>}
                        {pac?.email && <p className="text-xs text-muted-foreground">✉️ {pac.email}</p>}
                        {ag.observacoes && <p className="text-xs text-muted-foreground mt-1">💬 {ag.observacoes}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        Solicitado {new Date(ag.criadoEm).toLocaleDateString("pt-BR")}
                      </span>
                    </div>

                    {/* Documento */}
                    {anexoUrl ? (
                      <div className="flex items-center gap-2 p-2 bg-info/10 border border-info/20 rounded-lg">
                        <Paperclip className="w-4 h-4 text-info shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">
                            {tipoAnexoLabel[anexoTipo || "outro"] || "Documento"} anexado
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{anexoNome || "Arquivo"}</p>
                        </div>
                        <a href={anexoUrl} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline" className="h-7 text-xs">
                            <Eye className="w-3.5 h-3.5 mr-1" /> Ver
                          </Button>
                        </a>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                        <p className="text-xs text-muted-foreground">Nenhum documento anexado</p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-success text-success-foreground hover:bg-success/90"
                        onClick={() => handleAprovar(ag)}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Aprovar e Confirmar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          setRejeicaoTarget(ag);
                          setRejeicaoMotivo("");
                        }}
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1" /> Rejeitar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Agenda normal */}
      {abaAtiva === "agenda" && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            {/* NOVO: componente de calendário no lugar dos botões e input de data */}
            <CalendarioAgenda
              selectedDate={selectedDate}
              onDateChange={(date) => setSelectedDate(date)}
              agendamentos={agendamentos}
              bloqueios={bloqueios}
              disponibilidades={disponibilidades}
              filterProf={filterProf}
              filterUnit={filterUnit}
              profissionais={profissionais}
              getAvailableSlots={getAvailableSlots}
              getAvailableDates={getAvailableDates}
              unidades={unidades}
            />

            {!isProfissional && showUnitSelector && (
              <Select
                value={filterUnit}
                onValueChange={(v) => {
                  setFilterUnit(v);
                  setFilterProf("all");
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Unidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Unidades</SelectItem>
                  {unidadesVisiveis.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!isProfissional && (
              <Select value={filterProf} onValueChange={setFilterProf}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Profissional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Profissionais</SelectItem>
                  {filteredProfissionais.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Slot availability summary for selected professional */}
          {filterProf !== "all" && (
            <SlotInfoBadge
              profissionalId={filterProf}
              unidadeId={
                filterUnit !== "all" ? filterUnit : profissionais.find((p) => p.id === filterProf)?.unidadeId || ""
              }
              date={selectedDate}
            />
          )}

          {blockedForDate.length > 0 && (
            <Card className="shadow-card border-0 bg-destructive/5 ring-1 ring-destructive/20">
              <CardContent className="p-4 flex items-center gap-3">
                <CalendarOff className="w-5 h-5 text-destructive shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-destructive">🚫 Data bloqueada para agendamentos</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {blockedForDate.map((b) => b.titulo).join(" • ")}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {weekendInfo.isWeekend && !weekendInfo.hasAvailability && (
            <Card className="shadow-card border-0 bg-destructive/5 ring-1 ring-destructive/20">
              <CardContent className="p-4 flex items-center gap-3">
                <CalendarOff className="w-5 h-5 text-destructive shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-destructive">🔴 Fim de semana — sem atendimento</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Nenhum profissional possui disponibilidade cadastrada para este dia.
                    {user && ["master", "coordenador"].includes(user.role) && (
                      <span className="block mt-1 text-warning">
                        Master/Coordenador pode forçar encaixe ao criar agendamento.
                      </span>
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          {weekendInfo.isWeekend && weekendInfo.hasAvailability && (
            <Card className="shadow-card border-0 bg-orange-50 ring-1 ring-orange-300 dark:bg-orange-500/10 dark:ring-orange-500/30">
              <CardContent className="p-4 flex items-center gap-3">
                <CalendarIcon className="w-5 h-5 text-orange-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                    🟠 Fim de semana — com atendimento disponível
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Há profissionais com disponibilidade cadastrada para este dia.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            {filtered.length === 0 ? (
              <Card className="shadow-card border-0">
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground mb-3">
                    {isProfissional
                      ? "Nenhum paciente confirmado pela recepção para esta data."
                      : "Nenhum agendamento para esta data."}
                  </p>
                  {!isProfissional && (
                    <Button variant="outline" onClick={() => setDialogOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" /> Novo Agendamento
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              filtered.map((ag) => {
                const ehHoje = ag.data === new Date().toISOString().split("T")[0];
                const canStart =
                  isProfissional &&
                  (ag.status === "confirmado_chegada" || ag.status === "aguardando_atendimento") &&
                  ehHoje;
                const isEmAtendimento = ag.status === "em_atendimento";
                const tipoInfo = tipoBadge[ag.tipo] || {
                  label: ag.tipo,
                  class: "bg-muted text-muted-foreground",
                  icon: "⚪",
                };
                const paciente = pacientes.find((p) => p.id === ag.pacienteId);
                const lastAppt = lastProntuarios[ag.pacienteId];
                const ehPendenteOnline = ag.origem === "online" && ag.status === "pendente";
                const anexoUrl = (ag as any).attachment_url || ag.attachmentUrl;

                const typeColorBar: Record<string, string> = {
                  Consulta: "border-l-[#3B82F6]",
                  Retorno: "border-l-[#10B981]",
                  Procedimento: "border-l-[#8B5CF6]",
                  Exame: "border-l-[#F59E0B]",
                  Urgência: "border-l-[#EF4444]",
                  "Sessão de Tratamento": "border-l-[#F97316]",
                };

                return (
                  <Card
                    key={ag.id}
                    className={cn(
                      "shadow-card border-0 border-l-4",
                      typeColorBar[ag.tipo] || "border-l-muted",
                      isEmAtendimento && "ring-2 ring-primary/50",
                      ehPendenteOnline && "ring-1 ring-warning/40",
                    )}
                  >
                    <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                      <span className="text-lg font-mono font-bold text-primary w-16 shrink-0">{ag.hora}</span>
                      <div className="flex-1 min-w-0">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="font-semibold text-foreground cursor-default">
                              {tipoInfo.icon} {ag.pacienteNome}
                              {anexoUrl && <Paperclip className="w-3.5 h-3.5 inline ml-1 text-info" />}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="text-xs">
                              <strong>Paciente:</strong> {ag.pacienteNome}
                            </p>
                            {paciente?.telefone && (
                              <p className="text-xs">
                                <strong>Tel:</strong> {paciente.telefone}
                              </p>
                            )}
                            {paciente?.cpf && (
                              <p className="text-xs">
                                <strong>CPF:</strong> {paciente.cpf}
                              </p>
                            )}
                            {paciente?.cns && (
                              <p className="text-xs">
                                <strong>CNS:</strong> {paciente.cns}
                              </p>
                            )}
                            <p className="text-xs">
                              <strong>Tipo:</strong> {tipoInfo.label}
                            </p>
                            <p className="text-xs">
                              <strong>Origem:</strong> {ag.origem}
                            </p>
                            {lastAppt && (
                              <>
                                <hr className="my-1 border-border" />
                                <p className="text-xs font-semibold">Último atendimento:</p>
                                <p className="text-xs">
                                  {new Date(lastAppt.data + "T12:00:00").toLocaleDateString("pt-BR")} —{" "}
                                  {lastAppt.profissional}
                                </p>
                                {lastAppt.procedimentos && <p className="text-xs">📋 {lastAppt.procedimentos}</p>}
                                {lastAppt.queixa && <p className="text-xs">QP: {lastAppt.queixa.substring(0, 80)}</p>}
                              </>
                            )}
                          </TooltipContent>
                        </Tooltip>
                        <p className="text-sm text-muted-foreground">{ag.profissionalNome}</p>
                        {lastAppt && isProfissional && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            📋 Último: {new Date(lastAppt.data + "T12:00:00").toLocaleDateString("pt-BR")} —{" "}
                            {lastAppt.queixa?.substring(0, 50) || lastAppt.procedimentos || "sem resumo"}
                          </p>
                        )}
                        {ehPendenteOnline && <p className="text-xs text-warning mt-0.5">⏳ Aguardando aprovação</p>}
                      </div>
                      <ContactActionButton
                        phone={paciente?.telefone}
                        patientName={ag.pacienteNome}
                        unitName={unidades.find((u) => u.id === ag.unidadeId)?.nome}
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", tipoInfo.class)}>
                          {tipoInfo.label}
                        </span>
                        <span
                          className={cn(
                            "text-xs px-2.5 py-1 rounded-full font-medium shrink-0",
                            statusBadgeClass[ag.status] || "bg-muted text-muted-foreground",
                          )}
                        >
                          {statusLabels[ag.status] || ag.status}
                        </span>
                        {ag.googleEventId && (
                          <span
                            className={cn(
                              "text-xs px-1.5 py-0.5 rounded font-medium",
                              ag.syncStatus === "ok"
                                ? "bg-success/10 text-success"
                                : ag.syncStatus === "erro"
                                  ? "bg-destructive/10 text-destructive"
                                  : "bg-warning/10 text-warning",
                            )}
                          >
                            📅
                          </span>
                        )}
                      </div>

                      <div className="flex gap-1 flex-wrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs"
                          onClick={() => {
                            setDetalheAg(ag);
                            setDetalheOpen(true);
                          }}
                          title="Detalhes"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>

                        {/* NOVO: aprovação inline */}
                        {ehPendenteOnline && canAprovar && (
                          <>
                            <Button
                              size="sm"
                              className="h-8 px-2 bg-success text-success-foreground hover:bg-success/90"
                              onClick={() => handleAprovar(ag)}
                              title="Aprovar"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2 border-destructive text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                setRejeicaoTarget(ag);
                                setRejeicaoMotivo("");
                              }}
                              title="Rejeitar"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}

                        {isProfissional && (
                          <>
                            {(ag.status === "pendente" || ag.status === "confirmado") && ehHoje && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 px-3 text-xs cursor-not-allowed opacity-50"
                                    disabled
                                  >
                                    ⏳ Aguardando chegada
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Aguardando confirmação de chegada pela recepção</TooltipContent>
                              </Tooltip>
                            )}
                            {ag.status === "aguardando_triagem" && ehHoje && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-3 text-xs cursor-not-allowed opacity-50 border-warning text-warning"
                                    disabled
                                  >
                                    🩺 Em triagem
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Aguardando técnico de enfermagem concluir a triagem</TooltipContent>
                              </Tooltip>
                            )}
                            {canStart && (
                              <Button
                                size="sm"
                                className="h-8 px-3 text-xs bg-success text-success-foreground hover:bg-success/90"
                                onClick={() => handleIniciarAtendimento(ag)}
                              >
                                <Play className="w-3.5 h-3.5 mr-1" /> Iniciar atendimento
                              </Button>
                            )}
                            {isEmAtendimento && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-3 text-xs"
                                onClick={() => {
                                  const params = new URLSearchParams({
                                    pacienteId: ag.pacienteId,
                                    pacienteNome: ag.pacienteNome,
                                    agendamentoId: ag.id,
                                    data: ag.data,
                                  });
                                  navigate(`/painel/prontuario?${params.toString()}`);
                                }}
                              >
                                <Clock className="w-3.5 h-3.5 mr-1" /> Continuar
                              </Button>
                            )}
                            {ag.status === "concluido" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-3 text-xs"
                                onClick={() => {
                                  const params = new URLSearchParams({
                                    pacienteId: ag.pacienteId,
                                    pacienteNome: ag.pacienteNome,
                                    agendamentoId: ag.id,
                                    data: ag.data,
                                  });
                                  navigate(`/painel/prontuario?${params.toString()}`);
                                }}
                              >
                                ✅ Ver prontuário
                              </Button>
                            )}
                            {(ag.status === "falta" || ag.status === "cancelado") && (
                              <span className="text-xs text-muted-foreground px-2 py-1">
                                {ag.status === "falta" ? "Faltou" : "Cancelado"}
                              </span>
                            )}
                            {!ehHoje && !["falta", "cancelado", "concluido"].includes(ag.status) && (
                              <span className="text-xs text-muted-foreground px-2 py-1">
                                📅 Agendado para{" "}
                                {new Date(ag.data + "T12:00:00").toLocaleDateString("pt-BR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                })}
                              </span>
                            )}
                          </>
                        )}
                        {canRetorno && ag.status === "concluido" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-3 text-xs border-accent text-accent-foreground"
                            onClick={() => {
                              setRetornoAg({ pacienteId: ag.pacienteId, pacienteNome: ag.pacienteNome });
                              setRetornoForm({ data: "", hora: "" });
                              setRetornoDialogOpen(true);
                            }}
                          >
                            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Retorno
                          </Button>
                        )}
                        {!isProfissional &&
                          ag.status !== "cancelado" &&
                          ag.status !== "concluido" &&
                          !ehPendenteOnline &&
                          statusActions.map((sa) => (
                            <Button
                              key={sa.key}
                              size="sm"
                              variant="outline"
                              className={cn("h-8 px-2 text-xs", ag.status === sa.key && sa.color)}
                              onClick={() => handleStatusChange(ag.id, sa.key)}
                              disabled={ag.status === sa.key}
                              title={sa.label}
                            >
                              <sa.icon className="w-3.5 h-3.5" />
                            </Button>
                          ))}
                        {can("agenda", "can_delete") && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2 text-xs text-destructive"
                                title="Excluir"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir agendamento?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir o agendamento de {ag.pacienteNome} às {ag.hora}? Esta
                                  ação será registrada no log de auditoria.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteAgendamento(ag.id)}
                                  className="bg-destructive text-destructive-foreground"
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </>
      )}

      {/* NOVO: Dialog de rejeição com motivo */}
      <Dialog
        open={!!rejeicaoTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRejeicaoTarget(null);
            setRejeicaoMotivo("");
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rejeitar Agendamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Agendamento de <strong className="text-foreground">{rejeicaoTarget?.pacienteNome}</strong>. O paciente
              será notificado por e-mail com o motivo.
            </p>
            <div>
              <Label>Motivo da rejeição *</Label>
              <Textarea
                value={rejeicaoMotivo}
                onChange={(e) => setRejeicaoMotivo(e.target.value)}
                placeholder="Ex: Encaminhamento inválido, data indisponível, documento ilegível..."
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setRejeicaoTarget(null);
                  setRejeicaoMotivo("");
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleRejeitar}
                disabled={!rejeicaoMotivo.trim()}
              >
                Confirmar Rejeição
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Retorno Dialog */}
      <Dialog open={retornoDialogOpen} onOpenChange={setRetornoDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Agendar Retorno</DialogTitle>
          </DialogHeader>
          {retornoAg && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Paciente: <strong className="text-foreground">{retornoAg.pacienteNome}</strong>
              </p>
              <div>
                <Label>Data</Label>
                {retornoAvailableDates.length === 0 ? (
                  <p className="text-sm text-warning mt-1">Não há datas disponíveis na sua agenda.</p>
                ) : (
                  <Select
                    value={retornoForm.data}
                    onValueChange={(v) => setRetornoForm((p) => ({ ...p, data: v, hora: "" }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a data" />
                    </SelectTrigger>
                    <SelectContent>
                      {retornoAvailableDates.slice(0, 30).map((d) => {
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
              {retornoForm.data && (
                <div>
                  <Label>Horário</Label>
                  {retornoAvailableSlots.length === 0 ? (
                    <p className="text-sm text-warning mt-1">Não há horários disponíveis para esta data.</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      {retornoAvailableSlots.map((slot) => (
                        <Button
                          key={slot}
                          variant={retornoForm.hora === slot ? "default" : "outline"}
                          className={retornoForm.hora === slot ? "gradient-primary text-primary-foreground" : ""}
                          size="sm"
                          onClick={() => setRetornoForm((p) => ({ ...p, hora: slot }))}
                        >
                          {slot}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <Button
                onClick={handleAgendarRetorno}
                disabled={!retornoForm.data || !retornoForm.hora}
                className="w-full gradient-primary text-primary-foreground"
              >
                Confirmar Retorno
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Detalhe Drawer */}
      <DetalheDrawer open={detalheOpen} onOpenChange={setDetalheOpen} titulo="Detalhes do Agendamento">
        {detalheAg &&
          (() => {
            const pac = pacientes.find((p) => p.id === detalheAg.pacienteId);
            const prof = funcionarios.find((f) => f.id === detalheAg.profissionalId);
            const unidade = unidades.find((u) => u.id === detalheAg.unidadeId);
            const sala = salas.find((s) => s.id === detalheAg.salaId);
            const tipoInfo = tipoBadge[detalheAg.tipo] || {
              label: detalheAg.tipo,
              class: "bg-muted text-muted-foreground",
            };
            const tipoAnexoLabel: Record<string, string> = {
              laudo: "Laudo Médico",
              encaminhamento: "Encaminhamento",
              audio: "Áudio",
              outro: "Documento",
            };
            const anexoUrl = (detalheAg as any).attachment_url || detalheAg.attachmentUrl;
            return (
              <>
                <Secao titulo="Paciente">
                  <Campo label="Nome" valor={pac?.nome || detalheAg.pacienteNome} />
                  <Campo label="CPF" valor={pac?.cpf} />
                  <Campo label="Telefone" valor={pac?.telefone} />
                  <Campo
                    label="Data de Nascimento"
                    valor={pac?.dataNascimento ? formatarData(pac.dataNascimento) : undefined}
                    hide
                  />
                  <Campo
                    label="Idade"
                    valor={pac?.dataNascimento ? calcularIdade(pac.dataNascimento) : undefined}
                    hide
                  />
                </Secao>
                <Secao titulo="Agendamento">
                  <Campo label="Data" valor={formatarData(detalheAg.data)} />
                  <Campo label="Horário" valor={detalheAg.hora} />
                  <div className="flex justify-between items-center py-1">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <StatusBadge
                      label={statusLabels[detalheAg.status] || detalheAg.status}
                      className={statusBadgeClass[detalheAg.status]}
                    />
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-xs text-muted-foreground">Tipo</span>
                    <StatusBadge label={tipoInfo.label} className={tipoInfo.class} />
                  </div>
                  <Campo label="Origem" valor={detalheAg.origem} />
                </Secao>
                <Secao titulo="Atendimento">
                  <Campo label="Unidade" valor={unidade?.nome} />
                  <Campo label="Sala" valor={sala?.nome} hide />
                  <Campo
                    label="Profissional"
                    valor={
                      prof ? `${prof.nome}${prof.profissao ? ` — ${prof.profissao}` : ""}` : detalheAg.profissionalNome
                    }
                  />
                </Secao>
                {/* NOVO: documento */}
                {anexoUrl && (
                  <Secao titulo="Documento Anexado">
                    <div className="flex items-center gap-2 p-2 bg-info/10 rounded-lg">
                      <Paperclip className="w-4 h-4 text-info shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">
                          {tipoAnexoLabel[(detalheAg as any).attachment_type || detalheAg.attachmentType || "outro"]}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {(detalheAg as any).attachment_name || detalheAg.attachmentName}
                        </p>
                      </div>
                      <a href={anexoUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="h-7 text-xs">
                          <Eye className="w-3.5 h-3.5 mr-1" /> Ver
                        </Button>
                      </a>
                    </div>
                  </Secao>
                )}
                {detalheAg.observacoes && (
                  <Secao titulo="Observações">
                    <p className="text-sm text-foreground">{detalheAg.observacoes}</p>
                  </Secao>
                )}
              </>
            );
          })()}
      </DetalheDrawer>
    </div>
  );
};

export default Agenda;
