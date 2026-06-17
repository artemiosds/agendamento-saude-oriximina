import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingState, ErrorState } from "@/components/EmptyState";
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
import { Plus, Search, Phone, Mail, Pencil, Trash2, FileDown, Users, Clock, FileUp, Eye, FileText, Printer, Loader2, Paperclip, AlertTriangle } from "lucide-react";
import PatientAttachmentManager from "@/components/PatientAttachmentManager";
import ContactActionButton from "@/components/ContactActionButton";
import DetalheDrawer, { Secao, Campo, calcularIdade, formatarData } from "@/components/DetalheDrawer";
import PacienteDetalheModal, { PSecao, PCampo, AlergiasBlock, formatCPF, formatCNS, formatTelefoneBR, formatarDataBR } from "@/components/PacienteDetalheModal";
import { useCustomFields } from "@/hooks/useCustomFields";
import { toast } from "sonner";
import { calculatePatientPendingFields } from "@/lib/paciente-validation";
import { validatePacienteFields } from "@/lib/validation";
import { checkPatientDuplicity } from "@/lib/paciente-duplicity";
import { supabase } from "@/integrations/supabase/client";
import { normalizeSexo } from "@/lib/utils/sexo-normalization";

import ImportarPacientesCSV from "@/components/ImportarPacientesCSV";
import { useUnidadeFilter } from "@/hooks/useUnidadeFilter";
import { useNavigate } from "react-router-dom";
import CadastroPacienteForm, { PacienteFormData, emptyPacienteForm } from "@/components/CadastroPacienteForm";
import { FichaImpressao, FichaPrintMode } from '@/components/FichaImpressao';
import "@/styles/ficha-impressao.css";
import { imprimirLaudoApac } from "@/lib/apacLaudoPrint";
import ApacLaudoModal from "@/components/pacientes/ApacLaudoModal";
import { FileSignature } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries/queryKeys";

