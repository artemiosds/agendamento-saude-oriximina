import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useWebhookNotify } from "@/hooks/useWebhookNotify";
import { useFilaAutomatica } from "@/hooks/useFilaAutomatica";
import { useEnsurePortalAccess } from "@/hooks/useEnsurePortalAccess";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Bell,
  Play,
  CheckCircle,
  XCircle,
  Pencil,
  Trash2,
  UserPlus,
  Clock,
  Users,
  ArrowRight,
  Timer,
  Plus,
  FileUp,
  AlertTriangle,
  AlertCircle,
  Eye,
  Search,
  CalendarClock,
  TriangleAlert,
} from "lucide-react";
import ContactActionButton from "@/components/ContactActionButton";
import DetalheDrawer, {
  Secao,
  Campo,
  StatusBadge,
  calcularIdade,
  formatarData,
  formatarDataHora,
} from "@/components/DetalheDrawer";
import { CalendarioDisponibilidade } from "@/components/CalendarioDisponibilidade";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { validatePacienteFields } from "@/lib/validation";
import { useUnidadeFilter } from "@/hooks/useUnidadeFilter";
import { supabase } from "@/integrations/supabase/client";

const ABSENCE_REASONS = [
  { value: "saude", label: "Problema de Saúde" },
  { value: "transporte", label: "Transporte" },
  { value: "sem_contato", label: "Sem Contato" },
  { value: "trabalho", label: "Compromisso de Trabalho" },
  { value: "esquecimento", label: "Esquecimento" },
  { value: "outro", label: "Outro" },
];

const prioridadeColors: Record<string, string> = {
  normal: "bg-muted text-muted-foreground",
  alta: "bg-warning/10 text-warning",
  urgente: "bg-destructive/10 text-destructive",
  gestante: "bg-pink-500/10 text-pink-600",
  idoso: "bg-amber-500/10 text-amber-600",
  pcd: "bg-blue-500/10 text-blue-600",
  crianca: "bg-green-500/10 text-green-600",
};

const prioridadeLabel: Record<string, string> = {
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
  gestante: "Gestante",
  idoso: "Idoso 60+",
  pcd: "PNE",
  crianca: "Criança 0-12",
};

const statusLabels: Record<string, { label: string; color: string }> = {
  aguardando: { label: "Aguardando", color: "bg-muted text-muted-foreground" },
  aguardando_triagem: { label: "Aguardando Triagem", color: "bg-warning/10 text-warning" },
  aguardando_enfermagem: { label: "Aguardando Enfermagem", color: "bg-blue-500/10 text-blue-600" },
  apto_agendamento: { label: "Apto p/ Agendamento", color: "bg-success/10 text-success" },
  aguardando_multiprofissional: { label: "Avaliação Multiprofissional", color: "bg-purple-500/10 text-purple-600" },
  indeferido: { label: "Indeferido", color: "bg-destructive/10 text-destructive" },
  encaixado: { label: "Encaixado", color: "bg-primary/10 text-primary" },
  chamado: { label: "Chamado", color: "bg-info/10 text-info" },
  em_atendimento: { label: "Em Atendimento", color: "bg-success/10 text-success" },
  atendido: { label: "Atendido", color: "bg-muted text-muted-foreground" },
  falta: { label: "Faltou", color: "bg-destructive/10 text-destructive" },
  cancelado: { label: "Cancelado", color: "bg-muted text-muted-foreground" },
};

interface ReservaInfo {
  filaId: string;
  slot: {
    data: string;
    hora: string;
    profissionalId: string;
    profissionalNome: string;
    unidadeId: string;
    salaId?: string;
    tipo?: string;
  };
  expiresAt: number;
}

// Calculate wait time in minutes from criadoEm or horaChegada
const getWaitMinutes = (f: { criadoEm?: string; horaChegada: string }, nowMs: number): number => {
  if (f.criadoEm) {
    const entryTime = new Date(f.criadoEm).getTime();
    if (!isNaN(entryTime)) return Math.floor((nowMs - entryTime) / 60000);
  }
  const [h, m] = f.horaChegada.split(":").map(Number);
  if (!isNaN(h) && !isNaN(m)) {
    const today = new Date();
    today.setHours(h, m, 0, 0);
    return Math.max(0, Math.floor((nowMs - today.getTime()) / 60000));
  }
  return 0;
};

const getWaitColor = (minutes: number, prioridade: string): { bg: string; text: string; label: string } => {
  if (prioridade === "urgente") return { bg: "bg-destructive", text: "text-destructive-foreground", label: "Urgente" };
  if (minutes > 60) return { bg: "bg-destructive", text: "text-destructive-foreground", label: `${minutes}min` };
  if (minutes >= 30) return { bg: "bg-warning", text: "text-warning-foreground", label: `${minutes}min` };
  return { bg: "bg-success", text: "text-success-foreground", label: `${minutes}min` };
};

