import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Plus, FileUp, AlertCircle, CalendarClock, Search, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEnsurePortalAccess } from "@/hooks/useEnsurePortalAccess";
import { useWebhookNotify } from "@/hooks/useWebhookNotify";
import { BuscaPaciente } from "@/components/BuscaPaciente";
import { differenceInMinutes } from "date-fns";

interface Paciente {
  id: string;
  nome: string;
  cpf?: string;
  cns?: string;
  telefone?: string;
  email?: string;
  dataNascimento?: string;
  nomeMae?: string;
  descricaoClinica?: string;
  cid?: string;
  endereco?: string;
  observacoes?: string;
  criadoEm?: string;
}

interface FilaEsperaItem {
  id: string;
  pacienteId: string;
  pacienteNome: string;
  unidadeId: string;
  profissionalId?: string;
  setor?: string;
  prioridade: string;
  status: string;
  posicao?: number;
  horaChegada?: string;
  horaChamada?: string;
  observacoes?: string;
  descricaoClinica?: string;
  cid?: string;
  criadoPor?: string;
  criadoEm?: string;
  dataSolicitacaoOriginal?: string;
  origemCadastro?: string;
  especialidadeDestino?: string;
}

interface SlotInfo {
  data: string;
  hora: string;
  profissionalId: string;
  profissionalNome: string;
  unidadeId: string;
  salaId?: string;
  tipo?: string;
  agendamentoOrigemId?: string;
}

const ABSENCE_REASONS = [
  { label: "Não compareceu", value: "nao_compareceu" },
  { label: "Cancelou", value: "cancelou" },
  { label: "Remarcou", value: "remarcou" },
];