interface FichaDados {
  paciente: {
    nome: string;
    cpf: string;
    cns: string;
    data_nascimento: string;
    nome_mae: string;
    telefone: string;
    telefone_secundario?: string;
    email?: string;
    endereco?: string;
    responsavel?: string;
    sexo?: string;
    naturalidade?: string;
    nacionalidade?: string;
    raca_cor?: string;
    situacao_rua?: boolean;
    menor_idade?: boolean;
    parentesco_responsavel?: string;
    observacoes_cadastrais?: string;
    informacoes_adicionais?: string;
    origem_cadastro?: string;
    unidade_vinculada?: string;
    tipo_logradouro?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
  };
  dadosClinicos: {
    numero_prontuario: string;
    cid: string;
    tipo_atendimento: string;
    unidade_origem: string;
    unidade_atendimento: string;
    data_atendimento: string;
    especialidade?: string;
    encaminhamento?: string;
  };
  sinaisVitais: {
    pressao_arterial: string;
    frequencia_cardiaca: string;
    temperatura: string;
    saturacao: string;
    peso: string;
    altura: string;
    glicemia?: string;
    frequencia_respiratoria?: string;
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

const PACIENTE_COLUMNS =
  "id,nome,cpf,cns,nome_mae,telefone,data_nascimento,email,endereco,observacoes,descricao_clinica,cid,criado_em,is_gestante,is_pne,is_autista,unidade_id,naturalidade,naturalidade_uf,municipio,menor_idade,nome_responsavel,cpf_responsavel,ubs_origem,profissional_solicitante,tipo_encaminhamento,diagnostico_resumido,justificativa,data_encaminhamento,documento_url,tipo_condicao,mobilidade,usa_dispositivo,tipo_dispositivo,comunicacao,comportamento,usa_equipamentos,equipamentos,observacao_equipamentos,outro_servico_sus,transporte,turno_preferido,especialidade_destino,custom_data,sexo";

const mapPacienteRow = (p: any) => ({
  id: p.id,
  nome: p.nome,
  cpf: (p.cpf || "").replace(/\D/g, ""),
  cns: (p.cns || "").replace(/\D/g, "").slice(0, 15),
  nomeMae: p.nome_mae || "",
  telefone: p.telefone || "",
  dataNascimento: p.data_nascimento || "",
  email: p.email || "",
  endereco: p.endereco || "",
  observacoes: p.observacoes || "",
  descricaoClinica: p.descricao_clinica || "",
  cid: p.cid || "",
  criadoEm: p.criado_em || "",
  unidadeId: p.unidade_id || "",
  isGestante: !!p.is_gestante,
  isPne: !!p.is_pne,
  isAutista: !!p.is_autista,
  naturalidade: p.naturalidade || "",
  naturalidade_uf: p.naturalidade_uf || "",
  municipio: p.municipio || "",
  menor_idade: !!p.menor_idade,
  nome_responsavel: p.nome_responsavel || "",
  cpf_responsavel: p.cpf_responsavel || "",
  ubs_origem: p.ubs_origem || "",
  profissional_solicitante: p.profissional_solicitante || "",
  tipo_encaminhamento: p.tipo_encaminhamento || "",
  diagnostico_resumido: p.diagnostico_resumido || "",
  justificativa: p.justificativa || "",
  data_encaminhamento: p.data_encaminhamento || "",
  documento_url: p.documento_url || "",
  tipo_condicao: p.tipo_condicao || "",
  mobilidade: p.mobilidade || "",
  usa_dispositivo: !!p.usa_dispositivo,
  tipo_dispositivo: p.tipo_dispositivo || "",
  comunicacao: p.comunicacao || "",
  comportamento: p.comportamento || "",
  usa_equipamentos: !!p.usa_equipamentos,
  equipamentos: p.equipamentos || [],
  observacao_equipamentos: p.observacao_equipamentos || "",
  outro_servico_sus: !!p.outro_servico_sus,
  transporte: p.transporte || "",
  turno_preferido: p.turno_preferido || "",
  especialidade_destino: p.especialidade_destino || "",
  custom_data: p.custom_data || {},
  sexo: normalizeSexo(p.sexo || p.custom_data?.sexo),
});


const normalizeUnitId = (value?: string | null) => (value || "").trim();

const fetchAllRows = async (buildQuery: (from: number, to: number) => any, pageSize = 1000) => {
  const rows: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
};

const fetchPacientesByIds = async (ids: string[]) => {
  const pacientes: any[] = [];
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase.from("pacientes").select(PACIENTE_COLUMNS).in("id", chunk);
    if (error) throw error;
    if (data) pacientes.push(...data);
  }
  return pacientes;
};

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
    // Check for ID in URL to automatically open edit modal
    const params = new URLSearchParams(window.location.search);
    const idFromUrl = params.get('id');
    
