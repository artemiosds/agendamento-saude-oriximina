import React, { useState, useEffect, useRef, useMemo } from "react";
import { useProntuarioStructure } from "@/hooks/useProntuarioStructure";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Loader2, Plus, FileText, Printer, Pencil, Search, CheckCircle, History, Trash2, Activity, ClipboardList, Heart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams, useNavigate } from "react-router-dom";
import AtendimentoTimer from "@/components/AtendimentoTimer";
import { openPrintDocument } from "@/lib/printLayout";
import { HistoricoClinico } from "@/components/HistoricoClinico";
import { BuscaPaciente } from "@/components/BuscaPaciente";
import GerarDocumentoModal from "@/components/GerarDocumentoModal";
import SolicitacaoExames from "@/components/SolicitacaoExames";
import { Stamp } from "lucide-react";

const PTS_SPECIALTIES = [
  'Fisioterapia', 'Fonoaudiologia', 'Psicologia', 'Terapia Ocupacional',
  'Neuropsicologia', 'Psicopedagogia', 'Nutrição', 'Serviço Social', 'Enfermagem',
];

const FREQUENCY_OPTIONS = ["semanal", "quinzenal", "mensal", "bisemanal", "diário"];

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
}

const TIPOS_REGISTRO = [
  { value: 'consulta', label: 'Consulta' },
  { value: 'avaliacao_inicial', label: 'Avaliação Inicial' },
  { value: 'sessao', label: 'Sessão (SOAP)' },
  { value: 'retorno', label: 'Retorno' },
  { value: 'reavaliacao', label: 'Reavaliação' },
  { value: 'avaliacao_enfermagem', label: 'Avaliação de Enfermagem' },
  { value: 'pts', label: 'PTS' },
  { value: 'triagem_inicial', label: 'Triagem Inicial' },
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
  const { user, hasPermission } = useAuth();
  const { pacientes, unidades, agendamentos, updateAgendamento, logAction, refreshAgendamentos, funcionarios, addAgendamento, getAvailableSlots } = useData();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [prontuarios, setProntuarios] = useState<ProntuarioDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [previousForm, setPreviousForm] = useState<typeof emptyForm | null>(null);
  const [search, setSearch] = useState("");
  const [activeAtendimento, setActiveAtendimento] = useState<{ agendamentoId: string; horaInicio: string } | null>(
    null,
  );
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
    treatment_type: '', total_sessions: 6, frequency: 'semanal',
    start_date: new Date().toISOString().split("T")[0], clinical_notes: '',
  });

  const [procedimentos, setProcedimentos] = useState<ProcedimentoDB[]>([]);
  const [selectedProcIds, setSelectedProcIds] = useState<string[]>([]);
  const [episodios, setEpisodios] = useState<{ id: string; titulo: string; status: string }[]>([]);

  const isProfissional = user?.role === "profissional";
  const canEdit = hasPermission(["master", "coordenador", "profissional"]);
  const canDelete = hasPermission(["master", "coordenador"]);
  const tempoLimite = user?.tempoAtendimento || 30;
  const { getEnabledFields: getStructureSections } = useProntuarioStructure();
  const structureSections = getStructureSections();

  // Custom fields storage (for fields not in DB columns)
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [listaExames, setListaExames] = useState<{ id: string; nome: string; codigo_sus: string; indicacao: string }[]>([]);

  useEffect(() => {
    const loadProcs = async () => {
      const { data } = await supabase.from("procedimentos").select("*").eq("ativo", true);
      if (data) setProcedimentos(data as ProcedimentoDB[]);
    };
    loadProcs();
  }, []);

  const filteredProcedimentos = useMemo(() => {
    if (!user) return [];
    return procedimentos.filter((p) => {
      if (p.profissao && user.profissao && p.profissao.toLowerCase() !== user.profissao.toLowerCase()) return false;
      if (p.profissionais_ids && p.profissionais_ids.length > 0 && !p.profissionais_ids.includes(user.id)) return false;
      return true;
    });
  }, [procedimentos, user]);

  const loadProntuarios = async () => {
    setLoading(true);
    try {
      // All professionals can VIEW all prontuários — edit is restricted in the UI
      let query = (supabase as any).from("prontuarios").select("*").order("data_atendimento", { ascending: false });
      if (user?.role === "coordenador" && user.unidadeId) query = query.eq("unidade_id", user.unidadeId);
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
  }, [user]);

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

  useEffect(() => {
    const pacienteId = searchParams.get("pacienteId");
    const pacienteNome = searchParams.get("pacienteNome");
    const agendamentoId = searchParams.get("agendamentoId");
    const horaInicio = searchParams.get("horaInicio");
    const data = searchParams.get("data");

    if (pacienteId && pacienteNome) {
      if (agendamentoId) loadTriagem(agendamentoId);
      loadEpisodios(pacienteId);
      const existingForAgendamento = agendamentoId ? prontuarios.find((p) => p.agendamento_id === agendamentoId) : null;
      if (existingForAgendamento) {
        openEdit(existingForAgendamento);
      } else {
        setEditId(null);
        setSelectedProcIds([]);
        setForm({
          ...emptyForm,
          paciente_id: pacienteId,
          paciente_nome: pacienteNome,
          agendamento_id: agendamentoId || "",
          data_atendimento: data || new Date().toISOString().split("T")[0],
          hora_atendimento: horaInicio || "",
        });
        setDialogOpen(true);
      }
      if (agendamentoId && horaInicio) {
        setActiveAtendimento({ agendamentoId, horaInicio });
      } else if (agendamentoId) {
        const stored = localStorage.getItem(`timer_${agendamentoId}`);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            setActiveAtendimento({ agendamentoId, horaInicio: parsed.horaInicio });
          } catch {}
        }
      }
    }
  }, [searchParams, prontuarios.length]);

  const patientHistory = useMemo(() => {
    if (!form.paciente_id) return [];
    return prontuarios
      .filter((p) => p.paciente_id === form.paciente_id && p.id !== editId)
      .sort((a, b) => b.data_atendimento.localeCompare(a.data_atendimento));
  }, [form.paciente_id, prontuarios, editId]);

  const openNew = () => {
    setEditId(null);
    setActiveAtendimento(null);
    setSelectedProcIds([]);
    setEpisodios([]);
    setForm({ ...emptyForm, data_atendimento: new Date().toISOString().split("T")[0] });
    setDialogOpen(true);
  };

  const openEdit = (p: ProntuarioDB) => {
    setEditId(p.id);
    setActiveAtendimento(null);
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

  const handleSave = async () => {
    if (!form.paciente_nome || !form.data_atendimento) {
      toast.error("Paciente e data são obrigatórios.");
      return;
    }
    if (editId && !form.motivo_alteracao) {
      toast.error("Informe o motivo da alteração para salvar.");
      return;
    }
    setSaving(true);
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
        prescricao: form.prescricao,
        solicitacao_exames: form.solicitacao_exames,
        evolucao: form.evolucao,
        observacoes: form.observacoes,
        // CORRIGIDO: converte 'no_indication' para '' antes de salvar no banco
        indicacao_retorno: form.indicacao_retorno === "no_indication" ? "" : form.indicacao_retorno || "",
        motivo_alteracao: editId ? form.motivo_alteracao : "",
        procedimentos_texto: procTexto || form.procedimentos_texto || "",
        outro_procedimento: form.outro_procedimento || "",
        tipo_registro: form.tipo_registro || "consulta",
        soap_subjetivo: form.soap_subjetivo || "",
        soap_objetivo: form.soap_objetivo || "",
        soap_avaliacao: form.soap_avaliacao || "",
        soap_plano: form.soap_plano || "",
      };

      // CORRIGIDO: não salva 'no_episode' no banco
      if (form.episodio_id && form.episodio_id !== "no_episode") {
        record.episodio_id = form.episodio_id;
      }

      const pac = pacientes.find((px) => px.id === (form.paciente_id || record.paciente_id));
      let prontuarioId = editId;

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
        toast.success("Prontuário atualizado!");
      } else {
        const { data: inserted, error } = await (supabase as any)
          .from("prontuarios")
          .insert(record)
          .select("id")
          .single();
        if (error) throw error;
        prontuarioId = inserted?.id;
        await logAction({
          acao: "prontuario_criado",
          entidade: "prontuario",
          entidadeId: inserted?.id || "",
          modulo: "prontuario",
          user,
          detalhes: { paciente_nome: form.paciente_nome, paciente_cpf: pac?.cpf || "" },
        });
        toast.success("Prontuário criado!");
      }

      if (prontuarioId) {
        await (supabase as any).from("prontuario_procedimentos").delete().eq("prontuario_id", prontuarioId);
        if (selectedProcIds.length > 0) {
          const links = selectedProcIds.map((pid) => ({ prontuario_id: prontuarioId, procedimento_id: pid }));
          await (supabase as any).from("prontuario_procedimentos").insert(links);
        }
      }

      setDialogOpen(false);
      setPreviousForm(null);
      await loadProntuarios();
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err?.message || "erro desconhecido"));
    }
    setSaving(false);
  };

  const handleFinalizarAtendimento = async () => {
    await handleSave();
    if (!activeAtendimento) return;
    const now = new Date();
    const horaFim = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const [hi, mi] = activeAtendimento.horaInicio.split(":").map(Number);
    const [hf, mf] = horaFim.split(":").map(Number);
    const duracaoMinutos = hf * 60 + mf - (hi * 60 + mi);
    const pac = pacientes.find((px) => px.id === form.paciente_id);
    try {
      await (supabase as any)
        .from("atendimentos")
        .update({ hora_fim: horaFim, duracao_minutos: Math.max(0, duracaoMinutos), status: "finalizado" })
        .eq("agendamento_id", activeAtendimento.agendamentoId);
    } catch (err) {
      console.error("Error finalizing atendimento:", err);
    }
    await logAction({
      acao: "atendimento_finalizado",
      entidade: "atendimento",
      entidadeId: activeAtendimento.agendamentoId,
      modulo: "atendimento",
      user,
      detalhes: {
        paciente_nome: form.paciente_nome,
        paciente_cpf: pac?.cpf || "",
        hora_inicio: activeAtendimento.horaInicio,
        hora_fim: horaFim,
        duracao_minutos: Math.max(0, duracaoMinutos),
        unidade: user?.unidadeId || "",
        sala: user?.salaId || "",
      },
    });
    localStorage.removeItem(`timer_${activeAtendimento.agendamentoId}`);
    updateAgendamento(activeAtendimento.agendamentoId, { status: "concluido" });
    setActiveAtendimento(null);
    toast.success(`Atendimento finalizado! Duração: ${Math.max(0, duracaoMinutos)} minutos.`);
    navigate("/painel/agenda");
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

  // ---- Treatment cycle inline creation ----
  const calcEndDate = (startDate: string, totalSessions: number, frequency: string) => {
    const d = new Date(startDate + "T12:00:00");
    const weeksMap: Record<string, number> = { "diário": 1 / 7, semanal: 1, bisemanal: 0.5, quinzenal: 2, mensal: 4 };
    const weeks = (weeksMap[frequency] || 1) * totalSessions;
    d.setDate(d.getDate() + Math.ceil(weeks * 7));
    return d.toISOString().split("T")[0];
  };

  const handleCreateCycle = async () => {
    if (!form.paciente_id || !cycleForm.treatment_type) {
      toast.error("Preencha tipo de tratamento.");
      return;
    }
    setCycleSaving(true);
    try {
      const endDate = calcEndDate(cycleForm.start_date, cycleForm.total_sessions, cycleForm.frequency);
      const { data: cycleData, error: cycleError } = await supabase.from("treatment_cycles").insert({
        patient_id: form.paciente_id,
        professional_id: user?.id || "",
        unit_id: user?.unidadeId || "",
        specialty: user?.profissao || "",
        treatment_type: cycleForm.treatment_type,
        start_date: cycleForm.start_date,
        end_date_predicted: endDate,
        total_sessions: cycleForm.total_sessions,
        sessions_done: 0,
        frequency: cycleForm.frequency,
        status: "em_andamento",
        clinical_notes: cycleForm.clinical_notes,
        created_by: user?.id || "",
      }).select().single();
      if (cycleError) throw cycleError;

      // Generate sessions
      const sessionsToCreate = [];
      const startD = new Date(cycleForm.start_date + "T12:00:00");
      const weeksDelta: Record<string, number> = { "diário": 1, semanal: 7, bisemanal: 3.5, quinzenal: 14, mensal: 30 };
      const delta = weeksDelta[cycleForm.frequency] || 7;
      for (let i = 0; i < cycleForm.total_sessions; i++) {
        const sessionDate = new Date(startD);
        sessionDate.setDate(startD.getDate() + Math.round(i * delta));
        sessionsToCreate.push({
          cycle_id: cycleData.id,
          patient_id: form.paciente_id,
          professional_id: user?.id || "",
          session_number: i + 1,
          total_sessions: cycleForm.total_sessions,
          scheduled_date: sessionDate.toISOString().split("T")[0],
          status: "pendente_agendamento",
        });
      }
      await supabase.from("treatment_sessions").insert(sessionsToCreate);

      await logAction({
        acao: "criar_ciclo_tratamento",
        entidade: "treatment_cycle",
        entidadeId: cycleData.id,
        modulo: "prontuario",
        user,
        detalhes: { paciente: form.paciente_nome, tipo: cycleForm.treatment_type, sessoes: cycleForm.total_sessions },
      });
      toast.success("Ciclo de tratamento criado! Sessões aguardam agendamento pela recepção.");
      setCycleOpen(false);
      setCycleForm({ treatment_type: '', total_sessions: 6, frequency: 'semanal', start_date: new Date().toISOString().split("T")[0], clinical_notes: '' });
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
        <div className="flex gap-2 flex-wrap">
          {queryPacienteId && (
            <>
              <Button variant="outline" onClick={() => setShowHistorico(!showHistorico)}>
                <Activity className="w-4 h-4 mr-2" />
                {showHistorico ? "Ocultar" : "Ver"} Histórico
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
          if (!open) setActiveAtendimento(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
              <Select value={form.tipo_registro} onValueChange={(v) => setForm((p) => ({ ...p, tipo_registro: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_REGISTRO.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic fields from structure config */}
            {structureSections ? (
              structureSections.map(section => {
                // SOAP section: only show for sessao type
                if (section.id === 'sec_soap' && form.tipo_registro !== 'sessao') return null;

                return (
                  <div key={section.id} className={section.id === 'sec_soap' ? 'space-y-3 bg-primary/5 rounded-lg p-4 border border-primary/20' : 'space-y-3'}>
                    {section.id === 'sec_soap' && <h3 className="font-semibold text-sm text-primary">Registro SOAP — Sessão</h3>}
                    {section.id !== 'sec_soap' && section.title && (
                      <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">{section.title}</h4>
                    )}
                    {section.fields.map(field => {
                      const isBuiltin = field.isBuiltin;
                      const formKey = field.key as keyof typeof form;
                      const value = isBuiltin ? (form[formKey] || '') : (customFields[field.key] || '');
                      const onChange = (val: string) => {
                        if (isBuiltin) {
                          setForm(p => ({ ...p, [field.key]: val }));
                        } else {
                          setCustomFields(p => ({ ...p, [field.key]: val }));
                        }
                      };

                      return (
                        <div key={field.id}>
                          <Label>{field.label}{field.required && <span className="text-destructive ml-0.5">*</span>}</Label>
                          {(field.type === 'textarea') && (
                            <Textarea rows={2} value={value as string} onChange={e => onChange(e.target.value)} />
                          )}
                          {field.type === 'text' && (
                            <Input value={value as string} onChange={e => onChange(e.target.value)} />
                          )}
                          {field.type === 'number' && (
                            <Input type="number" value={value as string} onChange={e => onChange(e.target.value)} />
                          )}
                          {field.type === 'date' && (
                            <Input type="date" value={value as string} onChange={e => onChange(e.target.value)} />
                          )}
                          {field.type === 'select' && field.key !== 'indicacao_retorno' && (
                            <Select value={value as string || '_none'} onValueChange={v => onChange(v === '_none' ? '' : v)}>
                              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_none">Selecione...</SelectItem>
                                {(field.options || []).map(opt => (
                                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          {field.type === 'checkbox' && (
                            <div className="flex items-center gap-2 mt-1">
                              <Checkbox checked={value === 'true'} onCheckedChange={v => onChange(v ? 'true' : 'false')} />
                              <span className="text-sm">{field.label}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            ) : (
              <>
                {/* Fallback: original hardcoded fields when no config saved */}
                {form.tipo_registro === 'sessao' && (
                  <div className="space-y-3 bg-primary/5 rounded-lg p-4 border border-primary/20">
                    <h3 className="font-semibold text-sm text-primary">Registro SOAP — Sessão</h3>
                    <div>
                      <Label>S — Subjetivo (Relato do paciente)</Label>
                      <Textarea rows={2} value={form.soap_subjetivo} onChange={(e) => setForm((p) => ({ ...p, soap_subjetivo: e.target.value }))} placeholder="O que o paciente relata..." />
                    </div>
                    <div>
                      <Label>O — Objetivo (Dados observáveis)</Label>
                      <Textarea rows={2} value={form.soap_objetivo} onChange={(e) => setForm((p) => ({ ...p, soap_objetivo: e.target.value }))} placeholder="Achados clínicos, exame físico, sinais vitais..." />
                    </div>
                    <div>
                      <Label>A — Avaliação (Análise clínica)</Label>
                      <Textarea rows={2} value={form.soap_avaliacao} onChange={(e) => setForm((p) => ({ ...p, soap_avaliacao: e.target.value }))} placeholder="Interpretação dos achados, hipóteses, diagnóstico funcional..." />
                    </div>
                    <div>
                      <Label>P — Plano (Plano da sessão)</Label>
                      <Textarea rows={2} value={form.soap_plano} onChange={(e) => setForm((p) => ({ ...p, soap_plano: e.target.value }))} placeholder="Condutas, intervenções realizadas, próximos passos..." />
                    </div>
                  </div>
                )}
                <div>
                  <Label>{form.tipo_registro === 'avaliacao_inicial' ? 'Queixa Principal *' : 'Queixa Principal'}</Label>
                  <Textarea rows={2} value={form.queixa_principal} onChange={(e) => setForm((p) => ({ ...p, queixa_principal: e.target.value }))} />
                </div>
                <div><Label>Anamnese</Label><Textarea rows={3} value={form.anamnese} onChange={(e) => setForm((p) => ({ ...p, anamnese: e.target.value }))} /></div>
                <div><Label>Sinais e Sintomas</Label><Textarea rows={2} value={form.sinais_sintomas} onChange={(e) => setForm((p) => ({ ...p, sinais_sintomas: e.target.value }))} /></div>
                <div><Label>Exame Físico</Label><Textarea rows={3} value={form.exame_fisico} onChange={(e) => setForm((p) => ({ ...p, exame_fisico: e.target.value }))} /></div>
                <div><Label>Hipótese / Avaliação</Label><Textarea rows={2} value={form.hipotese} onChange={(e) => setForm((p) => ({ ...p, hipotese: e.target.value }))} /></div>
                <div><Label>Conduta</Label><Textarea rows={2} value={form.conduta} onChange={(e) => setForm((p) => ({ ...p, conduta: e.target.value }))} /></div>
                <div><Label>Prescrição / Orientações</Label><Textarea rows={2} value={form.prescricao} onChange={(e) => setForm((p) => ({ ...p, prescricao: e.target.value }))} /></div>
                <div><Label>Solicitação de Exames</Label><Textarea rows={2} value={form.solicitacao_exames} onChange={(e) => setForm((p) => ({ ...p, solicitacao_exames: e.target.value }))} /></div>
                <div><Label>Evolução</Label><Textarea rows={2} value={form.evolucao} onChange={(e) => setForm((p) => ({ ...p, evolucao: e.target.value }))} /></div>
                <div><Label>Observações Gerais</Label><Textarea rows={2} value={form.observacoes} onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))} /></div>
              </>
            )}

            {filteredProcedimentos.length > 0 && (
              <div>
                <Label className="mb-2 block">Procedimentos Realizados</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-muted/30 rounded-lg p-3 border max-h-40 overflow-y-auto">
                  {filteredProcedimentos.map((proc) => (
                    <div key={proc.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`proc-${proc.id}`}
                        checked={selectedProcIds.includes(proc.id)}
                        onCheckedChange={(checked) => {
                          setSelectedProcIds((prev) =>
                            checked ? [...prev, proc.id] : prev.filter((id) => id !== proc.id),
                          );
                        }}
                      />
                      <label htmlFor={`proc-${proc.id}`} className="text-sm cursor-pointer">
                        {proc.nome}
                        {proc.especialidade && (
                          <span className="text-xs text-muted-foreground ml-1">({proc.especialidade})</span>
                        )}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label>Outro Procedimento</Label>
              <Input
                value={form.outro_procedimento}
                onChange={(e) => setForm((p) => ({ ...p, outro_procedimento: e.target.value }))}
                placeholder="Descreva outro procedimento..."
              />
            </div>

            <div>
              <Label>Indicação de Retorno</Label>
              <Select
                value={form.indicacao_retorno || "no_indication"}
                onValueChange={(v) => setForm((p) => ({ ...p, indicacao_retorno: v === "no_indication" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {retornoOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Decisão Clínica: PTS / Tratamento */}
            {!editId && form.paciente_id && (
              <div className="bg-muted/30 rounded-lg p-4 border space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Heart className="w-4 h-4 text-primary" />
                  Decisão Clínica (opcional)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Após registrar o prontuário, você pode criar um PTS ou iniciar um ciclo de tratamento para este paciente.
                </p>
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

            <div className="flex gap-2">
              {activeAtendimento ? (
                <>
                  <Button onClick={handleSave} disabled={saving} variant="outline" className="flex-1">
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Salvar Rascunho
                  </Button>
                  <Button
                    onClick={handleFinalizarAtendimento}
                    disabled={saving}
                    className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Finalizar Atendimento
                  </Button>
                </>
              ) : (
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full gradient-primary text-primary-foreground"
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
                <Label>Sessões Previstas</Label>
                <Input type="number" min={1} value={cycleForm.total_sessions}
                  onChange={(e) => setCycleForm(p => ({ ...p, total_sessions: parseInt(e.target.value) || 1 }))} />
              </div>
              <div>
                <Label>Frequência</Label>
                <Select value={cycleForm.frequency} onValueChange={(v) => setCycleForm(p => ({ ...p, frequency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Data de Início</Label>
              <Input type="date" value={cycleForm.start_date}
                onChange={(e) => setCycleForm(p => ({ ...p, start_date: e.target.value }))} />
            </div>
            <div>
              <Label>Notas Clínicas</Label>
              <Textarea rows={2} value={cycleForm.clinical_notes}
                onChange={(e) => setCycleForm(p => ({ ...p, clinical_notes: e.target.value }))} />
            </div>
            <p className="text-xs text-muted-foreground">
              As sessões serão criadas automaticamente com status "Aguardando Agendamento". A recepção agendará cada sessão individualmente.
            </p>
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
              <Card key={p.id} className="shadow-card border-0">
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
                        <p className="text-xs text-warning mt-1 italic">
                          Prontuário de outro profissional (somente leitura)
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {canEdit && (isProfissional ? isOwn : true) && (
                        <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => handlePrint(p)}>
                        <Printer className="w-4 h-4" />
                      </Button>
                      {canDelete && (
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
      <GerarDocumentoModal
        open={docModalOpen}
        onOpenChange={setDocModalOpen}
        paciente={(() => {
          const p = pacientes.find(x => x.id === queryPacienteId);
          return p ? { nome: p.nome, cpf: p.cpf, cns: p.cns, data_nascimento: p.dataNascimento, cid: p.cid, especialidade_destino: '' } : undefined;
        })()}
        profissional={user ? { nome: user.nome, profissao: user.profissao, numero_conselho: user.numeroConselho, tipo_conselho: user.tipoConselho, uf_conselho: user.ufConselho } : undefined}
        unidade={unidades.find(u => u.id === user?.unidadeId)?.nome}
        dataAtendimento={new Date().toLocaleDateString('pt-BR')}
      />
    </div>
  );
};

export default ProntuarioPage;