const FilaEspera: React.FC = () => {
  const {
    fila,
    pacientes,
    funcionarios,
    unidades,
    addPaciente,
    updateFila,
    addAgendamento,
    logAction,
    refreshFila,
    refreshAgendamentos,
    getAvailableDates,
    getAvailableSlots,
    getDayInfoMap,
  } = useData();
  const { user, hasPermission } = useAuth();
  const { ensurePortalAccess } = useEnsurePortalAccess();
  const { notify } = useWebhookNotify();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<FilaEsperaItem>>({
    pacienteId: "",
    pacienteNome: "",
    unidadeId: "",
    profissionalId: "",
    setor: "",
    prioridade: "normal",
    status: "aguardando",
    observacoes: "",
    descricaoClinica: "",
    cid: "",
  });
  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState("");
  const [criarPaciente, setCriarPaciente] = useState(false);
  const [novoPaciente, setNovoPaciente] = useState<Partial<Paciente>>({});
  const [pacienteErrors, setPacienteErrors] = useState<Record<string, string>>({});
  const [duplicataEncontrada, setDuplicataEncontrada] = useState<Paciente | null>(null);

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importForm, setImportForm] = useState<any>({});
  const [importDup, setImportDup] = useState<Paciente | null>(null);
  const [importErrors, setImportErrors] = useState<Record<string, string>>({});
  const [importSaving, setImportSaving] = useState(false);

  const [manualCallDialog, setManualCallDialog] = useState(false);
  const [manualSlot, setManualSlot] = useState({ data: "", hora: "", profissionalId: "", unidadeId: "" });

  const [absenceModalOpen, setAbsenceModalOpen] = useState(false);
  const [absenceFilaItem, setAbsenceFilaItem] = useState<FilaEsperaItem | null>(null);
  const [absenceReason, setAbsenceReason] = useState("");
  const [absenceObs, setAbsenceObs] = useState("");
  const [absenceWantsReschedule, setAbsenceWantsReschedule] = useState(false);
  const [absenceHistory, setAbsenceHistory] = useState<Record<string, any>>({});

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleFilaItem, setRescheduleFilaItem] = useState<FilaEsperaItem | null>(null);
  const [rescheduleSlot, setRescheduleSlot] = useState({ data: "", hora: "", profissionalId: "", unidadeId: "" });

  const canManage = hasPermission(["master", "coordenador", "recepcao"]);
  const now = useMemo(() => new Date(), []);

  const aguardandoCount = fila.filter((f) => ["aguardando", "aguardando_triagem"].includes(f.status)).length;
  const chamadoCount = fila.filter((f) => f.status === "chamado").length;
  const emAtendimentoCount = fila.filter((f) => f.status === "em_atendimento").length;

  // ─── CORREÇÃO 1: remover filtro por unidade do usuário ───────────────────────
  // O filtro `item.unidadeId === user?.unidadeId` causava lista vazia quando
  // user.unidadeId estava vazio ou diferente. Agora mostra todos os registros
  // ativos, com filtro opcional por unidade se o usuário tiver unidadeId.
  const filaFiltrada = useMemo(() => {
    return fila
      .filter((item) => {
        // Filtro de busca por nome
        if (busca && !item.pacienteNome.toLowerCase().includes(busca.toLowerCase())) return false;

        // Excluir status finalizados
        if (["encaixado", "falta", "cancelado", "atendido"].includes(item.status)) return false;

        // Se usuário tem unidade definida (coordenador/recepcao), filtra pela unidade
        // Master e roles sem unidadeId veem tudo
        if (user?.unidadeId && user.role !== "master") {
          return item.unidadeId === user.unidadeId;
        }

        return true;
      })
      .sort((a, b) => {
        const priorityOrder: Record<string, number> = {
          urgente: 1,
          gestante: 1,
          idoso: 2,
          alta: 2,
          pcd: 3,
          crianca: 3,
          normal: 4,
        };
        const pA = priorityOrder[a.prioridade] || 99;
        const pB = priorityOrder[b.prioridade] || 99;
        if (pA !== pB) return pA - pB;
        // Ordenar por data de solicitação original (demanda reprimida mais antiga primeiro)
        if (a.dataSolicitacaoOriginal && b.dataSolicitacaoOriginal) {
          return a.dataSolicitacaoOriginal.localeCompare(b.dataSolicitacaoOriginal);
        }
        if (a.dataSolicitacaoOriginal) return -1;
        if (b.dataSolicitacaoOriginal) return 1;
        // Por fim, por hora de chegada/criação
        const timeA = a.criadoEm ? new Date(a.criadoEm).getTime() : 0;
        const timeB = b.criadoEm ? new Date(b.criadoEm).getTime() : 0;
        return timeA - timeB;
      });
  }, [fila, busca, user]);

  const checkDuplicidade = (dados: Partial<Paciente>) => {
    const cpfClean = (dados.cpf || "").replace(/\D/g, "");
    const telClean = (dados.telefone || "").replace(/\D/g, "");
    if (cpfClean.length >= 11) {
      const found = pacientes.find((p: any) => (p.cpf || "").replace(/\D/g, "") === cpfClean);
      if (found) return found;
    }
    if (telClean.length >= 8) {
      const found = pacientes.find((p: any) => (p.telefone || "").replace(/\D/g, "") === telClean);
      if (found) return found;
    }
    return null;
  };

  const validatePacienteFields = (dados: { nome?: string; telefone?: string; email?: string }) => {
    if (!dados.nome?.trim()) return "Nome é obrigatório.";
    return null;
  };

  const handleCreatePaciente = async () => {
    const err = validatePacienteFields({ nome: novoPaciente.nome, telefone: novoPaciente.telefone });
    if (err) {
      toast.error(err);
      return;
    }
    const dup = checkDuplicidade(novoPaciente);
    if (dup) {
      setDuplicataEncontrada(dup as any);
      return;
    }
    const pacienteId = `p${Date.now()}`;
    await addPaciente({
      id: pacienteId,
      nome: novoPaciente.nome || "",
      cpf: novoPaciente.cpf || "",
      cns: novoPaciente.cns || "",
      nomeMae: "",
      telefone: novoPaciente.telefone || "",
      email: novoPaciente.email || "",
      dataNascimento: "",
      endereco: "",
      observacoes: "",
      descricaoClinica: "",
      cid: "",
      criadoEm: new Date().toISOString(),
    });
    setForm((prev) => ({ ...prev, pacienteId, pacienteNome: novoPaciente.nome || "" }));
    setCriarPaciente(false);
    toast.success("Paciente cadastrado!");
  };

  const usarPacienteExistente = (p: any) => {
    setForm((prev) => ({ ...prev, pacienteNome: p.nome, pacienteId: p.id }));
    setCriarPaciente(false);
    setDuplicataEncontrada(null);
    toast.info(`Paciente ${p.nome} selecionado.`);
  };

  const addToFilaWithPatient = async (pacienteId: string, pacienteNome: string, telefone: string, email: string) => {
    if (!form.unidadeId) {
      toast.error("Selecione a unidade.");
      return;
    }
    const newId = `f${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const { error } = await supabase.from("fila_espera" as any).insert({
      id: newId,
      paciente_id: pacienteId,
      paciente_nome: pacienteNome,
      unidade_id: form.unidadeId,
      profissional_id: form.profissionalId || null,
      setor: form.setor || "",
      prioridade: form.prioridade || "normal",
      prioridade_perfil: form.prioridade || "normal",
      status: "aguardando",
      posicao: fila.length + 1,
      hora_chegada: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      criado_por: user?.id || "sistema",
      observacoes: form.observacoes || "",
      descricao_clinica: form.descricaoClinica || "",
      cid: form.cid || "",
      origem_cadastro: "normal",
    });
    if (error) {
      console.error("Erro ao adicionar na fila:", error);
      toast.error("Erro ao adicionar na fila: " + error.message);
      return;
    }
    const unidade = unidades.find((u: any) => u.id === form.unidadeId);
    const prof = form.profissionalId ? funcionarios.find((f: any) => f.id === form.profissionalId) : null;
    ensurePortalAccess({
      pacienteId,
      contexto: "fila",
      unidade: unidade?.nome || "",
      profissional: (prof as any)?.nome || "",
      posicaoFila: fila.length + 1,
    }).catch(() => {});
    await notify({
      evento: "fila_entrada",
      paciente_nome: pacienteNome,
      telefone,
      email,
      data_consulta: new Date().toISOString().split("T")[0],
      hora_consulta: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      unidade: unidade?.nome || "",
      profissional: (prof as any)?.nome || "",
      tipo_atendimento: "Fila de Espera",
      status_agendamento: "aguardando",
      id_agendamento: "",
    });
    await logAction({
      acao: "criar",
      entidade: "fila_espera",
      entidadeId: newId,
      detalhes: { pacienteNome, unidade: unidade?.nome },
      user,
      modulo: "fila_espera",
    });
    toast.success("Paciente adicionado à fila!");
    setDialogOpen(false);
    await refreshFila();
  };

  const handleSave = async () => {
    if (!form.pacienteNome || !form.unidadeId) {
      toast.error("Informe o paciente e a unidade.");
      return;
    }
    if (editId) {
      await updateFila(editId, { ...form } as any);
      toast.success("Registro atualizado!");
      setDialogOpen(false);
      refreshFila();
    } else {
      const pac = pacientes.find((p: any) => p.id === form.pacienteId) as any;
      await addToFilaWithPatient(form.pacienteId || "", form.pacienteNome || "", pac?.telefone || "", pac?.email || "");
    }
  };

  const checkImportDuplicidade = (dados: any) => {
    const cpfClean = (dados.cpf || "").replace(/\D/g, "");
    const telClean = (dados.telefone || "").replace(/\D/g, "");
    if (cpfClean.length >= 11) {
      const found = pacientes.find((p: any) => (p.cpf || "").replace(/\D/g, "") === cpfClean);
      if (found) return found;
    }
    if (telClean.length >= 8) {
      const found = pacientes.find((p: any) => (p.telefone || "").replace(/\D/g, "") === telClean);
      if (found) return found;
    }
    if (dados.nome?.trim() && dados.dataNascimento) {
      const found = pacientes.find(
        (p: any) =>
          p.nome?.toLowerCase().trim() === dados.nome.toLowerCase().trim() && p.dataNascimento === dados.dataNascimento,
      );
      if (found) return found;
    }
    return null;
  };

  // ─── CORREÇÃO 2: handleImportSave com campos snake_case corretos ─────────────
  const handleImportSave = async (existingPatient?: any) => {
    if (!importForm.nome?.trim() && !existingPatient) {
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
        telefone = existingPatient.telefone || "";
        email = existingPatient.email || "";
      } else {
        const dup = checkImportDuplicidade(importForm);
        if (dup && !importDup) {
          setImportDup(dup as any);
          setImportSaving(false);
          return;
        }

        const err = validatePacienteFields({ nome: importForm.nome, telefone: importForm.telefone });
        if (err) {
          toast.error(err);
          setImportSaving(false);
          return;
        }

        pacienteId = `p${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        pacienteNome = importForm.nome.trim();
        telefone = importForm.telefone || "";
        email = importForm.email || "";

        // Inserir paciente
        const { error: pacError } = await supabase.from("pacientes" as any).insert({
          id: pacienteId,
          nome: pacienteNome,
          cpf: importForm.cpf || "",
          cns: importForm.cns || "",
          nome_mae: importForm.nomeMae || "",
          telefone,
          email,
          data_nascimento: importForm.dataNascimento || "",
          endereco: "",
          observacoes: importForm.observacoes || "",
          descricao_clinica: importForm.descricaoClinica || "",
          cid: importForm.cid || "",
          criado_em: new Date().toISOString(),
        });

        if (pacError) {
          console.error("Erro ao cadastrar paciente:", pacError);
          toast.error("Erro ao cadastrar paciente: " + pacError.message);
          setImportSaving(false);
          return;
        }

        await logAction({
          acao: "criar",
          entidade: "paciente",
          entidadeId: pacienteId,
          detalhes: {
            nome: pacienteNome,
            origem: "demanda_reprimida",
            dataSolicitacaoOriginal: importForm.dataSolicitacaoOriginal,
          },
          user,
        });
      }

      // Normalizar data para YYYY-MM-DD
      let sortableDate = importForm.dataSolicitacaoOriginal;
      const parts = sortableDate.split("/");
      if (parts.length === 3 && parts[0].length <= 2) {
        sortableDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      }

      const newFilaId = `f${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

      // ── CORREÇÃO PRINCIPAL: todos os campos em snake_case ──────────────────
      const { error: filaError } = await supabase.from("fila_espera" as any).insert({
        id: newFilaId,
        paciente_id: pacienteId,
        paciente_nome: pacienteNome,
        unidade_id: importForm.unidadeId,
        profissional_id: importForm.profissionalId || null,
        setor: "",
        prioridade: importForm.prioridade || "normal",
        prioridade_perfil: importForm.prioridade || "normal",
        status: "aguardando", // ← status correto para aparecer na lista
        posicao: fila.length + 1,
        hora_chegada: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        criado_por: user?.id || "sistema",
        observacoes: importForm.observacoes || "",
        descricao_clinica: importForm.descricaoClinica || "", // ← snake_case correto
        cid: importForm.cid || "",
        data_solicitacao_original: sortableDate, // ← snake_case correto
        origem_cadastro: "demanda_reprimida",
        especialidade_destino:
          importForm.especialidadeDestino || importForm.profissionalId
            ? (funcionarios.find((f: any) => f.id === importForm.profissionalId) as any)?.profissao || ""
            : "",
      });

      if (filaError) {
        console.error("Erro ao inserir na fila:", filaError);
        toast.error("Erro ao adicionar na fila: " + filaError.message);
        setImportSaving(false);
        return;
      }

      const unidade = unidades.find((u: any) => u.id === importForm.unidadeId);
      const prof = importForm.profissionalId
        ? (funcionarios.find((f: any) => f.id === importForm.profissionalId) as any)
        : null;

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
          tipo_atendimento: "Demanda Reprimida",
          status_agendamento: "aguardando",
          id_agendamento: "",
        });
      }

      await logAction({
        acao: "criar",
        entidade: "fila_espera",
        entidadeId: newFilaId,
        detalhes: {
          pacienteNome,
          unidade: unidade?.nome,
          origemCadastro: "demanda_reprimida",
          dataSolicitacaoOriginal: sortableDate,
        },
        user,
        modulo: "fila_espera",
      });

      toast.success(`✅ ${pacienteNome} importado com sucesso para a fila de espera!`);
      setImportDialogOpen(false);
      setImportDup(null);
      setImportErrors({});
      setImportForm({});
      await refreshFila();
    } catch (error: any) {
      console.error("Erro ao importar:", error);
      toast.error("Erro ao importar: " + (error?.message || "Tente novamente."));
    } finally {
      setImportSaving(false);
    }
  };

  const getNextInQueue = useCallback(
    (profissionalId: string, unidadeId: string) => {
      const priorityRank: Record<string, number> = {
        urgente: 0,
        gestante: 1,
        idoso: 2,
        alta: 3,
        pcd: 4,
        crianca: 5,
        normal: 6,
      };
      return [...fila]
        .filter(
          (f) =>
            f.status === "aguardando" &&
            f.unidadeId === unidadeId &&
            (!f.profissionalId || f.profissionalId === profissionalId),
        )
        .sort((a, b) => {
          const aRank = priorityRank[a.prioridade] ?? 99;
          const bRank = priorityRank[b.prioridade] ?? 99;
          if (aRank !== bRank) return aRank - bRank;
          if (a.dataSolicitacaoOriginal && b.dataSolicitacaoOriginal)
            return a.dataSolicitacaoOriginal.localeCompare(b.dataSolicitacaoOriginal);
          if (a.dataSolicitacaoOriginal) return -1;
          if (b.dataSolicitacaoOriginal) return 1;
          return (a.criadoEm || "").localeCompare(b.criadoEm || "");
        });
    },
    [fila],
  );

  const chamarProximoDaFila = useCallback(
    async (slot: SlotInfo, callingUser?: any): Promise<boolean> => {
      const candidates = getNextInQueue(slot.profissionalId, slot.unidadeId);
      if (candidates.length === 0) {
        toast.info("Nenhum paciente aguardando na fila.");
        return false;
      }
      const next = candidates[0];
      const pac = pacientes.find((p: any) => p.id === next.pacienteId) as any;
      const unidade = unidades.find((u: any) => u.id === slot.unidadeId) as any;
      const prof = funcionarios.find((f: any) => f.id === slot.profissionalId) as any;
      const horaChamada = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      await updateFila(next.id, { status: "chamado", horaChamada } as any);
      await logAction({
        acao: "fila_vaga_liberada",
        entidade: "fila_espera",
        entidadeId: next.id,
        user,
        unidadeId: slot.unidadeId,
        detalhes: {
          pacienteNome: next.pacienteNome,
          profissionalNome: slot.profissionalNome,
          data: slot.data,
          hora: slot.hora,
        },
      });
      await notify({
        evento: "vaga_liberada",
        paciente_nome: next.pacienteNome,
        telefone: pac?.telefone || "",
        email: pac?.email || "",
        data_consulta: slot.data,
        hora_consulta: slot.hora,
        unidade: unidade?.nome || "",
        profissional: prof?.nome || slot.profissionalNome,
        tipo_atendimento: slot.tipo || "Consulta",
        status_agendamento: "aguardando",
        id_agendamento: slot.agendamentoOrigemId || "",
        observacoes: "Vaga disponível. Confirme em até 30 minutos.",
      });
      toast.info(`Vaga notificada para ${next.pacienteNome}.`);
      return true;
    },
    [getNextInQueue, pacientes, unidades, funcionarios, updateFila, logAction, notify],
  );

  const confirmarEncaixe = useCallback(
    async (filaId: string, slot: SlotInfo, callingUser?: any) => {
      const filaItem = fila.find((f) => f.id === filaId);
      if (!filaItem) return;
      const agId = `ag${Date.now()}`;
      await addAgendamento({
        id: agId,
        pacienteId: filaItem.pacienteId,
        pacienteNome: filaItem.pacienteNome,
        unidadeId: slot.unidadeId,
        salaId: slot.salaId || "",
        setorId: "",
        profissionalId: slot.profissionalId,
        profissionalNome: slot.profissionalNome,
        data: slot.data,
        hora: slot.hora,
        status: "confirmado",
        tipo: slot.tipo || "Consulta",
        observacoes: "Encaixe da fila de espera",
        origem: "recepcao",
        criadoEm: new Date().toISOString(),
        criadoPor: user?.id || "sistema",
      });
      await updateFila(filaId, { status: "encaixado" } as any);
      toast.success(`${filaItem.pacienteNome} encaixado na agenda!`);
      refreshAgendamentos();
      refreshFila();
    },
    [fila, addAgendamento, updateFila, refreshAgendamentos, refreshFila, user],
  );

  const openAbsenceModal = (f: FilaEsperaItem) => {
    setAbsenceFilaItem(f);
    setAbsenceReason("");
    setAbsenceObs("");
    setAbsenceWantsReschedule(false);
    setAbsenceModalOpen(true);
  };

  const handleAbsenceConfirm = async () => {
    if (!absenceFilaItem) return;
    if (!absenceReason) {
      toast.error("Selecione o motivo.");
      return;
    }
    await updateFila(absenceFilaItem.id, { status: "falta" } as any);
    toast.success("Falta registrada.");
    setAbsenceModalOpen(false);
    refreshFila();
  };

  const openRescheduleModal = (f: FilaEsperaItem) => {
    setRescheduleFilaItem(f);
    setRescheduleSlot({ data: "", hora: "", profissionalId: f.profissionalId || "", unidadeId: f.unidadeId || "" });
    setRescheduleOpen(true);
  };

  const manualCallDates = useMemo(() => {
    if (!manualSlot.profissionalId || !manualSlot.unidadeId) return [];
    return (getAvailableDates as any)(manualSlot.profissionalId, manualSlot.unidadeId, false);
  }, [manualSlot.profissionalId, manualSlot.unidadeId, getAvailableDates]);

  const manualCallSlots = useMemo(() => {
    if (!manualSlot.profissionalId || !manualSlot.unidadeId || !manualSlot.data) return [];
    return (getAvailableSlots as any)(manualSlot.profissionalId, manualSlot.unidadeId, manualSlot.data, false);
  }, [manualSlot.profissionalId, manualSlot.unidadeId, manualSlot.data, getAvailableSlots]);

  const handleManualCall = async () => {
    if (!manualSlot.hora || !manualSlot.profissionalId || !manualSlot.unidadeId) {
      toast.error("Preencha todos os campos.");
      return;
    }
    const prof = funcionarios.find((f: any) => f.id === manualSlot.profissionalId) as any;
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

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Fila de Espera</h1>
          <p className="text-muted-foreground text-sm">
            {aguardandoCount} aguardando
            {chamadoCount > 0 && ` • ${chamadoCount} chamado(s)`}
            {emAtendimentoCount > 0 && ` • ${emAtendimentoCount} em atendimento`}
            {" • "}
            <span className="text-xs text-muted-foreground">({filaFiltrada.length} exibidos)</span>
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
                    unidadeId: user?.unidadeId || "",
                    profissionalId: "",
                    tipo: "primeira_consulta",
                    dataSolicitacaoOriginal: "",
                    descricaoClinica: "",
                    cid: "",
                    observacoes: "",
                    prioridade: "normal",
                    especialidadeDestino: "",
                  });
                  setImportDup(null);
                  setImportErrors({});
                  setImportDialogOpen(true);
                }}
              >
                <FileUp className="w-4 h-4 mr-2" /> Importar Lista Antiga
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setManualSlot({ data: "", hora: "", profissionalId: "", unidadeId: user?.unidadeId || "" });
                  setManualCallDialog(true);
                }}
              >
                Chamar Manualmente
              </Button>
            </>
          )}
          <Button
            onClick={() => {
              setEditId(null);
              setForm({
                pacienteId: "",
                pacienteNome: "",
                unidadeId: user?.unidadeId || "",
                profissionalId: "",
                setor: "",
                prioridade: "normal",
                status: "aguardando",
                observacoes: "",
                descricaoClinica: "",
                cid: "",
              });
              setCriarPaciente(false);
              setDialogOpen(true);
            }}
            className="gradient-primary text-primary-foreground"
          >
            <Plus className="w-4 h-4 mr-2" /> Novo na Fila
          </Button>
        </div>
      </div>

      {/* Busca */}
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="Buscar paciente por nome..."
            value={buscaInput}
            onChange={(e) => setBuscaInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setBusca(buscaInput.trim());
            }}
          />
        </div>
        <Button variant="outline" onClick={() => setBusca(buscaInput.trim())}>
          <Search className="w-4 h-4" />
        </Button>
        {busca && (
          <Button
            variant="ghost"
            onClick={() => {
              setBusca("");
              setBuscaInput("");
            }}
          >
            ✕
          </Button>
        )}
      </div>

      {/* Lista */}
      {filaFiltrada.length === 0 ? (
        <Card className="shadow-card border-0">
          <CardContent className="p-8 text-center text-muted-foreground">
            {busca.trim()
              ? `Nenhum paciente encontrado para "${busca}".`
              : aguardandoCount > 0
                ? `Há ${aguardandoCount} paciente(s) na fila mas em outras unidades ou com status diferente.`
                : "Nenhum paciente aguardando na fila no momento."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filaFiltrada.map((item) => {
            const waitMinutes = item.criadoEm ? differenceInMinutes(now, new Date(item.criadoEm)) : 0;
            const waitLabel =
              waitMinutes >= 60 ? `${Math.floor(waitMinutes / 60)}h${waitMinutes % 60}min` : `${waitMinutes}min`;
            const isDemanda = item.origemCadastro === "demanda_reprimida";
            const unidade = unidades.find((u: any) => u.id === item.unidadeId) as any;
            const prof = item.profissionalId
              ? (funcionarios.find((f: any) => f.id === item.profissionalId) as any)
              : null;

            return (
              <Card key={item.id} className="shadow-card border-0">
                <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="flex flex-col items-center shrink-0 w-16">
                    <span className="text-sm font-mono font-bold text-primary">{item.horaChegada}</span>
                    {isDemanda && (
                      <Badge
                        variant="outline"
                        className="text-[9px] bg-orange-50 text-orange-600 border-orange-200 mt-0.5"
                      >
                        DEMANDA
                      </Badge>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{item.pacienteNome}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {unidade?.nome}
                      {prof ? ` • ${prof.nome}` : ""}
                      {item.dataSolicitacaoOriginal && ` • Solic. ${item.dataSolicitacaoOriginal}`}
                    </p>
                    {item.descricaoClinica && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">🩺 {item.descricaoClinica}</p>
                    )}
                    {item.cid && <p className="text-xs text-muted-foreground">CID: {item.cid}</p>}
                    {item.especialidadeDestino && (
                      <Badge variant="outline" className="text-[10px] border-primary/30 text-primary mt-0.5">
                        {item.especialidadeDestino.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <Badge
                      variant="outline"
                      className={`text-xs ${item.prioridade === "urgente" ? "border-destructive text-destructive" : item.prioridade === "alta" ? "border-warning text-warning" : ""}`}
                    >
                      {item.prioridade}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      <Clock className="w-3 h-3 mr-1" /> {waitLabel}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {item.status}
                    </Badge>
                    {canManage && item.status === "aguardando" && (
                      <Button size="sm" variant="outline" onClick={() => openAbsenceModal(item as any)}>
                        Falta
                      </Button>
                    )}
                    {canManage && item.status === "aguardando" && (
                      <Button size="sm" variant="outline" onClick={() => openRescheduleModal(item as any)}>
                        Reagendar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog Adicionar à Fila */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar" : "Novo Paciente na"} Fila</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!criarPaciente ? (
              <div className="space-y-2">
                <Label>Paciente *</Label>
                <BuscaPaciente
                  pacientes={pacientes}
                  value={form.pacienteId}
                  onChange={(id) => {
                    const p = pacientes.find((px: any) => px.id === id) as any;
                    setForm((prev) => ({ ...prev, pacienteId: id, pacienteNome: p?.nome || "" }));
                  }}
                />
                <Button
                  variant="link"
                  size="sm"
                  className="p-0 h-auto"
                  onClick={() => {
                    setCriarPaciente(true);
                    setNovoPaciente({});
                  }}
                >
                  <Plus className="w-3 h-3 mr-1" /> Criar novo paciente
                </Button>
              </div>
            ) : (
              <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
                <div className="flex justify-between items-center">
                  <Label className="font-semibold">Novo Paciente</Label>
                  <Button variant="ghost" size="sm" onClick={() => setCriarPaciente(false)}>
                    Voltar
                  </Button>
                </div>
                <Input
                  placeholder="Nome completo *"
                  value={novoPaciente.nome || ""}
                  onChange={(e) => setNovoPaciente((p) => ({ ...p, nome: e.target.value }))}
                />
                <Input
                  placeholder="Telefone"
                  value={novoPaciente.telefone || ""}
                  onChange={(e) => setNovoPaciente((p) => ({ ...p, telefone: e.target.value }))}
                />
                <Input
                  placeholder="E-mail (opcional)"
                  value={novoPaciente.email || ""}
                  onChange={(e) => setNovoPaciente((p) => ({ ...p, email: e.target.value }))}
                />
                <Button className="w-full" onClick={handleCreatePaciente}>
                  Salvar Paciente
                </Button>
                {duplicataEncontrada && (
                  <div className="p-3 rounded-lg border border-warning bg-warning/10 text-sm space-y-2">
                    <p className="font-medium text-warning">
                      ⚠️ Paciente semelhante: <strong>{(duplicataEncontrada as any).nome}</strong>
                    </p>
                    <Button size="sm" variant="outline" onClick={() => usarPacienteExistente(duplicataEncontrada)}>
                      Usar este paciente
                    </Button>
                  </div>
                )}
              </div>
            )}
            <div>
              <Label>Unidade *</Label>
              <Select value={form.unidadeId} onValueChange={(v) => setForm((p) => ({ ...p, unidadeId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {unidades.map((u: any) => (
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
                  <SelectValue placeholder="Qualquer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Qualquer profissional</SelectItem>
                  {funcionarios.map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                      {f.profissao ? ` — ${f.profissao}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select
                value={form.prioridade || "normal"}
                onValueChange={(v) => setForm((p) => ({ ...p, prioridade: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                  <SelectItem value="idoso">Idoso 60+</SelectItem>
                  <SelectItem value="gestante">Gestante</SelectItem>
                  <SelectItem value="pcd">PCD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                value={form.observacoes || ""}
                onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
              />
            </div>
            <Button onClick={handleSave} className="w-full gradient-primary text-primary-foreground">
              {editId ? "Atualizar" : "Adicionar à Fila"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Importar Lista Antiga */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="w-5 h-5" /> Importar Lista Antiga (Demanda Reprimida)
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Cadastre pacientes da lista em papel. Eles aparecerão na fila de espera com etiqueta DEMANDA.
          </p>

          {importDup && (
            <div className="p-3 rounded-lg border border-warning bg-warning/10 text-sm space-y-2">
              <p className="font-medium text-warning">
                ⚠️ Paciente já cadastrado: <strong>{importDup.nome}</strong>
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleImportSave(importDup)}>
                  Usar este e adicionar à fila
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setImportDup(null)}>
                  Corrigir dados
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <Label>Nome Completo *</Label>
              <Input
                value={importForm.nome || ""}
                onChange={(e) => setImportForm((p: any) => ({ ...p, nome: e.target.value }))}
              />
              {importErrors.nome && <p className="text-xs text-destructive mt-1">{importErrors.nome}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Telefone *</Label>
                <Input
                  value={importForm.telefone || ""}
                  onChange={(e) => setImportForm((p: any) => ({ ...p, telefone: e.target.value }))}
                  placeholder="(93) 99999-0000"
                />
              </div>
              <div>
                <Label>CPF (opcional)</Label>
                <Input
                  value={importForm.cpf || ""}
                  onChange={(e) => setImportForm((p: any) => ({ ...p, cpf: e.target.value }))}
                  placeholder="000.000.000-00"
                />
              </div>
              <div>
                <Label>CNS / Cartão SUS</Label>
                <Input
                  value={importForm.cns || ""}
                  onChange={(e) => setImportForm((p: any) => ({ ...p, cns: e.target.value }))}
                />
              </div>
              <div>
                <Label>Data Nasc.</Label>
                <Input
                  type="date"
                  value={importForm.dataNascimento || ""}
                  onChange={(e) => setImportForm((p: any) => ({ ...p, dataNascimento: e.target.value }))}
                />
              </div>
              <div>
                <Label>E-mail (opcional)</Label>
                <Input
                  value={importForm.email || ""}
                  onChange={(e) => setImportForm((p: any) => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div>
                <Label>Data Solicitação Original *</Label>
                <Input
                  type="date"
                  value={importForm.dataSolicitacaoOriginal || ""}
                  onChange={(e) => setImportForm((p: any) => ({ ...p, dataSolicitacaoOriginal: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Unidade *</Label>
              <Select
                value={importForm.unidadeId || ""}
                onValueChange={(v) => setImportForm((p: any) => ({ ...p, unidadeId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {unidades.map((u: any) => (
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
                value={importForm.profissionalId || "none"}
                onValueChange={(v) => setImportForm((p: any) => ({ ...p, profissionalId: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Qualquer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Qualquer profissional</SelectItem>
                  {funcionarios.map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                      {f.profissao ? ` — ${f.profissao}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select
                value={importForm.prioridade || "normal"}
                onValueChange={(v) => setImportForm((p: any) => ({ ...p, prioridade: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="idoso">Idoso 60+</SelectItem>
                  <SelectItem value="pcd">PCD / Autismo</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                  <SelectItem value="gestante">Gestante</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descrição Clínica</Label>
              <Textarea
                value={importForm.descricaoClinica || ""}
                onChange={(e) => setImportForm((p: any) => ({ ...p, descricaoClinica: e.target.value }))}
                rows={2}
                placeholder="Motivo, queixa principal..."
              />
            </div>
            <div>
              <Label>CID (opcional)</Label>
              <Input
                value={importForm.cid || ""}
                onChange={(e) => setImportForm((p: any) => ({ ...p, cid: e.target.value }))}
                placeholder="Ex: G80.0"
              />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                value={importForm.observacoes || ""}
                onChange={(e) => setImportForm((p: any) => ({ ...p, observacoes: e.target.value }))}
                rows={2}
              />
            </div>
            <Button
              onClick={() => handleImportSave()}
              className="w-full gradient-primary text-primary-foreground"
              disabled={importSaving}
            >
              {importSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Importar para Fila de Espera
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Chamar Manualmente */}
      <Dialog open={manualCallDialog} onOpenChange={setManualCallDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chamar Próximo da Fila</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
                  {unidades.map((u: any) => (
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
                  {funcionarios
                    .filter((f: any) => !manualSlot.unidadeId || f.unidadeId === manualSlot.unidadeId)
                    .map((f: any) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {manualSlot.profissionalId && manualSlot.unidadeId && (
              <>
                <div>
                  <Label>Data *</Label>
                  <Select
                    value={manualSlot.data}
                    onValueChange={(v) => setManualSlot((p) => ({ ...p, data: v, hora: "" }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {manualCallDates.map((d: string) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {manualSlot.data && (
                  <div>
                    <Label>Horário *</Label>
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      {manualCallSlots.map((slot: string) => (
                        <Button
                          key={slot}
                          size="sm"
                          variant={manualSlot.hora === slot ? "default" : "outline"}
                          className={manualSlot.hora === slot ? "gradient-primary text-primary-foreground" : ""}
                          onClick={() => setManualSlot((p) => ({ ...p, hora: slot }))}
                        >
                          {slot}
                        </Button>
                      ))}
                      {manualCallSlots.length === 0 && (
                        <p className="col-span-4 text-sm text-muted-foreground">Sem horários disponíveis.</p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
            <Button
              onClick={handleManualCall}
              disabled={!manualSlot.hora || !manualSlot.profissionalId || !manualSlot.unidadeId}
              className="w-full gradient-primary text-primary-foreground"
            >
              Chamar Próximo
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Falta */}
      <Dialog open={absenceModalOpen} onOpenChange={setAbsenceModalOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar Falta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paciente: <strong>{absenceFilaItem?.pacienteNome}</strong>
            </p>
            <div>
              <Label>Motivo *</Label>
              <Select value={absenceReason} onValueChange={setAbsenceReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
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
              <Textarea value={absenceObs} onChange={(e) => setAbsenceObs(e.target.value)} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="reschedule"
                checked={absenceWantsReschedule}
                onChange={(e) => setAbsenceWantsReschedule(e.target.checked)}
              />
              <label htmlFor="reschedule" className="text-sm cursor-pointer">
                Reagendar após registrar
              </label>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setAbsenceModalOpen(false)}>
                Cancelar
              </Button>
              <Button className="flex-1 bg-destructive text-destructive-foreground" onClick={handleAbsenceConfirm}>
                Confirmar Falta
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FilaEspera;
