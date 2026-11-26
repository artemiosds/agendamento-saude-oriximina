import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { altaDateLabel, altaEvolutionMessage, altaOfficialBody, altaSeries, collectAltaEvolution, readAltaEvolution, escapeAlta, type AltaEvolutionSnapshot, type AltaMetricSection } from "@/lib/altaEvolution";
import { useAuth } from "@/contexts/AuthContext";
import { usePacientes } from "@/contexts/PacientesContext";
import { useOperacional } from "@/contexts/OperacionalContext";
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
  ChevronRight, ListTodo, AlertTriangle, RefreshCw, Database as DatabaseIcon
} from "lucide-react";
import { openPrintDocument } from "@/lib/printLayout";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import RelatorioFonoAvaliativo from "@/components/RelatorioFonoAvaliativo";
import { ALTA_NOTE_TYPES, ALTA_NOTE_STATUS, ALTA_SESSION_STATUS, selectAltaSources, firstRecorded, lastRecorded, recordedProcedures, type AltaNote, type AltaCycle, type AltaSession, type AltaPts, type AltaGoal, type AltaSourceBundle, type AltaSourceMeta } from "@/lib/altaSources";

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
  metas_status: "" | "totalmente" | "parcialmente" | "nao_atingidas";
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

const altaPrintText = (s?: string) => escapeAlta(s);

const fmt = (d: string) => {
  if (!d) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return altaDateLabel(d);
  try { const parsed=new Date(d);return Number.isFinite(parsed.getTime())?parsed.toLocaleDateString("pt-BR"):"—"; } catch { return "—"; }
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

const parseAltaPayload = (raw?: string | null): any => {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("O conteúdo salvo do relatório de alta está inválido e não pôde ser carregado com segurança.");
  }
};


// Visual navigation only. The clinical form retains its original values and handlers.
type AltaStep = { value: string; label: string; icon: typeof User };
const INDIVIDUAL_STEPS: AltaStep[] = [
  { value: "identificacao", label: "Identificação", icon: User },
  { value: "contexto", label: "Contexto clínico", icon: Info },
  { value: "diagnostico", label: "Diagnóstico", icon: Stethoscope },
  { value: "evolucao", label: "Evolução", icon: Activity },
  { value: "alta", label: "Alta e plano", icon: Heart },
];
const MULTI_STEPS: AltaStep[] = [
  { value: "identificacao", label: "Identificação", icon: User },
  { value: "diagnostico", label: "Diagnóstico", icon: Stethoscope },
  { value: "resumo", label: "Percurso terapêutico", icon: ClipboardList },
  { value: "equipe", label: "Contribuições", icon: Users },
  { value: "alta", label: "Alta e plano", icon: Heart },
];
function AltaWorkflow({ steps, children }: { steps: AltaStep[]; children: React.ReactNode }) {
  const [active, setActive] = useState(steps[0].value);
  const index = Math.max(0, steps.findIndex(step => step.value === active));
  return <Tabs value={active} onValueChange={setActive} className="w-full min-w-0 space-y-2">
    <div className="clinical-premium p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0"><p className="clinical-field-label text-[10px] font-semibold uppercase tracking-wider">Percurso do relatório</p><h2 className="font-semibold text-sm">{steps[index].label}</h2></div>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">Etapa {index+1} de {steps.length}</span>
      </div>
      <div className="flex gap-1" aria-hidden="true">{steps.map((step,i)=><span key={step.value} className={`h-1.5 flex-1 rounded-full ${i === index ? "bg-[var(--cp-blue)]" : "bg-muted"}`}/>)}</div>
      <TabsList aria-label="Etapas do relatório" className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-1 bg-transparent w-full h-auto p-0">
        {steps.map(({value,label,icon:Icon},i)=><TabsTrigger key={value} value={value} className="min-w-0 h-auto min-h-[46px] justify-start whitespace-normal text-left gap-2 rounded-lg px-2 py-2 text-xs font-medium border border-transparent data-[state=active]:border-[var(--cp-blue)] data-[state=active]:bg-[var(--cp-inset)] data-[state=active]:text-[var(--cp-ink)] data-[state=active]:shadow-none">
          <span className="clinical-dock-icon clinical-tone-blue !w-7 !h-7"><Icon className="w-3.5 h-3.5" aria-hidden="true"/></span><span className="min-w-0"><span className="block text-[10px] text-muted-foreground">{String(i+1).padStart(2,"0")}</span>{label}</span>
        </TabsTrigger>)}
      </TabsList>
    </div>
    {children}
    <nav aria-label="Navegação entre etapas" className="clinical-premium flex flex-wrap items-center justify-between gap-2 p-2">
      <Button type="button" variant="outline" size="sm" disabled={index===0} onClick={()=>setActive(steps[Math.max(0,index-1)].value)}><ArrowLeft className="w-4 h-4 mr-1"/>Anterior</Button>
      <span className="text-xs text-muted-foreground">{index+1} / {steps.length}</span>
      <Button type="button" size="sm" disabled={index===steps.length-1} onClick={()=>setActive(steps[Math.min(steps.length-1,index+1)].value)}>Próxima etapa<ChevronRight className="w-4 h-4 ml-1"/></Button>
    </nav>
  </Tabs>;
}
function AltaMetric({ icon: Icon, label, value, tone = "blue" }: { icon: typeof User; label: string; value: React.ReactNode; tone?: "blue" | "teal" | "violet" | "slate" }) {
  return <div className="clinical-premium p-2.5 sm:p-3 flex items-center gap-2.5 min-w-0">
    <span className={`clinical-dock-icon clinical-tone-${tone}`}><Icon className="w-4 h-4" aria-hidden="true"/></span>
    <div className="min-w-0"><p className="clinical-field-label text-[10px] uppercase tracking-wide font-semibold">{label}</p><div className="font-semibold text-sm break-words leading-snug">{value}</div></div>
  </div>;
}

