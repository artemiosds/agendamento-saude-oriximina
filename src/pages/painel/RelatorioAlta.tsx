import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { BuscaPaciente } from "@/components/BuscaPaciente";
import { toast } from "sonner";
import { auditService } from "@/services/auditService";
import {
  FileText, Users, User, ArrowLeft, Printer, FileDown, CheckCircle,
  Save, Send, ClipboardList, Stethoscope, Heart, Activity,
  Clock, AlertCircle, Check, Info, LayoutDashboard, History,
  ShieldCheck, ExternalLink, Download, Lock, Unlock, Hash,
  ChevronRight, ListTodo, AlertTriangle, RefreshCw
} from "lucide-react";
import { openPrintDocument } from "@/lib/printLayout";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import RelatorioFonoAvaliativo from "@/components/RelatorioFonoAvaliativo";

/* ── types ─────────────────────────────────────────── */
interface ProfSection {
  profissional_id: string;
  profissional_nome: string;
  profissao: string;
  conselho: string;
  periodo_inicio: string;
  periodo_fim: string;
  sessoes: number;
  objetivos: string;
  intervencoes: string;
  evolucao: string;
  metas_status: "totalmente" | "parcialmente" | "nao_atingidas";
  metas_justificativa: string;
  tecnologia_assistiva: string;
  // Novos campos para evolução multiprofissional
  status_contribuicao: "nao_iniciada" | "em_preenchimento" | "concluida" | "assinada";
  data_contribuicao: string;
  orientacoes_especificas?: string;
  encaminhamentos_especificos?: string;
  objetivos_especificos?: string;
  adesao?: string;
  intercorrencias?: string;
  finalizado_em?: string;
  finalizado_por?: string;
}

interface VersionRecord {
  version: number;
  data: string;
  user_nome: string;
  action: string;
  reason?: string;
}

interface MetaPTS {
  id: string;
  titulo: string;
  status: string;
  trabalhada?: boolean;
}

type ModoRelatorio = "selector" | "multiprofissional" | "individual" | "individual_fono";

const MODALIDADES = [
  "Reabilitação Física", "Intelectual", "Auditiva", "Visual", "Ostomia"
];

const MOTIVOS_ALTA = [
  { value: "objetivos_atingidos", label: "Alta por objetivos atingidos" },
  { value: "pedido_usuario", label: "A pedido do usuário/família" },
  { value: "infrequencia", label: "Infrequência/abandono" },
  { value: "encaminhamento", label: "Encaminhamento para outro serviço" },
  { value: "agravamento", label: "Agravamento clínico" },
  { value: "administrativa", label: "Alta Administrativa" },
  { value: "transferencia", label: "Transferência" },
  { value: "obito", label: "Óbito" },
  { value: "outro", label: "Outro" },
];

const TIPOS_ALTA = [
  { value: "terapeutica", label: "Terapêutica" },
  { value: "administrativa", label: "Administrativa" },
  { value: "abandono", label: "Abandono/Infrequência" },
  { value: "transferencia", label: "Transferência" },
  { value: "encaminhamento", label: "Encaminhamento" },
  { value: "obito", label: "Óbito" },
  { value: "outro", label: "Outro" },
];

const ENCAMINHAMENTOS = [
  "APS/UBS", "CAPS", "NASF/eMulti", "Outro CER", "Hospital", "Serviço Social", "Escola", "Clínica Especializada", "Outro"
];

const NIVEIS_INDEPENDENCIA = [
  "Independente", "Independente com dispositivo", "Dependente parcial", "Dependente total"
];

const FREQUENCIAS_APS = ["Semanal", "Quinzenal", "Mensal", "Bimestral", "Semestral", "Anual", "Sem necessidade"];

const ADESAO_TRATAMENTO = ["Excelente", "Boa", "Regular", "Baixa"];

const EVOLUCAO_GLOBAL = ["Excelente", "Satisfatória", "Parcial", "Discreta", "Sem evolução relevante"];
const RESPOSTA_TERAPEUTICA = ["Inexistente", "Discreta", "Parcial", "Satisfatória", "Importante"];
const RISCO_POS_ALTA = ["Baixo", "Moderado", "Alto"];
const COMPLEXIDADE_CASO = ["Baixa", "Média", "Alta"];

const INTERCORRENCIAS_OPCOES = [
  "Nenhuma", "Faltas frequentes", "Baixa adesão", "Agravamento clínico", "Barreiras familiares", "Barreiras sociais", "Intercorrências médicas", "Troca de conduta", "Outro"
];

const fmt = (d: string) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return d; }
};

const fmtDateTime = (d: string) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("pt-BR"); } catch { return d; }
};

const calcIdade = (dn: string) => {
  if (!dn) return "";
  try {
    const b = new Date(dn);
    const diff = Date.now() - b.getTime();
    return `${Math.floor(diff / 31557600000)} anos`;
  } catch { return ""; }
};