    if (idFromUrl && pacientes.length > 0) {
      const target = pacientes.find(p => p.id === idFromUrl);
      if (target) {
        setEditId(target.id);
        setForm({
          nome: target.nome,
          cpf: target.cpf,
          cns: target.cns,
          nomeMae: target.nomeMae,
          telefone: target.telefone,
          dataNascimento: target.dataNascimento,
          email: target.email,
          endereco: target.endereco,
          naturalidade: target.naturalidade,
          naturalidadeUf: target.naturalidade_uf,
          municipio: target.municipio,
          menorIdade: target.menor_idade,
          nomeResponsavel: target.nome_responsavel,
          cpfResponsavel: target.cpf_responsavel,
          ubsOrigem: target.ubs_origem,
          profissionalSolicitante: target.profissional_solicitante,
          tipoEncaminhamento: target.tipo_encaminhamento,
          diagnosticoResumido: target.diagnostico_resumido,
          justificativa: target.justificativa,
          dataEncaminhamento: target.data_encaminhamento,
          tipoCondicao: target.tipo_condicao,
          mobilidade: target.mobilidade,
          usaDispositivo: target.usa_dispositivo,
          tipoDispositivo: target.tipo_dispositivo,
          comunicacao: target.comunicacao,
          comportamento: target.comportamento,
          usaEquipamentos: target.usa_equipamentos,
          equipamentos: target.equipamentos,
          observacaoEquipamentos: target.observacao_equipamentos,
          outroServicoSus: target.outro_servico_sus,
          transporte: target.transporte,
          turnoPreferido: target.turno_preferido,
          especialidadeDestino: target.especialidade_destino,
          customData: target.custom_data,
          cid: target.cid,
          descricaoClinica: target.descricaoClinica,
          isGestante: target.isGestante,
          isPne: target.isPne,
          isAutista: target.isAutista,
          documentoUrl: target.documento_url || "",
          sexo: normalizeSexo((target as any).sexo || target.custom_data?.sexo)
        });
        const formSexo = normalizeSexo((target as any).sexo || target.custom_data?.sexo);
        console.log("Paciente carregado:", target);
        console.log("Sexo aplicado no formulário:", formSexo);
        console.log("PACIENTE RAW (URL ID)", target);
        console.log("SEXO NORMALIZADO (URL ID)", normalizeSexo((target as any).sexo || target.custom_data?.sexo));
        setDialogOpen(true);
        
        // Clean URL after opening
        window.history.replaceState({}, '', '/painel/pacientes');
      }
    }

