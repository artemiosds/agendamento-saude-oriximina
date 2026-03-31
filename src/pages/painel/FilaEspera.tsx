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

  const [absenceHistory, setAbsenceHistory] = useState<Record<string, { reason: string; obs: string; date: string }>>({});

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
    especialidadeDestino: "",
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
      toast