const RelatorioAlta: React.FC = () => {
  const { user } = useAuth();
  const { pacientes, funcionarios } = useData();
  const { can } = usePermissions();
  const [modo, setModo] = useState<ModoRelatorio>("selector");
  const [showIndividualChooser, setShowIndividualChooser] = useState(false);

  // CBO normalizado do profissional autenticado (somente dígitos)
  const userCboNorm = String(user?.customData?.cbo_codigo ?? "").replace(/\D/g, "");
  const isFonoaudiologo = userCboNorm === "223810";

  const handleIndividualClick = () => {
    if (isFonoaudiologo) setShowIndividualChooser(true);
    else setModo("individual");
  };

  const [version, setVersion] = useState(1);
  const [history, setHistory] = useState<VersionRecord[]>([]);
  const [isReopening, setIsReopening] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [lastUpdatedBy, setLastUpdatedBy] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");

  /* ── shared patient selection ─── */
  const [pacienteId, setPacienteId] = useState("");
  const paciente = useMemo(() => pacientes.find(p => p.id === pacienteId), [pacientes, pacienteId]);

  /* ── multiprofissional state ─── */
  const [modalidades, setModalidades] = useState<string[]>([]);
  const [cid10, setCid10] = useState("");
  const [multiCid10Secundario, setMultiCid10Secundario] = useState("");
  const [multiDiagClinico, setMultiDiagClinico] = useState("");
  const [multiDiagFuncional, setMultiDiagFuncional] = useState("");
  const [multiContextoBiopsicossocial, setMultiContextoBiopsicossocial] = useState("");
  const [cifFuncoes, setCifFuncoes] = useState("");
  const [cifAtividades, setCifAtividades] = useState("");
  const [cifFatores, setCifFatores] = useState("");
  const [multiBarreiras, setMultiBarreiras] = useState("");
  const [multiPotencialidades, setMultiPotencialidades] = useState("");
  const [multiFatoresContextuais, setMultiFatoresContextuais] = useState("");

  const [multiObjetivosGerais, setMultiObjetivosGerais] = useState("");
  const [multiPlanoExecutado, setMultiPlanoExecutado] = useState("");
  const [profSections, setProfSections] = useState<ProfSection[]>([]);
  const [motivoAlta, setMotivoAlta] = useState("");
  const [multiTipoAlta, setMultiTipoAlta] = useState("");
  const [motivoDetalhe, setMultiMotivoDetalhe] = useState("");
  const [condicaoFuncional, setCondicaoFuncional] = useState("");
  const [nivelIndep, setNivelIndep] = useState("");
  const [multiComparacaoFuncional, setMultiComparacaoFuncional] = useState("");
  const [multiGanhosPrincipais, setMultiGanhosPrincipais] = useState("");
  const [multiLimitacoesPersistentes, setMultiLimitacoesPersistentes] = useState("");
  const [multiRiscoRegressao, setMultiRiscoRegressao] = useState("");
  const [multiFatoresAlerta, setMultiFatoresAlerta] = useState("");

  const [orientacoesUsuario, setOrientacoesUsuario] = useState("");
  const [orientacoesUbs, setOrientacoesUbs] = useState("");
  const [multiOrientacoesEscola, setMultiOrientacoesEscola] = useState("");
  const [multiPontosAtencao, setMultiPontosAtencao] = useState("");
  const [encaminhamentos, setEncaminhamentos] = useState<string[]>([]);
  const [freqAps, setFreqAps] = useState("");
  const [multiContinuarTerapia, setMultiContinuarTerapia] = useState("");
  const [multiPrazoRetorno, setMultiPrazoRetorno] = useState("");
  const [multiResponsavelTecnico, setMultiResponsavelTecnico] = useState("");
  const [multiResumoConsolidado, setMultiResumoConsolidado] = useState("");
  const [multiStatus, setMultiStatus] = useState<"rascunho" | "em_preenchimento" | "aguardando" | "validado" | "emitido">("rascunho");
  const [multiComplexidade, setMultiStatusComplexidade] = useState("");

  const [dataAlta, setDataAlta] = useState(new Date().toISOString().split("T")[0]);
  const [tabProf, setTabProf] = useState("");

  const generateMultiSummary = () => {
    const concluidores = profSections.filter(s => s.status_contribuicao === "concluida" || s.status_contribuicao === "assinada");
    const areas = concluidores.map(s => s.profissao).join(", ");
    const summary = `Relatório multiprofissional consolidado pelas áreas de: ${areas}. 
O paciente apresentou evolução global ${nivelIndep.toLowerCase()} no período. 
As intervenções realizadas focaram em ${multiObjetivosGerais}. 
Conclui-se que o paciente ${multiContinuarTerapia === "nao" ? "está apto para alta" : "necessita de seguimento na rede"}.`;
    setMultiResumoConsolidado(summary);
  };

  const [referralDetails, setReferralDetails] = useState<Record<string, { destino: string; motivo: string; prioridade: string }>>({});
  
  const updateReferralDetail = (type: string, field: string, value: string) => {
    setReferralDetails(prev => ({
      ...prev,
      [type]: { ...(prev[type] || { destino: "", motivo: "", prioridade: "média" }), [field]: value }
    }));
  };

  const [indDiagCid, setIndDiagCid] = useState("");
  const [indCif, setIndCif] = useState("");
  const [indDiagClinico, setIndDiagClinico] = useState("");
  const [indDiagFuncional, setIndDiagFuncional] = useState("");
  const [indNivelComprometimento, setIndNivelComprometimento] = useState("");
  const [indObsDiagnosticas, setIndObsDiagnosticas] = useState("");

  const [indQueixaPrincipal, setIndQueixaPrincipal] = useState("");
  const [indMotivoEncaminhamento, setIndMotivoEncaminhamento] = useState("");
  const [indContextoFamiliar, setIndContextoFamiliar] = useState("");
  const [indComorbidades, setIndComorbidades] = useState("");
  const [indMedicacao, setIndMedicacao] = useState("");

  const [indObjetivos, setIndObjetivos] = useState("");
  const [indIntervencoes, setIndIntervencoes] = useState("");
  const [indEvolucao, setIndEvolucao] = useState("");
  const [indMetas, setIndMetas] = useState<"totalmente" | "parcialmente" | "nao_atingidas">("totalmente");
  const [indMetasJust, setIndMetasJust] = useState("");
  const [indTA, setIndTA] = useState("");
  const [indFrequenciaAtendimento, setIndFrequenciaAtendimento] = useState("");
  const [indAdesaoTratamento, setIndAdesaoTratamento] = useState("");
  const [indEvolucaoGlobal, setIndEvolucaoGlobal] = useState("");
  const [indIntercorrencias, setIndIntercorrencias] = useState("");
  const [indIntercorrenciasObs, setIndIntercorrenciasObs] = useState("");
  const [indRespostaTerapeutica, setIndRespostaTerapeutica] = useState("");
  const [indComparacaoInicioAlta, setIndComparacaoInicioAlta] = useState("");
  const [indResumoConsolidado, setIndResumoConsolidado] = useState("");
  const [indRiscoPosAlta, setIndRiscoPosAlta] = useState("");
  const [indComplexidade, setIndComplexidade] = useState("");

  const [indMotivo, setIndMotivo] = useState("");
  const [indTipoAlta, setIndTipoAlta] = useState("");
  const [indMotivoDet, setIndMotivoDet] = useState("");
  const [indOrientacoes, setIndOrientacoes] = useState("");
  const [indEncaminhamento, setIndEncaminhamento] = useState("");
  const [indModalidade, setIndModalidade] = useState("");
  const [indDataAlta, setIndDataAlta] = useState(new Date().toISOString().split("T")[0]);
  const [indSessoes, setIndSessoes] = useState(0);
  const [indFaltas, setIndFaltas] = useState(0);
  const [indPeriodoInicio, setIndPeriodoInicio] = useState("");
  const [indPeriodoFim, setIndPeriodoFim] = useState("");
  const [indContinuarTerapia, setIndContinuarTerapia] = useState("");
  const [indRiscoRegressao, setIndRiscoRegressao] = useState("");
  const [indPrazoReavaliacao, setIndPrazoReavaliacao] = useState("");

  const [status, setStatus] = useState<"rascunho" | "concluido" | "validado" | "emitido">("rascunho");

  const [reportId, setReportId] = useState<string | null>(null);
  const [ptsMetas, setPtsMetas] = useState<MetaPTS[]>([]);
  const [loading, setLoading] = useState(false);

  /* ── auto-load professional data when patient selected ─── */
  useEffect(() => {
    if (!pacienteId || (modo !== "multiprofissional" && modo !== "individual")) return;
    if (modo === "multiprofissional") {
      loadProfessionalsForPatient(pacienteId);
      loadMultiData(pacienteId);
    }

  }, [pacienteId, modo]);

  useEffect(() => {
    if (!pacienteId || modo !== "individual") return;
    loadIndividualData(pacienteId);
  }, [pacienteId, modo]);

  const loadProfessionalsForPatient = async (pid: string) => {
    // Get all professionals who created prontuarios for this patient
    const { data: pronts } = await supabase
      .from("prontuarios")
      .select("profissional_id, profissional_nome, data_atendimento, hipotese, procedimentos_texto")
      .eq("paciente_id", pid)
      .order("data_atendimento", { ascending: true });

    if (!pronts || pronts.length === 0) {
      setProfSections([]);
      return;
    }

    // Group by professional
    const profMap = new Map<string, { nome: string; datas: string[]; lastPront?: any }>();
    pronts.forEach(p => {
      const existing = profMap.get(p.profissional_id);
      if (existing) {
        existing.datas.push(p.data_atendimento);
        existing.lastPront = p;
      } else {
        profMap.set(p.profissional_id, { nome: p.profissional_nome, datas: [p.data_atendimento], lastPront: p });
      }
    });

    // Count sessions from treatment_sessions
    const { data: sessions } = await supabase
      .from("treatment_sessions")
      .select("professional_id, status")
      .eq("patient_id", pid)
      .eq("status", "realizada");

    const sessionCounts = new Map<string, number>();
    sessions?.forEach(s => {
      sessionCounts.set(s.professional_id, (sessionCounts.get(s.professional_id) || 0) + 1);
    });

    const sections: ProfSection[] = [];
    profMap.forEach((val, profId) => {
      const func = funcionarios.find(f => f.id === profId);
      const datas = val.datas.sort();
      sections.push({
        profissional_id: profId,
        profissional_nome: val.nome,
        profissao: func?.profissao || "",
        conselho: func ? `${func.tipoConselho} ${func.numeroConselho}/${func.ufConselho}` : "",
        periodo_inicio: datas[0] || "",
        periodo_fim: datas[datas.length - 1] || "",
        sessoes: sessionCounts.get(profId) || val.datas.length,
        objetivos: "",
        intervencoes: val.lastPront?.procedimentos_texto || "",
        evolucao: "",
        metas_status: "totalmente",
        metas_justificativa: "",
        tecnologia_assistiva: "",
        status_contribuicao: "nao_iniciada",
        data_contribuicao: "",
        orientacoes_especificas: "",
        encaminhamentos_especificos: "",
        objetivos_especificos: "",
        adesao: "Excelente",
        intercorrencias: "Nenhuma"
      });
    });


    setProfSections(sections);
    if (sections.length > 0) setTabProf(sections[0].profissional_id);

    // Pre-fill CID from patient or most recent prontuario
    const pat = pacientes.find(p => p.id === pid);
    const lastP = pronts[pronts.length - 1];
    if (lastP?.hipotese) setCid10(lastP.hipotese);
    else if (pat?.cid) setCid10(pat.cid);
    
    // Auto-fill from PTS if exists
    const { data: activePts } = await supabase
      .from("pts")
      .select("*")
      .eq("patient_id", pid)
      .eq("status", "ativo")
      .maybeSingle();

    if (activePts) {
      setMultiDiagFuncional(activePts.diagnostico_funcional || "");
      setMultiObjetivosGerais(activePts.objetivos_terapeuticos || "");
      setMultiBarreiras(activePts.barreiras || "");
      setMultiPotencialidades(activePts.potencialidades || "");
    }
  };

  const loadMultiData = async (pid: string) => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data: existingDraft } = await supabase
        .from("prontuarios")
        .select("*")
        .eq("paciente_id", pid)
        .eq("status", "rascunho")
        .eq("tipo_registro", "alta_multiprofissional")
        .maybeSingle();

      if (existingDraft) {
        setReportId(existingDraft.id);
        setStatus(existingDraft.status as any || "rascunho");
        const data = JSON.parse(existingDraft.observacoes);
        
        setModalidades(data.modalidades || []);
        setCid10(data.cid10 || "");
        setMultiCid10Secundario(data.multiCid10Secundario || "");
        setMultiDiagClinico(data.multiDiagClinico || "");
        setMultiDiagFuncional(data.multiDiagFuncional || "");
        setMultiContextoBiopsicossocial(data.multiContextoBiopsicossocial || "");
        setCifFuncoes(data.cifFuncoes || "");
        setCifAtividades(data.cifAtividades || "");
        setCifFatores(data.cifFatores || "");
        setMultiBarreiras(data.multiBarreiras || "");
        setMultiPotencialidades(data.multiPotencialidades || "");
        setMultiFatoresContextuais(data.multiFatoresContextuais || "");
        setMultiObjetivosGerais(data.multiObjetivosGerais || "");
        setMultiPlanoExecutado(data.multiPlanoExecutado || "");
        setProfSections(data.profissionais || []);
        setMotivoAlta(data.motivoAlta || "");
        setMultiTipoAlta(data.multiTipoAlta || "");
        setMultiMotivoDetalhe(data.motivoDetalhe || "");
        setCondicaoFuncional(data.condicaoFuncional || "");
        setNivelIndep(data.nivelIndep || "");
        setMultiComparacaoFuncional(data.multiComparacaoFuncional || "");
        setMultiGanhosPrincipais(data.multiGanhosPrincipais || "");
        setMultiLimitacoesPersistentes(data.multiLimitacoesPersistentes || "");
        setMultiRiscoRegressao(data.multiRiscoRegressao || "");
        setMultiFatoresAlerta(data.multiFatoresAlerta || "");
        setOrientacoesUsuario(data.orientacoesUsuario || "");
        setOrientacoesUbs(data.orientacoesUbs || "");
        setMultiOrientacoesEscola(data.multiOrientacoesEscola || "");
        setMultiPontosAtencao(data.multiPontosAtencao || "");
        setEncaminhamentos(data.encaminhamentos || []);
        setFreqAps(data.freqAps || "");
        setMultiContinuarTerapia(data.multiContinuarTerapia || "");
        setMultiPrazoRetorno(data.multiPrazoRetorno || "");
        setMultiResponsavelTecnico(data.multiResponsavelTecnico || "");
        setMultiResumoConsolidado(data.resumoConsolidado || "");
        setDataAlta(existingDraft.data_atendimento || new Date().toISOString().split("T")[0]);
        
        setVersion(data.version || 1);
        setHistory(data.history || []);
        setLastUpdatedBy(existingDraft.profissional_nome);
        setLastUpdatedAt(existingDraft.atualizado_em || existingDraft.criado_em);
        
        toast.info("Relatório multiprofissional carregado.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadIndividualData = async (pid: string) => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // 1. Check for existing draft
      const { data: existingDraft } = await supabase
        .from("prontuarios")
        .select("*")
        .eq("paciente_id", pid)
        .eq("profissional_id", user.id)
        .eq("status", "rascunho")
        .eq("tipo_registro", "alta_individual")
        .maybeSingle();

      if (existingDraft) {
        setReportId(existingDraft.id);
        setStatus(existingDraft.status as any || "rascunho");
        const data = JSON.parse(existingDraft.observacoes);
        // Load all data from draft
        setIndDiagCid(data.diagCid || "");
        setIndCif(data.cif || "");
        setIndDiagClinico(data.diagClinico || "");
        setIndDiagFuncional(data.diagFuncional || "");
        setIndNivelComprometimento(data.nivelComprometimento || "");
        setIndObsDiagnosticas(data.obsDiagnosticas || "");
        setIndQueixaPrincipal(data.queixaPrincipal || "");
        setIndMotivoEncaminhamento(data.motivoEncaminhamento || "");
        setIndContextoFamiliar(data.contextoFamiliar || "");
        setIndComorbidades(data.comorbidades || "");
        setIndMedicacao(data.medicacao || "");
        setIndObjetivos(data.objetivos || "");
        setIndIntervencoes(data.intervencoes || "");
        setIndEvolucao(data.evolucao || "");
        setIndMetas(data.metas || "totalmente");
        setIndMetasJust(data.metasJust || "");
        setIndTA(data.ta || "");
        setIndFrequenciaAtendimento(data.frequenciaAtendimento || "");
        setIndAdesaoTratamento(data.adesaoTratamento || "");
        setIndEvolucaoGlobal(data.evolucaoGlobal || "");
        setIndIntercorrencias(data.intercorrencias || "");
        setIndIntercorrenciasObs(data.intercorrenciasObs || "");
        setIndRespostaTerapeutica(data.respostaTerapeutica || "");
        setIndComparacaoInicioAlta(data.comparacaoInicioAlta || "");
        setIndResumoConsolidado(data.resumoConsolidado || "");
        setIndRiscoPosAlta(data.riscoPosAlta || "");
        setIndComplexidade(data.complexidade || "");
        setIndMotivo(data.motivo || "");
        setIndTipoAlta(data.tipoAlta || "");
        setIndMotivoDet(data.motivoDet || "");
        setIndOrientacoes(data.orientacoes || "");
        setIndEncaminhamento(data.encaminhamento || "");
        setIndModalidade(data.modalidade || "");
        setIndDataAlta(existingDraft.data_atendimento || new Date().toISOString().split("T")[0]);
        setIndSessoes(data.sessoes || 0);
        setIndFaltas(data.faltas || 0);
        setIndPeriodoInicio(data.periodoInicio || "");
        setIndPeriodoFim(data.periodoFim || "");
        setIndContinuarTerapia(data.continuarTerapia || "");
        setIndRiscoRegressao(data.riscoRegressao || "");
        setIndPrazoReavaliacao(data.prazoReavaliacao || "");
        
        setVersion(data.version || 1);
        setHistory(data.history || []);
        setLastUpdatedBy(existingDraft.profissional_nome);
        setLastUpdatedAt(existingDraft.atualizado_em || existingDraft.criado_em);
        
        toast.info("Rascunho individual carregado.");
        setLoading(false);
        return;
      }

      // 2. Load fresh data if no draft
      const { data: pronts } = await supabase
        .from("prontuarios")
        .select("data_atendimento, hipotese, procedimentos_texto, queixa_principal, evolucao, conduta")
        .eq("paciente_id", pid)
        .eq("profissional_id", user.id)
        .order("data_atendimento", { ascending: true });

      if (pronts && pronts.length > 0) {
        setIndPeriodoInicio(pronts[0].data_atendimento);
        setIndPeriodoFim(pronts[pronts.length - 1].data_atendimento);
        setIndQueixaPrincipal(pronts[0].queixa_principal || "");
        
        const lastPront = pronts[pronts.length - 1];
        setIndDiagCid(lastPront.hipotese || "");
        setIndIntervencoes(lastPront.procedimentos_texto || "");
        setIndEvolucao(lastPront.evolucao || "");
        setIndOrientacoes(lastPront.conduta || "");
      }
  const generateIndSummary = () => {
    const summary = `Paciente em acompanhamento no período de ${fmt(indPeriodoInicio)} a ${fmt(indPeriodoFim)}, totalizando ${indSessoes} sessões. 
Durante o tratamento, os objetivos terapêuticos foram ${indMetas === "totalmente" ? "plenamente" : "parcialmente"} atingidos. 
A evolução global foi considerada ${indEvolucaoGlobal.toLowerCase()}. 
Na alta, apresenta ${indDiagFuncional || "estabilidade funcional"}. 
Recomenda-se ${indContinuarTerapia === "nao" ? "alta definitiva" : "continuidade do cuidado"}.`;
    setIndResumoConsolidado(summary);
  };

  const handleReopen = async () => {
    if (!reopenReason) { toast.error("Informe o motivo da reabertura"); return; }
    
    const newVersion = version + 1;
    const actionDate = new Date().toISOString();
    const newHistoryEntry: VersionRecord = {
      version: newVersion,
      data: actionDate,
      user_nome: user?.nome || "Sistema",
      action: "Reabertura de Relatório",
      reason: reopenReason
    };

    const updatedHistory = [...history, newHistoryEntry];
    setStatus("rascunho");
    setVersion(newVersion);
    setHistory(updatedHistory);
    setIsReopening(false);
    
    // Save state change
    await handleSave(modo === "individual" ? "individual" : "multi", true, "rascunho");

    await auditService.log({
      acao: "reabrir_relatorio_alta",
      modulo: "prontuario",
      entidade: "prontuario",
      entidadeId: reportId || "",
      pacienteId: pacienteId,
      pacienteNome: paciente?.nome,
      profissionalId: user?.id,
      profissionalNome: user?.nome,
      detalhes: { motivo: reopenReason, version: newVersion }

    });
    
    setReopenReason("");
    toast.success("Relatório reaberto para edição");
  };


      // Load sessions and absences
      const { data: sessions } = await supabase
        .from("treatment_sessions")
        .select("status")
        .eq("patient_id", pid)
        .eq("professional_id", user.id);

      const realizada = sessions?.filter(s => s.status === "realizada").length || 0;
      const faltas = sessions?.filter(s => s.status === "falta").length || 0;
      setIndSessoes(realizada);
      setIndFaltas(faltas);

      // Load PTS
      const { data: activePts } = await supabase
        .from("pts")
        .select("*")
        .eq("patient_id", pid)
        .eq("status", "ativo")
        .maybeSingle();

      if (activePts) {
        setIndDiagFuncional(activePts.diagnostico_funcional || "");
        setIndObjetivos(activePts.objetivos_terapeuticos || "");
        setIndMotivoEncaminhamento(activePts.motivo_encaminhamento || "");
        
        const { data: metas } = await supabase
          .from("pts_metas")
          .select("id, titulo, status")
          .eq("pts_id", activePts.id);
        
        if (metas) setPtsMetas(metas);
      }

      const pat = pacientes.find(p => p.id === pid);
      if (pat?.cid && !indDiagCid) setIndDiagCid(pat.cid);


    } catch (error) {
      console.error("Error loading individual data:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateProfSection = (profId: string, field: keyof ProfSection, value: any) => {
    setProfSections(prev =>
      prev.map(s => s.profissional_id === profId ? { ...s, [field]: value } : s)
    );
  };

  /* ── VALIDATION ─── */
  const validateMulti = (): string[] => {
    const errors: string[] = [];
    if (!pacienteId) errors.push("Selecione um paciente");
    if (!motivoAlta) errors.push("Selecione o motivo da alta");
    if (!multiTipoAlta) errors.push("Selecione o tipo de alta");
    if (!nivelIndep) errors.push("Selecione o nível de independência");
    if (modalidades.length === 0) errors.push("Selecione pelo menos uma modalidade");
    
    const hasCompletedContribution = profSections.some(s => s.status_contribuicao === "concluida");
    if (!hasCompletedContribution) {
      errors.push("Pelo menos um profissional deve concluir sua contribuição");
    }

    profSections.forEach(s => {
      if (s.status_contribuicao === "concluida" && s.metas_status !== "totalmente" && !s.metas_justificativa) {
        errors.push(`Justificativa de metas obrigatória para ${s.profissional_nome}`);
      }
    });
    return errors;
  };

  const validateInd = (): string[] => {
    const errors: string[] = [];
    if (!pacienteId) errors.push("Selecione um paciente");
    if (!indMotivo) errors.push("Selecione o motivo da alta");
    if (!indTipoAlta) errors.push("Selecione o tipo de alta");
    if (!indEvolucao) errors.push("A evolução clínica é obrigatória");
    if (!indOrientacoes) errors.push("Orientações de alta são obrigatórias");
    if (!indDiagClinico) errors.push("Diagnóstico clínico é obrigatório");
    if (!indResumoConsolidado) errors.push("O resumo final consolidado é obrigatório");
    if (indMetas !== "totalmente" && !indMetasJust) errors.push("Justificativa de metas obrigatória");
    return errors;
  };

  const generateIndSummary = () => {
    const summary = `Paciente em acompanhamento no período de ${fmt(indPeriodoInicio)} a ${fmt(indPeriodoFim)}, totalizando ${indSessoes} sessões. 
Durante o tratamento, os objetivos terapêuticos foram ${indMetas === "totalmente" ? "plenamente" : "parcialmente"} atingidos. 
A evolução global foi considerada ${indEvolucaoGlobal.toLowerCase()}. 
Na alta, apresenta ${indDiagFuncional || "estabilidade funcional"}. 
Recomenda-se ${indContinuarTerapia === "nao" ? "alta definitiva" : "continuidade do cuidado"}.`;
    setIndResumoConsolidado(summary);
  };

  const handleReopen = async () => {
    if (!reopenReason) { toast.error("Informe o motivo da reabertura"); return; }
    
    const newVersion = version + 1;
    const actionDate = new Date().toISOString();
    const newHistoryEntry: VersionRecord = {
      version: newVersion,
      data: actionDate,
      user_nome: user?.nome || "Sistema",
      action: "Reabertura de Relatório",
      reason: reopenReason
    };

    const updatedHistory = [...history, newHistoryEntry];
    setStatus("rascunho");
    setVersion(newVersion);
    setHistory(updatedHistory);
    setIsReopening(false);
    
    // Save state change
    await handleSave(modo === "individual" ? "individual" : "multi", true, "rascunho");

    await auditService.log({
      acao: "reabrir_relatorio_alta",
      modulo: "prontuario",
      entidade: "prontuario",
      entidadeId: reportId || "",
      pacienteId: pacienteId,
      pacienteNome: paciente?.nome,
      profissionalId: user?.id,
      profissionalNome: user?.nome,
      detalhes: { motivo: reopenReason, version: newVersion }
    });
    
    setReopenReason("");
    toast.success("Relatório reaberto para edição");
  };

  /* ── PRINT ─── */
  const buildMultiPrintBody = (): string => {
    const p = paciente;
    if (!p) return "";

    const motivoLabel = MOTIVOS_ALTA.find(m => m.value === motivoAlta)?.label || motivoAlta;
    const tipoAltaLabel = TIPOS_ALTA.find(t => t.value === multiTipoAlta)?.label || multiTipoAlta;
    
    let html = `
      <div class="info-grid">
        <div class="info-item"><span class="info-label">Paciente</span><br/><span class="info-value">${p.nome}</span></div>
        <div class="info-item"><span class="info-label">Data Nasc.</span><br/><span class="info-value">${fmt(p.dataNascimento)} (${calcIdade(p.dataNascimento)})</span></div>
        <div class="info-item"><span class="info-label">CNS</span><br/><span class="info-value">${p.cns || "—"}</span></div>
        <div class="info-item"><span class="info-label">CPF</span><br/><span class="info-value">${p.cpf || "—"}</span></div>
        <div class="info-item"><span class="info-label">Responsável</span><br/><span class="info-value">${p.nomeMae || "—"}</span></div>
        <div class="info-item"><span class="info-label">Data de Alta</span><br/><span class="info-value">${fmt(dataAlta)}</span></div>
        <div class="info-item"><span class="info-label">Modalidades</span><br/><span class="info-value">${modalidades.join(", ") || "—"}</span></div>
        <div class="info-item"><span class="info-label">Data Admissão</span><br/><span class="info-value">${fmt(p.criadoEm || "")}</span></div>
      </div>

      <div class="section">
        <div class="section-title">Quadro Diagnóstico Multiprofissional</div>
        <div class="info-grid">
           <div class="field"><span class="field-label">CID-10 Principal</span><div class="field-value">${cid10 || "—"}</div></div>
           <div class="field"><span class="field-label">CID-10 Secundário</span><div class="field-value">${multiCid10Secundario || "—"}</div></div>
        </div>
        <div class="field"><span class="field-label">Diagnóstico Clínico</span><div class="field-value">${multiDiagClinico || "—"}</div></div>
        <div class="field"><span class="field-label">Diagnóstico Funcional Global</span><div class="field-value">${multiDiagFuncional || "—"}</div></div>
        <div class="field"><span class="field-label">Contexto Biopsicossocial</span><div class="field-value">${multiContextoBiopsicossocial || "—"}</div></div>
        <div class="field"><span class="field-label">CIF — Funções do Corpo</span><div class="field-value">${cifFuncoes || "—"}</div></div>
        <div class="field"><span class="field-label">CIF — Atividades e Participação</span><div class="field-value">${cifAtividades || "—"}</div></div>
        <div class="field"><span class="field-label">CIF — Fatores Ambientais</span><div class="field-value">${cifFatores || "—"}</div></div>
        <div class="field"><span class="field-label">Barreiras</span><div class="field-value">${multiBarreiras || "—"}</div></div>
        <div class="field"><span class="field-label">Potencialidades</span><div class="field-value">${multiPotencialidades || "—"}</div></div>
      </div>

      <div class="section">
        <div class="section-title">Resumo do Percurso Terapêutico</div>
        <div class="field"><span class="field-label">Objetivos Gerais</span><div class="field-value">${multiObjetivosGerais || "—"}</div></div>
        <div class="field"><span class="field-label">Resumo do Plano Executado</span><div class="field-value">${multiPlanoExecutado || "—"}</div></div>
      </div>
    `;

    profSections.filter(s => s.status_contribuicao === "concluida").forEach(s => {
      html += `
        <div class="section" style="page-break-inside: avoid;">
          <div class="section-title">Evolução: ${s.profissao || "Área"} — ${s.profissional_nome}</div>
          <div class="info-grid" style="margin-bottom: 10px; padding: 8px;">
            <div><span class="info-label">Período</span><br/><span class="info-value">${fmt(s.periodo_inicio)} a ${fmt(s.periodo_fim)}</span></div>
            <div><span class="info-label">Sessões realizadas</span><br/><span class="info-value">${s.sessoes}</span></div>
            <div><span class="info-label">Adesão</span><br/><span class="info-value">${s.adesao || "Excelente"}</span></div>
          </div>
          <div class="field"><span class="field-label">Objetivos Específicos</span><div class="field-value">${s.objetivos_especificos || s.objetivos || "—"}</div></div>
          <div class="field"><span class="field-label">Intervenções/Procedimentos</span><div class="field-value">${s.intervencoes || "—"}</div></div>
          <div class="field"><span class="field-label">Evolução Clínica e Funcional da Área</span><div class="field-value">${s.evolucao || "—"}</div></div>
          <div class="field"><span class="field-label">Status das Metas</span><div class="field-value">${
            s.metas_status === "totalmente" ? "Totalmente atingidas" :
            s.metas_status === "parcialmente" ? "Parcialmente atingidas" : "Não atingidas"
          }${s.metas_justificativa ? ` — ${s.metas_justificativa}` : ""}</div></div>
          ${s.tecnologia_assistiva ? `<div class="field"><span class="field-label">Tecnologia Assistiva Concedida</span><div class="field-value">${s.tecnologia_assistiva}</div></div>` : ""}
          <div class="signature" style="margin-top:20px; text-align: left;">
            <div class="signature-line" style="margin-left: 0; width: 250px;"></div>
            <div class="name">${s.profissional_nome}</div>
            <div class="role">${s.profissao} — ${s.conselho}</div>
          </div>
        </div>
      `;
    });

    html += `
      <div class="section" style="page-break-inside: avoid;">
        <div class="section-title">Conclusão e Condição na Alta</div>
        <div class="info-grid">
           <div class="field"><span class="field-label">Tipo de Alta</span><div class="field-value">${tipoAltaLabel}</div></div>
           <div class="field"><span class="field-label">Nível de Independência</span><div class="field-value">${nivelIndep || "—"}</div></div>
        </div>
        <div class="field"><span class="field-label">Motivo da Alta</span><div class="field-value">${motivoLabel}${motivoDetalhe ? ` — ${motivoDetalhe}` : ""}</div></div>
        <div class="field"><span class="field-label">Descrição da Condição Funcional</span><div class="field-value">${condicaoFuncional || "—"}</div></div>
        <div class="field"><span class="field-label">Comparação Admissão x Alta</span><div class="field-value">${multiComparacaoFuncional || "—"}</div></div>
        <div class="field"><span class="field-label">Ganhos Clínicos Principais</span><div class="field-value">${multiGanhosPrincipais || "—"}</div></div>
        <div class="field"><span class="field-label">Limitações Persistentes</span><div class="field-value">${multiLimitacoesPersistentes || "—"}</div></div>
        <div class="info-grid">
           <div class="field"><span class="field-label">Risco de Regressão</span><div class="field-value">${multiRiscoRegressao || "—"}</div></div>
           <div class="field"><span class="field-label">Fatores de Alerta</span><div class="field-value">${multiFatoresAlerta || "—"}</div></div>
        </div>
      </div>

      <div class="section" style="page-break-inside: avoid;">
        <div class="section-title">Plano de Transição e Pós-Alta</div>
        <div class="field"><span class="field-label">Orientações ao Usuário</span><div class="field-value">${orientacoesUsuario || "—"}</div></div>
        <div class="field"><span class="field-label">Orientações à Família/Cuidador</span><div class="field-value">${orientacoesUbs || "—"}</div></div>
        <div class="field"><span class="field-label">Orientações para UBS/ESF</span><div class="field-value">${orientacoesUbs || "—"}</div></div>
        <div class="field"><span class="field-label">Encaminhamentos Realizados</span><div class="field-value">${encaminhamentos.join(", ") || "—"}</div></div>
        <div class="info-grid">
           <div class="field"><span class="field-label">Frequência Recomendada APS</span><div class="field-value">${freqAps || "—"}</div></div>
           <div class="field"><span class="field-label">Prazo sugerido de retorno</span><div class="field-value">${multiPrazoRetorno || "—"}</div></div>
        </div>
      </div>

      <div class="signature" style="margin-top:40px">
        <div class="signature-line"></div>
        <div class="name">${multiResponsavelTecnico || "Responsável Técnico (RT)"}</div>
        <div class="role">Assinatura e Carimbo</div>
      </div>
    `;

    return html;
  };

  const buildIndPrintBody = (): string => {
    const p = paciente;
    if (!p) return "";
    const func = funcionarios.find(f => f.id === user?.id);
    const profNome = user?.nome || "";
    const profissao = func?.profissao || user?.cargo || "";
    const conselho = func ? `${func.tipoConselho} ${func.numeroConselho}/${func.ufConselho}` : "";

    const motivoLabel = MOTIVOS_ALTA.find(m => m.value === indMotivo)?.label || indMotivo;
    const tipoAltaLabel = TIPOS_ALTA.find(t => t.value === indTipoAlta)?.label || indTipoAlta;

    return `
      <div class="info-grid">
        <div class="info-item"><span class="info-label">Paciente</span><br/><span class="info-value">${p.nome}</span></div>
        <div class="info-item"><span class="info-label">Data Nasc.</span><br/><span class="info-value">${fmt(p.dataNascimento)} (${calcIdade(p.dataNascimento)})</span></div>
        <div class="info-item"><span class="info-label">CNS</span><br/><span class="info-value">${p.cns || "—"}</span></div>
        <div class="info-item"><span class="info-label">CPF</span><br/><span class="info-value">${p.cpf || "—"}</span></div>
        <div class="info-item"><span class="info-label">Responsável</span><br/><span class="info-value">${p.nomeMae || "—"}</span></div>
        <div class="info-item"><span class="info-label">Data de Alta</span><br/><span class="info-value">${fmt(indDataAlta)}</span></div>
        <div class="info-item"><span class="info-label">Profissional</span><br/><span class="info-value">${profNome} — ${profissao}</span></div>
        <div class="info-item"><span class="info-label">Conselho</span><br/><span class="info-value">${conselho}</span></div>
      </div>

      <div class="section">
        <div class="section-title">Contexto Clínico</div>
        <div class="field"><span class="field-label">Queixa Principal</span><div class="field-value">${indQueixaPrincipal || "—"}</div></div>
        <div class="field"><span class="field-label">Motivo do Encaminhamento</span><div class="field-value">${indMotivoEncaminhamento || "—"}</div></div>
        <div class="field"><span class="field-label">Contexto Familiar/Social</span><div class="field-value">${indContextoFamiliar || "—"}</div></div>
        <div class="field"><span class="field-label">Comorbidades</span><div class="field-value">${indComorbidades || "—"}</div></div>
        <div class="field"><span class="field-label">Medicação</span><div class="field-value">${indMedicacao || "—"}</div></div>
      </div>

      <div class="section">
        <div class="section-title">Diagnóstico</div>
        <div class="field"><span class="field-label">CID-10</span><div class="field-value">${indDiagCid || "—"}</div></div>
        <div class="field"><span class="field-label">CIF</span><div class="field-value">${indCif || "—"}</div></div>
        <div class="field"><span class="field-label">Diagnóstico Clínico</span><div class="field-value">${indDiagClinico || "—"}</div></div>
        <div class="field"><span class="field-label">Diagnóstico Funcional</span><div class="field-value">${indDiagFuncional || "—"}</div></div>
        <div class="field"><span class="field-label">Nível de Comprometimento</span><div class="field-value">${indNivelComprometimento || "—"}</div></div>
        <div class="field"><span class="field-label">Observações Diagnósticas</span><div class="field-value">${indObsDiagnosticas || "—"}</div></div>
      </div>

      <div class="section">
        <div class="section-title">Acompanhamento Terapêutico</div>
        <div class="info-grid" style="margin-bottom: 10px; padding: 8px;">
          <div><span class="info-label">Período</span><br/><span class="info-value">${fmt(indPeriodoInicio)} a ${fmt(indPeriodoFim)}</span></div>
          <div><span class="info-label">Sessões realizadas</span><br/><span class="info-value">${indSessoes}</span></div>
          <div><span class="info-label">Faltas no período</span><br/><span class="info-value">${indFaltas}</span></div>
          <div><span class="info-label">Modalidade</span><br/><span class="info-value">${indModalidade || "—"}</span></div>
        </div>
        <div class="field"><span class="field-label">Frequência de Atendimento</span><div class="field-value">${indFrequenciaAtendimento || "—"}</div></div>
        <div class="field"><span class="field-label">Adesão ao Tratamento</span><div class="field-value">${indAdesaoTratamento || "—"}</div></div>
      </div>

      <div class="section">
        <div class="section-title">Evolução Clínica e Funcional</div>
        <div class="field"><span class="field-label">Objetivos Terapêuticos Iniciais</span><div class="field-value">${indObjetivos || "—"}</div></div>
        <div class="field"><span class="field-label">Intervenções/Procedimentos Realizados</span><div class="field-value">${indIntervencoes || "—"}</div></div>
        <div class="field"><span class="field-label">Evolução Clínica</span><div class="field-value">${indEvolucao || "—"}</div></div>
        <div class="field"><span class="field-label">Evolução Global</span><div class="field-value">${indEvolucaoGlobal || "—"}</div></div>
        <div class="field"><span class="field-label">Metas Atingidas</span><div class="field-value">${
          indMetas === "totalmente" ? "Totalmente atingidas" :
          indMetas === "parcialmente" ? "Parcialmente atingidas" : "Não atingidas"
        }${indMetasJust ? ` — ${indMetasJust}` : ""}</div></div>
        <div class="field"><span class="field-label">Resposta Terapêutica</span><div class="field-value">${indRespostaTerapeutica || "—"}</div></div>
        <div class="field"><span class="field-label">Comparação Início/Alta</span><div class="field-value">${indComparacaoInicioAlta || "—"}</div></div>
        ${indTA ? `<div class="field"><span class="field-label">Tecnologia Assistiva</span><div class="field-value">${indTA}</div></div>` : ""}
        ${indIntercorrencias ? `<div class="field"><span class="field-label">Intercorrências</span><div class="field-value">${indIntercorrencias}${indIntercorrenciasObs ? ` — ${indIntercorrenciasObs}` : ""}</div></div>` : ""}
      </div>

      <div class="section" style="page-break-inside: avoid;">
        <div class="section-title">Conclusão e Alta</div>
        <div class="field"><span class="field-label">Tipo de Alta</span><div class="field-value">${tipoAltaLabel}</div></div>
        <div class="field"><span class="field-label">Motivo da Alta</span><div class="field-value">${motivoLabel}${indMotivoDet ? ` — ${indMotivoDet}` : ""}</div></div>
        <div class="field"><span class="field-label">Risco de Regressão</span><div class="field-value">${indRiscoRegressao || "—"}</div></div>
        <div class="field"><span class="field-label">Necessidade de Continuidade Terapêutica</span><div class="field-value">${indContinuarTerapia || "—"}</div></div>
        <div class="field"><span class="field-label">Orientações Específicas</span><div class="field-value">${indOrientacoes || "—"}</div></div>
        <div class="field"><span class="field-label">Encaminhamentos</span><div class="field-value">${indEncaminhamento || "—"}</div></div>
        <div class="field"><span class="field-label">Prazo sugerido para reavaliação</span><div class="field-value">${indPrazoReavaliacao || "—"}</div></div>
      </div>

      <div class="signature" style="margin-top:50px">
        <div class="signature-line"></div>
        <div class="name">${profNome}</div>
        <div class="role">${profissao} — ${conselho}</div>
      </div>
    `;
  };

  const handlePrint = (type: "multi" | "individual") => {
    if (type === "multi") {
      const errs = validateMulti();
      if (errs.length > 0) { toast.error(errs[0]); return; }
      openPrintDocument("Relatório de Alta — Multiprofissional", buildMultiPrintBody(), {
        Paciente: paciente?.nome || "", "Data Alta": fmt(dataAlta)
      });
    } else {
      const errs = validateInd();
      if (errs.length > 0) { toast.error(errs[0]); return; }
      const func = funcionarios.find(f => f.id === user?.id);
      openPrintDocument(
        `Relatório de Alta — ${func?.profissao || "Individual"}`,
        buildIndPrintBody(),
        { Paciente: paciente?.nome || "", "Data Alta": fmt(indDataAlta) }
      );
    }
  };

  const handleSave = async (type: "multi" | "individual", isDraft: boolean = false, customStatus?: any) => {
    if (!pacienteId || !user?.id) { toast.error("Selecione um paciente"); return; }

    if (!isDraft && !customStatus) {
      const errs = type === "multi" ? validateMulti() : validateInd();
      if (errs.length > 0) { toast.error(errs[0]); return; }
    }

    const newVersion = version + (isDraft ? 0 : 1);
    const actionDate = new Date().toISOString();
    const newHistoryEntry: VersionRecord = {
      version: newVersion,
      data: actionDate,
      user_nome: user.nome || "Sistema",
      action: customStatus === "emitido" ? "Emissão Final" : isDraft ? "Salvar Rascunho" : "Atualização",
    };

    const updatedHistory = [...history, newHistoryEntry];

    const payload = type === "multi" ? {
      modalidades, cid10, multiCid10Secundario, multiDiagClinico, multiDiagFuncional,
      multiContextoBiopsicossocial, cifFuncoes, cifAtividades, cifFatores,
      multiBarreiras, multiPotencialidades, multiFatoresContextuais,
      multiObjetivosGerais, multiPlanoExecutado,
      profissionais: profSections, motivoAlta, multiTipoAlta, motivoDetalhe,
      condicaoFuncional, nivelIndep, multiComparacaoFuncional, multiGanhosPrincipais,
      multiLimitacoesPersistentes, multiRiscoRegressao, multiFatoresAlerta,
      orientacoesUsuario, orientacoesUbs, multiOrientacoesEscola, multiPontosAtencao,
      encaminhamentos, freqAps, multiContinuarTerapia, multiPrazoRetorno,
      multiResponsavelTecnico, resumoConsolidado: multiResumoConsolidado,
      version: newVersion, history: updatedHistory
    } : {
      diagCid: indDiagCid, cif: indCif, diagClinico: indDiagClinico,
      diagFuncional: indDiagFuncional, nivelComprometimento: indNivelComprometimento,
      obsDiagnosticas: indObsDiagnosticas, queixaPrincipal: indQueixaPrincipal,
      motivoEncaminhamento: indMotivoEncaminhamento, contextoFamiliar: indContextoFamiliar,
      comorbidades: indComorbidades, medicacao: indMedicacao,
      objetivos: indObjetivos, intervencoes: indIntervencoes,
      evolucao: indEvolucao, metas: indMetas, metasJust: indMetasJust,
      ta: indTA, frequenciaAtendimento: indFrequenciaAtendimento,
      adesaoTratamento: indAdesaoTratamento, evolucaoGlobal: indEvolucaoGlobal,
      intercorrencias: indIntercorrencias, intercorrenciasObs: indIntercorrenciasObs,
      respostaTerapeutica: indRespostaTerapeutica, comparacaoInicioAlta: indComparacaoInicioAlta,
      resumoConsolidado: indResumoConsolidado, riscoPosAlta: indRiscoPosAlta,
      complexidade: indComplexidade,
      motivo: indMotivo, tipoAlta: indTipoAlta, motivoDet: indMotivoDet,
      orientacoes: indOrientacoes, encaminhamento: indEncaminhamento,
      modalidade: indModalidade, sessoes: indSessoes, faltas: indFaltas,
      periodoInicio: indPeriodoInicio, periodoFim: indPeriodoFim,
      continuarTerapia: indContinuarTerapia, riscoRegressao: indRiscoRegressao,
      prazoReavaliacao: indPrazoReavaliacao,
      ptsMetas: ptsMetas,
      version: newVersion, history: updatedHistory
    };

    const targetStatus = customStatus || (isDraft ? "rascunho" : "concluido");

    const record: any = {
      paciente_id: pacienteId,
      paciente_nome: paciente?.nome || "",
      profissional_id: user.id,
      profissional_nome: user.nome || "",
      unidade_id: user.unidadeId || "",
      data_atendimento: type === "multi" ? dataAlta : indDataAlta,
      tipo_registro: type === "multi" ? "alta_multiprofissional" : "alta_individual",
      observacoes: JSON.stringify(payload),
      status: targetStatus,
      evolucao: type === "multi"
        ? `Relatório de Alta Multiprofissional — Versão ${newVersion}`
        : `Relatório de Alta Individual — Versão ${newVersion}`,
    };

    let result;
    if (reportId) {
      result = await supabase.from("prontuarios").update(record).eq("id", reportId);
    } else {
      result = await supabase.from("prontuarios").insert(record).select().single();
      if (!result.error && result.data) {
        setReportId(result.data.id);
      }
    }

    if (result.error) {
      toast.error("Erro ao salvar: " + result.error.message);
    } else {
      toast.success(isDraft ? "Rascunho salvo com sucesso" : "Relatório de alta atualizado");
      setStatus(targetStatus as any);
      setVersion(newVersion);
      setHistory(updatedHistory);
      
      // Auditoria
      await auditService.log({
        acao: isDraft ? "salvar_rascunho_alta" : "finalizar_relatorio_alta",
        modulo: "prontuario",
        entidade: "prontuario",
        entidadeId: reportId || (result.data as any)?.id,
        pacienteId: pacienteId,
        pacienteNome: paciente?.nome,
        profissionalId: user.id,
        profissionalNome: user.nome,
        detalhes: { tipo: type, isDraft, version: newVersion }
      });
    }
  };

  /* ── MODE SELECTOR ─── */
  if (modo === "selector") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Relatório de Alta — CER II
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Selecione o tipo de relatório que deseja gerar
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
          <Card
            className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all group"
            onClick={() => setModo("multiprofissional")}
          >
            <CardContent className="p-8 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Users className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Relatório Multiprofissional</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Toda a equipe em um documento consolidado. Cada profissional preenche sua seção.
                </p>
              </div>
              <Badge variant="secondary" className="text-xs">Consolidado</Badge>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all group"
            onClick={() => setModo("individual")}
          >
            <CardContent className="p-8 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <User className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Relatório Individual</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Por profissional separado, independente dos demais membros da equipe.
                </p>
              </div>
              <Badge variant="secondary" className="text-xs">Por profissional</Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  /* ═══ MULTIPROFISSIONAL ═══ */
  if (modo === "multiprofissional") {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setModo("selector")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Relatório de Alta — Multiprofissional
              </h1>
              <p className="text-xs text-muted-foreground">Documento consolidado da equipe</p>
            </div>
          </div>
          {pacienteId && (
            <div className="flex items-center gap-2">
              <Badge variant={status === "rascunho" ? "secondary" : "default"} className="px-3 py-1">
                {status === "rascunho" ? "Rascunho" : "Finalizado"}
              </Badge>
            </div>
          )}
        </div>

        <Tabs defaultValue="identificacao" className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto">
            <TabsTrigger value="identificacao" className="py-2">Identificação</TabsTrigger>
            <TabsTrigger value="diagnostico" className="py-2">Diagnóstico</TabsTrigger>
            <TabsTrigger value="resumo" className="py-2">Resumo Multiprof.</TabsTrigger>
            <TabsTrigger value="equipe" className="py-2">Contribuições</TabsTrigger>
            <TabsTrigger value="alta" className="py-2">Alta e Plano</TabsTrigger>
          </TabsList>

          <TabsContent value="identificacao" className="space-y-4 pt-4">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Identificação</CardTitle>
                <div className="flex items-center gap-2">
                   <Badge variant="outline" className="text-[10px]">v{version}</Badge>
                   {status === "emitido" && <Badge className="bg-green-600 text-white text-[10px]">Emitido</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <BuscaPaciente pacientes={pacientes} value={pacienteId} onChange={setPacienteId} />
                {paciente && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-xl text-sm">
                    <div><span className="text-muted-foreground text-xs block">Nome</span><strong>{paciente.nome}</strong></div>
                    <div><span className="text-muted-foreground text-xs block">Nasc.</span>{fmt(paciente.dataNascimento)}</div>
                    <div><span className="text-muted-foreground text-xs block">Data de Alta</span><Input type="date" value={dataAlta} onChange={e => setDataAlta(e.target.value)} className="h-8" /></div>
                    {lastUpdatedAt && (
                      <div><span className="text-muted-foreground text-xs block">Última atualização</span>{fmtDateTime(lastUpdatedAt)} por {lastUpdatedBy}</div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Professionalization UI components */}
            <Dialog open={isReopening} onOpenChange={setIsReopening}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reabertura de Relatório</DialogTitle>
                  <DialogDescription>
                    Este documento já foi finalizado. A reabertura criará uma nova versão e será registrada na auditoria.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <Label>Motivo da Reabertura *</Label>
                  <Textarea 
                    value={reopenReason} 
                    onChange={e => setReopenReason(e.target.value)} 
                    placeholder="Descreva o motivo pelo qual este documento precisa ser alterado..."
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsReopening(false)}>Cancelar</Button>
                  <Button onClick={handleReopen}>Confirmar Reabertura</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>


          <TabsContent value="diagnostico" className="space-y-4 pt-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Diagnóstico Multiprofissional</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input value={cid10} onChange={e => setCid10(e.target.value)} placeholder="CID-10 Principal" />
                    <Input value={multiCid10Secundario} onChange={e => setMultiCid10Secundario(e.target.value)} placeholder="CID-10 Secundário" />
                 </div>
                 <Textarea value={multiDiagClinico} onChange={e => setMultiDiagClinico(e.target.value)} placeholder="Diagnóstico clínico..." />
                 <Textarea value={multiDiagFuncional} onChange={e => setMultiDiagFuncional(e.target.value)} placeholder="Diagnóstico funcional..." />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="resumo" className="space-y-4 pt-4">
            <Card>
              <CardContent className="space-y-4 pt-4">
                 <Textarea value={multiObjetivosGerais} onChange={e => setMultiObjetivosGerais(e.target.value)} placeholder="Objetivos Terapêuticos Gerais..." rows={4} />
                 <Textarea value={multiPlanoExecutado} onChange={e => setMultiPlanoExecutado(e.target.value)} placeholder="Resumo do plano terapêutico executado..." rows={4} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="equipe" className="space-y-4 pt-4">
             {profSections.map(s => (
               <Card key={s.profissional_id}>
                 <CardHeader className="pb-3 flex flex-row items-center justify-between">
                   <CardTitle className="text-sm">{s.profissional_nome}</CardTitle>
                   <Badge variant={s.status_contribuicao === "assinada" ? "default" : "secondary"}>
                     {s.status_contribuicao.replace("_", " ")}
                   </Badge>
                 </CardHeader>
                 <CardContent className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Objetivos Específicos</Label>
                        <Textarea value={s.objetivos_especificos || ""} onChange={e => updateProfSection(s.profissional_id, "objetivos_especificos", e.target.value)} rows={2} disabled={s.status_contribuicao === "assinada"} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Evolução da Área</Label>
                        <Textarea value={s.evolucao || ""} onChange={e => updateProfSection(s.profissional_id, "evolucao", e.target.value)} rows={2} disabled={s.status_contribuicao === "assinada"} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex gap-4">
                        <Select value={s.status_contribuicao} onValueChange={(v: any) => updateProfSection(s.profissional_id, "status_contribuicao", v)} disabled={s.status_contribuicao === "assinada"}>
                          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nao_iniciada">Não Iniciada</SelectItem>
                            <SelectItem value="em_preenchimento">Em preenchimento</SelectItem>
                            <SelectItem value="concluida">Concluída</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {s.profissional_id === user?.id && s.status_contribuicao !== "assinada" && (
                        <Button size="sm" onClick={() => updateProfSection(s.profissional_id, "status_contribuicao", "assinada")}>
                          <ShieldCheck className="w-4 h-4 mr-2" /> Assinar Contribuição
                        </Button>
                      )}
                      {s.status_contribuicao === "assinada" && (
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <CheckCircle className="w-3 h-3 text-green-600" /> Assinado em {fmtDateTime(s.data_contribuicao)}
                        </div>
                      )}
                    </div>
                 </CardContent>
               </Card>
             ))}
          </TabsContent>

          <TabsContent value="alta" className="space-y-4 pt-4">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-3 space-y-4">
                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Conclusão Multiprofissional</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Tipo de Alta *</Label>
                        <Select value={multiTipoAlta} onValueChange={setMultiTipoAlta}>
                           <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                           <SelectContent>{TIPOS_ALTA.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Nível de Independência</Label>
                        <Select value={nivelIndep} onValueChange={setNivelIndep}>
                           <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                           <SelectContent>{NIVEIS_INDEPENDENCIA.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Resumo Consolidado Final (Editável)</Label>
                        <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={generateMultiSummary}>
                          <RefreshCw className="w-3 h-3 mr-1" /> Gerar Automático
                        </Button>
                      </div>
                      <Textarea value={multiResumoConsolidado} onChange={e => setMultiResumoConsolidado(e.target.value)} rows={6} className="text-sm font-serif" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-xs font-semibold flex items-center gap-2"><ListTodo className="w-4 h-4" /> Checklist de Alta</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { label: "Paciente Selecionado", ok: !!pacienteId },
                      { label: "Tipo de Alta", ok: !!multiTipoAlta },
                      { label: "Resumo Consolidado", ok: !!multiResumoConsolidado },
                      { label: "Mín. 1 Contribuição", ok: profSections.some(s => s.status_contribuicao === "concluida" || s.status_contribuicao === "assinada") }
                    ].map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px]">
                        <span className={item.ok ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
                        {item.ok ? <CheckCircle className="w-3 h-3 text-green-600" /> : <AlertCircle className="w-3 h-3 text-amber-500" />}
                      </div>
                    ))}
                    <Separator className="my-2" />
                    <div className="text-[10px] bg-muted p-2 rounded-lg text-muted-foreground">
                      Status: <strong className="text-foreground">{validateMulti().length === 0 ? "Pronto para Emitir" : "Incompleto"}</strong>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

        </Tabs>

        {/* Footer Actions */}
        <div className="flex gap-3 pt-6 border-t">
          <Button onClick={() => handleSave("multi", false)}>Finalizar Consolidação</Button>
        </div>
      </div>
    );
  }

  /* ═══ INDIVIDUAL ═══ */
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setModo("selector")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Relatório de Alta — Individual
            </h1>
            <p className="text-xs text-muted-foreground">Relatório clínico completo e automatizado</p>
          </div>
        </div>

        {pacienteId && (
          <div className="flex items-center gap-2">
            <Badge variant={status === "rascunho" ? "secondary" : "default"} className="px-3 py-1">
              {status === "rascunho" ? "Rascunho" : "Finalizado"}
            </Badge>
            {status === "rascunho" && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> Editando...
              </span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Form Content */}
        <div className="lg:col-span-3 space-y-6">
          <Tabs defaultValue="identificacao" className="w-full">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto">
              <TabsTrigger value="identificacao" className="py-2">Identificação</TabsTrigger>
              <TabsTrigger value="contexto" className="py-2">Contexto Clínico</TabsTrigger>
              <TabsTrigger value="diagnostico" className="py-2">Diagnóstico</TabsTrigger>
              <TabsTrigger value="evolucao" className="py-2">Evolução</TabsTrigger>
              <TabsTrigger value="alta" className="py-2">Alta e Plano</TabsTrigger>
            </TabsList>

            <TabsContent value="identificacao" className="space-y-4 pt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-primary" />
                    1. Identificação do Paciente e Profissional
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <BuscaPaciente pacientes={pacientes} value={pacienteId} onChange={setPacienteId} />
                  
                  {paciente && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-xl border border-border/50 text-sm">
                      <div className="space-y-1">
                        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider block">Paciente</span>
                        <strong className="text-foreground">{paciente.nome}</strong>
                      </div>
                      <div className="space-y-1">
                        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider block">CPF / CNS</span>
                        <span className="text-foreground">{paciente.cpf || "—"} / {paciente.cns || "—"}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider block">Nascimento / Idade</span>
                        <span className="text-foreground">{fmt(paciente.dataNascimento)} ({calcIdade(paciente.dataNascimento)})</span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider block">Telefone</span>
                        <span className="text-foreground">{paciente.telefone || "—"}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider block">Profissional Logado</span>
                        <span className="text-foreground font-semibold">{user?.nome}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider block">Especialidade</span>
                        <span className="text-foreground">{funcionarios.find(f => f.id === user?.id)?.profissao || "—"}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider block">Unidade</span>
                        <span className="text-foreground">{user?.unidadeId || "CER II"}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider block">Sessões / Faltas</span>
                        <Badge variant="outline" className="text-xs font-mono">{indSessoes} realizada(s) / {indFaltas} falta(s)</Badge>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Período de Acompanhamento</Label>
                      <div className="flex items-center gap-2">
                        <Input type="date" value={indPeriodoInicio} onChange={e => setIndPeriodoInicio(e.target.value)} className="h-9 text-sm" />
                        <span className="text-muted-foreground">até</span>
                        <Input type="date" value={indPeriodoFim} onChange={e => setIndPeriodoFim(e.target.value)} className="h-9 text-sm" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Data de Alta</Label>
                      <Input type="date" value={indDataAlta} onChange={e => setIndDataAlta(e.target.value)} className="h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Modalidade</Label>
                      <Select value={indModalidade} onValueChange={setIndModalidade}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {MODALIDADES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="contexto" className="space-y-4 pt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Info className="w-4 h-4 text-primary" />
                    2. Contexto Clínico Inicial
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Queixa Principal</Label>
                    <Textarea value={indQueixaPrincipal} onChange={e => setIndQueixaPrincipal(e.target.value)} rows={3} className="text-sm" placeholder="Resumo da queixa inicial..." />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Motivo do Encaminhamento</Label>
                    <Textarea value={indMotivoEncaminhamento} onChange={e => setIndMotivoEncaminhamento(e.target.value)} rows={3} className="text-sm" placeholder="Por que o paciente foi encaminhado?" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Contexto Familiar / Social</Label>
                    <Textarea value={indContextoFamiliar} onChange={e => setIndContextoFamiliar(e.target.value)} rows={3} className="text-sm" placeholder="Rede de apoio, barreiras sociais..." />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Comorbidades / Medicamentos</Label>
                    <div className="space-y-2">
                      <Input value={indComorbidades} onChange={e => setIndComorbidades(e.target.value)} placeholder="Outras doenças conhecidas" className="h-9 text-sm" />
                      <Input value={indMedicacao} onChange={e => setIndMedicacao(e.target.value)} placeholder="Medicamentos em uso" className="h-9 text-sm" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="diagnostico" className="space-y-4 pt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Stethoscope className="w-4 h-4 text-primary" />
                    3. Base Diagnóstica
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">CID-10 Princial</Label>
                      <Input value={indDiagCid} onChange={e => setIndDiagCid(e.target.value)} placeholder="Código ou descrição" className="h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Nível de Comprometimento</Label>
                      <Select value={indNivelComprometimento} onValueChange={setIndNivelComprometimento}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="leve">Leve</SelectItem>
                          <SelectItem value="moderado">Moderado</SelectItem>
                          <SelectItem value="grave">Grave / Severo</SelectItem>
                          <SelectItem value="profundo">Profundo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Diagnóstico Clínico / Funcional</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Textarea value={indDiagClinico} onChange={e => setIndDiagClinico(e.target.value)} placeholder="Hipótese diagnóstica clínica..." rows={3} className="text-sm" />
                      <Textarea value={indDiagFuncional} onChange={e => setIndDiagFuncional(e.target.value)} placeholder="Descrição da funcionalidade (CIF base)..." rows={3} className="text-sm" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Observações Diagnósticas Adicionais</Label>
                    <Textarea value={indObsDiagnosticas} onChange={e => setIndObsDiagnosticas(e.target.value)} rows={2} className="text-sm" />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="evolucao" className="space-y-4 pt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    4. Evolução Terapêutica Estruturada
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Adesão ao Tratamento</Label>
                      <Select value={indAdesaoTratamento} onValueChange={setIndAdesaoTratamento}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {ADESAO_TRATAMENTO.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Evolução Global</Label>
                      <Select value={indEvolucaoGlobal} onValueChange={setIndEvolucaoGlobal}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {EVOLUCAO_GLOBAL.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Frequência de Atendimento</Label>
                      <Select value={indFrequenciaAtendimento} onValueChange={setIndFrequenciaAtendimento}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="semanal">Semanal</SelectItem>
                          <SelectItem value="quinzenal">Quinzenal</SelectItem>
                          <SelectItem value="mensal">Mensal</SelectItem>
                          <SelectItem value="demanda">Sob demanda</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Objetivos Terapêuticos Alcançados</Label>
                      <Textarea value={indObjetivos} onChange={e => setIndObjetivos(e.target.value)} rows={4} className="text-sm" placeholder="Liste os objetivos trabalhados..." />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Resumo das Intervenções Realizadas</Label>
                      <Textarea value={indIntervencoes} onChange={e => setIndIntervencoes(e.target.value)} rows={4} className="text-sm" placeholder="Quais procedimentos foram mais frequentes?" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Evolução Clínica e Funcional (Texto Livre)</Label>
                    <Textarea value={indEvolucao} onChange={e => setIndEvolucao(e.target.value)} rows={5} className="text-sm" placeholder="Descreva detalhadamente a evolução do paciente no período..." />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-primary/5 rounded-xl border border-primary/10">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-primary">Status das Metas (PTS)</Label>
                      <Select value={indMetas} onValueChange={v => setIndMetas(v as any)}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="totalmente">Totalmente atingidas</SelectItem>
                          <SelectItem value="parcialmente">Parcialmente atingidas</SelectItem>
                          <SelectItem value="nao_atingidas">Não atingidas</SelectItem>
                        </SelectContent>
                      </Select>
                      {indMetas !== "totalmente" && (
                        <Textarea value={indMetasJust} onChange={e => setIndMetasJust(e.target.value)} placeholder="Justificativa clínica para metas não atingidas..." rows={2} className="text-sm mt-2" />
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-primary">Intercorrências no Período</Label>
                      <Select value={indIntercorrencias} onValueChange={setIndIntercorrencias}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {INTERCORRENCIAS_OPCOES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {indIntercorrencias !== "Nenhuma" && (
                        <Input value={indIntercorrenciasObs} onChange={e => setIndIntercorrenciasObs(e.target.value)} placeholder="Detalhes da intercorrência..." className="h-9 text-sm mt-2" />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Resposta Terapêutica</Label>
                      <Textarea value={indRespostaTerapeutica} onChange={e => setIndRespostaTerapeutica(e.target.value)} rows={3} className="text-sm" placeholder="Como o paciente respondeu às estratégias?" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Comparação Início vs Alta</Label>
                      <Textarea value={indComparacaoInicioAlta} onChange={e => setIndComparacaoInicioAlta(e.target.value)} rows={3} className="text-sm" placeholder="Diferença clínica observada entre a admissão e agora..." />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="alta" className="space-y-4 pt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Heart className="w-4 h-4 text-primary" />
                    5. Desfecho e Orientações de Alta
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Tipo de Alta *</Label>
                      <Select value={indTipoAlta} onValueChange={setIndTipoAlta}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {TIPOS_ALTA.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Motivo da Alta *</Label>
                      <Select value={indMotivo} onValueChange={setIndMotivo}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {MOTIVOS_ALTA.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Necessidade de Continuidade</Label>
                      <Select value={indContinuarTerapia} onValueChange={setIndContinuarTerapia}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sim_mesma">Sim, na mesma área</SelectItem>
                          <SelectItem value="sim_outra">Sim, em outra área</SelectItem>
                          <SelectItem value="nao">Não, alta definitiva</SelectItem>
                          <SelectItem value="vigilancia">Sim, vigilância em saúde</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Risco de Regressão</Label>
                      <Select value={indRiscoRegressao} onValueChange={setIndRiscoRegressao}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="baixo">Baixo</SelectItem>
                          <SelectItem value="moderado">Moderado</SelectItem>
                          <SelectItem value="alto">Alto</SelectItem>
                          <SelectItem value="nao_aplica">Não se aplica</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Prazo para Reavaliação</Label>
                      <Input value={indPrazoReavaliacao} onChange={e => setIndPrazoReavaliacao(e.target.value)} placeholder="Ex: 6 meses, 1 ano..." className="h-9 text-sm" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Orientações Específicas para Paciente / Cuidador</Label>
                    <Textarea value={indOrientacoes} onChange={e => setIndOrientacoes(e.target.value)} rows={4} className="text-sm" placeholder="Exercícios domiciliares, sinais de alerta..." />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Encaminhamentos (Internos e Externos)</Label>
                    <Textarea value={indEncaminhamento} onChange={e => setIndEncaminhamento(e.target.value)} rows={3} className="text-sm" placeholder="Liste para onde o paciente está sendo encaminhado..." />
                  </div>

                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">Resumo Final Consolidado *</Label>
                      <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={generateIndSummary}>
                        Gerar automaticamente
                      </Button>
                    </div>
                    <Textarea
                      value={indResumoConsolidado}
                      onChange={e => setIndResumoConsolidado(e.target.value)}
                      rows={6}
                      className="text-sm font-serif"
                      placeholder="Síntese final do percurso terapêutico, evolução e conclusões da alta..."
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar Actions & Info */}
        <div className="space-y-6">
          <Card className="sticky top-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4 text-primary" />
                Resumo e Ações
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 p-3 bg-muted/30 rounded-lg border border-border/50">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Paciente selecionado:</span>
                  <span className="font-semibold">{paciente ? "Sim" : "Não"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Status do Registro:</span>
                  <Badge variant={status === "rascunho" ? "secondary" : "default"} className="h-4 px-1 text-[10px]">
                    {status === "rascunho" ? "Rascunho" : "Finalizado"}
                  </Badge>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Checklist Validação:</span>
                  <span className={validateInd().length === 0 ? "text-green-600 font-bold" : "text-amber-600 font-bold"}>
                    {validateInd().length === 0 ? "Pronto" : `${validateInd().length} pendente(s)`}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Button 
                  variant="outline" 
                  className="w-full justify-start h-9" 
                  onClick={() => handleSave("individual", true)}
                  disabled={!pacienteId || loading}
                >
                  <Clock className="w-4 h-4 mr-2 text-muted-foreground" />
                  Salvar Rascunho
                </Button>
                
                <Button 
                  className="w-full justify-start h-9 bg-primary" 
                  onClick={() => handleSave("individual", false)}
                  disabled={!pacienteId || loading}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Finalizar Relatório
                </Button>
              </div>

              <Separator />

              <div className="flex flex-col gap-2">
                <Button 
                  variant="ghost" 
                  className="w-full justify-start h-9 text-xs" 
                  onClick={() => handlePrint("individual")}
                  disabled={!pacienteId || status === "rascunho"}
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Imprimir Documento
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full justify-start h-9 text-xs" 
                  onClick={() => handlePrint("individual")}
                  disabled={!pacienteId || status === "rascunho"}
                >
                  <FileDown className="w-4 h-4 mr-2" />
                  Gerar PDF Oficial
                </Button>
              </div>

              {validateInd().length > 0 && pacienteId && (
                <Alert variant="destructive" className="py-2 px-3 mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle className="text-xs">Pendências</AlertTitle>
                  <AlertDescription className="text-[10px]">
                    <ul className="list-disc ml-4 space-y-1">
                      {validateInd().map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {ptsMetas.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold flex items-center gap-2">
                  <History className="w-3 h-3 text-primary" />
                  Metas do PTS Ativo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="space-y-1">
                  {ptsMetas.map(meta => (
                    <div key={meta.id} className="text-[10px] flex items-center justify-between p-1 hover:bg-muted/30 rounded">
                      <span className="truncate max-w-[120px]">{meta.titulo}</span>
                      <Badge variant="outline" className="text-[9px] h-3 px-1">
                        {meta.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default RelatorioAlta;