    const t = window.setTimeout(() => {
      setDebouncedSearch(search);
      setVisibleCount(PAGE_SIZE); // reset pagination on search
    }, 300);
    return () => window.clearTimeout(t);
  }, [search, pacientes]);
  const [importOpen, setImportOpen] = useState(false);
  const [apacLaudo, setApacLaudo] = useState<{ paciente: any; unidadeNome: string; cnesUnidade: string } | null>(null);
  const openApacLaudo = (p: any) => {
    const u = unidades.find((x) => x.id === (p?.unidadeId || user?.unidadeId)) as any;
    setApacLaudo({
      paciente: p,
      unidadeNome: u?.nome || "",
      cnesUnidade: u?.cnes || u?.cnes_codigo || "",
    });
  };
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

  const shouldLoadUnitDiagnostics = !!user && !isGlobalAdminUser && !isProfissional && !!unidadeIdFuncionario;

  useQuery({
    queryKey: queryKeys.pacientes.diagnostics({ unidadeId: unidadeIdFuncionario || "", role: user?.role || "" }),
    enabled: shouldLoadUnitDiagnostics && funcionarios.length > 0,
    staleTime: 0,
    queryFn: async () => {
      const unitId = normalizeUnitId(unidadeIdFuncionario);
      const [allPacientes, agendaLinks, filaLinks, prontuarioLinks, nursingLinks, ptsLinks, treatmentLinks] = await Promise.all([
        fetchAllRows((from, to) =>
          supabase.from("pacientes").select("id,unidade_id,custom_data").range(from, to),
        ),
        fetchAllRows((from, to) =>
          supabase.from("agendamentos").select("paciente_id,unidade_id").eq("unidade_id", unitId).range(from, to),
        ),
        fetchAllRows((from, to) =>
          supabase.from("fila_espera").select("paciente_id,unidade_id").eq("unidade_id", unitId).range(from, to),
        ),
        fetchAllRows((from, to) =>
          supabase.from("prontuarios").select("paciente_id,unidade_id").eq("unidade_id", unitId).range(from, to),
        ),
        fetchAllRows((from, to) =>
          supabase.from("nursing_evaluations").select("patient_id,unit_id").eq("unit_id", unitId).range(from, to),
        ),
        fetchAllRows((from, to) =>
          supabase.from("pts").select("patient_id,unit_id").eq("unit_id", unitId).range(from, to),
        ),
        fetchAllRows((from, to) =>
          supabase.from("treatment_cycles").select("patient_id,unit_id").eq("unit_id", unitId).range(from, to),
        ),
      ]);
      const staffIds = new Set(
        funcionarios.filter((f) => normalizeUnitId(f.unidadeId) === unitId).map((f) => f.id),
      );
      const linkedIds = new Set(
        [
          ...agendaLinks.map((row) => row.paciente_id),
          ...filaLinks.map((row) => row.paciente_id),
          ...prontuarioLinks.map((row) => row.paciente_id),
          ...nursingLinks.map((row) => row.patient_id),
          ...ptsLinks.map((row) => row.patient_id),
          ...treatmentLinks.map((row) => row.patient_id),
        ].filter(Boolean),
      );
      const semUnidade = allPacientes.filter((p) => !normalizeUnitId(p.unidade_id));
      const diagnostico = {
        masterTotal: allPacientes.length,
        pacientesComVinculoNaUnidadeRecepcao: linkedIds.size,
        unidadeIdIgualRecepcao: allPacientes.filter((p) => normalizeUnitId(p.unidade_id) === unitId).length,
        unidadeIdVazioOuNull: semUnidade.length,
        unidadeIdDiferente: allPacientes.filter((p) => {
          const pacienteUnitId = normalizeUnitId(p.unidade_id);
          return pacienteUnitId && pacienteUnitId !== unitId;
        }).length,
        criadosPorUsuariosDaUnidadeSemUnidade: semUnidade.filter((p) => {
          const customData = p.custom_data || {};
          return staffIds.has(customData.criado_por) || staffIds.has(customData.atualizado_por) || customData.unidade_origem_id === unitId;
        }).length,
        vinculadosFilaAgendaSemUnidadeCadastro: semUnidade.filter((p) => linkedIds.has(p.id)).length,
      };
      console.info("[Pacientes][Diagnóstico Recepção]", diagnostico);
      return diagnostico;
    },
  });

  useEffect(() => {
    // Revalidação periódica ou quando parâmetros de busca mudam
    const invalidate = async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.pacientes.all });
      refreshPacientes();
    };
    invalidate();
  }, [queryClient, refreshPacientes, unidadeIdFuncionario, user?.role, user?.usuario, debouncedSearch]);

  // Profissionais veem pacientes vinculados aos seus agendamentos.
  // Recepção/Gestão/Master de unidade usam exclusivamente unidade_id real do funcionário.
  // Não filtrar por setor, sala, criado_por, profissional, fila ou agendamento.
  const visiblePacientes = useMemo(() => {
    if (isProfissional && user) {
      const myPacienteIds = new Set(agendamentos.filter((a) => a.profissionalId === user.id).map((a) => a.pacienteId));
      return pacientes.filter((p) => myPacienteIds.has(p.id));
    }
    if (!isGlobalAdminUser && unidadeIdFuncionario) {
      const unitId = normalizeUnitId(unidadeIdFuncionario);
      // Mostra pacientes da unidade + pacientes sem unidade vinculada (legados/órfãos)
      // para que a Recepção tenha visibilidade completa e possa revisar/corrigir o cadastro.
      return pacientes.filter((p) => {
        const u = normalizeUnitId(p.unidadeId);
        return !u || u === unitId;
      });
    }
    return pacientes;
  }, [pacientes, agendamentos, isProfissional, user, isGlobalAdminUser, unidadeIdFuncionario]);

  const analyzedPendencies = useMemo(() => {
    const list = visiblePacientes.map(p => calculatePatientPendingFields(p));
    const pending = list.filter(p => p.status !== 'completo' && p.status !== 'revisado');
    return {
      total: pending.length,
      pendenteBpa: list.filter(p => p.status === 'pendente_bpa').length
    };
  }, [visiblePacientes]);

  const exportCSV = (type: "pendentes" | "todos") => {
    const list = visiblePacientes.map(p => ({
      ...p,
      analysis: calculatePatientPendingFields(p)
    }));
    
    const listToExport = type === "pendentes" 
      ? list.filter(p => p.analysis.status !== "completo" && p.analysis.status !== "revisado")
      : list;

    if (listToExport.length === 0) {
      toast.error("Nenhum registro para exportar.");
      return;
    }

    const headers = ["id", "nome", "cpf", "cns", "telefone", "data_nascimento", "nome_mae", "unidade_id", "pendencias"];
    const rows = listToExport.map(p => [
      p.id, p.nome, p.cpf || "", p.cns || "", p.telefone || "", p.dataNascimento || "", 
      p.nomeMae || "", p.unidadeId || "", p.analysis.fields.join(" | ")
    ]);

    const csvContent = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pacientes_pendentes_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado com sucesso!");
  };

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    const qDigits = debouncedSearch.replace(/\D/g, "");
    let list = visiblePacientes.filter(
      (p) =>
        p.nome.toLowerCase().includes(q) ||
        p.cpf.includes(debouncedSearch) ||
        p.telefone.includes(debouncedSearch) ||
        (p.cns && qDigits && (p.cns || "").replace(/\D/g, "").includes(qDigits)),
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
    const mappedSexo = normalizeSexo((p as any).sexo || (p as any).custom_data?.sexo);
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
      sexo: mappedSexo,
    });
    console.log("FORM SEXO (CLICK)", mappedSexo);

    setErrors({});
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const { normalizePhone } = await import("@/lib/phoneUtils");
    const newErrors: Record<string, string> = {};
    const cd: any = form.customData || {};

    if (!form.nome?.trim()) newErrors.nome = "Nome completo é obrigatório";
    if (!form.nomeMae?.trim()) newErrors.nomeMae = "Nome da mãe é obrigatório";
    if (!form.dataNascimento) newErrors.dataNascimento = "Data de nascimento é obrigatória";
    if (!form.cns?.trim()) newErrors.cns = "CNS é obrigatório";
    if (!form.naturalidade?.trim()) newErrors.naturalidade = "Naturalidade é obrigatória";
    if (!form.telefone?.trim()) newErrors.telefone = "Telefone é obrigatório";
    if (!form.sexo) newErrors.sexo = "Sexo é obrigatório";
    if (!cd.cep?.trim()) newErrors.cep = "CEP é obrigatório";
    if (!cd.logradouro?.trim()) newErrors.logradouro = "Logradouro é obrigatório";
    if (!cd.numero?.trim()) newErrors.numero = "Número é obrigatório";
    if (!cd.bairro?.trim()) newErrors.bairro = "Bairro é obrigatório";
    if (!form.municipio?.trim()) newErrors.municipio = "Município é obrigatório";
    if (!cd.uf?.trim()) newErrors.uf = "UF é obrigatória";

    const rawPhone = form.telefone?.trim();
    if (rawPhone) {
      const normalized = normalizePhone(rawPhone);
      if (!normalized) {
        newErrors.telefone = "Informe o telefone com DDD ex: (93) 99999-0000";
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      const firstError = Object.values(newErrors)[0];
      toast.error(firstError);
      return;
    }
    if (!editId && user?.role === "recepcao" && !unidadeIdFuncionario) {
      toast.error("Usuário da recepção sem unidade vinculada. Corrija o cadastro do usuário.");
      return;
    }
    setErrors({});
    setSaving(true);

    const normalizedPhone = normalizePhone(rawPhone!) || "";

    const dbFields: any = {
      nome: form.nome,
      cpf: (form.cpf || "").replace(/\D/g, ""),
      cns: (form.cns || "").replace(/\D/g, "").slice(0, 15),
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
      sexo: normalizeSexo(form.sexo),
      custom_data: {
        ...(form.customData || {}),
        sexo: normalizeSexo(form.sexo),
        atualizado_em: new Date().toISOString(),
        atualizado_por: user?.id || "",
        atualizado_por_nome: user?.nome || "",
        atualizado_por_usuario: user?.usuario || "",
        motivo_alteracao: "Atualização cadastral pela página Pacientes",
      },
    };


    if (user?.role === "recepcao") {
      if (!unidadeIdFuncionario) {
        toast.error("Usuário da recepção sem unidade vinculada. Corrija o cadastro do usuário.");
        setSaving(false);
        return;
      }
      dbFields.unidade_id = unidadeIdFuncionario;
    } else if (!isGlobalAdminUser && unidadeIdFuncionario) {
      dbFields.unidade_id = unidadeIdFuncionario;
    }

    try {
      if (editId) {
        // Agora aguardamos o salvamento real para garantir sincronização e evitar race conditions
        const { data: updatedPaciente, error } = await supabase.from("pacientes").update(dbFields).eq("id", editId).select().single();
        
        if (error) {
          console.error("Erro ao atualizar paciente:", error);
          toast.error("Erro ao salvar dados. Verifique sua conexão.");
        } else {
          // Salvar procedimentos vinculados (persistentes)
          if (form.patientProcedures) {
            // Limpa procedimentos antigos e insere novos
            await supabase.from("patient_procedures").delete().eq("patient_id", editId);
            
            const validProcs = (form.patientProcedures || [])
              .filter(p => p.sigtap_codigo || p.procedimento_nome)
              .map(p => ({
                patient_id: editId,
                sigtap_codigo: p.sigtap_codigo,
                procedimento_nome: p.procedimento_nome,
                cid: p.cid
              }));
              
            if (validProcs.length > 0) {
              const { error: procError } = await supabase.from("patient_procedures").insert(validProcs);
              if (procError) console.error("Erro ao salvar procedimentos do paciente:", procError);
            }
          }

          // Invalidação agressiva e imediata
          await refreshPacientes();
          await queryClient.invalidateQueries();
          
          await queryClient.refetchQueries({ queryKey: queryKeys.pacientes.detail(editId) });
          
          toast.success("Dados do paciente sincronizados com sucesso!");
          
          logAction({
            acao: "editar",
            entidade: "paciente",
            entidadeId: editId,
            detalhes: { nome: form.nome, modulo: "Pacientes", acao: "edicao_paciente_pagina_pacientes" },
            user,
          });
          
          setDialogOpen(false);
          setEditId(null);
        }
      } else {
        // === DUPLICATE DETECTION ===
        const duplicity = await checkPatientDuplicity({
          nome: form.nome,
          dataNascimento: form.dataNascimento,
          cpf: form.cpf,
          cns: form.cns,
          idToExclude: null
        });

        if (duplicity.isDuplicate) {
          toast.error(duplicity.message);
          if (duplicity.existingPatient) {
            const openExisting = window.confirm(`${duplicity.message}\n\nDeseja abrir o cadastro existente?`);
            if (openExisting) {
              setDialogOpen(false);
              const { data: fullPatient } = await supabase
                .from("pacientes")
                .select("*")
                .eq("id", duplicity.existingPatient.id)
                .single();
              if (fullPatient) {
                setDetalhePaciente(mapPacienteRow(fullPatient));
                setDetalheOpen(true);
              }
            }
          }
          setSaving(false);
          return;
        }

        const id = `p${Date.now()}`;
        if (user?.role === "recepcao" && !unidadeIdFuncionario) {
          toast.error("Usuário da recepção sem unidade vinculada. Corrija o cadastro do usuário.");
          setSaving(false);
          return;
        }

        const insertPayload: any = {
          id,
          ...dbFields,
          criado_em: new Date().toISOString(),
          unidade_id: user?.role === "recepcao" ? unidadeIdFuncionario : dbFields.unidade_id || unidadeIdFuncionario,
          custom_data: {
            ...(dbFields.custom_data || {}),
            criado_por: user?.id || "",
            criado_por_nome: user?.nome || "",
            criado_por_usuario: user?.usuario || "",
            unidade_origem_id: unidadeIdFuncionario,
            criado_at: new Date().toISOString(),
            atualizado_at: new Date().toISOString(),
            motivo_alteracao: "Cadastro de paciente pela página Pacientes",
          },
        };
        // Aguardar o insert para garantir integridade e sincronização imediata
        const { error } = await supabase.from("pacientes").insert(insertPayload);
        
        if (error) {
          console.error("Erro ao cadastrar paciente:", error);
          toast.error("Erro ao realizar cadastro.");
        } else {
          // Salvar procedimentos vinculados (persistentes) para o novo paciente
          if (form.patientProcedures && form.patientProcedures.length > 0) {
            const validProcs = (form.patientProcedures || [])
              .filter(p => p.sigtap_codigo || p.procedimento_nome)
              .map(p => ({
                patient_id: id,
                sigtap_codigo: p.sigtap_codigo,
                procedimento_nome: p.procedimento_nome,
                cid: p.cid
              }));
              
            if (validProcs.length > 0) {
              const { error: procError } = await supabase.from("patient_procedures").insert(validProcs);
              if (procError) console.error("Erro ao salvar procedimentos do novo paciente:", procError);
            }
          }

          // Flush pending referrals + attachments queued in CadastroPacienteForm
          try {
            const refHandle = (window as any).__patientReferralRef?.current;
            if (refHandle?.hasPending?.()) {
              await refHandle.flushPending(id);
            }
          } catch (e) { console.error("Erro flush encaminhamentos pendentes:", e); }

          // Invalidação agressiva e abrangente
          await refreshPacientes();
          await queryClient.invalidateQueries(); 
          
          toast.success("Novo paciente cadastrado e sincronizado!");
          
          logAction({
            acao: "criar",
            entidade: "paciente",
            entidadeId: id,
            detalhes: { nome: form.nome, modulo: "Pacientes" },
            user,
          });
          
          setDialogOpen(false);
          setEditId(null);
        }
      }
    } catch (err: any) {
      console.error("[Pacientes] Erro crítico ao salvar:", err);
      toast.error("Erro de persistência: " + (err.message || "Tente novamente"));
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
      .select("*")
      .eq("id", pacienteId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) throw new Error("Paciente não encontrado");
        
        const cd = (data.custom_data || {}) as Record<string, any>;
        
        return {
          paciente: {
            nome: data.nome || "",
            cpf: data.cpf || "",
            cns: data.cns || "",
            data_nascimento: data.data_nascimento || "",
            nome_mae: data.nome_mae || "",
            telefone: data.telefone || "",
            telefone_secundario: cd.telefone_secundario || "",
            email: data.email || "",
            endereco: data.endereco || "",
            responsavel: data.nome_responsavel || "",
            sexo: cd.sexo || "",
            naturalidade: data.naturalidade || "",
            nacionalidade: cd.nacionalidade || "BRASILEIRA",
            raca_cor: cd.raca_cor || "",
            situacao_rua: !!cd.situacao_rua,
            menor_idade: !!data.menor_idade,
            parentesco_responsavel: cd.parentesco_responsavel || "",
            observacoes_cadastrais: data.observacoes || "",
            informacoes_adicionais: cd.informacoes_adicionais || "",
            origem_cadastro: cd.origem_cadastro || "",
            unidade_vinculada: (unidades.find(u => u.id === data.unidade_id)?.nome) || "",
            // Address mapping
            tipo_logradouro: cd.tipoLogradouro || cd.tipo_logradouro || "",
            logradouro: cd.logradouro || "",
            numero: cd.numero || "",
            complemento: cd.complemento || "",
            bairro: cd.bairro || "",
            municipio: data.municipio || cd.municipio || "",
            uf: cd.uf || "",
            cep: cd.cep || "",
          },
          cid: data.cid || "",
        };
      });

    // B) DADOS CLÍNICOS — Sempre limpos para a ficha de impressão
    const dadosClinicosPromise = Promise.resolve({
      numero_prontuario: pacienteId,
      tipo_atendimento: "",
      unidade_origem: "",
      unidade_atendimento: "",
      data_atendimento: "",
    });

    // C) SINAIS VITAIS — Sempre limpos para a ficha de impressão
    const sinaisVitaisPromise = Promise.resolve({
      pressao_arterial: "",
      frequencia_cardiaca: "",
      temperatura: "",
      saturacao: "",
      peso: "",
      altura: "",
      frequencia_respiratoria: "",
      glicemia: "",
    });

    // D) PROFISSIONAL LOGADO
    const profissionalPromise = Promise.resolve({
      nome: user?.nome || "",
      cargo: user?.role || "",
      registro: user?.numeroConselho || "",
    });

    // E) EVOLUÇÕES CLÍNICAS — Sempre limpas para a ficha de impressão
    const evolucionesPromise = Promise.resolve([]);

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
  }, [unidades, user, agendamentos]);

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
      <PageHeader
        title="Pacientes"
        subtitle={
          <>
            {visiblePacientes.length} cadastrados
            {pacientesNaFila.size > 0 && (
              <span className="ml-2">
                • <Users className="w-3.5 h-3.5 inline" /> {pacientesNaFila.size} na fila
              </span>
            )}
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/painel/atualizacao-cadastral")}>
              <AlertTriangle className="w-4 h-4 mr-2 text-orange-500" /> Pendências Cadastrais
            </Button>
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
          </>
        }
      />

      {analyzedPendencies.total > 0 && (
        <Card className="border-warning/30 bg-warning/10 shadow-card">
          <CardContent className="p-3 text-sm text-foreground">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-warning" />
                <span>
                  Existem <strong>{analyzedPendencies.total}</strong> pacientes com pendências cadastrais (CPF, CNS, endereço ou unidade faltando).
                </span>
              </div>
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="bg-background"
                  onClick={() => navigate("/painel/atualizacao-cadastral")}
                >
                  Ver pendências
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="bg-background"
                  onClick={() => exportCSV("pendentes")}
                >
                  Exportar pendentes
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
            pacienteId={editId}
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
                    {p.cns && (
                      <p className="text-xs text-muted-foreground mt-0.5">CNS: {formatCNS(p.cns)}</p>
                    )}
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
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        const u = unidades.find((x) => x.id === (p.unidadeId || user?.unidadeId)) as any;
                        imprimirLaudoApac(p as any, {
                          unidadeNome: u?.nome || "",
                          cnesUnidade: u?.cnes || (u as any)?.cnes_codigo || "",
                        });
                      }}
                      title="Imprimir Laudo APAC"
                    >
                      <FileSignature className="w-3.5 h-3.5" />
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
              className="w-full min-w-0"
              onClick={() => handleOpenFicha(detalhePaciente, 'dados_pessoais')}
            >
              <Printer className="w-4 h-4 mr-1.5" />
              <span className="truncate">Imprimir Só Dados</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full min-w-0"
              onClick={() => {
                const u = unidades.find((x) => x.id === (detalhePaciente.unidadeId || user?.unidadeId)) as any;
                imprimirLaudoApac(detalhePaciente as any, {
                  unidadeNome: u?.nome || "",
                  cnesUnidade: u?.cnes || (u as any)?.cnes_codigo || "",
                });
              }}
            >
              <FileSignature className="w-4 h-4 mr-1.5" />
              <span className="truncate">Laudo APAC</span>
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

            <PSecao titulo="Documentos e Anexos">
              <PatientAttachmentManager pacienteId={detalhePaciente.id} unidadeId={detalhePaciente.unidadeId} />
            </PSecao>
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
              <LoadingState label="Carregando dados da ficha..." size="lg" />
            ) : fichaData ? (
              <FichaImpressao data={fichaData} mode={fichaPrintMode} onPrintComplete={handlePrintComplete} />
            ) : (
              <ErrorState
                title="Erro ao carregar"
                description="Não foi possível carregar os dados da ficha."
                onRetry={() => setFichaOpen(false)}
                retryLabel="Fechar"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Pacientes;