const RelatorioAlta: React.FC = () => {
  const { user } = useAuth();
  const { pacientes } = usePacientes();
  const { funcionarios } = useOperacional();
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
  const [indPeriodoInicio, setIndPeriodoInicio] = useState("");
  const [indPeriodoFim, setIndPeriodoFim] = useState("");
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

  const [dataAlta, setDataAlta] = useState(new Date().toISOString().split("T")[0]);
  const [tabProf, setTabProf] = useState("");

  const generateMultiSummary = () => {
    if (formReadOnly) return;
    const areas = profSections.filter(s => s.status_contribuicao === "concluida" || s.status_contribuicao === "assinada").map(s => s.profissao || s.profissional_nome).join(", ");
    const summary = [
      areas && `Contribuições concluídas: ${areas}.`,
      nivelIndep && `Nível de independência avaliado: ${nivelIndep}.`,
      multiObjetivosGerais.trim() && `Objetivos terapêuticos: ${multiObjetivosGerais}.`,
      multiContinuarTerapia && `Continuidade do cuidado: ${multiContinuarTerapia === "nao" ? "Não indicada" : multiContinuarTerapia === "sim_mesma" ? "Na mesma área" : multiContinuarTerapia === "sim_outra" ? "Em outra área" : multiContinuarTerapia === "vigilancia" ? "Vigilância em saúde" : multiContinuarTerapia}.`,
    ].filter(Boolean).join("\n");
    if (!summary) { toast.error("Preencha os dados clínicos antes de gerar o resumo."); return; }
    setMultiResumoConsolidado(summary);
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
  const [indMetas, setIndMetas] = useState<"" | "totalmente" | "parcialmente" | "nao_atingidas">("");
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
  const [indContinuarTerapia, setIndContinuarTerapia] = useState("");
  const [indRiscoRegressao, setIndRiscoRegressao] = useState("");
  const [indPrazoReavaliacao, setIndPrazoReavaliacao] = useState("");

  const [status, setStatus] = useState<"rascunho" | "concluido" | "finalizado" | "validado" | "emitido">("rascunho");

  const [reportId, setReportId] = useState<string | null>(null);
  const [reportOwnerId, setReportOwnerId] = useState("");
  const [ptsMetas, setPtsMetas] = useState<MetaPTS[]>([]);
  const [loading, setLoading] = useState(false);
  const activePatientRef = React.useRef("");
  const reportLoadTokenRef = React.useRef(0);
  const loadedModeRef = React.useRef<ModoRelatorio>("selector");
  const isReportLocked = status !== "rascunho";
  const [loadFailed,setLoadFailed] = useState(false);
  const savingRef = React.useRef(false);
  const revisionRef = React.useRef<{ id: string; unitId: string; updated: string | null; status: string | null; payload: Record<string, any> } | null>(null);
  const [conflict,setConflict] = useState(false);
  const [savedSnapshot,setSavedSnapshot] = useState<string | null>(null);
  const loadedSnapshotPending = React.useRef(false);
  const [sourceBundle,setSourceBundle] = useState<AltaSourceBundle|null>(null);
  const [sourceScope,setSourceScope] = useState("");
  const [sourcePts,setSourcePts] = useState("");
  const [sourceMeta,setSourceMeta] = useState<AltaSourceMeta|null>(null);
  const [loadedScope,setLoadedScope] = useState<{userId:string;unitId:string;patientId:string;mode:ModoRelatorio}|null>(null);
  const scopeMatches=!!loadedScope&&loadedScope.userId===user?.id&&loadedScope.unitId===user?.unidadeId&&loadedScope.patientId===pacienteId&&loadedScope.mode===modo;
  const formReadOnly = isReportLocked || loading || loadFailed || !pacienteId || !scopeMatches;
  const awaitingSources=!!sourceBundle&&!reportId&&!sourceMeta;
  const isAltaMode=modo==="individual"||modo==="multiprofissional";
  const evolutionThrough=modo==="multiprofissional"?dataAlta:indDataAlta;
  const evolutionScopeReady=!!sourceMeta&&!!user?.id&&!!user.unidadeId&&sourceMeta.unitId===user.unidadeId&&sourceMeta.through===evolutionThrough&&(modo==="multiprofissional"||!!indPeriodoInicio&&!!indPeriodoFim&&indPeriodoInicio===sourceMeta.periodStart&&indPeriodoFim===sourceMeta.periodEnd);
  const evolutionQuery=useQuery({
    queryKey:["alta-medidas-v5",pacienteId,user?.id,user?.unidadeId,modo,sourceMeta?.cycleId,evolutionThrough],
    enabled:!!pacienteId&&isAltaMode&&!isReportLocked&&!loading&&!loadFailed&&!conflict&&evolutionScopeReady,
    refetchOnWindowFocus:false,refetchOnReconnect:false,staleTime:60_000,
    queryFn:async()=>{
      const unitId=user!.unidadeId!;
      const professionalId=modo==="individual"?user!.id:null;
      const [cycles,notes]=await Promise.all([
        fetchSourcePages<AltaCycle>((start,end)=>{let q=supabase.from("treatment_cycles").select("id,patient_id,professional_id,unit_id,specialty,treatment_type,start_date,status,pts_id").eq("patient_id",pacienteId).eq("unit_id",unitId);if(professionalId)q=q.eq("professional_id",professionalId);if(sourceMeta?.cycleId)q=q.eq("id",sourceMeta.cycleId);return q.order("id").range(start,end);}),
        fetchSourcePages<AltaNote>((start,end)=>{let q=supabase.from("prontuarios").select("id,paciente_id,profissional_id,unidade_id,data_atendimento,status,tipo_registro,custom_data").eq("paciente_id",pacienteId).eq("unidade_id",unitId).in("status",[...ALTA_NOTE_STATUS]).in("tipo_registro",[...ALTA_NOTE_TYPES]).lte("data_atendimento",evolutionThrough);if(professionalId)q=q.eq("profissional_id",professionalId);return q.order("id").range(start,end);}),
      ]);
      return {cycles,notes};
    },
  });
  const completedContributors=Object.fromEntries(profSections.filter(s=>s.status_contribuicao==="concluida"||s.status_contribuicao==="assinada").filter(s=>s.periodo_inicio&&s.periodo_fim).map(s=>[s.profissional_id,{from:s.periodo_inicio,to:s.periodo_fim}]));
  const liveSections:AltaMetricSection[]=evolutionScopeReady&&evolutionQuery.data&&!evolutionQuery.isError?collectAltaEvolution(evolutionQuery.data.cycles,evolutionQuery.data.notes,{patientId:pacienteId,unitId:user?.unidadeId||"",professionalId:modo==="individual"?user?.id||null:null,cycleId:sourceMeta?.cycleId||null,through:evolutionThrough,from:modo==="individual"?indPeriodoInicio:undefined,to:modo==="individual"?indPeriodoFim:undefined,contributors:modo==="multiprofissional"?completedContributors:undefined}):[];
  const liveEvolution:AltaEvolutionSnapshot={schema:1,state:!evolutionScopeReady||(modo==="multiprofissional"&&!Object.keys(completedContributors).length)?"unscoped":evolutionQuery.isError||evolutionQuery.isFetching||!evolutionQuery.data?"unavailable":liveSections.length?"recorded":"none",sections:[]};
  if(liveEvolution.state==="recorded")liveEvolution.sections=liveSections;
  const savedEvolution=isReportLocked?readAltaEvolution(revisionRef.current?.payload.altaEvolutionV1):null;
  const visibleEvolution=isReportLocked?savedEvolution:liveEvolution;

  const resetReportTracking = () => {
    revisionRef.current = null;
    setLoadedScope(null);
    setSourceBundle(null);setSourceScope("");setSourcePts("");setSourceMeta(null);
    loadedSnapshotPending.current = false;
    setSavedSnapshot(null);
    setConflict(false);
    setReportId(null);
    setReportOwnerId("");
    setStatus("rascunho");
    setVersion(1);
    setHistory([]);
    setLastUpdatedBy("");
    setLastUpdatedAt("");
    setReopenReason("");
    setIsReopening(false);
  };

  const resetMultiForm = () => {
    setModalidades([]);
    setCid10("");
    setMultiCid10Secundario("");
    setMultiDiagClinico("");
    setMultiDiagFuncional("");
    setMultiContextoBiopsicossocial("");
    setCifFuncoes("");
    setCifAtividades("");
    setCifFatores("");
    setMultiBarreiras("");
    setMultiPotencialidades("");
    setMultiFatoresContextuais("");
    setMultiObjetivosGerais("");
    setMultiPlanoExecutado("");
    setProfSections([]);
    setMotivoAlta("");
    setMultiTipoAlta("");
    setMultiMotivoDetalhe("");
    setCondicaoFuncional("");
    setNivelIndep("");
    setMultiComparacaoFuncional("");
    setMultiGanhosPrincipais("");
    setMultiLimitacoesPersistentes("");
    setMultiRiscoRegressao("");
    setMultiFatoresAlerta("");
    setOrientacoesUsuario("");
    setOrientacoesUbs("");
    setMultiOrientacoesEscola("");
    setMultiPontosAtencao("");
    setEncaminhamentos([]);
    setFreqAps("");
    setMultiContinuarTerapia("");
    setMultiPrazoRetorno("");
    setMultiResponsavelTecnico("");
    setMultiResumoConsolidado("");
    setDataAlta(new Date().toISOString().split("T")[0]);
    setTabProf("");
  };

  const resetIndividualForm = () => {
    setIndDiagCid("");
    setIndCif("");
    setIndDiagClinico("");
    setIndDiagFuncional("");
    setIndNivelComprometimento("");
    setIndObsDiagnosticas("");
    setIndQueixaPrincipal("");
    setIndMotivoEncaminhamento("");
    setIndContextoFamiliar("");
    setIndComorbidades("");
    setIndMedicacao("");
    setIndObjetivos("");
    setIndIntervencoes("");
    setIndEvolucao("");
    setIndMetas("");
    setIndMetasJust("");
    setIndTA("");
    setIndFrequenciaAtendimento("");
    setIndAdesaoTratamento("");
    setIndEvolucaoGlobal("");
    setIndIntercorrencias("");
    setIndIntercorrenciasObs("");
    setIndRespostaTerapeutica("");
    setIndComparacaoInicioAlta("");
    setIndResumoConsolidado("");
    setIndRiscoPosAlta("");
    setIndComplexidade("");
    setIndMotivo("");
    setIndTipoAlta("");
    setIndMotivoDet("");
    setIndOrientacoes("");
    setIndEncaminhamento("");
    setIndModalidade("");
    setIndDataAlta(new Date().toISOString().split("T")[0]);
    setIndSessoes(0);
    setIndFaltas(0);
    setIndPeriodoInicio("");
    setIndPeriodoFim("");
    setIndContinuarTerapia("");
    setIndRiscoRegressao("");
    setIndPrazoReavaliacao("");
    setPtsMetas([]);
  };

  const handlePacienteChange = (nextId: string) => {
    if ((nextId === pacienteId && scopeMatches) || savingRef.current) return;
    if (hasUnsavedChanges && !window.confirm("Há alterações não salvas. Deseja descartá-las e trocar de paciente?")) return;
    setLoadFailed(false);
    reportLoadTokenRef.current += 1;
    activePatientRef.current = nextId;
    resetReportTracking();
    resetMultiForm();
    resetIndividualForm();
    setPacienteId(nextId);
    if(nextId===pacienteId&&nextId){const token=++reportLoadTokenRef.current;setLoading(true);if(modo==="multiprofissional")void loadMultiData(nextId,token);else if(modo==="individual")void loadIndividualData(nextId,token);}
  };

  /* ── carga protegida por paciente/modo ─── */
  useEffect(() => {
    if (!pacienteId || (modo !== "multiprofissional" && modo !== "individual")) {
      loadedModeRef.current = modo;
      setLoading(false);
      setLoadFailed(false);
      return;
    }

    // Trocar Individual ↔ Multiprofissional para o mesmo paciente também precisa
    // limpar o id/estado do relatório anterior antes de iniciar a nova carga.
    if (loadedModeRef.current !== modo) {
      reportLoadTokenRef.current += 1;
      resetReportTracking();
      if (modo === "multiprofissional") resetMultiForm();
      else resetIndividualForm();
      loadedModeRef.current = modo;
    }

    setLoadFailed(false);
    activePatientRef.current = pacienteId;
    const token = ++reportLoadTokenRef.current;
    if (modo === "multiprofissional") {
      void loadMultiData(pacienteId, token);
    } else {
      void loadIndividualData(pacienteId, token);
    }
  }, [pacienteId, modo]);

  // Read-only, deterministic pagination; fail closed rather than treat a truncated/error result as zero.
  const fetchSourcePages = async <T,>(query: (start: number,end: number) => PromiseLike<{data: unknown;error: {message: string}|null}>): Promise<T[]> => {
    const rows:T[]=[];
    const size=500;
    for(let offset=0;offset<20000;offset+=size){
      const result=await query(offset,offset+size-1);
      if(result.error)throw new Error(result.error.message);
      if(!Array.isArray(result.data))throw new Error("Fonte clínica não retornou registros válidos.");
      rows.push(...result.data as T[]);
      if(result.data.length<size)return rows;
    }
    throw new Error("Volume de registros acima do limite de conferência. Não foi importada uma contagem parcial.");
  };

  const applyAltaSources = (bundle: AltaSourceBundle, scope: string, ptsId: string, through: string) => {
    const selected=selectAltaSources(bundle,scope,ptsId,through);
    const {notes,sessions,pts,goals,meta}=selected;
    setSourceMeta(meta);
    setSourceScope(scope);
    setSourcePts(ptsId || "none");
    if(bundle.professionalId){
      setIndPeriodoInicio(meta.periodStart);
      setIndPeriodoFim(meta.periodEnd);
      setIndSessoes(meta.performed);
      setIndFaltas(meta.absences);
      setIndDiagCid(bundle.patientCid);
      setIndQueixaPrincipal(firstRecorded(notes,n=>n.queixa_principal));
      const hypothesis=lastRecorded(notes,n=>n.hipotese);
      if(hypothesis)setIndDiagClinico("Hipótese registrada no prontuário (revisar): "+hypothesis);
      setIndIntervencoes(recordedProcedures(notes,sessions));
      const latestEvolution=[...notes].reverse().find(n=>n.evolucao?.trim());
      if(latestEvolution)setIndEvolucao("Última evolução registrada em "+fmt(latestEvolution.data_atendimento)+" (revisar para a alta):\n"+latestEvolution.evolucao);
      if(pts){
        setIndDiagFuncional(pts.diagnostico_funcional||"");
        setIndObjetivos(goals.length?goals.map(g=>g.titulo).filter(Boolean).join("\n"):"");
        setIndMotivoEncaminhamento(pts.motivo_encaminhamento||"");
        setPtsMetas(goals.map(g=>({id:g.id,titulo:g.titulo,status:g.status})));
      }
    }else{
      // Team derives from completed clinical notes/real sessions, never old alta documents.
      const ids=new Set([...notes.map(n=>n.profissional_id),...sessions.filter(s=>s.status==="realizada").map(s=>s.professional_id)].filter(Boolean));
      const sections:ProfSection[]=[...ids].map(profId=>{
        const n=notes.filter(x=>x.profissional_id===profId);
        const ss=sessions.filter(x=>x.professional_id===profId);
        const dates=[...n.map(x=>x.data_atendimento),...ss.map(x=>x.scheduled_date||"")].filter(Boolean).sort();
        const func=funcionarios.find(f=>f.id===profId);
        return {profissional_id:profId,profissional_nome:func?.nome||lastRecorded(n,x=>x.profissional_nome)||"Profissional sem nome cadastrado",
          profissao:func?.profissao||"",conselho:func?[func.tipoConselho,func.numeroConselho,func.ufConselho].filter(Boolean).join(" "):"",
          periodo_inicio:dates[0]||"",periodo_fim:dates[dates.length-1]||"",sessoes:ss.filter(x=>x.status==="realizada").length,
          objetivos:"",intervencoes:recordedProcedures(n,ss),evolucao:"",metas_status:"",metas_justificativa:"",tecnologia_assistiva:"",
          status_contribuicao:"nao_iniciada",data_contribuicao:"",orientacoes_especificas:"",encaminhamentos_especificos:"",objetivos_especificos:"",adesao:"",intercorrencias:""};
      });
      setProfSections(sections);
      if(sections.length)setTabProf(sections[0].profissional_id);
      setCid10(bundle.patientCid);
      if(pts){
        setMultiDiagFuncional(pts.diagnostico_funcional||"");
        setMultiObjetivosGerais(pts.objetivos_terapeuticos||pts.objetivo_geral||"");
        setMultiBarreiras(pts.barreiras||"");
        setMultiPotencialidades(pts.potencialidades||"");
      }
    }
  };

  const fetchAltaSourceBundle = async (pid: string,type:"multi"|"individual",token:number):Promise<AltaSourceBundle|null> => {
    const unitId=user?.unidadeId;
    const professionalId=type==="individual"?user?.id:null;
    if(!unitId || (type==="individual"&&!professionalId))throw new Error("Selecione uma unidade e um profissional válidos para consultar as fontes clínicas.");
    const through=new Date().toLocaleDateString("sv-SE",{timeZone:"America/Fortaleza"});
    const [notes,cycles,sessions,pts,patientResult]=await Promise.all([
      fetchSourcePages<AltaNote>((start,end)=>{
        let q=supabase.from("prontuarios").select("id,paciente_id,profissional_id,profissional_nome,unidade_id,data_atendimento,tipo_registro,status,hipotese,procedimentos_texto,queixa_principal,evolucao,agendamento_id,custom_data")
          .eq("paciente_id",pid).eq("unidade_id",unitId).in("tipo_registro",[...ALTA_NOTE_TYPES]).in("status",[...ALTA_NOTE_STATUS]).lte("data_atendimento",through);
        if(professionalId)q=q.eq("profissional_id",professionalId);
        return q.order("id").range(start,end);
      }),
      fetchSourcePages<AltaCycle>((start,end)=>{
        let q=supabase.from("treatment_cycles").select("id,patient_id,professional_id,unit_id,specialty,treatment_type,start_date,status,pts_id").eq("patient_id",pid).eq("unit_id",unitId);
        if(professionalId)q=q.eq("professional_id",professionalId);
        return q.order("id").range(start,end);
      }),
      fetchSourcePages<AltaSession>((start,end)=>{
        let q=supabase.from("treatment_sessions").select("id,cycle_id,patient_id,professional_id,appointment_id,scheduled_date,status,procedure_done,treatment_cycles!inner(unit_id)").eq("patient_id",pid).eq("treatment_cycles.unit_id",unitId).in("status",[...ALTA_SESSION_STATUS]);
        if(professionalId)q=q.eq("professional_id",professionalId);
        return q.order("id").range(start,end);
      }),
      fetchSourcePages<AltaPts>((start,end)=>supabase.from("pts").select("id,patient_id,unit_id,professional_id,status,updated_at,diagnostico_funcional,objetivos_terapeuticos,objetivo_geral,motivo_encaminhamento,barreiras,potencialidades,rede_apoio").eq("patient_id",pid).eq("unit_id",unitId).order("id").range(start,end)),
      supabase.from("pacientes").select("id,cid").eq("id",pid).maybeSingle(),
    ]);
    if(token!==reportLoadTokenRef.current||activePatientRef.current!==pid)return null;
    if(patientResult.error||!patientResult.data)throw new Error("Não foi possível conferir o cadastro do paciente.");
    // Offer active plans and plans explicitly linked to eligible treatment cycles.
    const linked=new Set(cycles.map(c=>c.pts_id).filter(Boolean));
    const eligiblePts=pts.filter(p=>p.status==="ativo"||linked.has(p.id));
    const goals:AltaGoal[]=[];
    for(const plan of eligiblePts){
      goals.push(...await fetchSourcePages<AltaGoal>((start,end)=>supabase.from("pts_metas").select("id,pts_id,titulo,status,responsavel_id").eq("pts_id",plan.id).order("id").range(start,end)));
      if(token!==reportLoadTokenRef.current||activePatientRef.current!==pid)return null;
    }
    return {patientId:pid,unitId,professionalId:professionalId||null,through,notes,cycles,sessions,pts:eligiblePts,goals,patientCid:patientResult.data.cid||""};
  };

  const loadNewAltaSources = async (pid:string,type:"multi"|"individual",token:number) => {
    const bundle=await fetchAltaSourceBundle(pid,type,token);
    if(!bundle||token!==reportLoadTokenRef.current||activePatientRef.current!==pid)return;
    const {cycles,pts:eligiblePts,through}=bundle;
    setSourceBundle(bundle);
    if(type==="individual")setIndDataAlta(through);else setDataAlta(through);
    const scope=cycles.length===0?"all":cycles.length===1?cycles[0].id:"";
    const singleLinked=cycles.length===1?cycles[0].pts_id:null;
    const chosen=singleLinked&&eligiblePts.some(p=>p.id===singleLinked)?singleLinked:eligiblePts.length===1?eligiblePts[0].id:eligiblePts.length===0?"none":"";
    setSourceScope(scope);setSourcePts(chosen);
    if(scope&&chosen)applyAltaSources(bundle,scope,chosen==="none"?"":chosen,through);
  };

  const loadMultiData = async (pid: string, token = reportLoadTokenRef.current) => {
    if (!user?.id) return;
    setLoading(true);
    try {
      if(!user.unidadeId)throw new Error("Selecione uma unidade para consultar ou elaborar o relatório de alta.");
      const { data: existingDraft, error: loadError } = await supabase
        .from("prontuarios")
        .select("*")
        .eq("paciente_id", pid)
        .eq("unidade_id",user.unidadeId)
        .eq("tipo_registro", "alta_multiprofissional")
        .order("atualizado_em", { ascending: false, nullsFirst:false })
        .order("id", { ascending:false })
        .limit(1)
        .maybeSingle();

      if (token !== reportLoadTokenRef.current || activePatientRef.current !== pid) return;
      if (loadError) throw loadError;
      setLoadedScope({userId:user.id,unitId:user.unidadeId,patientId:pid,mode:modo});

      if (existingDraft) {
        setReportId(existingDraft.id);
        setReportOwnerId(existingDraft.profissional_id || "");
        setStatus(existingDraft.status as any || "rascunho");
        const data = parseAltaPayload(existingDraft.observacoes);
        revisionRef.current = { id: existingDraft.id, unitId:existingDraft.unidade_id, updated: existingDraft.atualizado_em ?? null, status: existingDraft.status ?? null, payload: data };
        setSourceMeta(data.altaSourceMeta && typeof data.altaSourceMeta === "object" ? data.altaSourceMeta : null);
        
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
        
        toast.info(existingDraft.status === "rascunho" ? "Rascunho multiprofissional carregado." : "Relatório multiprofissional existente carregado.");
        return;
      }

      // Somente monta uma nova estrutura quando não existe relatório salvo.
      await loadNewAltaSources(pid, "multi", token);
    } catch (err: any) {
      console.error(err);
      if (token === reportLoadTokenRef.current && activePatientRef.current === pid) {
        setLoadFailed(true);
        toast.error(err?.message || "Não foi possível carregar o relatório multiprofissional.");
      }
    } finally {
      if (token === reportLoadTokenRef.current && activePatientRef.current === pid) {
        loadedSnapshotPending.current = true;
        setLoading(false);
      }
    }
  };

  const loadIndividualData = async (pid: string, token = reportLoadTokenRef.current) => {
    if (!user?.id) return;
    setLoading(true);
    try {
      if(!user.unidadeId)throw new Error("Selecione uma unidade para consultar ou elaborar o relatório de alta.");
      // 1. Carrega o relatório mais recente, independentemente do status.
      const { data: existingDraft, error: loadError } = await supabase
        .from("prontuarios")
        .select("*")
        .eq("paciente_id", pid)
        .eq("unidade_id",user.unidadeId)
        .eq("profissional_id", user.id)
        .eq("tipo_registro", "alta_individual")
        .order("atualizado_em", { ascending: false, nullsFirst:false })
        .order("id", { ascending:false })
        .limit(1)
        .maybeSingle();

      if (token !== reportLoadTokenRef.current || activePatientRef.current !== pid) return;
      if (loadError) throw loadError;
      setLoadedScope({userId:user.id,unitId:user.unidadeId,patientId:pid,mode:modo});

      if (existingDraft) {
        setReportId(existingDraft.id);
        setReportOwnerId(existingDraft.profissional_id || "");
        setStatus(existingDraft.status as any || "rascunho");
        const data = parseAltaPayload(existingDraft.observacoes);
        revisionRef.current = { id: existingDraft.id, unitId:existingDraft.unidade_id, updated: existingDraft.atualizado_em ?? null, status: existingDraft.status ?? null, payload: data };
        setSourceMeta(data.altaSourceMeta && typeof data.altaSourceMeta === "object" ? data.altaSourceMeta : null);
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
        setIndMetas(data.metas || "");
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
        setPtsMetas(Array.isArray(data.ptsMetas) ? data.ptsMetas : []);
        
        setVersion(data.version || 1);
        setHistory(data.history || []);
        setLastUpdatedBy(existingDraft.profissional_nome);
        setLastUpdatedAt(existingDraft.atualizado_em || existingDraft.criado_em);
        
        toast.info(existingDraft.status === "rascunho" ? "Rascunho individual carregado." : "Relatório individual existente carregado.");
        return;
      }

      await loadNewAltaSources(pid, "individual", token);
    } catch (error: any) {
      console.error("Error loading individual data:", error);
      if (token === reportLoadTokenRef.current && activePatientRef.current === pid) {
        setLoadFailed(true);
        toast.error(error?.message || "Não foi possível carregar o relatório individual.");
      }
    } finally {
      if (token === reportLoadTokenRef.current && activePatientRef.current === pid) {
        loadedSnapshotPending.current = true;
        setLoading(false);
      }
    }
  };

  const userRoleNorm = String(user?.role || "").toLowerCase().trim();
  const canManageOtherContribution = ["master", "gestao", "gestão", "coordenador"].includes(userRoleNorm);
  const canReopenReport =
    scopeMatches && !!reportId &&
    (modo === "individual" || reportOwnerId === user?.id || canManageOtherContribution);

  const canEditContribution = (section: ProfSection) =>
    !formReadOnly && !awaitingSources &&
    section.status_contribuicao !== "assinada" &&
    (section.profissional_id === user?.id || canManageOtherContribution);

  const updateProfSection = (profId: string, field: keyof ProfSection, value: any) => {
    const section = profSections.find(s => s.profissional_id === profId);
    if (!section || !canEditContribution(section)) {
      toast.error("Você não tem permissão para alterar esta contribuição.");
      return;
    }
    setProfSections(prev =>
      prev.map(s => s.profissional_id === profId ? { ...s, [field]: value } : s)
    );
  };

  const handleSignContribution = async (profId: string) => {
    const section = profSections.find(s => s.profissional_id === profId);
    if (!section || section.profissional_id !== user?.id || section.status_contribuicao === "assinada" || formReadOnly || savingRef.current || conflict) {
      toast.error("Somente o profissional responsável pode assinar sua própria contribuição.");
      return;
    }
    const errors = validateContribution(section);
    if (errors.length) { toast.error(errors[0]); return; }
    const nowIso = new Date().toISOString();
    if (!window.confirm("Confirmar sua contribuição e salvar o rascunho atual? Após salvar, esta contribuição ficará bloqueada para edição.")) return;
    const signed: ProfSection[] = profSections.map(s => s.profissional_id === profId ? {
      ...s, status_contribuicao: "assinada", data_contribuicao: nowIso,
      finalizado_em: nowIso, finalizado_por: user?.nome || "",
    } : s);
    await handleSave("multi", true, undefined, signed);
  };

  /* ── VALIDATION ─── */
  const validateContribution = (s: ProfSection): string[] => {
    const errors: string[] = [];
    if (!s.evolucao?.trim()) errors.push(`Informe a evolução clínica de ${s.profissional_nome}`);
    if (!s.metas_status) errors.push(`Avalie as metas de ${s.profissional_nome}`);
    if (s.metas_status && s.metas_status !== "totalmente" && !s.metas_justificativa?.trim()) errors.push(`Justificativa de metas obrigatória para ${s.profissional_nome}`);
    return errors;
  };
  const validateMulti = (): string[] => {
    const errors: string[] = [];
    if (!pacienteId) errors.push("Selecione um paciente");
    if (!motivoAlta) errors.push("Selecione o motivo da alta");
    if (!multiTipoAlta) errors.push("Selecione o tipo de alta");
    if (!nivelIndep) errors.push("Selecione o nível de independência");
    if (modalidades.length === 0) errors.push("Selecione pelo menos uma modalidade");
    if (!multiResumoConsolidado.trim()) errors.push("Informe o resumo final consolidado");
    
    const hasCompletedContribution = profSections.some(
      s => s.status_contribuicao === "concluida" || s.status_contribuicao === "assinada"
    );
    if (!hasCompletedContribution) {
      errors.push("Pelo menos um profissional deve concluir ou assinar sua contribuição");
    }

    profSections.forEach(s => {
      if (s.status_contribuicao === "concluida" || s.status_contribuicao === "assinada") errors.push(...validateContribution(s));
    });
    return errors;
  };

  const validateInd = (): string[] => {
    const errors: string[] = [];
    if (!pacienteId) errors.push("Selecione um paciente");
    if (!indMotivo) errors.push("Selecione o motivo da alta");
    if (!indTipoAlta) errors.push("Selecione o tipo de alta");
    if (!indEvolucao.trim()) errors.push("A evolução clínica é obrigatória");
    if (!indOrientacoes.trim()) errors.push("Orientações de alta são obrigatórias");
    if (!indDiagClinico.trim()) errors.push("Diagnóstico clínico é obrigatório");
    if (!indResumoConsolidado.trim()) errors.push("O resumo final consolidado é obrigatório");
    if (!indMetas) errors.push("Informe a avaliação profissional das metas do PTS");
    if (indMetas && indMetas !== "totalmente" && !indMetasJust.trim()) errors.push("Justificativa de metas obrigatória");
    return errors;
  };

  const generateIndSummary = () => {
    if (formReadOnly) return;
    if (!indMetas) { toast.error("Avalie as metas antes de gerar o resumo."); return; }
    const summary = [
      indPeriodoInicio && indPeriodoFim && `Período informado: ${fmt(indPeriodoInicio)} a ${fmt(indPeriodoFim)}.`,
      `Sessões realizadas registradas: ${indSessoes}.`,
      `Durante o tratamento, os objetivos terapêuticos foram ${indMetas === "totalmente" ? "plenamente" : indMetas === "parcialmente" ? "parcialmente" : "não"} atingidos.`,
      indEvolucaoGlobal && `A evolução global foi considerada ${indEvolucaoGlobal.toLowerCase()}.`,
      indDiagFuncional && `Diagnóstico funcional informado: ${indDiagFuncional}.`,
      indContinuarTerapia && `Recomenda-se ${indContinuarTerapia === "nao" ? "alta definitiva" : "continuidade do cuidado"}.`,
    ].filter(Boolean).join("\n");
    setIndResumoConsolidado(summary);
  };

  const handleReopen = async () => {
    if (loading || loadFailed || savingRef.current || conflict || !scopeMatches) return;
    const reason = reopenReason.trim();
    if (!reason) { toast.error("Informe o motivo da reabertura"); return; }
    if (!reportId || !pacienteId || !user?.id) {
      toast.error("Não há relatório carregado para reabrir.");
      return;
    }
    if (!canReopenReport) {
      toast.error("Você não tem permissão para reabrir este relatório.");
      return;
    }

    savingRef.current = true;
    setLoading(true);
    try {
      // Relê o registro persistido para não incorporar alterações feitas
      // acidentalmente na tela enquanto o documento estava finalizado.
      const { data: persisted, error: readError } = await supabase
        .from("prontuarios")
        .select("id, paciente_id, profissional_id, unidade_id, tipo_registro, observacoes, status, atualizado_em")
        .eq("id", reportId)
        .eq("paciente_id", pacienteId)
        .eq("unidade_id",user.unidadeId)
        .maybeSingle();
      if (readError) throw readError;
      if (!persisted) throw new Error("Relatório não encontrado ou não pertence ao paciente selecionado.");

      const expectedType = modo === "individual" ? "alta_individual" : "alta_multiprofissional";
      if (persisted.tipo_registro !== expectedType) {
        throw new Error("O tipo do relatório carregado não corresponde ao fluxo atual.");
      }

      const revision = revisionRef.current;
      if (!revision || revision.id !== persisted.id || revision.unitId!==persisted.unidade_id || revision.updated !== (persisted.atualizado_em ?? null) || revision.status !== persisted.status || persisted.status === "rascunho") {
        setConflict(true);
        throw new Error("O relatório foi modificado por outra operação. Recarregue antes de reabrir.");
      }
      if (modo === "individual" && persisted.profissional_id !== user.id) throw new Error("Profissional não corresponde ao relatório.");
      if (modo === "multiprofissional" && persisted.profissional_id !== user.id && !canManageOtherContribution) throw new Error("Sem autorização para reabrir este relatório.");
      const persistedPayload = parseAltaPayload(persisted.observacoes);
      const currentVersion = Number(persistedPayload.version || version || 1);
      const newVersion = currentVersion + 1;
      const actionDate = new Date().toISOString();
      const newHistoryEntry: VersionRecord = {
        version: newVersion,
        data: actionDate,
        user_nome: user?.nome || "Sistema",
        action: "Reabertura de Relatório",
        reason,
      };
      const updatedHistory = [...(Array.isArray(persistedPayload.history) ? persistedPayload.history : []), newHistoryEntry];
      const updatedPayload = {
        ...persistedPayload,
        version: newVersion,
        history: updatedHistory,
      };

      let reopenQuery = supabase
        .from("prontuarios")
        .update({
          status: "rascunho",
          observacoes: JSON.stringify(updatedPayload),
          evolucao: modo === "individual"
            ? `Relatório de Alta Individual — Versão ${newVersion}`
            : `Relatório de Alta Multiprofissional — Versão ${newVersion}`,
        })
        .eq("id", reportId)
        .eq("paciente_id", pacienteId)
        .eq("unidade_id",user.unidadeId)
        .eq("tipo_registro", expectedType);
      reopenQuery = persisted.status === null ? reopenQuery.is("status", null) : reopenQuery.eq("status", persisted.status);
      reopenQuery = revision.updated === null ? reopenQuery.is("atualizado_em", null) : reopenQuery.eq("atualizado_em", revision.updated);
      if (modo === "individual") reopenQuery = reopenQuery.eq("profissional_id", user.id);
      const { data: reopened, error: updateError } = await reopenQuery.select("id,atualizado_em,status").maybeSingle();
      if (updateError) throw updateError;
      if (!reopened) { setConflict(true); throw new Error("O relatório mudou durante a reabertura. Nenhum dado foi alterado."); }
      revisionRef.current = { id: reopened.id, unitId: persisted.unidade_id, updated: reopened.atualizado_em ?? null, status: reopened.status ?? null, payload: updatedPayload };
      setLastUpdatedAt(reopened.atualizado_em || actionDate);
      setLastUpdatedBy(user.nome || "");

      setStatus("rascunho");
      setVersion(newVersion);
      setHistory(updatedHistory);
      setIsReopening(false);
      setReopenReason("");

      await auditService.log({
        acao: "reabrir_relatorio_alta",
        modulo: "prontuario",
        entidade: "prontuario",
        entidadeId: reportId,
        pacienteId,
        pacienteNome: paciente?.nome,
        profissionalId: user?.id,
        profissionalNome: user?.nome,
        detalhes: { motivo: reason, version: newVersion, status_anterior: persisted.status }
      });

      toast.success("Relatório reaberto para edição em nova versão.");
    } catch (error: any) {
      console.error("[RelatorioAlta] erro ao reabrir:", error);
      toast.error(error?.message || "Não foi possível reabrir o relatório.");
    } finally {
      savingRef.current = false;
      setLoading(false);
    }
  };

  /* ── PRINT ─── */
  const buildMultiPrintBody = (): string => {
    const p = paciente;
    if (!p) return "";

    const motivoLabel = MOTIVOS_ALTA.find(m => m.value === motivoAlta)?.label || motivoAlta;
    const tipoAltaLabel = TIPOS_ALTA.find(t => t.value === multiTipoAlta)?.label || multiTipoAlta;
    
    let html = `
      <div class="info-grid">
        <div class="info-item"><span class="info-label">Paciente</span><br/><span class="info-value">${altaPrintText(p.nome)}</span></div>
        <div class="info-item"><span class="info-label">Data Nasc.</span><br/><span class="info-value">${altaDateLabel(p.dataNascimento)} </span></div>
        <div class="info-item"><span class="info-label">CNS</span><br/><span class="info-value">${altaPrintText(p.cns || "—")}</span></div>
        <div class="info-item"><span class="info-label">CPF</span><br/><span class="info-value">${altaPrintText(p.cpf || "—")}</span></div>
        <div class="info-item"><span class="info-label">Responsável</span><br/><span class="info-value">${altaPrintText(p.nomeMae || "—")}</span></div>
        <div class="info-item"><span class="info-label">Data de Alta</span><br/><span class="info-value">${fmt(dataAlta)}</span></div>
        <div class="info-item"><span class="info-label">Modalidades</span><br/><span class="info-value">${altaPrintText(modalidades.join(", ") || "—")}</span></div>
        <div class="info-item"><span class="info-label">Período de referência</span><br/><span class="info-value">${sourceMeta?altaDateLabel(sourceMeta.periodStart)+" a "+altaDateLabel(sourceMeta.periodEnd):"—"}</span></div>
      </div>

      <div class="section">
        <div class="section-title">Quadro Diagnóstico Multiprofissional</div>
        <div class="info-grid">
           <div class="field"><span class="field-label">CID-10 Principal</span><div class="field-value">${altaPrintText(cid10) || "—"}</div></div>
           <div class="field"><span class="field-label">CID-10 Secundário</span><div class="field-value">${altaPrintText(multiCid10Secundario || "—")}</div></div>
        </div>
        <div class="field"><span class="field-label">Diagnóstico Clínico</span><div class="field-value">${altaPrintText(multiDiagClinico || "—")}</div></div>
        <div class="field"><span class="field-label">Diagnóstico Funcional Global</span><div class="field-value">${altaPrintText(multiDiagFuncional) || "—"}</div></div>
        <div class="field"><span class="field-label">Contexto Biopsicossocial</span><div class="field-value">${altaPrintText(multiContextoBiopsicossocial || "—")}</div></div>
        <div class="field"><span class="field-label">CIF — Funções do Corpo</span><div class="field-value">${altaPrintText(cifFuncoes || "—")}</div></div>
        <div class="field"><span class="field-label">CIF — Atividades e Participação</span><div class="field-value">${altaPrintText(cifAtividades || "—")}</div></div>
        <div class="field"><span class="field-label">CIF — Fatores Ambientais</span><div class="field-value">${altaPrintText(cifFatores || "—")}</div></div>
        <div class="field"><span class="field-label">Barreiras</span><div class="field-value">${altaPrintText(multiBarreiras) || "—"}</div></div>
        <div class="field"><span class="field-label">Potencialidades</span><div class="field-value">${altaPrintText(multiPotencialidades) || "—"}</div></div>
        ${multiFatoresContextuais ? `<div class="field"><span class="field-label">Fatores contextuais</span><div class="field-value">${altaPrintText(multiFatoresContextuais)}</div></div>` : ""}
      </div>

      <div class="section">
        <div class="section-title">Resumo do Percurso Terapêutico</div>
        <div class="field"><span class="field-label">Objetivos Gerais</span><div class="field-value">${altaPrintText(multiObjetivosGerais) || "—"}</div></div>
        <div class="field"><span class="field-label">Resumo do Plano Executado</span><div class="field-value">${altaPrintText(multiPlanoExecutado || "—")}</div></div>
      </div>
    `;

    profSections
      .filter(s => s.status_contribuicao === "concluida" || s.status_contribuicao === "assinada")
      .forEach(s => {
      html += `
        <div class="section" style="page-break-inside: avoid;">
          <div class="section-title">Evolução: ${altaPrintText(s.profissao || "Área")} — ${altaPrintText(s.profissional_nome)}</div>
          <div class="info-grid" style="margin-bottom: 10px; padding: 8px;">
            <div><span class="info-label">Período</span><br/><span class="info-value">${fmt(s.periodo_inicio)} a ${fmt(s.periodo_fim)}</span></div>
            <div><span class="info-label">Sessões realizadas</span><br/><span class="info-value">${s.sessoes}</span></div>
            <div><span class="info-label">Adesão</span><br/><span class="info-value">${altaPrintText(s.adesao || "—")}</span></div>
          </div>
          <div class="field"><span class="field-label">Objetivos Específicos</span><div class="field-value">${altaPrintText(s.objetivos_especificos || s.objetivos || "—")}</div></div>
          <div class="field"><span class="field-label">Intervenções/Procedimentos</span><div class="field-value">${altaPrintText(s.intervencoes) || "—"}</div></div>
          <div class="field"><span class="field-label">Evolução Clínica e Funcional da Área</span><div class="field-value">${altaPrintText(s.evolucao || "—")}</div></div>
          <div class="field"><span class="field-label">Status das Metas</span><div class="field-value">${
            s.metas_status === "totalmente" ? "Totalmente atingidas" :
            s.metas_status === "parcialmente" ? "Parcialmente atingidas" : s.metas_status === "nao_atingidas" ? "Não atingidas" : "Aguardando avaliação profissional"
          }${s.metas_justificativa ? ` — ${altaPrintText(s.metas_justificativa)}` : ""}</div></div>
          ${s.tecnologia_assistiva ? `<div class="field"><span class="field-label">Tecnologia Assistiva Concedida</span><div class="field-value">${altaPrintText(s.tecnologia_assistiva)}</div></div>` : ""}
          ${s.intercorrencias ? `<div class="field"><span class="field-label">Intercorrências</span><div class="field-value">${altaPrintText(s.intercorrencias)}</div></div>` : ""}
          ${s.orientacoes_especificas ? `<div class="field"><span class="field-label">Orientações da área</span><div class="field-value">${altaPrintText(s.orientacoes_especificas)}</div></div>` : ""}
          ${s.encaminhamentos_especificos ? `<div class="field"><span class="field-label">Encaminhamentos da área</span><div class="field-value">${altaPrintText(s.encaminhamentos_especificos)}</div></div>` : ""}
          <div class="signature" style="margin-top:20px; text-align: left;">
            <div class="signature-line" style="margin-left: 0; width: 250px;"></div>
            <div class="name">${altaPrintText(s.profissional_nome)}</div>
            <div class="role">${altaPrintText(s.profissao)} — ${altaPrintText(s.conselho)}</div>
          </div>
        </div>
      `;
    });

    html += `
      <div class="section" style="page-break-inside: avoid;">
        <div class="section-title">Conclusão e Condição na Alta</div>
        <div class="info-grid">
           <div class="field"><span class="field-label">Tipo de Alta</span><div class="field-value">${altaPrintText(tipoAltaLabel)}</div></div>
           <div class="field"><span class="field-label">Nível de Independência</span><div class="field-value">${altaPrintText(nivelIndep || "—")}</div></div>
        </div>
        <div class="field"><span class="field-label">Motivo da Alta</span><div class="field-value">${altaPrintText(motivoLabel)}${motivoDetalhe ? ` — ${altaPrintText(motivoDetalhe)}` : ""}</div></div>
        <div class="field"><span class="field-label">Descrição da Condição Funcional</span><div class="field-value">${altaPrintText(condicaoFuncional || "—")}</div></div>
        <div class="field"><span class="field-label">Comparação Admissão x Alta</span><div class="field-value">${altaPrintText(multiComparacaoFuncional || "—")}</div></div>
        <div class="field"><span class="field-label">Ganhos Clínicos Principais</span><div class="field-value">${altaPrintText(multiGanhosPrincipais || "—")}</div></div>
        <div class="field"><span class="field-label">Limitações Persistentes</span><div class="field-value">${altaPrintText(multiLimitacoesPersistentes || "—")}</div></div>
        <div class="info-grid">
           <div class="field"><span class="field-label">Risco de Regressão</span><div class="field-value">${altaPrintText(multiRiscoRegressao || "—")}</div></div>
           <div class="field"><span class="field-label">Fatores de Alerta</span><div class="field-value">${altaPrintText(multiFatoresAlerta || "—")}</div></div>
        </div>
      </div>

      <div class="section" style="page-break-inside: avoid;">
        <div class="section-title">Plano de Transição e Pós-Alta</div>
        <div class="field"><span class="field-label">Orientações ao Usuário / Família</span><div class="field-value">${altaPrintText(orientacoesUsuario) || "—"}</div></div>
        ${multiOrientacoesEscola ? `<div class="field"><span class="field-label">Orientações à escola</span><div class="field-value">${altaPrintText(multiOrientacoesEscola)}</div></div>` : ""}
        ${multiPontosAtencao ? `<div class="field"><span class="field-label">Pontos de atenção</span><div class="field-value">${altaPrintText(multiPontosAtencao)}</div></div>` : ""}
        ${multiContinuarTerapia ? `<div class="field"><span class="field-label">Continuidade do cuidado</span><div class="field-value">${altaPrintText(multiContinuarTerapia)}</div></div>` : ""}
        <div class="field"><span class="field-label">Orientações para UBS/ESF</span><div class="field-value">${altaPrintText(orientacoesUbs || "—")}</div></div>
        <div class="field"><span class="field-label">Encaminhamentos Realizados</span><div class="field-value">${altaPrintText(encaminhamentos.join(", ") || "—")}</div></div>
        <div class="info-grid">
           <div class="field"><span class="field-label">Frequência Recomendada APS</span><div class="field-value">${altaPrintText(freqAps || "—")}</div></div>
           <div class="field"><span class="field-label">Prazo sugerido de retorno</span><div class="field-value">${altaPrintText(multiPrazoRetorno || "—")}</div></div>
        </div>
      </div>

      <div class="section"><div class="section-title">Resumo Final Consolidado</div><div class="field-value">${altaPrintText(multiResumoConsolidado) || "—"}</div></div>
      <div class="signature" style="margin-top:40px">
        <div class="signature-line"></div>
        <div class="name">${altaPrintText(multiResponsavelTecnico || "Responsável Técnico (RT)")}</div>
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
        <div class="info-item"><span class="info-label">Paciente</span><br/><span class="info-value">${altaPrintText(p.nome)}</span></div>
        <div class="info-item"><span class="info-label">Data Nasc.</span><br/><span class="info-value">${altaDateLabel(p.dataNascimento)} </span></div>
        <div class="info-item"><span class="info-label">CNS</span><br/><span class="info-value">${altaPrintText(p.cns || "—")}</span></div>
        <div class="info-item"><span class="info-label">CPF</span><br/><span class="info-value">${altaPrintText(p.cpf || "—")}</span></div>
        <div class="info-item"><span class="info-label">Responsável</span><br/><span class="info-value">${altaPrintText(p.nomeMae || "—")}</span></div>
        <div class="info-item"><span class="info-label">Data de Alta</span><br/><span class="info-value">${fmt(indDataAlta)}</span></div>
        <div class="info-item"><span class="info-label">Profissional</span><br/><span class="info-value">${altaPrintText(profNome)} — ${altaPrintText(profissao)}</span></div>
        <div class="info-item"><span class="info-label">Conselho</span><br/><span class="info-value">${altaPrintText(conselho)}</span></div>
      </div>

      <div class="section">
        <div class="section-title">Contexto Clínico</div>
        <div class="field"><span class="field-label">Queixa Principal</span><div class="field-value">${altaPrintText(indQueixaPrincipal) || "—"}</div></div>
        <div class="field"><span class="field-label">Motivo do Encaminhamento</span><div class="field-value">${altaPrintText(indMotivoEncaminhamento) || "—"}</div></div>
        <div class="field"><span class="field-label">Contexto Familiar/Social</span><div class="field-value">${altaPrintText(indContextoFamiliar || "—")}</div></div>
        <div class="field"><span class="field-label">Comorbidades</span><div class="field-value">${altaPrintText(indComorbidades || "—")}</div></div>
        <div class="field"><span class="field-label">Medicação</span><div class="field-value">${altaPrintText(indMedicacao || "—")}</div></div>
      </div>

      <div class="section">
        <div class="section-title">Diagnóstico</div>
        <div class="field"><span class="field-label">CID-10</span><div class="field-value">${altaPrintText(indDiagCid) || "—"}</div></div>
        <div class="field"><span class="field-label">CIF</span><div class="field-value">${altaPrintText(indCif || "—")}</div></div>
        <div class="field"><span class="field-label">Diagnóstico Clínico</span><div class="field-value">${altaPrintText(indDiagClinico) || "—"}</div></div>
        <div class="field"><span class="field-label">Diagnóstico Funcional</span><div class="field-value">${altaPrintText(indDiagFuncional) || "—"}</div></div>
        <div class="field"><span class="field-label">Nível de Comprometimento</span><div class="field-value">${altaPrintText(indNivelComprometimento || "—")}</div></div>
        <div class="field"><span class="field-label">Observações Diagnósticas</span><div class="field-value">${altaPrintText(indObsDiagnosticas || "—")}</div></div>
      </div>

      <div class="section">
        <div class="section-title">Acompanhamento Terapêutico</div>
        <div class="info-grid" style="margin-bottom: 10px; padding: 8px;">
          <div><span class="info-label">Período</span><br/><span class="info-value">${fmt(indPeriodoInicio)} a ${fmt(indPeriodoFim)}</span></div>
          <div><span class="info-label">Sessões realizadas</span><br/><span class="info-value">${altaPrintText(indSessoes)}</span></div>
          <div><span class="info-label">Faltas no período</span><br/><span class="info-value">${altaPrintText(indFaltas)}</span></div>
          <div><span class="info-label">Modalidade</span><br/><span class="info-value">${altaPrintText(indModalidade || "—")}</span></div>
        </div>
        <div class="field"><span class="field-label">Frequência de Atendimento</span><div class="field-value">${altaPrintText(indFrequenciaAtendimento || "—")}</div></div>
        <div class="field"><span class="field-label">Adesão ao Tratamento</span><div class="field-value">${altaPrintText(indAdesaoTratamento || "—")}</div></div>
      </div>

      <div class="section">
        <div class="section-title">Evolução Clínica e Funcional</div>
        <div class="field"><span class="field-label">Objetivos Terapêuticos Iniciais</span><div class="field-value">${altaPrintText(indObjetivos) || "—"}</div></div>
        <div class="field"><span class="field-label">Intervenções/Procedimentos Realizados</span><div class="field-value">${altaPrintText(indIntervencoes) || "—"}</div></div>
        <div class="field"><span class="field-label">Evolução Clínica</span><div class="field-value">${altaPrintText(indEvolucao) || "—"}</div></div>
        <div class="field"><span class="field-label">Evolução Global</span><div class="field-value">${altaPrintText(indEvolucaoGlobal || "—")}</div></div>
        <div class="field"><span class="field-label">Metas Atingidas</span><div class="field-value">${
          indMetas === "totalmente" ? "Totalmente atingidas" :
          indMetas === "parcialmente" ? "Parcialmente atingidas" :
          indMetas === "nao_atingidas" ? "Não atingidas" : "Aguardando avaliação profissional"
        }${indMetasJust ? ` — ${altaPrintText(indMetasJust)}` : ""}</div></div>
        <div class="field"><span class="field-label">Resposta Terapêutica</span><div class="field-value">${altaPrintText(indRespostaTerapeutica || "—")}</div></div>
        <div class="field"><span class="field-label">Comparação Início/Alta</span><div class="field-value">${altaPrintText(indComparacaoInicioAlta || "—")}</div></div>
        ${indTA ? `<div class="field"><span class="field-label">Tecnologia Assistiva</span><div class="field-value">${altaPrintText(indTA)}</div></div>` : ""}
        ${indIntercorrencias ? `<div class="field"><span class="field-label">Intercorrências</span><div class="field-value">${altaPrintText(indIntercorrencias)}${indIntercorrenciasObs ? ` — ${altaPrintText(indIntercorrenciasObs)}` : ""}</div></div>` : ""}
      </div>

      <div class="section" style="page-break-inside: avoid;">
        <div class="section-title">Conclusão e Alta</div>
        <div class="field"><span class="field-label">Tipo de Alta</span><div class="field-value">${altaPrintText(tipoAltaLabel)}</div></div>
        <div class="field"><span class="field-label">Motivo da Alta</span><div class="field-value">${altaPrintText(motivoLabel)}${indMotivoDet ? ` — ${altaPrintText(indMotivoDet)}` : ""}</div></div>
        <div class="field"><span class="field-label">Risco de Regressão</span><div class="field-value">${altaPrintText(indRiscoRegressao || "—")}</div></div>
        ${indRiscoPosAlta ? `<div class="field"><span class="field-label">Risco pós-alta</span><div class="field-value">${altaPrintText(indRiscoPosAlta)}</div></div>` : ""}
        ${indComplexidade ? `<div class="field"><span class="field-label">Complexidade do caso</span><div class="field-value">${altaPrintText(indComplexidade)}</div></div>` : ""}
        <div class="field"><span class="field-label">Necessidade de Continuidade Terapêutica</span><div class="field-value">${altaPrintText(indContinuarTerapia || "—")}</div></div>
        <div class="field"><span class="field-label">Orientações Específicas</span><div class="field-value">${altaPrintText(indOrientacoes || "—")}</div></div>
        <div class="field"><span class="field-label">Encaminhamentos</span><div class="field-value">${altaPrintText(indEncaminhamento || "—")}</div></div>
        <div class="field"><span class="field-label">Prazo sugerido para reavaliação</span><div class="field-value">${altaPrintText(indPrazoReavaliacao || "—")}</div></div>
      </div>

      <div class="section"><div class="section-title">Resumo Final Consolidado</div><div class="field-value">${altaPrintText(indResumoConsolidado) || "—"}</div></div>
      <div class="signature" style="margin-top:50px">
        <div class="signature-line"></div>
        <div class="name">${altaPrintText(profNome)}</div>
        <div class="role">${altaPrintText(profissao)} — ${altaPrintText(conselho)}</div>
      </div>
    `;
  };

  const handlePrint = (type: "multi" | "individual") => {
    if (!pacienteId || !reportId || !isReportLocked || loading || loadFailed || conflict || !scopeMatches || revisionRef.current?.unitId!==user?.unidadeId) return;
    if (!paciente || paciente.id!==pacienteId || revisionRef.current?.id!==reportId) {toast.error("Não foi possível conferir a identificação do relatório. Recarregue antes de imprimir.");return;}
    const body=type==="multi"?buildMultiPrintBody():buildIndPrintBody();
    const title=type==="multi"?"Relatório de Alta — Multiprofissional":"Relatório de Alta — Individual";
    const meta={Paciente:escapeAlta(paciente.nome),"Data de Alta":escapeAlta(fmt(type==="multi"?dataAlta:indDataAlta)),Versão:escapeAlta(version)};
    void openPrintDocument(title,altaOfficialBody(body,readAltaEvolution(revisionRef.current?.payload.altaEvolutionV1),version),meta);
  };

  const buildDraftPayload = (type: "multi" | "individual", signedSections?: ProfSection[]) => type === "multi" ? {
      altaSourceMeta:sourceMeta,
      modalidades, cid10, multiCid10Secundario, multiDiagClinico, multiDiagFuncional,
      multiContextoBiopsicossocial, cifFuncoes, cifAtividades, cifFatores,
      multiBarreiras, multiPotencialidades, multiFatoresContextuais,
      multiObjetivosGerais, multiPlanoExecutado,
      profissionais: signedSections || profSections, motivoAlta, multiTipoAlta, motivoDetalhe,
      condicaoFuncional, nivelIndep, multiComparacaoFuncional, multiGanhosPrincipais,
      multiLimitacoesPersistentes, multiRiscoRegressao, multiFatoresAlerta,
      orientacoesUsuario, orientacoesUbs, multiOrientacoesEscola, multiPontosAtencao,
      encaminhamentos, freqAps, multiContinuarTerapia, multiPrazoRetorno,
      multiResponsavelTecnico, resumoConsolidado: multiResumoConsolidado,
    } : {
      altaSourceMeta:sourceMeta,
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
    };

  // Compare clinical fields only: changes to audit/version metadata are not unsaved edits.
  const snapshot = (type: "multi" | "individual", signedSections?: ProfSection[]) =>
    JSON.stringify({ date: type === "multi" ? dataAlta : indDataAlta, fields: buildDraftPayload(type, signedSections) });
  const currentSnapshot = modo === "multiprofissional" ? snapshot("multi") : modo === "individual" ? snapshot("individual") : null;
  const hasUnsavedChanges = !!pacienteId && !isReportLocked && !loadFailed && savedSnapshot !== null && currentSnapshot !== null && savedSnapshot !== currentSnapshot;

  useEffect(() => {
    if (!loading && loadedSnapshotPending.current) {
      loadedSnapshotPending.current = false;
      if (!loadFailed) setSavedSnapshot(currentSnapshot);
    }
  }, [loading, loadFailed, currentSnapshot]);

  useEffect(() => {
    if (!hasUnsavedChanges && !loading) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges && !savingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const guardLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.download || (anchor.target && anchor.target !== "_self")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
      if (savingRef.current || (hasUnsavedChanges && !window.confirm("Há alterações não salvas neste relatório. Deseja sair mesmo assim?"))) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", guardLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", guardLink, true);
    };
  }, [hasUnsavedChanges, loading]);

  const returnToSelector = () => {
    if (savingRef.current) return;
    if (hasUnsavedChanges && !window.confirm("Há alterações não salvas. Voltar e descartá-las?")) return;
    setModo("selector");
  };

  const handleSave = async (type: "multi" | "individual", isDraft: boolean = false, customStatus?: any, signedSections?: ProfSection[]) => {
    if (savingRef.current || loading || loadFailed || conflict || !scopeMatches) return;
    if (!pacienteId || !user?.id || !user.unidadeId) { toast.error("Selecione um paciente"); return; }
    if (!reportId && (!sourceBundle || !sourceMeta)) { toast.error("Confirme as fontes clínicas antes de salvar o novo relatório."); return; }
    if (!reportId && sourceBundle && sourceMeta && (sourceMeta.unitId!==user.unidadeId || sourceBundle.patientId!==pacienteId || (type==="individual"&&sourceBundle.professionalId!==user.id))) { toast.error("O contexto da fonte mudou. Selecione novamente o paciente."); return; }
    if (sourceMeta && (type==="multi"?dataAlta:indDataAlta)!==sourceMeta.through) { toast.error("A data de alta foi alterada. Confira a data de referência das fontes antes de salvar."); return; }
    if (type==="individual"&&sourceMeta&&(indPeriodoInicio!==sourceMeta.periodStart||indPeriodoFim!==sourceMeta.periodEnd)) { toast.error("O período foi alterado. Confira as contagens das fontes antes de salvar."); return; }

    if (isReportLocked && customStatus !== "rascunho") {
      toast.error("Este relatório está finalizado. Reabra o relatório antes de alterar ou salvar.");
      return;
    }

    if (!isDraft && !customStatus) {
      const errs = type === "multi" ? validateMulti() : validateInd();
      if (errs.length > 0) { toast.error(errs[0]); return; }
    }

    if (!isDraft && liveEvolution.state==="unavailable" && !window.confirm("A consulta das medidas clínicas está indisponível ou ainda em andamento. Finalizar sem incluir gráficos nesta versão?")) return;
    savingRef.current = true;
    setLoading(true);
    try {
    const newVersion = version + (isDraft ? 0 : 1);
    const actionDate = new Date().toISOString();
    const newHistoryEntry: VersionRecord = {
      version: newVersion,
      data: actionDate,
      user_nome: user.nome || "Sistema",
      action: signedSections ? "Assinar Contribuição" : customStatus === "emitido" ? "Emissão Final" : isDraft ? "Salvar Rascunho" : "Atualização",
    };

    const updatedHistory = [...history, newHistoryEntry];

    const draftPayload = buildDraftPayload(type, signedSections);
    const payload = { ...revisionRef.current?.payload, ...draftPayload, version: newVersion, history: updatedHistory, ...(!isDraft?{altaEvolutionV1:liveEvolution}:{}) };

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

    let result: any;
    let targetReportId = reportId;

    // A criação mantém a consulta de existência. Sem índice único no banco,
    // essa consulta não garante unicidade em duas inserções simultâneas.
    if (!targetReportId) {
      let existingQuery = supabase
        .from("prontuarios")
        .select("id")
        .eq("paciente_id", pacienteId)
        .eq("unidade_id",user.unidadeId)
        .eq("tipo_registro", record.tipo_registro)
        .order("atualizado_em", { ascending: false })
        .limit(1);
      if (type === "individual") existingQuery = existingQuery.eq("profissional_id", user.id);
      const { data: existingBeforeSave, error: existingError } = await existingQuery.maybeSingle();
      if (existingError) {
        toast.error("Não foi possível verificar relatório existente: " + existingError.message);
        return;
      }
      if (existingBeforeSave?.id) {
        setConflict(true);
        toast.error("Outro relatório já foi criado. Seus dados permanecem na tela; revise o registro existente antes de tentar novamente.");
        return;
      }
    }

    if (targetReportId) {
      const revision = revisionRef.current;
      if (!revision || revision.id !== targetReportId || revision.unitId!==user.unidadeId || revision.status !== "rascunho") {
        setConflict(true);
        toast.error("A revisão do relatório não corresponde ao rascunho carregado.");
        return;
      }
      const { profissional_id, profissional_nome, unidade_id, ...changes } = record;
      let updateQuery = supabase
        .from("prontuarios")
        .update(changes)
        .eq("id", targetReportId)
        .eq("paciente_id", pacienteId)
        .eq("unidade_id",user.unidadeId)
        .eq("tipo_registro", record.tipo_registro)
        .eq("status", "rascunho");
      if (type === "individual") updateQuery = updateQuery.eq("profissional_id", user.id);
      // Compare-and-swap: a condição é avaliada no mesmo UPDATE pelo PostgreSQL.
      updateQuery = revision.updated === null ? updateQuery.is("atualizado_em", null) : updateQuery.eq("atualizado_em", revision.updated);
      result = await updateQuery.select("id,atualizado_em,status").maybeSingle();

      if (!result.error && !result.data) {
        setConflict(true);
        toast.error("O relatório mudou ou o acesso foi revogado. Nenhum dado foi sobrescrito; suas alterações continuam na tela.");
        return;
      }
      if (!result.error && result.data?.id) {
        setReportId(result.data.id);
      }
    } else {
      result = await supabase.from("prontuarios").insert(record).select("id,atualizado_em,status").single();
      if (!result.error && result.data) {
        setReportId(result.data.id);
      }
    }

    if (result.error || !result.data?.id) {
      toast.error("Não foi possível confirmar o salvamento: " + (result.error?.message || "registro não retornado"));
    } else {
      revisionRef.current = { id: result.data.id, unitId:user.unidadeId, updated: result.data.atualizado_em ?? null, status: result.data.status ?? null, payload };
      if (signedSections) setProfSections(signedSections);
      setSavedSnapshot(snapshot(type, signedSections));
      toast.success(signedSections ? "Contribuição registrada e rascunho salvo" : isDraft ? "Rascunho salvo com sucesso" : "Relatório de alta atualizado");
      setStatus(targetStatus as any);
      if (!targetReportId) setReportOwnerId(user.id);
      setLastUpdatedBy(user.nome || "");
      setLastUpdatedAt(result.data.atualizado_em || actionDate);
      setVersion(newVersion);
      setHistory(updatedHistory);
      
      // Auditoria
      await auditService.log({
        acao: signedSections ? "assinar_contribuicao_alta" : isDraft ? "salvar_rascunho_alta" : "finalizar_relatorio_alta",
        modulo: "prontuario",
        entidade: "prontuario",
        entidadeId: (result.data as any)?.id || reportId || "",
        pacienteId: pacienteId,
        pacienteNome: paciente?.nome,
        profissionalId: user.id,
        profissionalNome: user.nome,
        detalhes: { tipo: type, isDraft, version: newVersion }
      });
    }
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível salvar o relatório.");
    } finally {
      savingRef.current = false;
      setLoading(false);
    }
  };

  const scopeInvalidated=!!pacienteId&&!!loadedScope&&!scopeMatches;
  if(scopeInvalidated){
    return <div className="clinical-premium p-4 space-y-3"><Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertTitle>Contexto de acesso alterado</AlertTitle><AlertDescription>A unidade ou o profissional ativo mudou. O relatório anterior não será exibido, impresso nem gravado neste contexto.</AlertDescription></Alert><Button type="button" variant="outline" disabled={savingRef.current} onClick={()=>{if(hasUnsavedChanges&&!window.confirm("Existem alterações não salvas. Descartá-las e retornar à seleção?"))return;handlePacienteChange("");setModo("selector");}}>Retornar à seleção</Button></div>;
  }
  const sourceDatesChanged = !!sourceMeta && ((modo==="multiprofissional"?dataAlta:indDataAlta)!==sourceMeta.through || (modo==="individual"&&(indPeriodoInicio!==sourceMeta.periodStart||indPeriodoFim!==sourceMeta.periodEnd)));
  const hasSignedContribution=profSections.some(s=>s.status_contribuicao==="assinada");
  const recountAltaSources=async()=>{
    if(!sourceMeta||formReadOnly||conflict||savingRef.current||!user?.id)return;
    const type=modo==="multiprofissional"?"multi":"individual";
    if(type==="multi"&&hasSignedContribution){toast.error("Há contribuições assinadas. Preserve o período já conferido.");return;}
    if(sourceMeta.unitId!==user.unidadeId){toast.error("A unidade atual não corresponde às fontes do relatório.");return;}
    const pid=pacienteId, token=reportLoadTokenRef.current;
    const through=type==="multi"?dataAlta:indDataAlta;
    const from=type==="individual"?indPeriodoInicio:"";
    const to=type==="individual"?indPeriodoFim||through:through;
    if(!through||through>new Date().toLocaleDateString("sv-SE",{timeZone:"America/Fortaleza"})||(from&&from>to)||to>through){toast.error("Confira o período e a data de alta; não utilize datas futuras.");return;}
    savingRef.current=true;setLoading(true);
    try{
      const bundle=await fetchAltaSourceBundle(pid,type,token);
      if(!bundle||token!==reportLoadTokenRef.current||activePatientRef.current!==pid)return;
      const scoped=selectAltaSources(bundle,sourceMeta.cycleId||"all","",through,from,to);
      if(type==="individual"){
        setIndSessoes(scoped.meta.performed);setIndFaltas(scoped.meta.absences);
        setIndPeriodoInicio(from||scoped.meta.periodStart);setIndPeriodoFim(to||scoped.meta.periodEnd);
      }else{
        const counts=new Map<string,number>();for(const s of scoped.sessions)if(s.status==="realizada")counts.set(s.professional_id,(counts.get(s.professional_id)||0)+1);
        setProfSections(prev=>prev.map(s=>{const n=scoped.notes.filter(x=>x.profissional_id===s.profissional_id);const ss=scoped.sessions.filter(x=>x.professional_id===s.profissional_id);const ds=[...n.map(x=>x.data_atendimento),...ss.map(x=>x.scheduled_date||"")].filter(Boolean).sort();return {...s,sessoes:counts.get(s.profissional_id)||0,periodo_inicio:ds[0]||"",periodo_fim:ds[ds.length-1]||""};}));
      }
      setSourceMeta({...scoped.meta,ptsId:sourceMeta.ptsId,periodStart:type==="individual"?from||scoped.meta.periodStart:scoped.meta.periodStart,periodEnd:type==="individual"?to||scoped.meta.periodEnd:scoped.meta.periodEnd});
      toast.success("Contagens reconferidas. Revise os textos clínicos para o novo período; eles foram preservados.");
    }catch(e){toast.error(e instanceof Error?e.message:"Não foi possível reconferir as fontes.");}
    finally{savingRef.current=false;setLoading(false);}
  };
  const evolutionPreview=pacienteId&&!loading&&!loadFailed&&<section className="clinical-premium p-3 space-y-3 min-w-0" aria-label="Evolução clínica">
    <div className="flex flex-wrap items-center gap-2"><span className="clinical-dock-icon clinical-tone-blue"><Activity className="w-4 h-4"/></span><div className="flex-1 min-w-0"><h2 className="text-sm font-semibold">Evolução clínica registrada</h2><p className="text-xs text-muted-foreground">{isReportLocked?"Medidas preservadas na versão finalizada":"Medidas do ciclo e do período conferido, sem inferência clínica."}</p></div>{!isReportLocked&&evolutionScopeReady&&<Button type="button" size="sm" variant="outline" disabled={evolutionQuery.isFetching||conflict} onClick={()=>void evolutionQuery.refetch()}><RefreshCw className="w-3.5 h-3.5 mr-1"/>Atualizar medidas</Button>}</div>
    {visibleEvolution?.state==="recorded"?visibleEvolution.sections.map(section=><details key={section.cycleId} className="group rounded-lg border clinical-inset p-2.5" open><summary className="cursor-pointer font-semibold text-sm break-words">{section.specialty} · {altaDateLabel(section.startDate)} <span className="text-xs font-normal text-muted-foreground">· ciclo {section.cycleId.slice(-8)}</span></summary><div className="mt-2 grid gap-2 xl:grid-cols-2">{altaSeries(section).map(series=><div key={series.scale+":"+series.context} className="rounded-lg border bg-card p-3 min-w-0 space-y-2"><h3 className="text-xs font-semibold break-words">{series.label}{series.context?" · "+series.context:""}</h3><div className="grid grid-cols-3 gap-1 text-xs"><div><p className="text-muted-foreground">Inicial</p><strong className="text-lg tabular-nums">{series.values[0]}</strong></div><div><p className="text-muted-foreground">Última</p><strong className="text-lg tabular-nums">{series.values[series.values.length-1]}</strong></div><div><p className="text-muted-foreground">Variação</p><strong className="text-lg tabular-nums">{series.delta===null?"—":(series.delta>0?"+":"")+series.delta}</strong></div></div>
    {series.values.length>1?<svg className="w-full h-auto text-muted-foreground" viewBox="0 0 340 120" role="img" aria-label={series.label+" — curva em ordem dos registros"}><line x1="38" y1="20" x2="38" y2="100" stroke="currentColor" opacity=".5"/><line x1="38" y1="100" x2="322" y2="100" stroke="currentColor" opacity=".5"/><text x="30" y="23" textAnchor="end" fontSize="10" fill="currentColor">{series.max}</text><text x="30" y="103" textAnchor="end" fontSize="10" fill="currentColor">{series.min}</text><polyline fill="none" stroke="#168b9d" strokeWidth="2" points={series.geometry.map(p=>p.x+","+p.y).join(" ")}/>{series.geometry.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#168b9d"><title>{altaDateLabel(series.points[i].date)}: {series.values[i]}</title></circle>)}</svg>:<p className="text-xs text-muted-foreground">Uma medida registrada; sem comparação temporal.</p>}
    <p className="text-xs text-muted-foreground">{series.values.length} medida(s) · {altaDateLabel(series.points[0].date)} a {altaDateLabel(series.points[series.points.length-1].date)} · ordem dos registros</p><details className="text-xs"><summary className="cursor-pointer font-medium">Conferir valores registrados</summary><div className="max-h-48 overflow-auto mt-1"><table className="w-full text-left"><thead><tr><th>Data</th><th>Sessão</th><th>Valor</th></tr></thead><tbody>{series.points.map((point,i)=><tr key={point.id} className="border-t"><td className="py-1">{altaDateLabel(point.date)}</td><td>{point.session??"—"}</td><td>{series.values[i]}</td></tr>)}</tbody></table></div></details></div>)}</div></details>):<p role="status" className="text-xs text-muted-foreground">{!isReportLocked&&evolutionScopeReady&&evolutionQuery.isFetching?"Consultando medidas clínicas…":altaEvolutionMessage(visibleEvolution)}</p>}
    <p className="text-xs text-muted-foreground">As escalas não determinam sozinhas a melhora, o cumprimento de metas ou a indicação de alta.</p>
  </section>;
  const sourcePanel = pacienteId && !loading && !loadFailed && <section className="clinical-premium p-3 space-y-2 min-w-0" aria-label="Fontes do preenchimento">
    <div className="flex flex-wrap items-center gap-2"><span className="clinical-dock-icon clinical-tone-teal"><DatabaseIcon className="w-4 h-4"/></span><div className="flex-1 min-w-0"><h2 className="text-sm font-semibold">Fontes do preenchimento inteligente</h2><p className="text-xs text-muted-foreground">Dados registrados na unidade; revise o conteúdo clínico antes de finalizar.</p></div></div>
    {sourceMeta?<div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">{[{label:"Prontuários clínicos",value:sourceMeta.noteCount},{label:"Sessões realizadas",value:sourceMeta.performed},{label:"Faltas",value:sourceMeta.absences},{label:"Sessões sem data",value:sourceMeta.undated}].map(x=><div key={x.label} className="clinical-inset border rounded-md p-2"><span className="block text-muted-foreground">{x.label}</span><strong className="text-base tabular-nums">{x.value}</strong></div>)}</div>
      <p className="text-xs text-muted-foreground">{sourceMeta.cycleId?"Ciclo selecionado":"Histórico da unidade no período"} · {sourceMeta.ptsId?"PTS selecionado":"Sem PTS vinculado"} · referência {fmt(sourceMeta.through)}.</p>
      {sourceMeta.undated>0&&<p className="text-xs text-amber-700 dark:text-amber-300">Sessões sem data não foram somadas ao período.</p>}
      {reportId&&<p className="text-xs text-muted-foreground">Fontes preservadas da versão salva. Nenhuma importação automática sobre o rascunho.</p>}
      {sourceDatesChanged&&<div role="status" className="rounded-md border p-2 text-xs space-y-2"><p className="text-amber-700 dark:text-amber-300">Data ou período alterado. Reconferir os números antes de salvar. Os textos clínicos não serão substituídos.</p><Button type="button" size="sm" variant="outline" disabled={formReadOnly||conflict||(modo==="multiprofissional"&&hasSignedContribution)} onClick={()=>void recountAltaSources()}><RefreshCw className="w-4 h-4 mr-1"/>Reconferir sessões e faltas</Button></div>}
      {modo==="multiprofissional"&&hasSignedContribution&&<p className="text-xs text-muted-foreground">A data de referência fica preservada após assinatura de contribuição.</p>}
      {!reportId&&sourceBundle&&<Button type="button" variant="outline" size="sm" disabled={formReadOnly||conflict||hasUnsavedChanges} onClick={()=>{setSourceMeta(null);resetMultiForm();resetIndividualForm();setSourceScope("");setSourcePts("");setDataAlta(sourceBundle.through);setIndDataAlta(sourceBundle.through);loadedSnapshotPending.current=true;}}>Escolher outras fontes antes de editar</Button>}
    </div>:sourceBundle&&!reportId?<div className="space-y-2">
      <p className="text-xs">Escolha o recorte de atendimento e o PTS. Não há combinação automática de ciclos ou de vários planos.</p>
      <div className="grid sm:grid-cols-2 gap-2">
        <div className="space-y-1"><Label className="text-xs">Ciclo / recorte de atendimento</Label><Select value={sourceScope} disabled={formReadOnly||hasUnsavedChanges} onValueChange={v=>{setSourceScope(v);const linked=sourceBundle.cycles.find(c=>c.id===v)?.pts_id;setSourcePts(linked&&sourceBundle.pts.some(p=>p.id===linked)?linked:sourceBundle.pts.length===1?sourceBundle.pts[0].id:sourceBundle.pts.length===0?"none":"");}}><SelectTrigger className="h-auto min-h-9 whitespace-normal text-left"><SelectValue placeholder="Escolher recorte"/></SelectTrigger><SelectContent><SelectItem value="all">Histórico completo da unidade (todos os ciclos)</SelectItem>{sourceBundle.cycles.map(c=><SelectItem key={c.id} value={c.id}>{c.specialty||c.treatment_type||"Ciclo"} · {c.start_date?fmt(c.start_date):"Sem data inicial"} · {c.status||"Sem situação"}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label className="text-xs">Projeto Terapêutico Singular (PTS)</Label><Select value={sourcePts} onValueChange={setSourcePts} disabled={formReadOnly||hasUnsavedChanges}><SelectTrigger className="h-auto min-h-9 whitespace-normal text-left"><SelectValue placeholder="Escolher PTS"/></SelectTrigger><SelectContent><SelectItem value="none">Sem vincular PTS</SelectItem>{sourceBundle.pts.map(plan=><SelectItem key={plan.id} value={plan.id}>{plan.status} · {plan.updated_at?fmtDateTime(plan.updated_at):"Sem atualização"} · {funcionarios.find(f=>f.id===plan.professional_id)?.nome||"Profissional responsável"}</SelectItem>)}</SelectContent></Select></div>
      </div>
      {hasUnsavedChanges&&<p className="text-xs text-amber-700">Para preservar os campos já editados, descarte as alterações e selecione novamente o paciente antes de importar.</p>}
      <Button type="button" size="sm" disabled={!sourceScope||!sourcePts||formReadOnly||conflict||hasUnsavedChanges} onClick={()=>{try{applyAltaSources(sourceBundle,sourceScope,sourcePts==="none"?"":sourcePts,sourceBundle.through);loadedSnapshotPending.current=true;toast.success("Fontes importadas para revisão profissional.");}catch(e){toast.error(e instanceof Error?e.message:"Falha ao importar fontes.");}}}><RefreshCw className="w-4 h-4 mr-1"/>Importar fontes selecionadas</Button>
    </div>:<p className="text-xs text-muted-foreground">Relatório existente: conteúdo salvo preservado. O registro não possui metadados das novas fontes.</p>}
  </section>;

  /* ── MODE SELECTOR ─── */
  if (modo === "selector") {
    return (
      <div className="space-y-3 min-w-0">
        <header className="clinical-hub-hero flex flex-wrap items-center gap-3">
          <span className="clinical-patient-avatar flex items-center justify-center shrink-0"><FileText className="w-5 h-5" aria-hidden="true" /></span>
          <div className="flex-1 min-w-[9rem]">
            <p className="clinical-hub-eyebrow">Documentação e continuidade assistencial</p>
            <h1 className="clinical-hub-name text-xl font-bold font-display">Relatório de Alta — CER II</h1>
            <p className="clinical-patient-sub text-xs mt-1">Consolidação clínica e encerramento terapêutico</p>
          </div>
        </header>
        <h2 className="text-sm font-semibold px-1">Selecione o modelo de relatório</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { key: "multi", label: "Relatório Multiprofissional", description: "Toda a equipe em um documento consolidado. Cada profissional preenche sua seção.", features: ["Contribuições por profissional", "Consolidação da equipe"], action: () => setModo("multiprofissional"), Icon: Users, tone: "clinical-tone-blue" },
            { key: "individual", label: "Relatório Individual", description: "Relatório específico do profissional responsável pelo atendimento.", features: ["Evolução clínica individual", "Emissão e impressão"], action: handleIndividualClick, Icon: User, tone: "clinical-tone-teal" },
          ].map(({ key, label, description, features, action, Icon, tone }) => (
            <button key={key} type="button" onClick={action} className="clinical-premium group min-w-0 text-left p-3 sm:p-4 flex flex-col gap-3 hover:ring-1 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors">
              <div className="clinical-inset rounded-lg border flex items-center justify-center h-24 sm:h-28 overflow-hidden" aria-hidden="true">
                {key === "multi" ? <svg viewBox="0 0 220 100" className="h-full w-full max-w-[250px]" fill="none">
                  {[42, 82, 122].map((x, i) => <g key={x} fill={i === 1 ? "var(--cp-teal)" : "var(--cp-blue)"} opacity={i === 1 ? 1 : 0.75}><circle cx={x} cy="30" r="10"/><path d={`M${x-15} 63V53Q${x-15} 42 ${x} 42Q${x+15} 42 ${x+15} 53V63Z`}/></g>)}
                  <rect x="151" y="23" width="43" height="55" rx="5" fill="hsl(var(--card))" stroke="var(--cp-blue)" strokeWidth="1.5"/>
                  {[39,47,55,63].map(y => <path key={y} d={`M161 ${y}h23`} stroke="var(--cp-blue)" opacity=".5" strokeWidth="2" strokeLinecap="round"/>)}
                  <circle cx="190" cy="76" r="11" fill="var(--cp-teal)"/><path d="M185 76l4 4 6-8" stroke="white" strokeWidth="2"/>
                </svg> : <svg viewBox="0 0 220 100" className="h-full w-full max-w-[250px]" fill="none">
                  <circle cx="65" cy="29" r="14" fill="var(--cp-blue)" opacity=".75"/>
                  <path d="M37 81V64Q37 47 65 47Q93 47 93 64V81Z" fill="hsl(var(--card))" stroke="var(--cp-blue)" strokeWidth="1.5"/>
                  <path d="M54 49l11 17 11-17M65 66v15" stroke="var(--cp-teal)" strokeWidth="2"/>
                  <rect x="115" y="18" width="60" height="66" rx="6" fill="hsl(var(--card))" stroke="var(--cp-teal)" strokeWidth="1.5"/>
                  <rect x="130" y="13" width="30" height="12" rx="4" fill="var(--cp-teal)"/>
                  {[37,47,57,67].map(y => <path key={y} d={`M127 ${y}h36`} stroke="var(--cp-teal)" opacity=".5" strokeWidth="2" strokeLinecap="round"/>)}
                  <path d="M153 78l28-27 6 6-28 27-8 2z" fill="var(--cp-blue)"/>
                </svg>}
              </div>
              <div className="flex gap-2.5 items-start"><span className={`clinical-dock-icon ${tone}`}><Icon className="h-4 w-4" /></span><div className="min-w-0"><h3 className="text-base font-semibold break-words">{label}</h3><p className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</p></div></div>
              <div className="space-y-1.5 border-t pt-2 flex-1">{features.map(feature => <p key={feature} className="flex items-center gap-1.5 text-xs"><CheckCircle className="h-3.5 w-3.5 shrink-0 text-[var(--cp-teal)]" />{feature}</p>)}</div>
              <span className="clinical-record-action clinical-action-main inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold">Acessar relatório <ChevronRight className="w-4 h-4" /></span>
            </button>
          ))}
        </div>

        {/* Sub-seletor exclusivo Fonoaudiologia (CBO 223810) */}
        <Dialog open={showIndividualChooser} onOpenChange={setShowIndividualChooser}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Escolha o modelo de Relatório Individual</DialogTitle>
              <DialogDescription>
                Disponível para profissionais com CBO 223810 (Fonoaudiólogo).
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
              <Card
                className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all"
                onClick={() => { setShowIndividualChooser(false); setModo("individual"); }}
              >
                <CardContent className="p-6 text-center space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Relatório Individual Padrão</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Utilize o modelo individual já existente no sistema.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card
                className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all"
                onClick={() => { setShowIndividualChooser(false); setModo("individual_fono"); }}
              >
                <CardContent className="p-6 text-center space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
                    <Stethoscope className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Relatório Fonoaudiológico Avaliativo 1</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Modelo avaliativo completo e exclusivo para profissionais de Fonoaudiologia.
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">Versão 1</Badge>
                </CardContent>
              </Card>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowIndividualChooser(false)}>Cancelar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (modo === "individual_fono") {
    return <RelatorioFonoAvaliativo onBack={() => setModo("selector")} />;
  }


  /* ═══ MULTIPROFISSIONAL ═══ */
  if (modo === "multiprofissional") {
    return (
      <div className="space-y-3 min-w-0">
        <header className="clinical-hub-hero flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Button variant="outline" size="icon" className="clinical-hub-new shrink-0" aria-label="Voltar à seleção de relatórios" onClick={returnToSelector} disabled={loading}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="min-w-0">
              <p className="clinical-hub-eyebrow">Continuidade assistencial · CER II</p>
              <h1 className="text-xl font-bold clinical-hub-name flex items-center gap-2">
                <Users className="w-5 h-5 shrink-0" aria-hidden="true" />
                Relatório de Alta — Multiprofissional
              </h1>
              <p className="clinical-patient-sub text-xs mt-1">Documento consolidado da equipe</p>
            </div>
          </div>
          {pacienteId && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={status === "rascunho" ? "secondary" : "default"} className="px-3 py-1">
                {status === "rascunho" ? "Rascunho" : "Finalizado"}
              </Badge>
              {isReportLocked && canReopenReport && (
                <Button variant="outline" size="sm" className="clinical-hub-new" onClick={() => setIsReopening(true)} disabled={loading}>
                  <Unlock className="w-4 h-4 mr-1" /> Reabrir relatório
                </Button>
              )}
            </div>
          )}
        </header>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
          <AltaMetric icon={User} label="Paciente" value={!pacienteId?"Selecionar paciente":loading?"Carregando…":loadFailed?"Não carregado":paciente?.id===pacienteId?paciente.nome:"Selecionado"} />
          <AltaMetric icon={Users} label="Equipe identificada" tone="teal" value={!pacienteId||loading||loadFailed?"—":profSections.length} />
          <AltaMetric icon={ShieldCheck} label="Contribuições assinadas" tone="violet" value={!pacienteId||loading||loadFailed?"—":`${profSections.filter(s=>s.status_contribuicao==="assinada").length} / ${profSections.length}`} />
          <AltaMetric icon={ListTodo} label="Validação" tone="slate" value={!pacienteId||loading||loadFailed?"Aguardando":isReportLocked?"Finalizado":validateMulti().length===0?"Pronto para finalizar":`${validateMulti().length} pendência(s)`} />
        </div>
      

        {sourcePanel}
        {evolutionPreview}
        {hasUnsavedChanges && <Alert><Clock className="h-4 w-4"/><AlertTitle>Alterações ainda não salvas</AlertTitle><AlertDescription>Salve o rascunho antes de sair. Somente dados confirmados pelo banco são recuperados.</AlertDescription></Alert>}
        {conflict && <Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertTitle>Conflito de gravação</AlertTitle><AlertDescription>O relatório foi alterado por outra operação ou seu acesso mudou. As alterações não salvas continuam nesta tela. Revise-as antes de recarregar; nenhuma sobrescrita foi efetuada. <Button type="button" variant="outline" size="sm" className="mt-2" disabled={loading} onClick={()=>{if(!window.confirm("Recarregar o registro do banco e descartar as alterações ainda não salvas?"))return;resetReportTracking();if(modo==="multiprofissional"){resetMultiForm();void loadMultiData(pacienteId,++reportLoadTokenRef.current);}else{resetIndividualForm();void loadIndividualData(pacienteId,++reportLoadTokenRef.current);}}}>Recarregar relatório</Button></AlertDescription></Alert>}
        {loadFailed && <Alert variant="destructive"><AlertCircle className="h-4 w-4"/><AlertTitle>Não foi possível carregar o relatório</AlertTitle><AlertDescription>Para evitar perda de dados, a edição e a impressão estão bloqueadas. Limpe a seleção e selecione o paciente novamente.</AlertDescription></Alert>}
        {isReportLocked && (
          <Alert className="border-amber-300 bg-amber-50">
            <Lock className="h-4 w-4 text-amber-700" />
            <AlertTitle className="text-amber-800">Relatório finalizado — alterações bloqueadas</AlertTitle>
            <AlertDescription className="text-amber-700">
              Para fazer qualquer alteração, utilize “Reabrir relatório”. A reabertura cria nova versão e registra o motivo na auditoria.
            </AlertDescription>
          </Alert>
        )}

        <Dialog open={isReopening} onOpenChange={setIsReopening}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reabertura de Relatório</DialogTitle>
              <DialogDescription>
                O documento finalizado será reaberto como nova versão. Os dados persistidos serão preservados e o motivo ficará registrado na auditoria.
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
              <Button onClick={handleReopen} disabled={loading}>Confirmar Reabertura</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,25%)] gap-3 items-start"><div className="min-w-0"><AltaWorkflow key="multi" steps={MULTI_STEPS}>

          <TabsContent value="identificacao" className="space-y-3 pt-1">
            <Card className="clinical-premium min-w-0">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Identificação</CardTitle>
                <div className="flex items-center gap-2">
                   <Badge variant="outline" className="text-[10px]">v{version}</Badge>
                   {status === "emitido" && <Badge className="bg-green-600 text-white text-[10px]">Emitido</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <BuscaPaciente pacientes={pacientes} value={pacienteId} onChange={handlePacienteChange} />
                {paciente && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 p-3 clinical-inset rounded-xl border text-sm">
                    <div><span className="text-muted-foreground text-xs block">Nome</span><strong>{paciente.nome}</strong></div>
                    <div><span className="text-muted-foreground text-xs block">Nasc.</span>{fmt(paciente.dataNascimento)}</div>
                    <div><span className="text-muted-foreground text-xs block">Data de Alta</span><Input disabled={formReadOnly || awaitingSources || (!!sourceMeta && hasSignedContribution)} type="date" value={dataAlta} onChange={e => setDataAlta(e.target.value)} className="h-8" /></div>
                    {lastUpdatedAt && (
                      <div><span className="text-muted-foreground text-xs block">Última atualização</span>{fmtDateTime(lastUpdatedAt)} por {lastUpdatedBy}</div>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Modalidades de reabilitação *</Label>
                  <div className="flex flex-wrap gap-3">{MODALIDADES.map(m => <label key={m} className="flex items-center gap-2 text-sm"><Checkbox checked={modalidades.includes(m)} disabled={formReadOnly || awaitingSources} onCheckedChange={v => setModalidades(prev => v === true ? Array.from(new Set([...prev,m])) : prev.filter(x => x !== m))}/>{m}</label>)}</div>
                </div>
              </CardContent>
            </Card>

          </TabsContent>


          <TabsContent value="diagnostico" className="space-y-3 pt-1">
            <Card className="clinical-premium min-w-0">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Diagnóstico Multiprofissional</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input disabled={formReadOnly || awaitingSources} value={cid10} onChange={e => setCid10(e.target.value)} placeholder="CID-10 Principal" />
                    <Input disabled={formReadOnly || awaitingSources} value={multiCid10Secundario} onChange={e => setMultiCid10Secundario(e.target.value)} placeholder="CID-10 Secundário" />
                 </div>
                 <Textarea disabled={formReadOnly || awaitingSources} value={multiDiagClinico} onChange={e => setMultiDiagClinico(e.target.value)} placeholder="Diagnóstico clínico..." />
                 <Textarea disabled={formReadOnly || awaitingSources} value={multiDiagFuncional} onChange={e => setMultiDiagFuncional(e.target.value)} placeholder="Diagnóstico funcional..." />
                 <details className="border rounded-lg p-3 space-y-3"><summary className="text-sm font-medium cursor-pointer">Contexto funcional e CIF</summary>
                 <div className="space-y-1"><Label className="text-xs font-semibold">Contexto biopsicossocial</Label><Textarea disabled={formReadOnly || awaitingSources} value={multiContextoBiopsicossocial} onChange={e=>setMultiContextoBiopsicossocial(e.target.value)} rows={2} /></div>
                 <div className="space-y-1"><Label className="text-xs font-semibold">CIF — funções do corpo</Label><Textarea disabled={formReadOnly || awaitingSources} value={cifFuncoes} onChange={e=>setCifFuncoes(e.target.value)} rows={2} /></div>
                 <div className="space-y-1"><Label className="text-xs font-semibold">CIF — atividades e participação</Label><Textarea disabled={formReadOnly || awaitingSources} value={cifAtividades} onChange={e=>setCifAtividades(e.target.value)} rows={2} /></div>
                 <div className="space-y-1"><Label className="text-xs font-semibold">CIF — fatores ambientais</Label><Textarea disabled={formReadOnly || awaitingSources} value={cifFatores} onChange={e=>setCifFatores(e.target.value)} rows={2} /></div>
                 <div className="space-y-1"><Label className="text-xs font-semibold">Barreiras</Label><Textarea disabled={formReadOnly || awaitingSources} value={multiBarreiras} onChange={e=>setMultiBarreiras(e.target.value)} rows={2} /></div>
                 <div className="space-y-1"><Label className="text-xs font-semibold">Potencialidades</Label><Textarea disabled={formReadOnly || awaitingSources} value={multiPotencialidades} onChange={e=>setMultiPotencialidades(e.target.value)} rows={2} /></div>
                 <div className="space-y-1"><Label className="text-xs font-semibold">Fatores contextuais</Label><Textarea disabled={formReadOnly || awaitingSources} value={multiFatoresContextuais} onChange={e=>setMultiFatoresContextuais(e.target.value)} rows={2} /></div>
                 </details>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="resumo" className="space-y-3 pt-1">
            <Card className="clinical-premium min-w-0">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ClipboardList className="w-4 h-4 text-primary"/>Percurso terapêutico</CardTitle><CardDescription>Objetivos e plano terapêutico executado.</CardDescription></CardHeader>
              <CardContent className="space-y-4 pt-2">
                 <Textarea disabled={formReadOnly || awaitingSources} value={multiObjetivosGerais} onChange={e => setMultiObjetivosGerais(e.target.value)} placeholder="Objetivos Terapêuticos Gerais..." rows={4} />
                 <Textarea disabled={formReadOnly || awaitingSources} value={multiPlanoExecutado} onChange={e => setMultiPlanoExecutado(e.target.value)} placeholder="Resumo do plano terapêutico executado..." rows={4} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="equipe" className="space-y-3 pt-1">
             <div className="clinical-premium p-3 space-y-2"><h2 className="font-semibold text-sm flex items-center gap-2"><Users className="w-4 h-4 text-primary"/>Equipe multiprofissional</h2><p className="text-xs text-muted-foreground">Abra cada contribuição para consultar ou preencher conforme suas permissões.</p><div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">{[{label:"Não iniciadas",status:"nao_iniciada"},{label:"Em preenchimento",status:"em_preenchimento"},{label:"Concluídas",status:"concluida"},{label:"Assinadas",status:"assinada"}].map(item=><div key={item.status} className="clinical-inset rounded-lg border p-2"><p className="text-muted-foreground">{item.label}</p><strong className="text-base tabular-nums">{!pacienteId||loading||loadFailed?"—":profSections.filter(s=>s.status_contribuicao===item.status).length}</strong></div>)}</div></div>
             {profSections.length===0&&<div className="clinical-premium p-5 text-sm text-center text-muted-foreground">{!pacienteId?"Selecione um paciente na identificação.":loading?"Carregando equipe…":loadFailed?"Não foi possível carregar a equipe.":"Nenhuma contribuição identificada para este relatório."}</div>}
             {profSections.map(s => (
               <Card key={s.profissional_id} className="clinical-premium min-w-0">
                 <details open={s.profissional_id === user?.id} className="group">
                 <summary className="list-none cursor-pointer rounded-lg p-3 flex flex-wrap items-center gap-2 [&::-webkit-details-marker]:hidden"><span className="clinical-dock-icon clinical-tone-teal"><User className="w-4 h-4"/></span><span className="flex-1 min-w-[8rem]"><span className="block font-semibold text-sm break-words">{s.profissional_nome}</span><span className="block text-xs text-muted-foreground break-words">{s.profissao || "Profissão não informada"}</span></span>
                   <Badge variant={s.status_contribuicao === "assinada" ? "default" : "secondary"}>
                     {s.status_contribuicao.replace("_", " ")}
                   </Badge><ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground group-open:rotate-90"/>
                 </summary>
                 <CardContent className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Objetivos Específicos</Label>
                        <Textarea value={s.objetivos_especificos || ""} onChange={e => updateProfSection(s.profissional_id, "objetivos_especificos", e.target.value)} rows={2} disabled={!canEditContribution(s)} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Evolução da Área</Label>
                        <Textarea value={s.evolucao || ""} onChange={e => updateProfSection(s.profissional_id, "evolucao", e.target.value)} rows={2} disabled={!canEditContribution(s)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1"><Label className="text-xs">Avaliação das metas *</Label><Select disabled={!canEditContribution(s)} value={s.metas_status || ""} onValueChange={v=>updateProfSection(s.profissional_id,"metas_status",v)}><SelectTrigger><SelectValue placeholder="Avalie as metas" /></SelectTrigger><SelectContent><SelectItem value="totalmente">Totalmente atingidas</SelectItem><SelectItem value="parcialmente">Parcialmente atingidas</SelectItem><SelectItem value="nao_atingidas">Não atingidas</SelectItem></SelectContent></Select></div>
                      {s.metas_status&&s.metas_status!=="totalmente"&&<div className="space-y-1"><Label className="text-xs">Justificativa das metas *</Label><Textarea disabled={!canEditContribution(s)} value={s.metas_justificativa} onChange={e=>updateProfSection(s.profissional_id,"metas_justificativa",e.target.value)} rows={2}/></div>}
                      <div className="space-y-1"><Label className="text-xs">Adesão</Label><Select disabled={!canEditContribution(s)} value={s.adesao || ""} onValueChange={v=>updateProfSection(s.profissional_id,"adesao",v)}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{ADESAO_TRATAMENTO.map(o=><SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
                      <div className="space-y-1"><Label className="text-xs">Intercorrências</Label><Textarea disabled={!canEditContribution(s)} value={s.intercorrencias || ""} onChange={e=>updateProfSection(s.profissional_id,"intercorrencias",e.target.value)} rows={2}/></div>
                      <div className="space-y-1"><Label className="text-xs">Intervenções realizadas</Label><Textarea disabled={!canEditContribution(s)} value={s.intervencoes || ""} onChange={e=>updateProfSection(s.profissional_id,"intervencoes",e.target.value)} rows={2}/></div>
                      <div className="space-y-1"><Label className="text-xs">Tecnologia assistiva</Label><Textarea disabled={!canEditContribution(s)} value={s.tecnologia_assistiva || ""} onChange={e=>updateProfSection(s.profissional_id,"tecnologia_assistiva",e.target.value)} rows={2}/></div>
                      <div className="space-y-1"><Label className="text-xs">Orientações da área</Label><Textarea disabled={!canEditContribution(s)} value={s.orientacoes_especificas || ""} onChange={e=>updateProfSection(s.profissional_id,"orientacoes_especificas",e.target.value)} rows={2}/></div>
                      <div className="space-y-1"><Label className="text-xs">Encaminhamentos da área</Label><Textarea disabled={!canEditContribution(s)} value={s.encaminhamentos_especificos || ""} onChange={e=>updateProfSection(s.profissional_id,"encaminhamentos_especificos",e.target.value)} rows={2}/></div>
                    </div>
                    <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
                      <div className="flex gap-4">
                        <Select value={s.status_contribuicao} onValueChange={(v: any) => { if(v==="concluida"){const errors=validateContribution(s);if(errors.length){toast.error(errors[0]);return;}} updateProfSection(s.profissional_id, "status_contribuicao", v); }} disabled={!canEditContribution(s)}>
                          <SelectTrigger className="w-full min-w-[150px] max-w-[230px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nao_iniciada">Não Iniciada</SelectItem>
                            <SelectItem value="em_preenchimento">Em preenchimento</SelectItem>
                            <SelectItem value="concluida">Concluída</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {s.profissional_id === user?.id && s.status_contribuicao !== "assinada" && !isReportLocked && (
                        <Button size="sm" onClick={() => handleSignContribution(s.profissional_id)} disabled={loading || conflict}>
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
                 </details>
               </Card>
             ))}
          </TabsContent>

          <TabsContent value="alta" className="space-y-3 pt-1">
                <Card className="clinical-premium min-w-0">
                  <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Conclusão Multiprofissional</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Tipo de Alta *</Label>
                        <Select disabled={formReadOnly || awaitingSources} value={multiTipoAlta} onValueChange={setMultiTipoAlta}>
                           <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                           <SelectContent>{TIPOS_ALTA.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Nível de Independência</Label>
                        <Select disabled={formReadOnly || awaitingSources} value={nivelIndep} onValueChange={setNivelIndep}>
                           <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                           <SelectContent>{NIVEIS_INDEPENDENCIA.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Motivo da Alta *</Label>
                      <Select disabled={formReadOnly || awaitingSources} value={motivoAlta} onValueChange={setMotivoAlta}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{MOTIVOS_ALTA.map(m=><SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select>
                      <Label className="text-xs">Detalhes do motivo</Label>
                      <Textarea disabled={formReadOnly || awaitingSources} value={motivoDetalhe} onChange={e=>setMultiMotivoDetalhe(e.target.value)} rows={2}/>
                    </div>
                    <details className="border rounded-lg p-3 space-y-3"><summary className="text-sm font-medium cursor-pointer">Condição funcional e plano pós-alta</summary>
                    <div className="space-y-1"><Label className="text-xs font-semibold">Condição funcional</Label><Textarea disabled={formReadOnly || awaitingSources} value={condicaoFuncional} onChange={e=>setCondicaoFuncional(e.target.value)} rows={2} /></div>
                    <div className="space-y-1"><Label className="text-xs font-semibold">Comparação admissão e alta</Label><Textarea disabled={formReadOnly || awaitingSources} value={multiComparacaoFuncional} onChange={e=>setMultiComparacaoFuncional(e.target.value)} rows={2} /></div>
                    <div className="space-y-1"><Label className="text-xs font-semibold">Ganhos clínicos</Label><Textarea disabled={formReadOnly || awaitingSources} value={multiGanhosPrincipais} onChange={e=>setMultiGanhosPrincipais(e.target.value)} rows={2} /></div>
                    <div className="space-y-1"><Label className="text-xs font-semibold">Limitações persistentes</Label><Textarea disabled={formReadOnly || awaitingSources} value={multiLimitacoesPersistentes} onChange={e=>setMultiLimitacoesPersistentes(e.target.value)} rows={2} /></div>
                    <div className="space-y-1"><Label className="text-xs font-semibold">Risco de regressão</Label><Select disabled={formReadOnly || awaitingSources} value={multiRiscoRegressao} onValueChange={setMultiRiscoRegressao}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{RISCO_POS_ALTA.map(o=><SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-1"><Label className="text-xs font-semibold">Fatores de alerta</Label><Textarea disabled={formReadOnly || awaitingSources} value={multiFatoresAlerta} onChange={e=>setMultiFatoresAlerta(e.target.value)} rows={2} /></div>
                    <div className="space-y-1"><Label className="text-xs font-semibold">Orientações ao paciente/família</Label><Textarea disabled={formReadOnly || awaitingSources} value={orientacoesUsuario} onChange={e=>setOrientacoesUsuario(e.target.value)} rows={2} /></div>
                    <div className="space-y-1"><Label className="text-xs font-semibold">Orientações UBS/ESF</Label><Textarea disabled={formReadOnly || awaitingSources} value={orientacoesUbs} onChange={e=>setOrientacoesUbs(e.target.value)} rows={2} /></div>
                    <div className="space-y-1"><Label className="text-xs font-semibold">Orientações à escola</Label><Textarea disabled={formReadOnly || awaitingSources} value={multiOrientacoesEscola} onChange={e=>setMultiOrientacoesEscola(e.target.value)} rows={2} /></div>
                    <div className="space-y-1"><Label className="text-xs font-semibold">Pontos de atenção</Label><Textarea disabled={formReadOnly || awaitingSources} value={multiPontosAtencao} onChange={e=>setMultiPontosAtencao(e.target.value)} rows={2} /></div>
                    <div className="space-y-2"><Label className="text-xs">Encaminhamentos</Label><div className="flex flex-wrap gap-3">{ENCAMINHAMENTOS.map(m=><label key={m} className="flex items-center gap-2 text-sm"><Checkbox checked={encaminhamentos.includes(m)} disabled={formReadOnly || awaitingSources} onCheckedChange={v=>setEncaminhamentos(prev=>v===true?Array.from(new Set([...prev,m])):prev.filter(x=>x!==m))}/>{m}</label>)}</div></div>
                    <div className="space-y-1"><Label className="text-xs font-semibold">Frequência APS</Label><Select disabled={formReadOnly || awaitingSources} value={freqAps} onValueChange={setFreqAps}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{FREQUENCIAS_APS.map(o=><SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-1"><Label className="text-xs">Continuidade do cuidado</Label><Select disabled={formReadOnly || awaitingSources} value={multiContinuarTerapia} onValueChange={setMultiContinuarTerapia}><SelectTrigger><SelectValue placeholder="Selecione..."/></SelectTrigger><SelectContent><SelectItem value="sim_mesma">Sim, na mesma área</SelectItem><SelectItem value="sim_outra">Sim, em outra área</SelectItem><SelectItem value="nao">Não indicada</SelectItem><SelectItem value="vigilancia">Vigilância em saúde</SelectItem></SelectContent></Select></div>
                    <div className="space-y-1"><Label className="text-xs font-semibold">Prazo de retorno</Label><Textarea disabled={formReadOnly || awaitingSources} value={multiPrazoRetorno} onChange={e=>setMultiPrazoRetorno(e.target.value)} rows={1} /></div>
                    <div className="space-y-1"><Label className="text-xs font-semibold">Responsável técnico</Label><Textarea disabled={formReadOnly || awaitingSources} value={multiResponsavelTecnico} onChange={e=>setMultiResponsavelTecnico(e.target.value)} rows={1} /></div>
                    </details>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Resumo Consolidado Final (Editável)</Label>
                        <Button variant="ghost" size="sm" disabled={formReadOnly || awaitingSources} className="h-7 text-[10px]" onClick={generateMultiSummary}>
                          <RefreshCw className="w-3 h-3 mr-1" /> Gerar Automático
                        </Button>
                      </div>
                      <Textarea disabled={formReadOnly || awaitingSources} value={multiResumoConsolidado} onChange={e => setMultiResumoConsolidado(e.target.value)} rows={6} className="text-sm font-serif" />
                    </div>
                  </CardContent>
                </Card>

          </TabsContent>
        </AltaWorkflow>
        </div>
        <aside className="min-w-0 lg:sticky lg:top-3 space-y-2">
              <div className="space-y-4">
                <Card className="clinical-premium min-w-0">
                  <CardHeader className="pb-3"><CardTitle className="text-xs font-semibold flex items-center gap-2"><ListTodo className="w-4 h-4" /> Resumo e Ações · Checklist de Alta</CardTitle></CardHeader>
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
                      {validateMulti().map((err,i)=><p key={i} className="mt-1">{err}</p>)}
                    </div>
        <div className="flex flex-col gap-2 pt-3 border-t">
          <Button className="w-full justify-start" variant="outline" onClick={() => handleSave("multi", true)} disabled={formReadOnly || conflict || awaitingSources}><Save className="w-4 h-4 mr-1"/>Salvar Rascunho</Button>
          <Button className="w-full justify-start clinical-record-action clinical-action-main" onClick={() => handleSave("multi", false)} disabled={formReadOnly || conflict || awaitingSources}>Finalizar Consolidação</Button>
          <Button className="w-full justify-start" variant="outline" onClick={() => handlePrint("multi")} disabled={!pacienteId || !reportId || !isReportLocked || loading || loadFailed || conflict}><Printer className="w-4 h-4 mr-1"/>Imprimir / Salvar PDF</Button>
        </div>
                  </CardContent>
                </Card>
              </div>
        </aside>
        </div>
      </div>
    );
  }

  /* ═══ INDIVIDUAL ═══ */
  return (
    <div className="space-y-3 min-w-0">
      <header className="clinical-hub-hero flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button variant="outline" size="icon" className="clinical-hub-new shrink-0" aria-label="Voltar à seleção de relatórios" onClick={returnToSelector} disabled={loading}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <p className="clinical-hub-eyebrow">Continuidade assistencial · CER II</p>
            <h1 className="text-xl font-bold clinical-hub-name flex items-center gap-2">
              <User className="w-5 h-5 shrink-0" aria-hidden="true" />
              Relatório de Alta — Individual
            </h1>
            <p className="clinical-patient-sub text-xs mt-1">Relatório clínico completo e automatizado</p>
          </div>
        </div>

        {pacienteId && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status === "rascunho" ? "secondary" : "default"} className="px-3 py-1">
              {status === "rascunho" ? "Rascunho" : "Finalizado"}
            </Badge>
            {status === "rascunho" ? (
              <span className="clinical-patient-sub text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" /> Editando...
              </span>
            ) : canReopenReport ? (
              <Button variant="outline" size="sm" className="clinical-hub-new" onClick={() => setIsReopening(true)} disabled={loading}>
                <Unlock className="w-4 h-4 mr-1" /> Reabrir relatório
              </Button>
            ) : null}
          </div>
        )}
      </header>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        <AltaMetric icon={User} label="Paciente" value={!pacienteId?"Selecionar paciente":loading?"Carregando…":loadFailed?"Não carregado":paciente?.id===pacienteId?paciente.nome:"Selecionado"} />
        <AltaMetric icon={Activity} label="Sessões registradas" tone="teal" value={!pacienteId||loading||loadFailed||(!reportId&&!sourceMeta)?"—":indSessoes} />
        <AltaMetric icon={Clock} label="Faltas registradas" tone="violet" value={!pacienteId||loading||loadFailed||(!reportId&&!sourceMeta)?"—":indFaltas} />
        <AltaMetric icon={ListTodo} label="Validação" tone="slate" value={!pacienteId||loading||loadFailed?"Aguardando":isReportLocked?"Finalizado":validateInd().length===0?"Pronto para finalizar":`${validateInd().length} pendência(s)`} />
      </div>
      

      {sourcePanel}
        {evolutionPreview}
        {hasUnsavedChanges && <Alert><Clock className="h-4 w-4"/><AlertTitle>Alterações ainda não salvas</AlertTitle><AlertDescription>Salve o rascunho antes de sair. Somente dados confirmados pelo banco são recuperados.</AlertDescription></Alert>}
        {conflict && <Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertTitle>Conflito de gravação</AlertTitle><AlertDescription>O relatório foi alterado por outra operação ou seu acesso mudou. As alterações não salvas continuam nesta tela. Revise-as antes de recarregar; nenhuma sobrescrita foi efetuada. <Button type="button" variant="outline" size="sm" className="mt-2" disabled={loading} onClick={()=>{if(!window.confirm("Recarregar o registro do banco e descartar as alterações ainda não salvas?"))return;resetReportTracking();if(modo==="multiprofissional"){resetMultiForm();void loadMultiData(pacienteId,++reportLoadTokenRef.current);}else{resetIndividualForm();void loadIndividualData(pacienteId,++reportLoadTokenRef.current);}}}>Recarregar relatório</Button></AlertDescription></Alert>}
        {loadFailed && <Alert variant="destructive"><AlertCircle className="h-4 w-4"/><AlertTitle>Não foi possível carregar o relatório</AlertTitle><AlertDescription>Para evitar perda de dados, a edição e a impressão estão bloqueadas. Limpe a seleção e selecione o paciente novamente.</AlertDescription></Alert>}
            {isReportLocked && (
        <Alert className="border-amber-300 bg-amber-50">
          <Lock className="h-4 w-4 text-amber-700" />
          <AlertTitle className="text-amber-800">Relatório finalizado — alterações bloqueadas</AlertTitle>
          <AlertDescription className="text-amber-700">
            Reabra o relatório para editar. O sistema criará uma nova versão e registrará o motivo na auditoria.
          </AlertDescription>
        </Alert>
      )}

      <Dialog open={isReopening} onOpenChange={setIsReopening}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabertura de Relatório</DialogTitle>
            <DialogDescription>
              O documento finalizado será reaberto como nova versão. Os dados persistidos serão preservados e o motivo ficará registrado na auditoria.
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
            <Button onClick={handleReopen} disabled={loading}>Confirmar Reabertura</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,25%)] gap-3 items-start">
        {/* Main Form Content */}
        <div className="min-w-0 space-y-3">
          <AltaWorkflow key="individual" steps={INDIVIDUAL_STEPS}>

            <TabsContent value="identificacao" className="space-y-3 pt-1">
              <Card className="clinical-premium min-w-0">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-primary" />
                    1. Identificação do Paciente e Profissional
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <BuscaPaciente pacientes={pacientes} value={pacienteId} onChange={handlePacienteChange} />
                  
                  {paciente && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 p-3 clinical-inset rounded-xl border border border-border/50 text-sm">
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
                        <Badge variant="outline" className="text-xs font-mono">{!reportId&&!sourceMeta?"Aguardando seleção de fontes":`${indSessoes} realizada(s) / ${indFaltas} falta(s)`}</Badge>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Período de Acompanhamento</Label>
                      <div className="flex items-center gap-2">
                        <Input disabled={formReadOnly || awaitingSources} type="date" value={indPeriodoInicio} onChange={e => setIndPeriodoInicio(e.target.value)} className="h-9 text-sm" />
                        <span className="text-muted-foreground">até</span>
                        <Input disabled={formReadOnly || awaitingSources} type="date" value={indPeriodoFim} onChange={e => setIndPeriodoFim(e.target.value)} className="h-9 text-sm" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Data de Alta</Label>
                      <Input disabled={formReadOnly || awaitingSources} type="date" value={indDataAlta} onChange={e => setIndDataAlta(e.target.value)} className="h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Modalidade</Label>
                      <Select disabled={formReadOnly || awaitingSources} value={indModalidade} onValueChange={setIndModalidade}>
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

            <TabsContent value="contexto" className="space-y-3 pt-1">
              <Card className="clinical-premium min-w-0">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Info className="w-4 h-4 text-primary" />
                    2. Contexto Clínico Inicial
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Queixa Principal</Label>
                    <Textarea disabled={formReadOnly || awaitingSources} value={indQueixaPrincipal} onChange={e => setIndQueixaPrincipal(e.target.value)} rows={3} className="text-sm" placeholder="Resumo da queixa inicial..." />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Motivo do Encaminhamento</Label>
                    <Textarea disabled={formReadOnly || awaitingSources} value={indMotivoEncaminhamento} onChange={e => setIndMotivoEncaminhamento(e.target.value)} rows={3} className="text-sm" placeholder="Por que o paciente foi encaminhado?" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Contexto Familiar / Social</Label>
                    <Textarea disabled={formReadOnly || awaitingSources} value={indContextoFamiliar} onChange={e => setIndContextoFamiliar(e.target.value)} rows={3} className="text-sm" placeholder="Rede de apoio, barreiras sociais..." />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Comorbidades / Medicamentos</Label>
                    <div className="space-y-2">
                      <Input disabled={formReadOnly || awaitingSources} value={indComorbidades} onChange={e => setIndComorbidades(e.target.value)} placeholder="Outras doenças conhecidas" className="h-9 text-sm" />
                      <Input disabled={formReadOnly || awaitingSources} value={indMedicacao} onChange={e => setIndMedicacao(e.target.value)} placeholder="Medicamentos em uso" className="h-9 text-sm" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="diagnostico" className="space-y-3 pt-1">
              <Card className="clinical-premium min-w-0">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Stethoscope className="w-4 h-4 text-primary" />
                    3. Base Diagnóstica
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">CID-10 Principal</Label>
                      <Input disabled={formReadOnly || awaitingSources} value={indDiagCid} onChange={e => setIndDiagCid(e.target.value)} placeholder="Código ou descrição" className="h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Nível de Comprometimento</Label>
                      <Select disabled={formReadOnly || awaitingSources} value={indNivelComprometimento} onValueChange={setIndNivelComprometimento}>
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
                      <Textarea disabled={formReadOnly || awaitingSources} value={indDiagClinico} onChange={e => setIndDiagClinico(e.target.value)} placeholder="Hipótese diagnóstica clínica..." rows={3} className="text-sm" />
                      <Textarea disabled={formReadOnly || awaitingSources} value={indDiagFuncional} onChange={e => setIndDiagFuncional(e.target.value)} placeholder="Descrição da funcionalidade (CIF base)..." rows={3} className="text-sm" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="space-y-1"><Label className="text-xs font-semibold">CIF</Label><Textarea disabled={formReadOnly || awaitingSources} value={indCif} onChange={e=>setIndCif(e.target.value)} rows={2} /></div>
                    <Label className="text-xs font-semibold">Observações Diagnósticas Adicionais</Label>
                    <Textarea disabled={formReadOnly || awaitingSources} value={indObsDiagnosticas} onChange={e => setIndObsDiagnosticas(e.target.value)} rows={2} className="text-sm" />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="evolucao" className="space-y-3 pt-1">
              <Card className="clinical-premium min-w-0">
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
                      <Select disabled={formReadOnly || awaitingSources} value={indAdesaoTratamento} onValueChange={setIndAdesaoTratamento}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {ADESAO_TRATAMENTO.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Evolução Global</Label>
                      <Select disabled={formReadOnly || awaitingSources} value={indEvolucaoGlobal} onValueChange={setIndEvolucaoGlobal}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {EVOLUCAO_GLOBAL.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Frequência de Atendimento</Label>
                      <Select disabled={formReadOnly || awaitingSources} value={indFrequenciaAtendimento} onValueChange={setIndFrequenciaAtendimento}>
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
                      <Textarea disabled={formReadOnly || awaitingSources} value={indObjetivos} onChange={e => setIndObjetivos(e.target.value)} rows={4} className="text-sm" placeholder="Liste os objetivos trabalhados..." />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Resumo das Intervenções Realizadas</Label>
                      <Textarea disabled={formReadOnly || awaitingSources} value={indIntervencoes} onChange={e => setIndIntervencoes(e.target.value)} rows={4} className="text-sm" placeholder="Quais procedimentos foram mais frequentes?" />
                    </div>
                  </div>

                  <div className="space-y-1"><Label className="text-xs font-semibold">Tecnologia assistiva</Label><Textarea disabled={formReadOnly || awaitingSources} value={indTA} onChange={e=>setIndTA(e.target.value)} rows={2} /></div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Evolução Clínica e Funcional (Texto Livre)</Label>
                    <Textarea disabled={formReadOnly || awaitingSources} value={indEvolucao} onChange={e => setIndEvolucao(e.target.value)} rows={5} className="text-sm" placeholder="Descreva detalhadamente a evolução do paciente no período..." />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-primary/5 rounded-xl border border-primary/10">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-primary">Status das Metas (PTS)</Label>
                      <Select disabled={formReadOnly || awaitingSources} value={indMetas} onValueChange={v => setIndMetas(v as "totalmente" | "parcialmente" | "nao_atingidas")}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Avalie as metas" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="totalmente">Totalmente atingidas</SelectItem>
                          <SelectItem value="parcialmente">Parcialmente atingidas</SelectItem>
                          <SelectItem value="nao_atingidas">Não atingidas</SelectItem>
                        </SelectContent>
                      </Select>
                      {!!indMetas && indMetas !== "totalmente" && (
                        <Textarea disabled={formReadOnly || awaitingSources} value={indMetasJust} onChange={e => setIndMetasJust(e.target.value)} placeholder="Justificativa clínica para metas não atingidas..." rows={2} className="text-sm mt-2" />
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-primary">Intercorrências no Período</Label>
                      <Select disabled={formReadOnly || awaitingSources} value={indIntercorrencias} onValueChange={setIndIntercorrencias}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {INTERCORRENCIAS_OPCOES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {indIntercorrencias !== "Nenhuma" && (
                        <Input disabled={formReadOnly || awaitingSources} value={indIntercorrenciasObs} onChange={e => setIndIntercorrenciasObs(e.target.value)} placeholder="Detalhes da intercorrência..." className="h-9 text-sm mt-2" />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Resposta Terapêutica</Label>
                      <Textarea disabled={formReadOnly || awaitingSources} value={indRespostaTerapeutica} onChange={e => setIndRespostaTerapeutica(e.target.value)} rows={3} className="text-sm" placeholder="Como o paciente respondeu às estratégias?" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Comparação Início vs Alta</Label>
                      <Textarea disabled={formReadOnly || awaitingSources} value={indComparacaoInicioAlta} onChange={e => setIndComparacaoInicioAlta(e.target.value)} rows={3} className="text-sm" placeholder="Diferença clínica observada entre a admissão e agora..." />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="alta" className="space-y-3 pt-1">
              <Card className="clinical-premium min-w-0">
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
                      <Select disabled={formReadOnly || awaitingSources} value={indTipoAlta} onValueChange={setIndTipoAlta}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {TIPOS_ALTA.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Motivo da Alta *</Label>
                      <Select disabled={formReadOnly || awaitingSources} value={indMotivo} onValueChange={setIndMotivo}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {MOTIVOS_ALTA.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Necessidade de Continuidade</Label>
                      <Select disabled={formReadOnly || awaitingSources} value={indContinuarTerapia} onValueChange={setIndContinuarTerapia}>
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
                      <Select disabled={formReadOnly || awaitingSources} value={indRiscoRegressao} onValueChange={setIndRiscoRegressao}>
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
                      <Input disabled={formReadOnly || awaitingSources} value={indPrazoReavaliacao} onChange={e => setIndPrazoReavaliacao(e.target.value)} placeholder="Ex: 6 meses, 1 ano..." className="h-9 text-sm" />
                    </div>
                  </div>

                  <div className="space-y-1"><Label className="text-xs font-semibold">Detalhes do motivo da alta</Label><Textarea disabled={formReadOnly || awaitingSources} value={indMotivoDet} onChange={e=>setIndMotivoDet(e.target.value)} rows={2} /></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div className="space-y-1"><Label className="text-xs font-semibold">Risco pós-alta</Label><Select disabled={formReadOnly || awaitingSources} value={indRiscoPosAlta} onValueChange={setIndRiscoPosAlta}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{RISCO_POS_ALTA.map(o=><SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label className="text-xs font-semibold">Complexidade do caso</Label><Select disabled={formReadOnly || awaitingSources} value={indComplexidade} onValueChange={setIndComplexidade}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{COMPLEXIDADE_CASO.map(o=><SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div></div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Orientações Específicas para Paciente / Cuidador</Label>
                    <Textarea disabled={formReadOnly || awaitingSources} value={indOrientacoes} onChange={e => setIndOrientacoes(e.target.value)} rows={4} className="text-sm" placeholder="Exercícios domiciliares, sinais de alerta..." />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Encaminhamentos (Internos e Externos)</Label>
                    <Textarea disabled={formReadOnly || awaitingSources} value={indEncaminhamento} onChange={e => setIndEncaminhamento(e.target.value)} rows={3} className="text-sm" placeholder="Liste para onde o paciente está sendo encaminhado..." />
                  </div>

                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">Resumo Final Consolidado *</Label>
                      <Button variant="ghost" size="sm" disabled={formReadOnly || awaitingSources} className="h-7 text-[10px]" onClick={generateIndSummary}>
                        Gerar automaticamente
                      </Button>
                    </div>
                    <Textarea disabled={formReadOnly || awaitingSources}
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
          </AltaWorkflow>
        </div>

        {/* Sidebar Actions & Info */}
        <aside className="min-w-0 space-y-3 lg:sticky lg:top-3">
          <Card className="clinical-premium min-w-0">
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
                  disabled={formReadOnly || conflict || awaitingSources}
                >
                  <Clock className="w-4 h-4 mr-2 text-muted-foreground" />
                  Salvar Rascunho
                </Button>
                
                <Button 
                  className="w-full justify-start h-10 clinical-record-action clinical-action-main" 
                  onClick={() => handleSave("individual", false)}
                  disabled={formReadOnly || conflict || awaitingSources}
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
                  disabled={!pacienteId || status === "rascunho" || loading || loadFailed || conflict}
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Imprimir Documento
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full justify-start h-9 text-xs" 
                  onClick={() => handlePrint("individual")}
                  disabled={!pacienteId || status === "rascunho" || loading || loadFailed || conflict}
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
            <Card className="clinical-premium min-w-0">
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
                      <span className="min-w-0 break-words pr-2">{meta.titulo}</span>
                      <Badge variant="outline" className="text-[9px] h-3 px-1">
                        {meta.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
};

export default RelatorioAlta;
