import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useWebhookNotify } from "@/hooks/useWebhookNotify";
import { useEnsurePortalAccess } from "@/hooks/useEnsurePortalAccess";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Phone, Mail, Pencil, Trash2, FileDown, Users, Clock, FileUp, Eye, FileText, Printer, Loader2 } from "lucide-react";
import ContactActionButton from "@/components/ContactActionButton";
import DetalheDrawer, { Secao, Campo, calcularIdade, formatarData } from "@/components/DetalheDrawer";
import PacienteDetalheModal, { PSecao, PCampo, AlergiasBlock, formatCPF, formatCNS, formatTelefoneBR, formatarDataBR } from "@/components/PacienteDetalheModal";
import { useCustomFields } from "@/hooks/useCustomFields";
import { toast } from "sonner";
import { validatePacienteFields } from "@/lib/validation";
import { supabase } from "@/integrations/supabase/client";
import ImportarPacientesCSV from "@/components/ImportarPacientesCSV";
import { useUnidadeFilter } from "@/hooks/useUnidadeFilter";
import { useNavigate } from "react-router-dom";
import CadastroPacienteForm, { PacienteFormData, emptyPacienteForm } from "@/components/CadastroPacienteForm";
import { FichaImpressao, FichaPrintMode } from '@/components/FichaImpressao';
import "@/styles/ficha-impressao.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries/queryKeys";

interface FichaDados {
  paciente: {
    nome_completo: string;
    cpf: string;
    cns: string;
    data_nascimento: string;
    nome_mae: string;
    telefone: string;
  };
  dadosClinicos: {
    numero_prontuario: string;
    cid: string;
    tipo_atendimento: string;
    unidade_origem: string;
    unidade_atendimento: string;
    data_atendimento: string;
  };
  sinaisVitais: {
    pressao_arterial: string;
    frequencia_cardiaca: string;
    temperatura: string;
    saturacao: string;
    peso: string;
    altura: string;
  };
  profissional: {
    nome: string;
    cargo: string;
    registro: string;
  };
  evoluciones: Array<{
    data: string;
    observacao: string;
    profissional: string;
  }>;
}