const formatWaitTime = (minutes: number): string => {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m}min` : `${h}h`;
};

const FilaEspera: React.FC = () => {
  const {
    fila,
    addToFila,
    updateFila,
    removeFromFila,
    pacientes,
    funcionarios,
    unidades,
    addPaciente,
    refreshPacientes,
    logAction,
    getAvailableDates,
    getAvailableSlots,
    getDayInfoMap,
  } = useData();
  const { user, hasPermission } = useAuth();
  const [detalheOpen, setDetalheOpen] = useState(false);
  const [detalheFila, setDetalheFila] = useState<(typeof fila)[0] | null>(null);
  const { notify } = useWebhookNotify();
  const { chamarProximoDaFila, confirmarEncaixe, expirarReserva, getNextInQueue } = useFilaAutomatica();
  const { ensurePortalAccess } = useEnsurePortalAccess();
  const canManage = hasPermission(["master", "coordenador", "recepcao", "gestao"]);
  const { unidadesVisiveis, profissionaisVisiveis, isMaster, defaultUnidadeId, showUnitSelector } = useUnidadeFilter();
  const profissionais = profissionaisVisiveis;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterUnidade, setFilterUnidade] = useState("all");
  const [filterProf, setFilterProf] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterEspecialidade, setFilterEspecialidade] = useState("all");
  const [sortField, setSortField] = useState<"prioridade" | "tempo" | "entrada" | "solicitacao">("prioridade");
  const [reservas, setReservas] = useState<Record<string, ReservaInfo>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [now, setNow] = useState(Date.now());

  const [absenceModalOpen, setAbsenceModalOpen] = useState(false);
  const [absenceFilaItem, setAbsenceFilaItem] = useState<(typeof fila)[0] | null>(null);
  const [absenceReason, setAbsenceReason] = useState("");
  const [absenceObs, setAbsenceObs] = useState("");
  const [absenceWantsReschedule, setAbsenceWantsReschedule] = useState(false);

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleFilaItem, setRescheduleFilaItem] = useState<(typeof fila)[0] | null>(null);
  const [rescheduleSlot, setRescheduleSlot] = useState({ data: "", hora: "", profissionalId: "", unidadeId: "" });

  const [absenceHistory, setAbsenceHistory] = useState<Record<string, { reason: string; obs: string; date: string }>>(
    {},
  );

  const [criarPaciente, setCriarPaciente] = useState(false);
  const [novoPaciente, setNovoPaciente] = useState({
    nome: "",
    cpf: "",
    cns: "",
    nomeMae: "",
    telefone: "",
    email: "",
    dataNascimento: "",
    endereco: "",
    descricaoClinica: "",
    cid: "",
  });
  const [duplicataEncontrada, setDuplicataEncontrada] = useState<(typeof pacientes)[0] | null>(null);
  const [pacienteErrors, setPacienteErrors] = useState<Record<string, string>>({});

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importForm, setImportForm] = useState({
    nome: "",
    telefone: "",
    cpf: "",
    cns: "",
    nomeMae: "",
    email: "",
    dataNascimento: "",
    unidadeId: "",
    profissionalId: "",
    tipo: "primeira_consulta",
    dataSolicitacaoOriginal: "",
    descricaoClinica: "",
    cid: "",
    observacoes: "",
    prioridade: "normal",
  });
  const [importDup, setImportDup] = useState<(typeof pacientes)[0] | null>(null);
  const [importErrors, setImportErrors] = useState<Record<string, string>>({});
  const [importSaving, setImportSaving] = useState(false);

  const [form, setForm] = useState({
    pacienteNome: "",
    pacienteId: "",
    unidadeId: "",
    profissionalId: "",
    setor: "",
    prioridade: "normal" as string,
    observacoes: "",
    descricaoClinica: "",
    cid: "",
  });

  useEffect(() => {
    const loadReservas = () => {
      const loaded: Record<string, ReservaInfo> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("fila_reserva_")) {
          try {
            const val = JSON.parse(localStorage.getItem(key)!);
            loaded[val.filaId] = val;
          } catch {
            /* ignore */
          }
        }
      }
      setReservas(loaded);
    };
    loadReservas();
    const interval = setInterval(() => {
      setNow(Date.now());
      loadReservas();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadAbsenceHistory = async () => {
      const { data } = await supabase
        .from("action_logs")
        .select("entidade_id, detalhes, created_at")
        .eq("acao", "marcar_falta")
        .eq("entidade", "fila_espera")
        .order("created_at", { ascending: false })
        .limit(500);
      if (data) {
        const history: Record<string, { reason: string; obs: string; date: string }> = {};
        data.forEach((log) => {
          const d = log.detalhes as any;
          const pacienteId = d?.pacienteId;
          if (pacienteId && !history[pacienteId]) {
            history[pacienteId] = {
              reason: d?.motivo || "",
              obs: d?.observacaoFalta || "",
              date: log.created_at?.split("T")[0] || "",
            };
          }
        });
        setAbsenceHistory(history);
      }
    };
    loadAbsenceHistory();
  }, []);

  useEffect(() => {
    Object.values(reservas).forEach(async (r) => {
      if (r.expiresAt <= now) {
        const filaItem = fila.find((f) => f.id === r.filaId && f.status === "chamado");
        if (filaItem) {
          await expirarReserva(r.filaId, r.slot, user);
        } else {
          localStorage.removeItem(`fila_reserva_${r.filaId}`);
        }
      }
    });
  }, [now, reservas, fila, expirarReserva, user]);

  const filteredFila = useMemo(() => {
    const prioOrder: Record<string, number> = {
      urgente: 0,
      gestante: 1,
      idoso: 2,
      alta: 3,
      pcd: 4,
      crianca: 5,
      normal: 6,
    };
    const query = searchQuery.toLowerCase().trim();
    return [...fila]
      .filter((f) => !query || f.pacienteNome.toLowerCase().includes(query))
      .filter((f) => filterUnidade === "all" || f.unidadeId === filterUnidade)
      .filter((f) => filterProf === "all" || f.profissionalId === filterProf)
      .filter((f) => filterStatus === "all" || f.status === filterStatus)
      .filter((f) => filterEspecialidade === "all" || (f as any).especialidadeDestino === filterEspecialidade)
      .sort((a, b) => {
        if (sortField === "prioridade") {
          if ((prioOrder[a.prioridade] ?? 6) !== (prioOrder[b.prioridade] ?? 6))
            return (prioOrder[a.prioridade] ?? 6) - (prioOrder[b.prioridade] ?? 6);
          if (a.dataSolicitacaoOriginal && b.dataSolicitacaoOriginal)
            return a.dataSolicitacaoOriginal.localeCompare(b.dataSolicitacaoOriginal);
          if (a.dataSolicitacaoOriginal) return -1;
          if (b.dataSolicitacaoOriginal) return 1;
          return (a.criadoEm || a.horaChegada).localeCompare(b.criadoEm || b.horaChegada);
        }
        if (sortField === "tempo") {
          const aMin = getWaitMinutes(a, now);
          const bMin = getWaitMinutes(b, now);
          return bMin - aMin;
        }
        if (sortField === "solicitacao") {
          if (a.dataSolicitacaoOriginal && b.dataSolicitacaoOriginal)
            return a.dataSolicitacaoOriginal.localeCompare(b.dataSolicitacaoOriginal);
          if (a.dataSolicitacaoOriginal) return -1;
          if (b.dataSolicitacaoOriginal) return 1;
          return (a.criadoEm || a.horaChegada).localeCompare(b.criadoEm || b.horaChegada);
        }
        return (a.criadoEm || a.horaChegada).localeCompare(b.criadoEm || b.horaChegada);
      });
  }, [fila, filterUnidade, filterProf, filterStatus, sortField, now, searchQuery]);

  const activeQueue = fila.filter((f) => ["aguardando", "aguardando_triagem", "chamado", "em_atendimento"].includes(f.status));
  const aguardandoCount = fila.filter((f) => f.status === "aguardando" || f.status === "aguardando_triagem").length;
  const chamadoCount = fila.filter((f) => f.status === "chamado").length;
  const emAtendimentoCount = fila.filter((f) => f.status === "em_atendimento").length;

  const greenCount = activeQueue.filter((f) => {
    if (f.prioridade === "urgente") return false;
    return getWaitMinutes(f, now) < 30;
  }).length;
  const yellowCount = activeQueue.filter((f) => {
    if (f.prioridade === "urgente") return false;
    const m = getWaitMinutes(f, now);
    return m >= 30 && m <= 60;
  }).length;
  const redCount = activeQueue.filter((f) => {
    if (f.prioridade === "urgente") return true;
    return getWaitMinutes(f, now) > 60;
  }).length;

  const openNew = () => {
    setEditId(null);
    setForm({
      pacienteNome: "",
      pacienteId: "",
      unidadeId: "",
      profissionalId: "",
      setor: "",
      prioridade: "normal",
      observacoes: "",
      descricaoClinica: "",
      cid: "",
    });
    setCriarPaciente(false);
    setNovoPaciente({
      nome: "",
      cpf: "",
      cns: "",
      nomeMae: "",
      telefone: "",
      email: "",
      dataNascimento: "",
      endereco: "",
      descricaoClinica: "",
      cid: "",
    });
    setDuplicataEncontrada(null);
    setPacienteErrors({});
    setDialogOpen(true);
  };

  const openEdit = (f: (typeof fila)[0]) => {
    setEditId(f.id);
    setForm({
      pacienteNome: f.pacienteNome,
      pacienteId: f.pacienteId,
      unidadeId: f.unidadeId,
      profissionalId: f.profissionalId || "",
      setor: f.setor,
      prioridade: f.prioridade,
      observacoes: f.observacoes || "",
      descricaoClinica: f.descricaoClinica || "",
      cid: f.cid || "",
    });
    setCriarPaciente(false);
    setDuplicataEncontrada(null);
    setPacienteErrors({});
    setDialogOpen(true);
  };

  const checkDuplicidade = (dados: typeof novoPaciente) => {
    const cpfClean = dados.cpf.replace(/\D/g, "");
    const cnsClean = (dados.cns || "").replace(/\D/g, "");
    const telClean = dados.telefone.replace(/\D/g, "");
    const emailLower = dados.email.toLowerCase().trim();
    if (cpfClean.length >= 11) {
      const found = pacientes.find((p) => p.cpf.replace(/\D/g, "") === cpfClean);
      if (found) return found;
    }
    if (cnsClean.length >= 15) {
      const found = pacientes.find((p) => (p.cns || "").replace(/\D/g, "") === cnsClean);
      if (found) return found;
    }
    if (telClean.length >= 8) {
      const found = pacientes.find((p) => p.telefone.replace(/\D/g, "") === telClean);
      if (found) return found;
    }
    if (emailLower && emailLower.includes("@")) {
      const found = pacientes.find((p) => p.email.toLowerCase().trim() === emailLower);
      if (found) return found;
    }
    return null;
  };

  const handleCriarPacienteEAdicionarFila = async () => {
    const err = validatePacienteFields({
      nome: novoPaciente.nome,
      telefone: novoPaciente.telefone,
      email: novoPaciente.email,
    });
    if (err) {
      const newErrors: Record<string, string> = {};
      if (err.includes("Nome")) newErrors.nome = err;
      else if (err.includes("Telefone") || err.includes("telefone")) newErrors.telefone = err;
      else if (err.includes("mail")) newErrors.email = err;
      setPacienteErrors(newErrors);
      toast.error(err);
      return;
    }
    setPacienteErrors({});
    const dup = checkDuplicidade(novoPaciente);
    if (dup) {
      setDuplicataEncontrada(dup);
      return;
    }
    const pacienteId = `p${Date.now()}`;
    try {
      await addPaciente({
        id: pacienteId,
        nome: novoPaciente.nome,
        cpf: novoPaciente.cpf,
        cns: novoPaciente.cns || "",
        nomeMae: novoPaciente.nomeMae || "",
        telefone: novoPaciente.telefone,
        email: novoPaciente.email,
        dataNascimento: novoPaciente.dataNascimento,
        endereco: novoPaciente.endereco,
        observacoes: "",
        descricaoClinica: novoPaciente.descricaoClinica || "",
        cid: novoPaciente.cid || "",
        criadoEm: new Date().toISOString(),
      });
      await logAction({
        acao: "criar",
        entidade: "paciente",
        entidadeId: pacienteId,
        detalhes: { nome: novoPaciente.nome, origem: "fila_espera" },
        user,
      });
      setForm((prev) => ({ ...prev, pacienteNome: novoPaciente.nome, pacienteId }));
      setCriarPaciente(false);
      toast.success(`Paciente ${novoPaciente.nome} cadastrado!`);
      await addToFilaWithPatient(pacienteId, novoPaciente.nome, novoPaciente.telefone, novoPaciente.email);
    } catch {
      toast.error("Erro ao cadastrar paciente.");
    }
  };

  const usarPacienteExistente = (p: (typeof pacientes)[0]) => {
    setForm((prev) => ({ ...prev, pacienteNome: p.nome, pacienteId: p.id }));
    setCriarPaciente(false);
    setDuplicataEncontrada(null);
    toast.info(`Paciente ${p.nome} selecionado.`);
  };

  const addToFilaWithPatient = async (pacienteId: string, pacienteNome: string, telefone: string, email: string) => {
    if (!form.unidadeId) {
      toast.error("Selecione a unidade antes de adicionar.");
      return;
    }
    const newId = `f${Date.now()}`;
    await addToFila({
      id: newId,
      pacienteId,
      pacienteNome,
      unidadeId: form.unidadeId,
      profissionalId: form.profissionalId,
      setor: form.setor,
      prioridade: form.prioridade as any,
      status: "aguardando",
      posicao: fila.length + 1,
      horaChegada: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      criadoPor: user?.id || "sistema",
      observacoes: form.observacoes,
      descricaoClinica: form.descricaoClinica,
      cid: form.cid,
    });
    const unidade = unidades.find((u) => u.id === form.unidadeId);
    const prof = form.profissionalId ? funcionarios.find((f) => f.id === form.profissionalId) : null;
    ensurePortalAccess({
      pacienteId,
      contexto: "fila",
      unidade: unidade?.nome || "",
      profissional: prof?.nome || "",
      posicaoFila: fila.length + 1,
    })
      .then((result) => {
        if (result.created)
          toast.info(`Acesso ao portal criado para ${pacienteNome}. ${result.emailSent ? "E-mail enviado." : ""}`);
      })
      .catch(() => {});
    await notify({
      evento: "fila_entrada",
      paciente_nome: pacienteNome,
      telefone,
      email,
      data_consulta: new Date().toISOString().split("T")[0],
      hora_consulta: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      unidade: unidade?.nome || "",
      profissional: prof?.nome || "",
      tipo_atendimento: "Fila de Espera",
      status_agendamento: "aguardando",
      id_agendamento: "",
    });
    await logAction({
      acao: "criar",
      entidade: "fila_espera",
      entidadeId: newId,
      detalhes: {
        pacienteNome,
        unidade: unidade?.nome,
        descricaoClinica: form.descricaoClinica || undefined,
        cid: form.cid || undefined,
      },
      user,
      modulo: "fila_espera",
    });
    toast.success("Paciente adicionado à fila!");
    setDialogOpen(false);
  };

  const handleSave = async () => {
    if (!form.pacienteNome || !form.unidadeId) {
      toast.error("Informe o paciente e a unidade.");
      return;
    }
    if (editId) {
      await updateFila(editId, { ...form, prioridade: form.prioridade as any });
      toast.success("Registro atualizado!");
      setDialogOpen(false);
    } else {
      const pac = pacientes.find((p) => p.id === form.pacienteId);
      await addToFilaWithPatient(form.pacienteId, form.pacienteNome, pac?.telefone || "", pac?.email || "");
    }
  };

  const checkImportDuplicidade = (dados: typeof importForm) => {
    const cpfClean = dados.cpf.replace(/\D/g, "");
    const cnsClean = (dados.cns || "").replace(/\D/g, "");
    const telClean = dados.telefone.replace(/\D/g, "");
    const emailLower = dados.email.toLowerCase().trim();
    if (cpfClean.length >= 11) {
      const found = pacientes.find((p) => p.cpf.replace(/\D/g, "") === cpfClean);
      if (found) return found;
    }
    if (cnsClean.length >= 15) {
      const found = pacientes.find((p) => (p.cns || "").replace(/\D/g, "") === cnsClean);
      if (found) return found;
    }
    if (telClean.length >= 8) {
      const found = pacientes.find((p) => p.telefone.replace(/\D/g, "") === telClean);
      if (found) return found;
    }
    if (emailLower && emailLower.includes("@")) {
      const found = pacientes.find((p) => p.email.toLowerCase().trim() === emailLower);
      if (found) return found;
    }
    if (dados.nome.trim() && dados.dataNascimento) {
      const found = pacientes.find(
        (p) =>
          p.nome.toLowerCase().trim() === dados.nome.toLowerCase().trim() && p.dataNascimento === dados.dataNascimento,
      );
      if (found) return found;
    }
    return null;
  };

  // CORREÇÃO: handleImportSave com status "aguardando" para demanda reprimida
  const handleImportSave = async (existingPatient?: (typeof pacientes)[0]) => {
    if (!importForm.nome.trim() && !existingPatient) {
      toast.error("Informe o nome do paciente.");
      return;
    }
    if (!importForm.unidadeId) {
      toast.error("Selecione a unidade.");
      return;
    }
    if (!importForm.dataSolicitacaoOriginal) {
      toast.error("Informe a data de solicitação original.");
      return;
    }
    setImportSaving(true);
    try {
      let pacienteId: string;
      let pacienteNome: string;
      let telefone: string;
      let email: string;
      if (existingPatient) {
        pacienteId = existingPatient.id;
        pacienteNome = existingPatient.nome;
        telefone = existingPatient.telefone;
        email = existingPatient.email;
      } else {
        const dup = checkImportDuplicidade(importForm);
        if (dup && !importDup) {
          setImportDup(dup);
          setImportSaving(false);
          return;
        }
        const err = validatePacienteFields({
          nome: importForm.nome,
          telefone: importForm.telefone,
          email: importForm.email,
        });
        if (err) {
          const newErrors: Record<string, string> = {};
          if (err.includes("Nome")) newErrors.nome = err;
          else if (err.includes("Telefone") || err.includes("telefone")) newErrors.telefone = err;
          else if (err.includes("mail")) newErrors.email = err;
          setImportErrors(newErrors);
          toast.error(err);
          setImportSaving(false);
          return;
        }
        pacienteId = `p${Date.now()}`;
        pacienteNome = importForm.nome;
        telefone = importForm.telefone;
        email = importForm.email;
        await addPaciente({
          id: pacienteId,
          nome: importForm.nome,
          cpf: importForm.cpf,
          cns: importForm.cns || "",
          nomeMae: (importForm as any).nomeMae || "",
          telefone: importForm.telefone,
          email: importForm.email,
          dataNascimento: importForm.dataNascimento,
          endereco: "",
          observacoes: importForm.observacoes,
          descricaoClinica: importForm.descricaoClinica || "",
          cid: importForm.cid || "",
          criadoEm: new Date().toISOString(),
        });
        await logAction({
          acao: "criar",
          entidade: "paciente",
          entidadeId: pacienteId,
          detalhes: {
            nome: importForm.nome,
            origem: "demanda_reprimida",
            dataSolicitacaoOriginal: importForm.dataSolicitacaoOriginal,
          },
          user,
        });
      }
      let sortableDate = importForm.dataSolicitacaoOriginal;
      const parts = sortableDate.split("/");
      if (parts.length === 3 && parts[0].length <= 2) {
        sortableDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      }
      const newId = `f${Date.now()}`;

      await addToFila({
        id: newId,
        pacienteId,
        pacienteNome,
        unidadeId: importForm.unidadeId,
        profissionalId: importForm.profissionalId,
        setor: "",
        prioridade: importForm.prioridade as any,
        status: "aguardando_triagem",
        posicao: fila.length + 1,
        horaChegada: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        criadoPor: user?.id || "sistema",
        observacoes: importForm.observacoes,
        descricaoClinica: importForm.descricaoClinica,
        cid: importForm.cid,
        dataSolicitacaoOriginal: sortableDate,
        origemCadastro: "demanda_reprimida",
        especialidadeDestino: importForm.profissionalId
          ? funcionarios.find((f) => f.id === importForm.profissionalId)?.profissao || ""
          : "",
      });
      const unidade = unidades.find((u) => u.id === importForm.unidadeId);
      const prof = importForm.profissionalId ? funcionarios.find((f) => f.id === importForm.profissionalId) : null;
      ensurePortalAccess({
        pacienteId,
        contexto: "fila",
        unidade: unidade?.nome || "",
        profissional: prof?.nome || "",
        posicaoFila: fila.length + 1,
      }).catch(() => {});
      if (email) {
        await notify({
          evento: "fila_entrada",
          paciente_nome: pacienteNome,
          telefone,
          email,
          data_consulta: new Date().toISOString().split("T")[0],
          hora_consulta: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          unidade: unidade?.nome || "",
          profissional: prof?.nome || "",
          tipo_atendimento: importForm.tipo === "retorno" ? "Retorno" : "Primeira Consulta",
          status_agendamento: "aguardando",
          id_agendamento: "",
        });
      }
      await logAction({
        acao: "criar",
        entidade: "fila_espera",
        entidadeId: newId,
        detalhes: {
          pacienteNome,
          unidade: unidade?.nome,
          profissional: prof?.nome,
          origemCadastro: "demanda_reprimida",
           status: "aguardando_triagem",
          dataSolicitacaoOriginal: sortableDate,
          descricaoClinica: importForm.descricaoClinica || undefined,
          cid: importForm.cid || undefined,
        },
        user,
        modulo: "fila_espera",
      });
      toast.success(`${pacienteNome} importado da lista antiga para a fila de espera!`);
      setImportDialogOpen(false);
      setImportDup(null);
      setImportErrors({});
    } catch {
      toast.error("Erro ao importar paciente.");
    } finally {
      setImportSaving(false);
    }
  };

  const getReservaTimeLeft = (filaId: string) => {
    const r = reservas[filaId];
    if (!r) return null;
    const remaining = Math.max(0, r.expiresAt - now);
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return { minutes, seconds, slot: r.slot, expired: remaining <= 0 };
  };

  const [manualCallDialog, setManualCallDialog] = useState(false);
  const [manualSlot, setManualSlot] = useState({ data: "", hora: "", profissionalId: "", unidadeId: "" });

  const manualCallDates = useMemo(() => {
    if (!manualSlot.profissionalId || !manualSlot.unidadeId) return [];
    return getAvailableDates(manualSlot.profissionalId, manualSlot.unidadeId, false);
  }, [manualSlot.profissionalId, manualSlot.unidadeId, getAvailableDates]);

  const manualCallDayInfoMap = useMemo(() => {
    if (!manualSlot.profissionalId || !manualSlot.unidadeId) return {};
    return getDayInfoMap(manualSlot.profissionalId, manualSlot.unidadeId, false);
  }, [manualSlot.profissionalId, manualSlot.unidadeId, getDayInfoMap]);

  const handleManualCall = async () => {
    if (!manualSlot.hora || !manualSlot.profissionalId || !manualSlot.unidadeId) {
      toast.error("Preencha todos os campos.");
      return;
    }
    const prof = funcionarios.find((f) => f.id === manualSlot.profissionalId);
    await chamarProximoDaFila(
      {
        data: manualSlot.data,
        hora: manualSlot.hora,
        profissionalId: manualSlot.profissionalId,
        profissionalNome: prof?.nome || "",
        unidadeId: manualSlot.unidadeId,
      },
      user,
    );
    setManualCallDialog(false);
  };

  const openAbsenceModal = (f: (typeof fila)[0]) => {
    setAbsenceFilaItem(f);
    setAbsenceReason("");
    setAbsenceObs("");
    setAbsenceWantsReschedule(false);
    setAbsenceModalOpen(true);
  };

  const handleAbsenceConfirm = async () => {
    if (!absenceFilaItem) return;
    if (!absenceReason) {
      toast.error("Selecione o motivo da falta.");
      return;
    }
    await updateFila(absenceFilaItem.id, { status: "falta" });
    await logAction({
      acao: "marcar_falta",
      entidade: "fila_espera",
      entidadeId: absenceFilaItem.id,
      detalhes: {
        pacienteNome: absenceFilaItem.pacienteNome,
        pacienteId: absenceFilaItem.pacienteId,
        motivo: absenceReason,
        observacaoFalta: absenceObs,
      },
      user,
      modulo: "fila_espera",
    });
    setAbsenceHistory((prev) => ({
      ...prev,
      [absenceFilaItem.pacienteId]: {
        reason: ABSENCE_REASONS.find((r) => r.value === absenceReason)?.label || absenceReason,
        obs: absenceObs,
        date: new Date().toISOString().split("T")[0],
      },
    }));
    toast.success("Falta registrada.");
    setAbsenceModalOpen(false);
    if (absenceWantsReschedule) openRescheduleModal(absenceFilaItem);
  };

  const openRescheduleModal = (f: (typeof fila)[0]) => {
    setRescheduleFilaItem(f);
    setRescheduleSlot({ data: "", hora: "", profissionalId: f.profissionalId || "", unidadeId: f.unidadeId || "" });
    setRescheduleOpen(true);
  };

  const rescheduleDates = useMemo(() => {
    if (!rescheduleSlot.profissionalId || !rescheduleSlot.unidadeId) return [];
    return getAvailableDates(rescheduleSlot.profissionalId, rescheduleSlot.unidadeId, false);
  }, [rescheduleSlot.profissionalId, rescheduleSlot.unidadeId, getAvailableDates]);

  const rescheduleDayInfoMap = useMemo(() => {
    if (!rescheduleSlot.profissionalId || !rescheduleSlot.unidadeId) return {};
    return getDayInfoMap(rescheduleSlot.profissionalId, rescheduleSlot.unidadeId, false);
  }, [rescheduleSlot.profissionalId, rescheduleSlot.unidadeId, getDayInfoMap]);

  const handleRescheduleConfirm = async () => {
    if (
      !rescheduleFilaItem ||
      !rescheduleSlot.data ||
      !rescheduleSlot.hora ||
      !rescheduleSlot.profissionalId ||
      !rescheduleSlot.unidadeId
    ) {
      toast.error("Selecione data e horário disponíveis.");
      return;
    }
    const { data: checkResult } = await supabase.rpc("check_slot_availability", {
      p_profissional_id: rescheduleSlot.profissionalId,
      p_unidade_id: rescheduleSlot.unidadeId,
      p_data: rescheduleSlot.data,
      p_hora: rescheduleSlot.hora,
    });
    const result = checkResult as any;
    if (!result?.available) {
      const reasons: Record<string, string> = {
        date_blocked: "Esta data está bloqueada.",
        no_availability: "Sem disponibilidade configurada.",
        day_full: "Vagas esgotadas para esta data.",
        hour_full: "Vagas esgotadas para este horário.",
      };
      toast.error(reasons[result?.reason] || "Horário indisponível.");
      return;
    }
    const prof = funcionarios.find((fn) => fn.id === rescheduleSlot.profissionalId);
    const pac = pacientes.find((p) => p.id === rescheduleFilaItem.pacienteId);
    const agId = `ag${Date.now()}`;
    const { error } = await supabase.from("agendamentos").insert({
      id: agId,
      paciente_id: rescheduleFilaItem.pacienteId,
      paciente_nome: rescheduleFilaItem.pacienteNome,
      profissional_id: rescheduleSlot.profissionalId,
      profissional_nome: prof?.nome || "",
      unidade_id: rescheduleSlot.unidadeId,
      data: rescheduleSlot.data,
      hora: rescheduleSlot.hora,
      tipo: "Consulta",
      status: "pendente",
      criado_por: user?.id || "sistema",
      origem: "fila_espera",
      sala_id: "",
      setor_id: "",
      observacoes: `Reagendamento da fila de espera`,
      prioridade_perfil: rescheduleFilaItem.prioridade || "normal",
    });
    if (error) {
      toast.error("Erro ao criar agendamento: " + error.message);
      return;
    }
    await updateFila(rescheduleFilaItem.id, { status: "encaixado" });
    await logAction({
      acao: "reagendar",
      entidade: "fila_espera",
      entidadeId: rescheduleFilaItem.id,
      detalhes: {
        pacienteNome: rescheduleFilaItem.pacienteNome,
        novaData: rescheduleSlot.data,
        novaHora: rescheduleSlot.hora,
        profissional: prof?.nome,
        agendamentoId: agId,
      },
      user,
      modulo: "fila_espera",
    });
    const unidade = unidades.find((u) => u.id === rescheduleSlot.unidadeId);
    await notify({
      evento: "reagendamento",
      paciente_nome: rescheduleFilaItem.pacienteNome,
      telefone: pac?.telefone || "",
      email: pac?.email || "",
      data_consulta: rescheduleSlot.data,
      hora_consulta: rescheduleSlot.hora,
      unidade: unidade?.nome || "",
      profissional: prof?.nome || "",
      tipo_atendimento: "Reagendamento",
      status_agendamento: "pendente",
      id_agendamento: agId,
    });
    toast.success(`Reagendamento criado para ${rescheduleSlot.data} às ${rescheduleSlot.hora}!`);
    setRescheduleOpen(false);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Fila de Espera</h1>
          <p className="text-muted-foreground text-sm">
            {aguardandoCount} aguardando {chamadoCount > 0 && `• ${chamadoCount} chamado(s)`}{" "}
            {emAtendimentoCount > 0 && `• ${emAtendimentoCount} em atendimento`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canManage && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setImportForm({
                    nome: "",
                    telefone: "",
                    cpf: "",
                    cns: "",
                    nomeMae: "",
                    email: "",
                    dataNascimento: "",
                    unidadeId: "",
                    profissionalId: "",
                    tipo: "primeira_consulta",
                    dataSolicitacaoOriginal: "",
                    descricaoClinica: "",
                    cid: "",
                    observacoes: "",
                    prioridade: "normal",
                  } as any);
                  setImportDup(null);
                  setImportErrors({});
                  setImportDialogOpen(true);
                }}
              >
                <FileUp className="w-4 h-4 mr-2" />
                Importar Lista Antiga
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setManualSlot({ data: "", hora: "", profissionalId: "", unidadeId: "" });
                  setManualCallDialog(true);
                }}
              >
                <ArrowRight className="w-4 h-4 mr-2" />
                Chamar Próximo da Fila
              </Button>
              <Button onClick={openNew} className="gradient-primary text-primary-foreground">
                <UserPlus className="w-4 h-4 mr-2" />
                Adicionar à Fila
              </Button>
            </>
          )}
        </div>
      </div>

      {activeQueue.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="shadow-card border-0">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-success flex items-center justify-center text-success-foreground font-bold text-sm">
                {greenCount}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Recentes</p>
                <p className="text-xs text-muted-foreground">&lt; 30 min</p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-card border-0">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-warning flex items-center justify-center text-warning-foreground font-bold text-sm">
                {yellowCount}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Atenção</p>
                <p className="text-xs text-muted-foreground">30–60 min</p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-card border-0">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive flex items-center justify-center text-destructive-foreground font-bold text-sm">
                {redCount}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Crítico</p>
                <p className="text-xs text-muted-foreground">&gt; 60 min / Urgente</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Pesquisar paciente pelo nome..."
          className="pl-9"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <Select value={filterUnidade} onValueChange={setFilterUnidade}>
          <SelectTrigger>
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
        <Select value={filterProf} onValueChange={setFilterProf}>
          <SelectTrigger>
            <SelectValue placeholder="Profissional" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Profissionais</SelectItem>
            {profissionais.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
                {p.profissao ? ` — ${p.profissao}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            <SelectItem value="aguardando">Aguardando</SelectItem>
            <SelectItem value="encaixado">Encaixado</SelectItem>
            <SelectItem value="chamado">Chamado</SelectItem>
            <SelectItem value="em_atendimento">Em Atendimento</SelectItem>
            <SelectItem value="atendido">Atendido</SelectItem>
            <SelectItem value="falta">Faltou</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortField} onValueChange={(v) => setSortField(v as any)}>
          <SelectTrigger>
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="prioridade">Prioridade</SelectItem>
            <SelectItem value="tempo">Tempo de espera</SelectItem>
            <SelectItem value="entrada">Data de entrada</SelectItem>
            <SelectItem value="solicitacao">Data solicitação original</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Manual Call Dialog */}
      <Dialog open={manualCallDialog} onOpenChange={setManualCallDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Chamar Próximo da Fila</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Selecione a vaga disponível para chamar o próximo paciente elegível.
          </p>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Unidade *</Label>
                <Select
                  value={manualSlot.unidadeId}
                  onValueChange={(v) =>
                    setManualSlot((p) => ({ ...p, unidadeId: v, profissionalId: "", data: "", hora: "" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {unidadesVisiveis.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Profissional *</Label>
                <Select
                  value={manualSlot.profissionalId}
                  onValueChange={(v) => setManualSlot((p) => ({ ...p, profissionalId: v, data: "", hora: "" }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {profissionais
                      .filter((p) => !manualSlot.unidadeId || p.unidadeId === manualSlot.unidadeId)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome}
                          {p.profissao ? ` — ${p.profissao}` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {manualSlot.profissionalId && manualSlot.unidadeId ? (
              (() => {
                const dates = manualCallDates;
                const dayInfo = manualCallDayInfoMap;
                const slots = manualSlot.data
                  ? getAvailableSlots(manualSlot.profissionalId, manualSlot.unidadeId, manualSlot.data, false)
                  : [];
                return (
                  <>
                    {dates.length === 0 ? (
                      <div className="flex items-center gap-3 p-4 bg-warning/10 rounded-lg">
                        <AlertCircle className="w-5 h-5 text-warning shrink-0" />
                        <p className="text-sm text-warning">
                          Não há datas disponíveis para este profissional nesta unidade.
                        </p>
                      </div>
                    ) : (
                      <div>
                        <Label>Selecione a data *</Label>
                        <div className="mt-2">
                          <CalendarioDisponibilidade
                            availableDates={dates.slice(0, 60)}
                            selectedDate={manualSlot.data}
                            onSelectDate={(d) => setManualSlot((p) => ({ ...p, data: d, hora: "" }))}
                            dayInfoMap={dayInfo}
                            blockToday={false}
                          />
                        </div>
                      </div>
                    )}
                    {manualSlot.data && (
                      <div>
                        <Label>Horário Disponível *</Label>
                        {slots.length === 0 ? (
                          <p className="text-sm text-warning mt-1">Todos os horários desta data estão ocupados.</p>
                        ) : (
                          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-2">
                            {slots.map((slot) => (
                              <Button
                                key={slot}
                                variant={manualSlot.hora === slot ? "default" : "outline"}
                                className={manualSlot.hora === slot ? "gradient-primary text-primary-foreground" : ""}
                                size="sm"
                                onClick={() => setManualSlot((p) => ({ ...p, hora: slot }))}
                              >
                                {slot}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()
            ) : (
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Selecione a unidade e o profissional para ver as datas disponíveis.</span>
              </div>
            )}
            {manualSlot.unidadeId && manualSlot.profissionalId && (
              <div className="p-3 rounded-lg bg-muted/50 text-sm">
                <p className="font-medium flex items-center gap-1">
                  <Users className="w-4 h-4" /> Próximos na fila:
                </p>
                {getNextInQueue(manualSlot.profissionalId, manualSlot.unidadeId)
                  .slice(0, 3)
                  .map((f, i) => (
                    <p key={f.id} className="ml-5 text-muted-foreground">
                      {i + 1}. {f.pacienteNome} ({prioridadeLabel[f.prioridade] || f.prioridade})
                    </p>
                  ))}
                {getNextInQueue(manualSlot.profissionalId, manualSlot.unidadeId).length === 0 && (
                  <p className="ml-5 text-muted-foreground italic">Nenhum paciente na fila</p>
                )}
              </div>
            )}
            <Button
              onClick={handleManualCall}
              disabled={!manualSlot.data || !manualSlot.hora || !manualSlot.profissionalId || !manualSlot.unidadeId}
              className="w-full gradient-primary text-primary-foreground"
            >
              <Bell className="w-4 h-4 mr-2" />
              Chamar Próximo
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editId ? "Editar" : "Adicionar à"} Fila de Espera</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!criarPaciente ? (
              <div>
                <Label>Paciente *</Label>
                <Input
                  value={form.pacienteNome}
                  onChange={(e) => setForm((p) => ({ ...p, pacienteNome: e.target.value, pacienteId: "" }))}
                  placeholder="Buscar paciente pelo nome..."
                />
                {form.pacienteNome.length >= 2 && !form.pacienteId && (
                  <div className="mt-1 max-h-32 overflow-y-auto border rounded-md bg-background">
                    {pacientes
                      .filter((p) => p.nome.toLowerCase().includes(form.pacienteNome.toLowerCase()))
                      .slice(0, 5)
                      .map((p) => (
                        <button
                          key={p.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0"
                          onClick={() => setForm((prev) => ({ ...prev, pacienteNome: p.nome, pacienteId: p.id }))}
                        >
                          <span className="font-medium">{p.nome}</span>
                          <span className="text-muted-foreground ml-2">— {p.telefone}</span>
                        </button>
                      ))}
                    {pacientes.filter((p) => p.nome.toLowerCase().includes(form.pacienteNome.toLowerCase())).length ===
                      0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground italic">Nenhum paciente encontrado</div>
                    )}
                  </div>
                )}
                {!editId && (
                  <Button
                    variant="link"
                    size="sm"
                    className="mt-1 h-auto p-0 text-primary"
                    onClick={() => {
                      setCriarPaciente(true);
                      setNovoPaciente({
                        nome: form.pacienteNome || "",
                        cpf: "",
                        cns: "",
                        nomeMae: "",
                        telefone: "",
                        email: "",
                        dataNascimento: "",
                        endereco: "",
                        descricaoClinica: "",
                        cid: "",
                      });
                      setDuplicataEncontrada(null);
                      setPacienteErrors({});
                    }}
                  >
                    <Plus className="w-3 h-3 mr-1" /> Criar novo paciente
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Novo Paciente</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCriarPaciente(false);
                      setDuplicataEncontrada(null);
                      setPacienteErrors({});
                    }}
                  >
                    Voltar à busca
                  </Button>
                </div>
                {duplicataEncontrada && (
                  <div className="p-3 rounded-lg border border-warning bg-warning/10 text-sm space-y-2">
                    <p className="font-medium text-warning">⚠️ Paciente semelhante encontrado:</p>
                    <p>
                      <strong>{duplicataEncontrada.nome}</strong> — {duplicataEncontrada.telefone} —{" "}
                      {duplicataEncontrada.cpf || "Sem CPF"}
                    </p>
                    <Button size="sm" variant="outline" onClick={() => usarPacienteExistente(duplicataEncontrada)}>
                      Selecionar este paciente
                    </Button>
                  </div>
                )}
                <div>
                  <Label>Nome completo *</Label>
                  <Input
                    value={novoPaciente.nome}
                    onChange={(e) => setNovoPaciente((p) => ({ ...p, nome: e.target.value }))}
                  />
                  {pacienteErrors.nome && <p className="text-xs text-destructive mt-1">{pacienteErrors.nome}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>CPF</Label>
                    <Input
                      value={novoPaciente.cpf}
                      onChange={(e) => setNovoPaciente((p) => ({ ...p, cpf: e.target.value }))}
                      placeholder="000.000.000-00"
                    />
                  </div>
                  <div>
                    <Label>Cartão SUS / CNS</Label>
                    <Input
                      value={novoPaciente.cns}
                      onChange={(e) => setNovoPaciente((p) => ({ ...p, cns: e.target.value }))}
                      placeholder="Nº do cartão SUS"
                    />
                  </div>
                </div>
                <div>
                  <Label>Nome da Mãe</Label>
                  <Input
                    value={novoPaciente.nomeMae}
                    onChange={(e) => setNovoPaciente((p) => ({ ...p, nomeMae: e.target.value }))}
                    placeholder="Nome completo da mãe"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Telefone *</Label>
                    <Input
                      value={novoPaciente.telefone}
                      onChange={(e) => setNovoPaciente((p) => ({ ...p, telefone: e.target.value }))}
                      placeholder="(93) 99999-0000"
                    />
                    {pacienteErrors.telefone && (
                      <p className="text-xs text-destructive mt-1">{pacienteErrors.telefone}</p>
                    )}
                  </div>
                  <div>
                    <Label>E-mail (opcional)</Label>
                    <Input
                      type="email"
                      value={novoPaciente.email}
                      onChange={(e) => setNovoPaciente((p) => ({ ...p, email: e.target.value }))}
                    />
                    {pacienteErrors.email && <p className="text-xs text-destructive mt-1">{pacienteErrors.email}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Data Nasc.</Label>
                    <Input
                      type="date"
                      value={novoPaciente.dataNascimento}
                      onChange={(e) => setNovoPaciente((p) => ({ ...p, dataNascimento: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Endereço</Label>
                    <Input
                      value={novoPaciente.endereco}
                      onChange={(e) => setNovoPaciente((p) => ({ ...p, endereco: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="border-t pt-3 mt-1">
                  <p className="text-sm font-semibold text-foreground mb-2">Informações Clínicas</p>
                  <div className="space-y-3">
                    <div>
                      <Label>Descrição Clínica</Label>
                      <Input
                        value={novoPaciente.descricaoClinica}
                        onChange={(e) => setNovoPaciente((p) => ({ ...p, descricaoClinica: e.target.value }))}
                        placeholder="Ex: dor lombar crônica, avaliação psicológica..."
                      />
                    </div>
                    <div>
                      <Label>CID (opcional)</Label>
                      <Input
                        value={novoPaciente.cid}
                        onChange={(e) => setNovoPaciente((p) => ({ ...p, cid: e.target.value }))}
                        placeholder="Ex: F41.1"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div>
              <Label>Unidade *</Label>
              <Select value={form.unidadeId} onValueChange={(v) => setForm((p) => ({ ...p, unidadeId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {unidadesVisiveis.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Profissional (opcional)</Label>
              <Select
                value={form.profissionalId || "none"}
                onValueChange={(v) => setForm((p) => ({ ...p, profissionalId: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Qualquer</SelectItem>
                  {profissionais.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                      {p.profissao ? ` — ${p.profissao}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={form.prioridade} onValueChange={(v) => setForm((p) => ({ ...p, prioridade: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="gestante">Gestante</SelectItem>
                  <SelectItem value="idoso">Idoso 60+</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                  <SelectItem value="crianca">Criança 0-12</SelectItem>
                  <SelectItem value="pcd">PNE</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observação Geral</Label>
              <Input
                value={form.observacoes}
                onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
                placeholder="Observações administrativas ou complementares..."
              />
            </div>
            <div className="border-t pt-3 mt-1">
              <p className="text-sm font-semibold text-foreground mb-2">Informações Clínicas</p>
              <div className="space-y-3">
                <div>
                  <Label>Descrição Clínica</Label>
                  <Input
                    value={form.descricaoClinica}
                    onChange={(e) => setForm((p) => ({ ...p, descricaoClinica: e.target.value }))}
                    placeholder="Motivo de espera / queixa principal..."
                  />
                </div>
                <div>
                  <Label>CID (opcional)</Label>
                  <Input
                    value={form.cid}
                    onChange={(e) => setForm((p) => ({ ...p, cid: e.target.value }))}
                    placeholder="Ex: F41.1"
                  />
                </div>
              </div>
            </div>
            {criarPaciente ? (
              <Button
                onClick={handleCriarPacienteEAdicionarFila}
                className="w-full gradient-primary text-primary-foreground"
              >
                Cadastrar Paciente e Adicionar à Fila
              </Button>
            ) : (
              <Button onClick={handleSave} className="w-full gradient-primary text-primary-foreground">
                {editId ? "Atualizar" : "Adicionar"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Old List Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <FileUp className="w-5 h-5" /> Importar Lista Antiga (Demanda Reprimida)
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Cadastre pacientes da lista em papel anterior ao sistema. Eles entrarão na fila de espera com a etiqueta
            DEMANDA REPRIMIDA e aparecerão na tela de triagem.
          </p>
          {importDup && (
            <div className="p-3 rounded-lg border border-warning bg-warning/10 text-sm space-y-2">
              <p className="font-medium text-warning flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> Paciente já cadastrado:
              </p>
              <p>
                <strong>{importDup.nome}</strong> — {importDup.telefone} — {importDup.cpf || "Sem CPF"}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    handleImportSave(importDup);
                  }}
                >
                  Usar este e adicionar à fila
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setImportDup(null)}>
                  Corrigir dados
                </Button>
              </div>
            </div>
          )}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nome Completo *</Label>
                <Input
                  value={importForm.nome}
                  onChange={(e) => setImportForm((p) => ({ ...p, nome: e.target.value }))}
                />
                {importErrors.nome && <p className="text-xs text-destructive mt-1">{importErrors.nome}</p>}
              </div>
              <div>
                <Label>Telefone *</Label>
                <Input
                  value={importForm.telefone}
                  onChange={(e) => setImportForm((p) => ({ ...p, telefone: e.target.value }))}
                  placeholder="(93) 99999-0000"
                />
                {importErrors.telefone && <p className="text-xs text-destructive mt-1">{importErrors.telefone}</p>}
              </div>
              <div>
                <Label>CPF (opcional)</Label>
                <Input
                  value={importForm.cpf}
                  onChange={(e) => setImportForm((p) => ({ ...p, cpf: e.target.value }))}
                  placeholder="000.000.000-00"
                />
              </div>
              <div>
                <Label>CNS / Cartão SUS</Label>
                <Input
                  value={importForm.cns}
                  onChange={(e) => setImportForm((p) => ({ ...p, cns: e.target.value }))}
                  placeholder="Nº do Cartão SUS"
                />
              </div>
              <div className="col-span-2">
                <Label>Nome da Mãe</Label>
                <Input
                  value={(importForm as any).nomeMae || ""}
                  onChange={(e) => setImportForm((p) => ({ ...p, nomeMae: e.target.value }) as any)}
                  placeholder="Nome completo da mãe"
                />
              </div>
              <div>
                <Label>E-mail (opcional)</Label>
                <Input
                  type="email"
                  value={importForm.email}
                  onChange={(e) => setImportForm((p) => ({ ...p, email: e.target.value }))}
                />
                {importErrors.email && <p className="text-xs text-destructive mt-1">{importErrors.email}</p>}
              </div>
              <div>
                <Label>Data Nasc.</Label>
                <Input
                  type="date"
                  value={importForm.dataNascimento}
                  onChange={(e) => setImportForm((p) => ({ ...p, dataNascimento: e.target.value }))}
                />
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="text-sm font-semibold text-foreground mb-2">📋 Dados da Fila</p>
              <div className="space-y-3">
                <div>
                  <Label>
                    Data de Solicitação Original *{" "}
                    <span className="text-xs text-muted-foreground">(da ficha de papel)</span>
                  </Label>
                  <Input
                    type="date"
                    value={importForm.dataSolicitacaoOriginal}
                    onChange={(e) => setImportForm((p) => ({ ...p, dataSolicitacaoOriginal: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Unidade *</Label>
                  <Select
                    value={importForm.unidadeId}
                    onValueChange={(v) => setImportForm((p) => ({ ...p, unidadeId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {unidadesVisiveis.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Profissional Desejado</Label>
                  <Select
                    value={importForm.profissionalId || "none"}
                    onValueChange={(v) => setImportForm((p) => ({ ...p, profissionalId: v === "none" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Qualquer</SelectItem>
                      {profissionais.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome}
                          {p.profissao ? ` — ${p.profissao}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tipo</Label>
                    <Select value={importForm.tipo} onValueChange={(v) => setImportForm((p) => ({ ...p, tipo: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="primeira_consulta">Primeira Consulta</SelectItem>
                        <SelectItem value="retorno">Retorno</SelectItem>
                        <SelectItem value="sessao tratamento">Sessão Tratamento</SelectItem>
                        <SelectItem value="urgencia">Urgência</SelectItem>
                        <SelectItem value="procedimento">Procedimento</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Prioridade</Label>
                    <Select
                      value={importForm.prioridade}
                      onValueChange={(v) => setImportForm((p) => ({ ...p, prioridade: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="gestante">Gestante</SelectItem>
                        <SelectItem value="idoso">Idoso 60+</SelectItem>
                        <SelectItem value="urgente">Urgente</SelectItem>
                        <SelectItem value="crianca">Criança 0-12</SelectItem>
                        <SelectItem value="pcd">PNE</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="text-sm font-semibold text-foreground mb-2">🩺 Informações Clínicas</p>
              <div className="space-y-3">
                <div>
                  <Label>Descrição Clínica (opcional)</Label>
                  <Textarea
                    value={importForm.descricaoClinica}
                    onChange={(e) => setImportForm((p) => ({ ...p, descricaoClinica: e.target.value }))}
                    placeholder="Motivo de espera / queixa principal..."
                    rows={2}
                  />
                </div>
                <div>
                  <Label>CID (opcional)</Label>
                  <Input
                    value={importForm.cid}
                    onChange={(e) => setImportForm((p) => ({ ...p, cid: e.target.value }))}
                    placeholder="Ex: F41.1"
                  />
                </div>
                <div>
                  <Label>Observações</Label>
                  <Textarea
                    value={importForm.observacoes}
                    onChange={(e) => setImportForm((p) => ({ ...p, observacoes: e.target.value }))}
                    placeholder="Observações administrativas..."
                    rows={2}
                  />
                </div>
              </div>
            </div>
            <Button
              onClick={() => handleImportSave()}
              className="w-full gradient-primary text-primary-foreground"
              disabled={importSaving}
            >
              {importSaving ? "Importando..." : "Importar para Fila de Espera"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-2">
        {filteredFila.length === 0 ? (
          <Card className="shadow-card border-0">
            <CardContent className="p-8 text-center text-muted-foreground">Fila vazia.</CardContent>
          </Card>
        ) : (
          filteredFila.map((f, i) => {
            const prof = f.profissionalId ? funcionarios.find((fn) => fn.id === f.profissionalId) : null;
            const unidade = unidades.find((u) => u.id === f.unidadeId);
            const reservaTime = getReservaTimeLeft(f.id);
            const isChamado = f.status === "chamado";
            const isActive = ["aguardando", "chamado", "em_atendimento"].includes(f.status);
            const waitMin = getWaitMinutes(f, now);
            const waitColor = getWaitColor(waitMin, f.prioridade);
            return (
              <Card
                key={f.id}
                className={cn(
                  "shadow-card border-0 transition-all",
                  isChamado && "ring-2 ring-primary/30",
                  isActive && waitMin > 60 && "border-l-4 border-l-destructive",
                  isActive && waitMin >= 30 && waitMin <= 60 && "border-l-4 border-l-warning",
                  isActive && waitMin < 30 && f.prioridade !== "urgente" && "border-l-4 border-l-success",
                  isActive && f.prioridade === "urgente" && "border-l-4 border-l-destructive",
                )}
              >
                <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm",
                        isActive ? `${waitColor.bg} ${waitColor.text}` : "gradient-primary text-primary-foreground",
                      )}
                    >
                      {i + 1}
                    </div>
                    {isActive && (
                      <span
                        className={cn(
                          "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                          waitColor.bg,
                          waitColor.text,
                        )}
                      >
                        {formatWaitTime(waitMin)}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground">{f.pacienteNome}</p>
                      {f.origemCadastro === "demanda_reprimida" && (
                        <Badge
                          variant="outline"
                          className="bg-orange-500/10 text-orange-600 border-orange-500/30 text-[10px] px-1.5 py-0"
                        >
                          <FileUp className="w-3 h-3 mr-0.5" /> DEMANDA REPRIMIDA
                        </Badge>
                      )}
                      {isActive && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full",
                            waitColor.bg,
                            waitColor.text,
                          )}
                        >
                          <Clock className="w-3 h-3" />
                          {f.prioridade === "urgente" ? "URGENTE" : `Espera: ${formatWaitTime(waitMin)}`}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {unidade?.nome || f.setor} •{" "}
                      {prof ? `${prof.nome}${prof.profissao ? ` — ${prof.profissao}` : ""}` : "Qualquer profissional"} •
                      Chegou: {f.horaChegada}
                    </p>
                    {absenceHistory[f.pacienteId] && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive cursor-help mt-0.5">
                              <TriangleAlert className="w-3 h-3" /> Falta anterior
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="font-semibold text-sm">Última falta: {absenceHistory[f.pacienteId].date}</p>
                            <p className="text-sm">Motivo: {absenceHistory[f.pacienteId].reason}</p>
                            {absenceHistory[f.pacienteId].obs && (
                              <p className="text-sm text-muted-foreground">{absenceHistory[f.pacienteId].obs}</p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {f.dataSolicitacaoOriginal && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        📅 Solicitação original: {f.dataSolicitacaoOriginal}
                      </p>
                    )}
                    {f.observacoes && <p className="text-xs text-muted-foreground mt-0.5">📋 {f.observacoes}</p>}
                    {f.descricaoClinica && (
                      <p className="text-xs text-muted-foreground mt-0.5">🩺 {f.descricaoClinica}</p>
                    )}
                    {f.cid && <p className="text-xs text-muted-foreground mt-0.5">CID: {f.cid}</p>}
                    {isChamado && reservaTime && !reservaTime.expired && (
                      <div className="flex items-center gap-1 mt-1 text-xs font-medium text-primary">
                        <Timer className="w-3 h-3" />
                        Reserva: {reservaTime.minutes}:{String(reservaTime.seconds).padStart(2, "0")} restantes — Vaga:{" "}
                        {reservaTime.slot.hora} com {reservaTime.slot.profissionalNome}
                      </div>
                    )}
                    {isChamado && reservaTime && reservaTime.expired && (
                      <div className="flex items-center gap-1 mt-1 text-xs font-medium text-destructive">
                        <Timer className="w-3 h-3" />
                        Reserva expirada!
                      </div>
                    )}
                  </div>
                  <ContactActionButton
                    phone={pacientes.find((p) => p.id === f.pacienteId)?.telefone}
                    patientName={f.pacienteNome}
                    unitName={unidade?.nome}
                  />
                  <Badge className={cn("shrink-0", prioridadeColors[f.prioridade] || prioridadeColors.normal)}>
                    {prioridadeLabel[f.prioridade] || f.prioridade}
                  </Badge>
                  <span
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-full font-medium shrink-0",
                      statusLabels[f.status]?.color,
                    )}
                  >
                    {statusLabels[f.status]?.label}
                  </span>
                  {canManage && (
                    <div className="flex gap-1 shrink-0 flex-wrap">
                      {isChamado && reservaTime?.slot && (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-8 bg-success text-success-foreground hover:bg-success/90"
                          onClick={() => confirmarEncaixe(f.id, reservaTime.slot, user)}
                          title="Confirmar Encaixe"
                        >
                          <CheckCircle className="w-4 h-4 mr-1" /> Confirmar
                        </Button>
                      )}
                      {isChamado && reservaTime?.slot && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => expirarReserva(f.id, reservaTime.slot, user)}
                          title="Expirar Reserva / Chamar Próximo"
                        >
                          <ArrowRight className="w-4 h-4 mr-1" /> Próximo
                        </Button>
                      )}
                      {!isChamado && f.status === "aguardando" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          onClick={async () => {
                            await updateFila(f.id, {
                              status: "chamado",
                              horaChamada: new Date().toLocaleTimeString("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              }),
                            });
                            const pac = pacientes.find((p) => p.id === f.pacienteId);
                            const unidadeN = unidades.find((u) => u.id === f.unidadeId);
                            await notify({
                              evento: "fila_chamada",
                              paciente_nome: f.pacienteNome,
                              telefone: pac?.telefone || "",
                              email: pac?.email || "",
                              data_consulta: new Date().toISOString().split("T")[0],
                              hora_consulta: new Date().toLocaleTimeString("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              }),
                              unidade: unidadeN?.nome || "",
                              profissional: prof?.nome || "",
                              tipo_atendimento: "Chamada da Fila",
                              status_agendamento: "chamado",
                              id_agendamento: "",
                            });
                            toast.info("Paciente chamado!");
                          }}
                          title="Chamar"
                        >
                          <Bell className="w-4 h-4" />
                        </Button>
                      )}
                      {f.status !== "encaixado" &&
                        f.status !== "atendido" &&
                        f.status !== "cancelado" &&
                        !isChamado && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8"
                              onClick={() => updateFila(f.id, { status: "em_atendimento" })}
                              title="Iniciar"
                            >
                              <Play className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8"
                              onClick={() => updateFila(f.id, { status: "atendido" })}
                              title="Finalizar"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8"
                              onClick={() => openAbsenceModal(f)}
                              title="Marcar Falta"
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8"
                              onClick={() => openRescheduleModal(f)}
                              title="Reagendar"
                            >
                              <CalendarClock className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => {
                          setDetalheFila(f);
                          setDetalheOpen(true);
                        }}
                        title="Detalhes"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => openEdit(f)} title="Editar">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-8 text-destructive" title="Remover">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover da fila?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja remover {f.pacienteNome} da fila?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={async () => {
                                await removeFromFila(f.id);
                                toast.success("Removido da fila!");
                              }}
                            >
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Absence Modal */}
      <Dialog open={absenceModalOpen} onOpenChange={setAbsenceModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <XCircle className="w-5 h-5 text-destructive" /> Registrar Falta
            </DialogTitle>
          </DialogHeader>
          {absenceFilaItem && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Paciente: <strong>{absenceFilaItem.pacienteNome}</strong>
              </p>
              <div>
                <Label>Motivo da Falta *</Label>
                <Select value={absenceReason} onValueChange={setAbsenceReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {ABSENCE_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea
                  value={absenceObs}
                  onChange={(e) => setAbsenceObs(e.target.value)}
                  placeholder="Detalhes adicionais sobre a falta..."
                  rows={3}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="wantsReschedule"
                  checked={absenceWantsReschedule}
                  onChange={(e) => setAbsenceWantsReschedule(e.target.checked)}
                  className="rounded border-input"
                />
                <Label htmlFor="wantsReschedule" className="cursor-pointer text-sm">
                  Reagendar este paciente após registrar falta
                </Label>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setAbsenceModalOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleAbsenceConfirm}
                >
                  Confirmar Falta
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reschedule Modal */}
      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-primary" /> Reagendar Paciente
            </DialogTitle>
          </DialogHeader>
          {rescheduleFilaItem && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Reagendando <strong>{rescheduleFilaItem.pacienteNome}</strong>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Unidade *</Label>
                  <Select
                    value={rescheduleSlot.unidadeId}
                    onValueChange={(v) =>
                      setRescheduleSlot((p) => ({ ...p, unidadeId: v, profissionalId: "", data: "", hora: "" }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {unidadesVisiveis.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Profissional *</Label>
                  <Select
                    value={rescheduleSlot.profissionalId}
                    onValueChange={(v) => setRescheduleSlot((p) => ({ ...p, profissionalId: v, data: "", hora: "" }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {profissionais
                        .filter((p) => !rescheduleSlot.unidadeId || p.unidadeId === rescheduleSlot.unidadeId)
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nome}
                            {p.profissao ? ` — ${p.profissao}` : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {rescheduleSlot.profissionalId && rescheduleSlot.unidadeId ? (
                (() => {
                  const dates = rescheduleDates;
                  const dayInfo = rescheduleDayInfoMap;
                  const slots = rescheduleSlot.data
                    ? getAvailableSlots(
                        rescheduleSlot.profissionalId,
                        rescheduleSlot.unidadeId,
                        rescheduleSlot.data,
                        false,
                      )
                    : [];
                  return (
                    <>
                      {dates.length === 0 ? (
                        <div className="flex items-center gap-3 p-4 bg-warning/10 rounded-lg">
                          <AlertCircle className="w-5 h-5 text-warning shrink-0" />
                          <p className="text-sm text-warning">Não há datas disponíveis.</p>
                        </div>
                      ) : (
                        <div>
                          <Label>Selecione a data *</Label>
                          <div className="mt-2">
                            <CalendarioDisponibilidade
                              availableDates={dates.slice(0, 60)}
                              selectedDate={rescheduleSlot.data}
                              onSelectDate={(d) => setRescheduleSlot((p) => ({ ...p, data: d, hora: "" }))}
                              dayInfoMap={dayInfo}
                              blockToday={false}
                            />
                          </div>
                        </div>
                      )}
                      {rescheduleSlot.data && (
                        <div>
                          <Label>Horário Disponível *</Label>
                          {slots.length === 0 ? (
                            <div className="flex items-center gap-2 p-3 mt-1 bg-destructive/10 rounded-lg">
                              <AlertCircle className="w-4 h-4 text-destructive" />
                              <p className="text-sm text-destructive font-medium">Vagas esgotadas para esta data.</p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-2">
                              {slots.map((slot) => (
                                <Button
                                  key={slot}
                                  variant={rescheduleSlot.hora === slot ? "default" : "outline"}
                                  className={
                                    rescheduleSlot.hora === slot ? "gradient-primary text-primary-foreground" : ""
                                  }
                                  size="sm"
                                  onClick={() => setRescheduleSlot((p) => ({ ...p, hora: slot }))}
                                >
                                  {slot}
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()
              ) : (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Selecione a unidade e o profissional para ver as datas disponíveis.</span>
                </div>
              )}
              <Button
                onClick={handleRescheduleConfirm}
                disabled={
                  !rescheduleSlot.data ||
                  !rescheduleSlot.hora ||
                  !rescheduleSlot.profissionalId ||
                  !rescheduleSlot.unidadeId
                }
                className="w-full gradient-primary text-primary-foreground"
              >
                <CalendarClock className="w-4 h-4 mr-2" /> Confirmar Reagendamento
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Detalhe Drawer - Fila */}
      <DetalheDrawer open={detalheOpen} onOpenChange={setDetalheOpen} titulo="Detalhes da Fila">
        {detalheFila &&
          (() => {
            const pac = pacientes.find((p) => p.id === detalheFila.pacienteId);
            const prof = detalheFila.profissionalId
              ? funcionarios.find((fn) => fn.id === detalheFila.profissionalId)
              : null;
            const unidade = unidades.find((u) => u.id === detalheFila.unidadeId);
            return (
              <>
                <Secao titulo="Dados do Paciente">
                  <Campo label="Nome" valor={pac?.nome || detalheFila.pacienteNome} />
                  <Campo label="CPF" valor={pac?.cpf} />
                  <Campo label="Telefone" valor={pac?.telefone} />
                  <Campo label="E-mail" valor={pac?.email} hide />
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
                <Secao titulo="Dados da Fila">
                  <Campo label="Posição" valor={detalheFila.posicao} />
                  <div className="flex justify-between items-center py-1">
                    <span className="text-xs text-muted-foreground">Prioridade</span>
                    <StatusBadge
                      label={prioridadeLabel[detalheFila.prioridade] || detalheFila.prioridade}
                      className={prioridadeColors[detalheFila.prioridade]}
                    />
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <StatusBadge
                      label={statusLabels[detalheFila.status]?.label || detalheFila.status}
                      className={statusLabels[detalheFila.status]?.color}
                    />
                  </div>
                  <Campo
                    label="Entrada na fila"
                    valor={detalheFila.criadoEm ? formatarDataHora(detalheFila.criadoEm) : detalheFila.horaChegada}
                  />
                  <Campo label="Solicitação original" valor={detalheFila.dataSolicitacaoOriginal} hide />
                  <Campo label="Hora chamada" valor={detalheFila.horaChamada} hide />
                  <Campo
                    label="Origem"
                    valor={
                      detalheFila.origemCadastro === "demanda_reprimida"
                        ? "Demanda Reprimida"
                        : detalheFila.origemCadastro === "normal"
                          ? "Normal"
                          : detalheFila.origemCadastro
                    }
                    hide
                  />
                </Secao>
                <Secao titulo="Atendimento">
                  <Campo label="Unidade" valor={unidade?.nome} />
                  <Campo
                    label="Profissional"
                    valor={
                      prof ? `${prof.nome}${prof.profissao ? ` — ${prof.profissao}` : ""}` : "Qualquer profissional"
                    }
                  />
                </Secao>
                {(detalheFila.cid || detalheFila.descricaoClinica || detalheFila.observacoes) && (
                  <Secao titulo="Clínico / Observação">
                    <Campo label="CID" valor={detalheFila.cid} hide />
                    <Campo label="Descrição clínica" valor={detalheFila.descricaoClinica} hide />
                    <Campo label="Observações" valor={detalheFila.observacoes} hide />
                  </Secao>
                )}
              </>
            );
          })()}
      </DetalheDrawer>
    </div>
  );
};

export default FilaEspera;