const Pacientes: React.FC = () => {
  const navigate = useNavigate();
  const {
    pacientes,
    addPaciente,
    updatePaciente,
    agendamentos,
    fila,
    addToFila,
    unidades,
    funcionarios,
    logAction,
    refreshPacientes,
    refreshFila,
  } = useData();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { notify } = useWebhookNotify();
  const { ensurePortalAccess } = useEnsurePortalAccess();
  const { can } = usePermissions();
  const isProfissional = user?.role === "profissional";
  const canDelete = can("pacientes", "can_delete");
  const canImportCSV = can("pacientes", "can_create");
  const canAddToFila = can("fila", "can_create");
  const canCreate = can("pacientes", "can_create");
  const canEdit = can("pacientes", "can_edit");
  const { unidadesVisiveis, profissionaisVisiveis } = useUnidadeFilter();
  const profissionais = profissionaisVisiveis;
  const { getNativeLabel: L } = useCustomFields('paciente', user?.unidadeId);
  const funcionarioLogado = useMemo(
    () => funcionarios.find((f) => f.id === user?.id || f.authUserId === user?.authUserId || f.usuario === user?.usuario),
    [funcionarios, user],
  );
  const unidadeIdFuncionario = funcionarioLogado?.unidadeId || user?.unidadeId || "";
  const isGlobalAdminUser = user?.usuario === "admin.sms";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const PAGE_SIZE = 50;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search);
      setVisibleCount(PAGE_SIZE); // reset pagination on search
    }, 300);
    return () => window.clearTimeout(t);
  }, [search]);
  const [importOpen, setImportOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<PacienteFormData>(emptyPacienteForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [detalheOpen, setDetalheOpen] = useState(false);
  const [detalhePaciente, setDetalhePaciente] = useState<(typeof pacientes)[0] | null>(null);

  // Print ficha state
  const [fichaOpen, setFichaOpen] = useState(false);
  const [fichaLoading, setFichaLoading] = useState(false);
  const [fichaData, setFichaData] = useState<FichaDados | null>(null);
  const [fichaPrintMode, setFichaPrintMode] = useState<FichaPrintMode>('completa');

  // Filter state
  const [filterFila, setFilterFila] = useState("all");
  const [sortBy, setSortBy] = useState("nome");

  // Reset pagination when filter/sort changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filterFila, sortBy]);

  // Fila dialog
  const [filaDialogOpen, setFilaDialogOpen] = useState(false);
  const [filaPaciente, setFilaPaciente] = useState<(typeof pacientes)[0] | null>(null);
  const [filaForm, setFilaForm] = useState({
    unidadeId: "",
    profissionalId: "",
    prioridade: "normal",
    observacoes: "",
    descricaoClinica: "",
    cid: "",
  });
  const [savingFila, setSavingFila] = useState(false);

  // Set of patient IDs currently in active queue
  const pacientesNaFila = useMemo(() => {
    const activeStatuses = ["aguardando", "chamado", "em_atendimento", "encaixado"];
    return new Set(fila.filter((f) => activeStatuses.includes(f.status)).map((f) => f.pacienteId));
  }, [fila]);

  // Set of patient IDs from demanda reprimida
  const pacientesDemandaReprimida = useMemo(() => {
    return new Set(fila.filter((f) => f.origemCadastro === "demanda_reprimida").map((f) => f.pacienteId));
  }, [fila]);

  // Get fila entry for a patient (for sorting)
  const filaEntryMap = useMemo(() => {
    const map = new Map<string, (typeof fila)[0]>();
    const activeStatuses = ["aguardando", "chamado", "em_atendimento", "encaixado"];
    fila
      .filter((f) => activeStatuses.includes(f.status))
      .forEach((f) => {
        if (!map.has(f.pacienteId)) map.set(f.pacienteId, f);
      });
    return map;
  }, [fila]);

  const pacientesQueryScope = useMemo(
    () => ({
      unidadeId: unidadeIdFuncionario || "global",
      role: user?.role || "anon",
      usuario: user?.usuario || "",
      search: debouncedSearch,
      filterFila,
      sortBy,
      page: Math.ceil(visibleCount / PAGE_SIZE),
    }),
    [unidadeIdFuncionario, user?.role, user?.usuario, debouncedSearch, filterFila, sortBy, visibleCount],
  );

  useQuery({
    queryKey: queryKeys.pacientes.page(pacientesQueryScope),
    queryFn: async () => true,
    enabled: !!user,
    staleTime: 0,
  });

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.pacientes.all });
    refreshPacientes();
  }, [queryClient, refreshPacientes, unidadeIdFuncionario, user?.role, user?.usuario]);

  // Profissionais veem pacientes vinculados aos seus agendamentos.
  // Recepção/Gestão/Master de unidade usam exclusivamente unidade_id real do funcionário.
  // Não filtrar por setor, sala, criado_por, profissional, fila ou agendamento.
  const visiblePacientes = useMemo(() => {
    if (isProfissional && user) {
      const myPacienteIds = new Set(agendamentos.filter((a) => a.profissionalId === user.id).map((a) => a.pacienteId));
      return pacientes.filter((p) => myPacienteIds.has(p.id));
    }
    if (!isGlobalAdminUser && unidadeIdFuncionario) {
      return pacientes.filter((p) => (p.unidadeId || "") === unidadeIdFuncionario);
    }
    return pacientes;
  }, [pacientes, agendamentos, isProfissional, user, isGlobalAdminUser, unidadeIdFuncionario]);

  const pacientesSemUnidade = useMemo(() => {
    if (!user || !["master", "gestao"].includes(user.role)) return [];
    return pacientes.filter((p) => !p.unidadeId);
  }, [pacientes, user]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    let list = visiblePacientes.filter(
      (p) =>
        p.nome.toLowerCase().includes(q) ||
        p.cpf.includes(debouncedSearch) ||
        p.telefone.includes(debouncedSearch) ||
        (p.cns && p.cns.includes(debouncedSearch)),
    );

    // Filter by fila
    if (filterFila === "fila") {
      list = list.filter((p) => pacientesNaFila.has(p.id));
    } else if (filterFila === "sem_fila") {
      list = list.filter((p) => !pacientesNaFila.has(p.id));
    } else if (filterFila === "demanda_reprimida") {
      list = list.filter((p) => pacientesDemandaReprimida.has(p.id));
    }

    // Sort
    if (sortBy === "nome") {
      list.sort((a, b) => a.nome.localeCompare(b.nome));
    } else if (sortBy === "data_fila") {
      list.sort((a, b) => {
        const fa = filaEntryMap.get(a.id);
        const fb = filaEntryMap.get(b.id);
        if (fa && !fb) return -1;
        if (!fa && fb) return 1;
        if (fa && fb) return fa.horaChegada.localeCompare(fb.horaChegada);
        return a.nome.localeCompare(b.nome);
      });
    } else if (sortBy === "prioridade") {
      const prioOrder: Record<string, number> = {
        urgente: 0,
        gestante: 1,
        idoso: 2,
        alta: 3,
        pcd: 4,
        crianca: 5,
        normal: 6,
      };
      list.sort((a, b) => {
        const fa = filaEntryMap.get(a.id);
        const fb = filaEntryMap.get(b.id);
        const pa = fa ? (prioOrder[fa.prioridade] ?? 6) : 99;
        const pb = fb ? (prioOrder[fb.prioridade] ?? 6) : 99;
        return pa - pb;
      });
    }

    return list;
  }, [visiblePacientes, debouncedSearch, filterFila, sortBy, pacientesNaFila, filaEntryMap]);

  const openNew = () => {
    setEditId(null);
    setForm(emptyPacienteForm);
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (p: (typeof pacientes)[0]) => {
    setEditId(p.id);
    setForm({
      ...emptyPacienteForm,
      nome: p.nome,
      cpf: p.cpf,
      cns: p.cns || "",
      nomeMae: p.nomeMae || "",
      telefone: p.telefone,
      dataNascimento: p.dataNascimento,
      email: p.email,
      endereco: p.endereco || "",
      descricaoClinica: p.descricaoClinica || "",
      cid: p.cid || "",
      especialidadeDestino: (p as any).especialidade_destino || "",
      municipio: (p as any).municipio || "",
      naturalidade: (p as any).naturalidade || "",
      naturalidadeUf: (p as any).naturalidade_uf || "",
      menorIdade: (p as any).menor_idade || false,
      nomeResponsavel: (p as any).nome_responsavel || "",
      cpfResponsavel: (p as any).cpf_responsavel || "",
      ubsOrigem: (p as any).ubs_origem || "",
      profissionalSolicitante: (p as any).profissional_solicitante || "",
      tipoEncaminhamento: (p as any).tipo_encaminhamento || "",
      diagnosticoResumido: (p as any).diagnostico_resumido || "",
      justificativa: (p as any).justificativa || "",
      dataEncaminhamento: (p as any).data_encaminhamento || "",
      documentoUrl: (p as any).documento_url || "",
      tipoCondicao: (p as any).tipo_condicao || "",
      mobilidade: (p as any).mobilidade || "",
      usaDispositivo: (p as any).usa_dispositivo || false,
      tipoDispositivo: (p as any).tipo_dispositivo || "",
      comunicacao: (p as any).comunicacao || "",
      comportamento: (p as any).comportamento || "",
      usaEquipamentos: (p as any).usa_equipamentos || false,
      equipamentos: (p as any).equipamentos || [],
      observacaoEquipamentos: (p as any).observacao_equipamentos || "",
      outroServicoSus: (p as any).outro_servico_sus || false,
      transporte: (p as any).transporte || "",
      turnoPreferido: (p as any).turno_preferido || "",
      isGestante: (p as any).isGestante || (p as any).is_gestante || false,
      isPne: (p as any).isPne || (p as any).is_pne || false,
      isAutista: (p as any).isAutista || (p as any).is_autista || false,
      customData: (p as any).custom_data || {},
    });
    setErrors({});
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const { normalizePhone } = await import("@/lib/phoneUtils");
    const newErrors: Record<string, string> = {};
    if (!form.nome.trim()) newErrors.nome = "Nome é obrigatório";

    // Validate and normalize phone
    const rawPhone = form.telefone?.trim();
    if (!rawPhone) {
      newErrors.telefone = "Informe o telefone com DDD ex: (93) 99999-0000";
    } else {
      const normalized = normalizePhone(rawPhone);
      if (!normalized) {
        newErrors.telefone = "Informe o telefone com DDD ex: (93) 99999-0000";
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error(Object.values(newErrors)[0]);
      return;
    }
    setErrors({});
    setSaving(true);

    const normalizedPhone = normalizePhone(rawPhone!) || "";

    const dbFields: any = {
      nome: form.nome,
      cpf: form.cpf,
      cns: form.cns,
      nome_mae: form.nomeMae,
      telefone: normalizedPhone,
      data_nascimento: form.dataNascimento,
      email: form.email,
      endereco: form.endereco,
      descricao_clinica: form.descricaoClinica || form.diagnosticoResumido,
      cid: form.cid,
      especialidade_destino: form.especialidadeDestino,
      municipio: form.municipio,
      naturalidade: form.naturalidade || "",
      naturalidade_uf: form.naturalidadeUf || "",
      menor_idade: form.menorIdade,
      nome_responsavel: form.nomeResponsavel,
      cpf_responsavel: form.cpfResponsavel,
      ubs_origem: form.ubsOrigem,
      profissional_solicitante: form.profissionalSolicitante,
      tipo_encaminhamento: form.tipoEncaminhamento,
      diagnostico_resumido: form.diagnosticoResumido,
      justificativa: form.justificativa,
      data_encaminhamento: form.dataEncaminhamento,
      documento_url: form.documentoUrl,
      tipo_condicao: form.tipoCondicao,
      mobilidade: form.mobilidade,
      usa_dispositivo: form.usaDispositivo,
      tipo_dispositivo: form.tipoDispositivo,
      comunicacao: form.comunicacao,
      comportamento: form.comportamento,
      usa_equipamentos: form.usaEquipamentos,
      equipamentos: form.equipamentos,
      observacao_equipamentos: form.observacaoEquipamentos,
      outro_servico_sus: form.outroServicoSus,
      transporte: form.transporte,
      turno_preferido: form.turnoPreferido,
      is_gestante: form.isGestante,
      is_pne: form.isPne,
      is_autista: form.isAutista,
      custom_data: form.customData || {},
    };

    try {
      if (editId) {
        // Close dialog immediately (optimistic)
        setDialogOpen(false);
        setSaving(false);
        Promise.resolve(supabase.from("pacientes").update(dbFields).eq("id", editId))
          .then(({ error }) => { if (error) console.error("Erro ao atualizar paciente:", error); })
          .catch((err) => console.error("Erro ao atualizar paciente:", err))
          .finally(() => refreshPacientes());
        toast.success("Paciente atualizado!");
      } else {
        // === DUPLICATE DETECTION ===
        const duplicateChecks: string[] = [];

        if (form.cpf.trim()) {
          const { data: cpfMatch } = await supabase
            .from("pacientes")
            .select("id, nome")
            .eq("cpf", form.cpf.trim())
            .limit(1);
          if (cpfMatch && cpfMatch.length > 0) duplicateChecks.push(`CPF já cadastrado: ${cpfMatch[0].nome}`);
        }

        if (form.cns.trim()) {
          const { data: cnsMatch } = await supabase
            .from("pacientes")
            .select("id, nome")
            .eq("cns", form.cns.trim())
            .limit(1);
          if (cnsMatch && cnsMatch.length > 0) duplicateChecks.push(`CNS já cadastrado: ${cnsMatch[0].nome}`);
        }

        if (form.nome.trim() && form.dataNascimento && form.nomeMae.trim()) {
          const { data: nameMatch } = await supabase
            .from("pacientes")
            .select("id, nome")
            .eq("nome", form.nome.trim())
            .eq("data_nascimento", form.dataNascimento)
            .eq("nome_mae", form.nomeMae.trim())
            .limit(1);
          if (nameMatch && nameMatch.length > 0)
            duplicateChecks.push(`Nome + Data Nasc. + Mãe já cadastrado: ${nameMatch[0].nome}`);
        }

        if (duplicateChecks.length > 0) {
          const confirmed = window.confirm(
            `⚠️ Possível duplicidade detectada:\n\n${duplicateChecks.join("\n")}\n\nDeseja continuar com o cadastro mesmo assim?`,
          );
          if (!confirmed) {
            setSaving(false);
            return;
          }
        }

        const id = `p${Date.now()}`;
        // Stamp unit on creation so unit-scoped users (Recepção, Master de unidade, Gestão)
        // see the patient immediately. Admin global sem unidade fica vazio (visível para todos).
        const insertPayload: any = { id, ...dbFields };
        if (user?.unidadeId) insertPayload.unidade_id = user.unidadeId;
        // Close dialog immediately (optimistic)
        setDialogOpen(false);
        setSaving(false);
        Promise.resolve(supabase.from("pacientes").insert(insertPayload))
          .then(({ error }) => { if (error) console.error("Erro ao cadastrar paciente:", error); })
          .catch((err) => console.error("Erro ao cadastrar paciente:", err))
          .finally(() => refreshPacientes());
        toast.success("Paciente cadastrado com sucesso!");
      }
    } catch {
      toast.error("Erro ao salvar paciente.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: (typeof pacientes)[0]) => {
    if (!can("pacientes", "can_delete")) {
      toast.error("Sem permissão para excluir.");
      return;
    }
    const activeLinks = agendamentos.filter(
      (a) => a.pacienteId === p.id && !["cancelado", "concluido", "falta"].includes(a.status),
    );
    if (activeLinks.length > 0) {
      toast.error(`Não é possível excluir: ${p.nome} possui ${activeLinks.length} agendamento(s) ativo(s).`);
      return;
    }

    try {
      await (supabase as any).from("pacientes").delete().eq("id", p.id);
      await logAction({
        acao: "excluir",
        entidade: "paciente",
        entidadeId: p.id,
        detalhes: { nome: p.nome, cpf: p.cpf },
        user,
      });
      await refreshPacientes();
      toast.success("Paciente excluído!");
    } catch (err) {
      console.error("Error deleting patient:", err);
      toast.error("Erro ao excluir paciente.");
    }
  };

  const openFilaDialog = (p: (typeof pacientes)[0]) => {
    setFilaPaciente(p);
    setFilaForm({
      unidadeId: "",
      profissionalId: "",
      prioridade: "normal",
      observacoes: "",
      descricaoClinica: "",
      cid: "",
    });
    setFilaDialogOpen(true);
  };

  const handleAddToFila = async () => {
    if (!filaPaciente || !filaForm.unidadeId) {
      toast.error("Selecione a unidade.");
      return;
    }
    setSavingFila(true);
    try {
      const newId = `f${Date.now()}`;
      await addToFila({
        id: newId,
        pacienteId: filaPaciente.id,
        pacienteNome: filaPaciente.nome,
        unidadeId: filaForm.unidadeId,
        profissionalId: filaForm.profissionalId,
        setor: "",
        prioridade: filaForm.prioridade as any,
        status: "aguardando",
        posicao: fila.length + 1,
        horaChegada: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        criadoPor: user?.id || "sistema",
        observacoes: filaForm.observacoes,
        descricaoClinica: filaForm.descricaoClinica,
        cid: filaForm.cid,
      });

      const unidade = unidades.find((u) => u.id === filaForm.unidadeId);
      const prof = filaForm.profissionalId ? funcionarios.find((f) => f.id === filaForm.profissionalId) : null;

      // Ensure portal access
      ensurePortalAccess({
        pacienteId: filaPaciente.id,
        contexto: "fila",
        unidade: unidade?.nome || "",
        profissional: prof?.nome || "",
        posicaoFila: fila.length + 1,
      })
        .then((result) => {
          if (result.created)
            toast.info(
              `Acesso ao portal criado para ${filaPaciente!.nome}. ${result.emailSent ? "E-mail enviado." : ""}`,
            );
        })
        .catch(() => {});

      await notify({
        evento: "fila_entrada",
        paciente_nome: filaPaciente.nome,
        telefone: filaPaciente.telefone,
        email: filaPaciente.email,
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
          pacienteNome: filaPaciente.nome,
          unidade: unidade?.nome,
          origem: "tela_pacientes",
          descricaoClinica: filaForm.descricaoClinica || undefined,
          cid: filaForm.cid || undefined,
        },
        user,
        modulo: "fila_espera",
      });

      toast.success(`${filaPaciente.nome} adicionado à fila de espera!`);
      setFilaDialogOpen(false);
    } catch {
      toast.error("Erro ao adicionar à fila.");
    } finally {
      setSavingFila(false);
    }
  };

  // Função para buscar dados da ficha em paralelo
  const fetchFichaData = useCallback(async (pacienteId: string): Promise<FichaDados> => {
    // A) PACIENTE
    const pacientePromise = supabase
      .from("pacientes")
      .select("nome, cpf, cns, data_nascimento, nome_mae, telefone, endereco, cid")
      .eq("id", pacienteId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) throw new Error("Paciente não encontrado");
        return {
          paciente: {
            nome_completo: data.nome || "",
            cpf: data.cpf || "",
            cns: data.cns || "",
            data_nascimento: data.data_nascimento || "",
            nome_mae: data.nome_mae || "",
            telefone: data.telefone || "",
            endereco: data.endereco || "",
          },
          cid: data.cid || "",
        };
      });

    // B) DADOS CLÍNICOS — agendamento do dia atual (ou mais recente se não houver hoje)
    const today = new Date().toISOString().split("T")[0];
    const dadosClinicosPromise = supabase
      .from("agendamentos")
      .select("id, tipo, data, unidade_id, profissional_id")
      .eq("paciente_id", pacienteId)
      .order("data", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        const todayAg = data?.find((a) => a.data === today);
        const lastAg = todayAg || data?.[0];
        const unidade = lastAg?.unidade_id ? unidades.find((u) => u.id === lastAg.unidade_id) : null;
        return {
          numero_prontuario: pacienteId,
          tipo_atendimento: lastAg?.tipo || "",
          unidade_origem: "",
          unidade_atendimento: unidade?.nome || "",
          data_atendimento: lastAg?.data || "",
        };
      });

    // C) SINAIS VITAIS — último registro de triagem
    const sinaisVitaisPromise = (supabase as any)
      .from("triage_records")
      .select("pressao_arterial, frequencia_cardiaca, temperatura, saturacao_oxigenio, peso, altura")
      .in("agendamento_id", agendamentos.filter(a => a.pacienteId === pacienteId).map(a => a.id))
      .order("criado_em", { ascending: false })
      .limit(1)
      .then(({ data }: any) => {
        const triagem = data?.[0];
        return {
          pressao_arterial: triagem?.pressao_arterial || "",
          frequencia_cardiaca: triagem?.frequencia_cardiaca ? String(triagem.frequencia_cardiaca) : "",
          temperatura: triagem?.temperatura ? String(triagem.temperatura) : "",
          saturacao: triagem?.saturacao_oxigenio ? String(triagem.saturacao_oxigenio) : "",
          peso: triagem?.peso ? String(triagem.peso) : "",
          altura: triagem?.altura ? String(triagem.altura) : "",
        };
      });

    // D) PROFISSIONAL LOGADO
    const profissionalPromise = Promise.resolve({
      nome: user?.nome || "",
      cargo: user?.role || "",
      registro: user?.numeroConselho || "",
    });

    // E) EVOLUÇÕES CLÍNICAS — prontuários reais (não agendamentos)
    const evolucionesPromise = supabase
      .from("prontuarios")
      .select("data_atendimento, profissional_nome, soap_subjetivo, soap_objetivo, observacoes")
      .eq("paciente_id", pacienteId)
      .order("data_atendimento", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        return (data || []).map((p) => ({
          data: p.data_atendimento || "",
          observacao: p.soap_subjetivo || p.observacoes || "",
          profissional: p.profissional_nome || "",
        }));
      });

    // Executar todas as buscas em paralelo
    const [pacienteResult, dadosClinicos, sinaisVitais, profissional, evoluciones] = await Promise.all([
      pacientePromise,
      dadosClinicosPromise,
      sinaisVitaisPromise,
      profissionalPromise,
      evolucionesPromise,
    ]);

    return {
      paciente: pacienteResult.paciente,
      dadosClinicos: { ...dadosClinicos, cid: pacienteResult.cid },
      sinaisVitais,
      profissional,
      evoluciones,
    };
  }, [unidades, user]);

  // Abrir ficha de impressão
  const handleOpenFicha = async (p: (typeof pacientes)[0], mode: FichaPrintMode = 'completa') => {
    setFichaPrintMode(mode);
    setFichaLoading(true);
    setFichaOpen(true);
    try {
      const data = await fetchFichaData(p.id);
      setFichaData(data);
    } catch (err) {
      console.error("Erro ao buscar dados da ficha:", err);
      toast.error("Erro ao carregar dados para impressão. Verifique sua conexão.");
      setFichaOpen(false);
    } finally {
      setFichaLoading(false);
    }
  };

  const handlePrintComplete = () => {
    setFichaOpen(false);
    setFichaData(null);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Pacientes</h1>
          <p className="text-muted-foreground text-sm">
            {visiblePacientes.length} cadastrados
            {pacientesNaFila.size > 0 && (
              <span className="ml-2">
                • <Users className="w-3.5 h-3.5 inline" /> {pacientesNaFila.size} na fila
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {canImportCSV && (
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileDown className="w-4 h-4 mr-2" /> Importar CSV
            </Button>
          )}
          {canCreate && (
            <Button onClick={openNew} className="gradient-primary text-primary-foreground">
              <Plus className="w-4 h-4 mr-2" /> Novo Paciente
            </Button>
          )}
        </div>
      </div>

      {/* Patient create/edit dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setErrors({});
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="font-display">{editId ? "Editar" : "Cadastrar"} Paciente</DialogTitle>
          </DialogHeader>
          <CadastroPacienteForm
            form={form}
            onChange={setForm}
            onSave={handleSave}
            saving={saving}
            isEdit={!!editId}
            errors={errors}
          />
        </DialogContent>
      </Dialog>

      {/* Add to queue dialog */}
      <Dialog open={filaDialogOpen} onOpenChange={setFilaDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Adicionar à Fila de Espera</DialogTitle>
          </DialogHeader>
          {filaPaciente && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="font-semibold text-foreground">{filaPaciente.nome}</p>
                <p className="text-sm text-muted-foreground">
                  {filaPaciente.telefone} • {filaPaciente.email}
                </p>
              </div>
              <div>
                <Label>Unidade *</Label>
                <Select value={filaForm.unidadeId} onValueChange={(v) => setFilaForm((p) => ({ ...p, unidadeId: v }))}>
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
                  value={filaForm.profissionalId || "none"}
                  onValueChange={(v) => setFilaForm((p) => ({ ...p, profissionalId: v === "none" ? "" : v }))}
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
                <Select
                  value={filaForm.prioridade}
                  onValueChange={(v) => setFilaForm((p) => ({ ...p, prioridade: v }))}
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
              <div>
                <Label>Observação Geral</Label>
                <Input
                  value={filaForm.observacoes}
                  onChange={(e) => setFilaForm((p) => ({ ...p, observacoes: e.target.value }))}
                  placeholder="Observações administrativas..."
                />
              </div>
              <div className="border-t pt-3 mt-1">
                <p className="text-sm font-semibold text-foreground mb-2">Informações Clínicas</p>
                <div className="space-y-3">
                  <div>
                    <Label>Descrição Clínica</Label>
                    <Input
                      value={filaForm.descricaoClinica}
                      onChange={(e) => setFilaForm((p) => ({ ...p, descricaoClinica: e.target.value }))}
                      placeholder="Motivo de espera / queixa principal..."
                    />
                  </div>
                  <div>
                    <Label>CID (opcional)</Label>
                    <Input
                      value={filaForm.cid}
                      onChange={(e) => setFilaForm((p) => ({ ...p, cid: e.target.value }))}
                      placeholder="Ex: F41.1"
                    />
                  </div>
                </div>
              </div>
              <Button
                onClick={handleAddToFila}
                className="w-full gradient-primary text-primary-foreground"
                disabled={savingFila}
              >
                {savingFila ? "Adicionando..." : "Adicionar à Fila"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CPF, CNS ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterFila} onValueChange={setFilterFila}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filtrar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="fila">Na Fila de Espera</SelectItem>
            <SelectItem value="demanda_reprimida">Demanda Reprimida</SelectItem>
            <SelectItem value="sem_fila">Sem fila</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Ordenar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nome">Nome A-Z</SelectItem>
            <SelectItem value="data_fila">Data entrada fila</SelectItem>
            <SelectItem value="prioridade">Prioridade fila</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.slice(0, visibleCount).map((p) => {
          const naFila = pacientesNaFila.has(p.id);
          const filaEntry = filaEntryMap.get(p.id);

          return (
            <Card key={p.id} className="shadow-card border-0 hover:shadow-elevated transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground">{p.nome}</h3>
                      {naFila && (
                        <Badge
                          variant="outline"
                          className="bg-warning/10 text-warning border-warning/30 text-[10px] px-1.5 py-0"
                        >
                          <Clock className="w-3 h-3 mr-0.5" /> FILA DE ESPERA
                        </Badge>
                      )}
                      {pacientesDemandaReprimida.has(p.id) && (
                        <Badge
                          variant="outline"
                          className="bg-orange-500/10 text-orange-600 border-orange-500/30 text-[10px] px-1.5 py-0"
                        >
                          <FileUp className="w-3 h-3 mr-0.5" /> DEMANDA REPRIMIDA
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.cpf || "Sem CPF"}</p>
                    {naFila && filaEntry && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Entrada: {filaEntry.horaChegada} •{" "}
                        {filaEntry.prioridade !== "normal" ? filaEntry.prioridade : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    <ContactActionButton
                      phone={p.telefone}
                      patientName={p.nome}
                      unitName={unidades.find((u) => u.id === (filaEntry?.unidadeId || user?.unidadeId))?.nome}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => handleOpenFicha(p, 'completa')}
                      title="Imprimir Ficha"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </Button>
                    {canAddToFila && !naFila && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-warning"
                        onClick={() => openFilaDialog(p)}
                        title="Adicionar à fila"
                      >
                        <Users className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        setDetalhePaciente(p);
                        setDetalheOpen(true);
                      }}
                      title="Detalhes"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() =>
                        navigate(`/painel/prontuario?pacienteId=${p.id}&pacienteNome=${encodeURIComponent(p.nome)}`)
                      }
                      title="Ver Prontuários"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(p)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    {canDelete && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir paciente?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Excluir {p.nome}? Será verificado se há agendamentos ativos vinculados. Esta ação é
                              irreversível e será registrada em log.
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
                <div className="flex items-center gap-2 sm:gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1 min-w-0">
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{p.telefone}</span>
                  </span>
                  {p.email && (
                    <span className="flex items-center gap-1 min-w-0">
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{p.email}</span>
                    </span>
                  )}
                </div>
                {(p.descricaoClinica || p.cid) && (
                  <div className="mt-1.5 text-xs text-muted-foreground space-y-0.5">
                    {p.descricaoClinica && <p>🩺 {p.descricaoClinica}</p>}
                    {p.cid && <p>CID: {p.cid}</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {visibleCount < filtered.length && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
          >
            Carregar mais ({filtered.length - visibleCount} restantes)
          </Button>
        </div>
      )}
      {canImportCSV && <ImportarPacientesCSV open={importOpen} onOpenChange={setImportOpen} />}

      {/* Modal Detalhes - Paciente (página de Pacientes) */}
      {detalhePaciente && (() => {
        const naFila = pacientesNaFila.has(detalhePaciente.id);
        const isDemanda = pacientesDemandaReprimida.has(detalhePaciente.id);
        const totalAg = agendamentos.filter((a) => a.pacienteId === detalhePaciente.id).length;
        const ultimoAg = agendamentos
          .filter((a) => a.pacienteId === detalhePaciente.id && a.status === "concluido")
          .sort((a, b) => b.data.localeCompare(a.data))[0];
        const alergiasRaw = (detalhePaciente as any).alergias ?? (detalhePaciente as any).custom_data?.alergias;

        const badges = (naFila || isDemanda) ? (
          <>
            {naFila && (
              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-[11px]">
                Fila de Espera
              </Badge>
            )}
            {isDemanda && (
              <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30 text-[11px]">
                Demanda Reprimida
              </Badge>
            )}
          </>
        ) : null;

        const cidVal = [detalhePaciente.cid, detalhePaciente.descricaoClinica]
          .filter((s) => s && String(s).trim() !== '')
          .join(' — ');

        const footer = (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full min-w-0"
              onClick={() => {
                setDetalheOpen(false);
                navigate(
                  `/painel/prontuario?pacienteId=${detalhePaciente.id}&pacienteNome=${encodeURIComponent(detalhePaciente.nome)}`,
                );
              }}
            >
              <FileText className="w-4 h-4 mr-1.5" />
              <span className="truncate">Ver Prontuários</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full min-w-0"
              onClick={() => handleOpenFicha(detalhePaciente, 'completa')}
            >
              <Printer className="w-4 h-4 mr-1.5" />
              <span className="truncate">Ficha Completa</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full col-span-2 min-w-0"
              onClick={() => handleOpenFicha(detalhePaciente, 'dados_pessoais')}
            >
              <Printer className="w-4 h-4 mr-1.5" />
              <span className="truncate">Imprimir Só Dados</span>
            </Button>
          </div>
        );

        return (
          <PacienteDetalheModal
            open={detalheOpen}
            onOpenChange={setDetalheOpen}
            nome={detalhePaciente.nome}
            prontuarioNumero={(detalhePaciente as any).numeroProntuario || detalhePaciente.id?.slice(0, 8)}
            dataNascimento={detalhePaciente.dataNascimento}
            badges={badges}
            footer={footer}
          >
            <PSecao titulo="Dados Pessoais">
              <PCampo label={L('nome', 'Nome completo')} valor={detalhePaciente.nome} />
              <PCampo label={L('cpf', 'CPF')} valor={formatCPF(detalhePaciente.cpf)} />
              <PCampo label={L('cns', 'Cartão SUS')} valor={formatCNS(detalhePaciente.cns)} />
              <PCampo label={L('nomeMae', 'Nome da mãe')} valor={detalhePaciente.nomeMae} />
              <PCampo label="CID" valor={cidVal} />
            </PSecao>

            <PSecao titulo="Contato">
              <PCampo label={L('telefone', 'Telefone')} valor={formatTelefoneBR(detalhePaciente.telefone)} />
              <PCampo label={L('email', 'E-mail')} valor={detalhePaciente.email} />
              <PCampo label={L('endereco', 'Endereço')} valor={detalhePaciente.endereco} />
            </PSecao>

            <PSecao titulo="Histórico">
              <PCampo label="Data de cadastro" valor={detalhePaciente.criadoEm ? formatarDataBR(detalhePaciente.criadoEm) : ''} />
              <PCampo label="Total de agendamentos" valor={totalAg > 0 ? String(totalAg) : ''} />
              <PCampo label="Último atendimento" valor={ultimoAg ? formatarDataBR(ultimoAg.data) : ''} />
            </PSecao>

            <PSecao titulo="Alergias">
              <AlergiasBlock alergias={alergiasRaw} />
            </PSecao>

            {detalhePaciente.observacoes && (
              <PSecao titulo={L('observacoes', 'Observações')}>
                <PCampo label="Notas" valor={detalhePaciente.observacoes} />
              </PSecao>
            )}
          </PacienteDetalheModal>
        );
      })()}

      {/* Dialog de impressão da ficha */}
      <Dialog open={fichaOpen} onOpenChange={(open) => { if (!open) { setFichaOpen(false); setFichaData(null); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b flex flex-row items-center justify-between">
            <DialogTitle className="font-display flex items-center gap-2">
              <Printer className="w-5 h-5" />
              {fichaPrintMode === 'dados_pessoais' ? 'Ficha Cadastral' : 'Ficha de Atendimento Clínico'}
            </DialogTitle>
            <div className="flex gap-2">
              <Button size="sm" variant={fichaPrintMode === 'completa' ? 'default' : 'outline'} onClick={() => setFichaPrintMode('completa')}>Completa</Button>
              <Button size="sm" variant={fichaPrintMode === 'dados_pessoais' ? 'default' : 'outline'} onClick={() => setFichaPrintMode('dados_pessoais')}>Só Dados Pessoais</Button>
            </div>
          </DialogHeader>
          <div className="px-6 pb-6">
            {fichaLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Carregando dados da ficha...</p>
              </div>
            ) : fichaData ? (
              <FichaImpressao data={fichaData} mode={fichaPrintMode} onPrintComplete={handlePrintComplete} />
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                <p>Erro ao carregar dados da ficha.</p>
                <Button variant="outline" className="mt-4" onClick={() => setFichaOpen(false)}>
                  Fechar
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Pacientes;