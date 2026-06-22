import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BuscaPaciente } from "@/components/BuscaPaciente";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ArrowLeft, Save, CheckCircle, Printer, AlertCircle, ChevronLeft, ChevronRight, Stethoscope, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { auditService } from "@/services/auditService";
import { openPrintDocument } from "@/lib/printLayout";
import { exportFonoAvaliativoDocx, type ReportSection, type ReportField } from "@/lib/fonoAvaliativoDocx";
import {
  FONO_STEPS, FONO_AVALIATIVO_VERSION, FONO_AVALIATIVO_TIPO_REGISTRO,
  type FieldDef, type StepDef,
} from "@/lib/fonoAvaliativoTemplate";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props { onBack: () => void; }

type Answers = Record<string, any>;

const onlyDigits = (v: any) => String(v ?? "").replace(/\D/g, "");

const calcIdadeStr = (dn?: string, ref?: string) => {
  if (!dn) return "";
  try {
    const b = new Date(dn);
    const r = ref ? new Date(ref) : new Date();
    let years = r.getFullYear() - b.getFullYear();
    let months = r.getMonth() - b.getMonth();
    if (r.getDate() < b.getDate()) months--;
    if (months < 0) { years--; months += 12; }
    return `${years} anos${months ? ` e ${months} meses` : ""}`;
  } catch { return ""; }
};

const fmtBr = (d: string) => { try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return d; } };

const STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  concluído: "Concluído",
  cancelado: "Cancelado",
  pausado: "Pausado",
  rascunho: "Rascunho",
  inativo: "Inativo",
};
const statusLabel = (s?: string) => {
  if (!s) return "—";
  const k = String(s).trim().toLowerCase();
  return STATUS_LABELS[k] || s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
};

const pickPlanoConduta = (p: any): string => {
  if (!p) return "";
  const keys = ["plano_conduta", "plano_de_conduta", "conduta", "condutas", "plano_terapeutico", "planejamento", "metas", "objetivos"];
  for (const k of keys) {
    const v = p?.[k] ?? p?.custom_data?.[k];
    if (v && String(v).trim()) return String(v);
  }
  return "";
};

const pickQueixa = (sources: any[]): string => {
  const keys = ["queixa_principal", "queixa", "queixaPrincipal", "motivo", "objetivo_geral", "objetivos_terapeuticos", "queixa_atual"];
  for (const src of sources) {
    if (!src) continue;
    for (const k of keys) {
      const v = src?.[k] ?? src?.custom_data?.[k];
      if (v && String(v).trim()) return String(v).trim();
    }
  }
  return "";
};

// Renumbered nav (Identificação, PTS, Gestão, then evaluation steps)
const renumberTitle = (title: string, n: number) =>
  `${n}. ${title.replace(/^\s*\d+\.\s*/, "")}`;

const RelatorioFonoAvaliativo: React.FC<Props> = ({ onBack }) => {
  const { user } = useAuth();
  const { pacientes, funcionarios, unidades } = useData();

  const [pacienteId, setPacienteId] = useState("");
  const paciente = useMemo(() => pacientes.find(p => p.id === pacienteId), [pacientes, pacienteId]);
  const funcionario = useMemo(() => funcionarios.find(f => f.id === user?.id), [funcionarios, user?.id]);

  const unidade = useMemo(
    () => unidades.find(u => u.id === (user?.unidadeId || funcionario?.unidadeId)),
    [unidades, user?.unidadeId, funcionario?.unidadeId]
  );
  const unidadeNome =
    unidade?.nomeExibicao || unidade?.nome || (user?.unidadeId ? "Unidade não identificada" : "—");

  const cboNorm = onlyDigits(user?.customData?.cbo_codigo);
  const allowed = cboNorm === "223810";

  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [obs, setObs] = useState<Record<string, string>>({});
  const [others, setOthers] = useState<Record<string, string>>({});
  const [justifs, setJustifs] = useState<Record<string, string>>({});
  const [reportId, setReportId] = useState<string | null>(null);
  const [status, setStatus] = useState<"rascunho" | "concluido">("rascunho");
  const [loading, setLoading] = useState(false);
  const [dataRelatorio, setDataRelatorio] = useState(new Date().toISOString().split("T")[0]);

  // PTS & Ciclo de tratamento
  const [ptsList, setPtsList] = useState<any[]>([]);
  const [selectedPtsId, setSelectedPtsId] = useState<string>("");
  const [cycleList, setCycleList] = useState<any[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string>("");
  const selectedPts = useMemo(() => ptsList.find(p => p.id === selectedPtsId), [ptsList, selectedPtsId]);
  const selectedCycle = useMemo(() => cycleList.find(c => c.id === selectedCycleId), [cycleList, selectedCycleId]);

  // PROC totals
  const procTotal = useMemo(() => {
    const a = Number(answers.proc_habilidades || 0);
    const b = Number(answers.proc_compreensao || 0);
    const c = Number(answers.proc_cognitivo || 0);
    return Math.min(200, Math.max(0, a + b + c));
  }, [answers.proc_habilidades, answers.proc_compreensao, answers.proc_cognitivo]);

  // Load draft when patient selected
  useEffect(() => {
    if (!pacienteId || !user?.id) return;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("prontuarios")
          .select("*")
          .eq("paciente_id", pacienteId)
          .eq("profissional_id", user.id)
          .eq("tipo_registro", FONO_AVALIATIVO_TIPO_REGISTRO)
          .eq("status", "rascunho")
          .maybeSingle();
        if (data) {
          setReportId(data.id);
          setStatus(data.status as any);
          const payload = JSON.parse(data.observacoes || "{}");
          setAnswers(payload.answers || {});
          setObs(payload.obs || {});
          setOthers(payload.others || {});
          setJustifs(payload.justifs || {});
          setSelectedPtsId(payload.pts_id || "");
          setSelectedCycleId(payload.treatment_cycle_id || "");
          setDataRelatorio(data.data_atendimento || new Date().toISOString().split("T")[0]);
          toast.info("Rascunho carregado.");
        } else {
          setReportId(null);
          setStatus("rascunho");
          setAnswers({});
          setObs({});
          setOthers({});
          setJustifs({});
          setSelectedPtsId("");
          setSelectedCycleId("");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [pacienteId, user?.id]);

  // Load PTS list for this patient (prioriza profissional logado)
  useEffect(() => {
    if (!pacienteId) { setPtsList([]); return; }
    (async () => {
      const { data } = await supabase
        .from("pts")
        .select("id,patient_id,professional_id,unit_id,status,created_at,updated_at,objetivo_geral,objetivos_terapeuticos,metas_curto_prazo,metas_medio_prazo,metas_longo_prazo,plano_conduta,especialidades_envolvidas,frequencia_planejada,custom_data")
        .eq("patient_id", pacienteId)
        .order("updated_at", { ascending: false });
      const list = (data as any[]) || [];
      setPtsList(list);
      if (list.length && !selectedPtsId) {
        const own = list.find(p => p.professional_id === user?.id);
        setSelectedPtsId((own || list[0]).id);
      }
    })();
  }, [pacienteId, user?.id]);

  // Load Treatment Cycles for this patient
  useEffect(() => {
    if (!pacienteId) { setCycleList([]); return; }
    (async () => {
      const { data } = await supabase
        .from("treatment_cycles")
        .select("id,patient_id,professional_id,unit_id,specialty,treatment_type,start_date,end_date_predicted,total_sessions,sessions_done,frequency,status,clinical_notes,pts_id,created_at")
        .eq("patient_id", pacienteId)
        .order("created_at", { ascending: false });
      const list = (data as any[]) || [];
      setCycleList(list);
      if (list.length && !selectedCycleId) {
        const own = list.find(c => c.professional_id === user?.id)
          || list.find(c => (c.specialty || "").toLowerCase().includes("fono"));
        setSelectedCycleId((own || list[0]).id);
      }
    })();
  }, [pacienteId, user?.id]);

  if (!allowed) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="w-5 h-5" /></Button>
          <h1 className="text-xl font-bold">Acesso restrito</h1>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Permissão negada</AlertTitle>
          <AlertDescription>
            Este relatório é exclusivo para profissionais com CBO 223810 (Fonoaudiólogo).
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const setA = (id: string, v: any) => setAnswers(prev => ({ ...prev, [id]: v }));

  const renderField = (f: FieldDef) => {
    const v = answers[f.id];
    switch (f.kind) {
      case "radio":
        return (
          <div key={f.id} className="space-y-2 p-3 rounded-lg bg-muted/30 border">
            <Label className="text-sm font-semibold">{f.label}</Label>
            <RadioGroup value={v || ""} onValueChange={val => setA(f.id, val)} className="space-y-1">
              {f.options!.map(opt => (
                <label key={opt} className="flex items-start gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value={opt} id={`${f.id}-${opt}`} className="mt-0.5" />
                  <span>{opt}</span>
                </label>
              ))}
              {f.requireJustification && (
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="Não foi possível avaliar" id={`${f.id}-npa`} className="mt-0.5" />
                  <span>Não foi possível avaliar</span>
                </label>
              )}
            </RadioGroup>
            {f.requireJustification && v === "Não foi possível avaliar" && (
              <Textarea
                placeholder="Justificativa obrigatória..."
                value={justifs[f.id] || ""}
                onChange={e => setJustifs(prev => ({ ...prev, [f.id]: e.target.value }))}
                rows={2}
                className="text-sm"
              />
            )}
            {f.observation && (
              <Textarea
                placeholder="Observação (opcional)"
                value={obs[f.id] || ""}
                onChange={e => setObs(prev => ({ ...prev, [f.id]: e.target.value }))}
                rows={2}
                className="text-sm"
              />
            )}
          </div>
        );
      case "checkbox": {
        const arr: string[] = Array.isArray(v) ? v : [];
        const toggle = (opt: string) => {
          const next = arr.includes(opt) ? arr.filter(x => x !== opt) : [...arr, opt];
          setA(f.id, next);
        };
        return (
          <div key={f.id} className="space-y-2 p-3 rounded-lg bg-muted/30 border">
            <Label className="text-sm font-semibold">{f.label}</Label>
            <div className="space-y-1">
              {f.options!.map(opt => (
                <label key={opt} className="flex items-start gap-2 text-sm cursor-pointer">
                  <Checkbox checked={arr.includes(opt)} onCheckedChange={() => toggle(opt)} className="mt-0.5" />
                  <span>{opt}</span>
                </label>
              ))}
              {f.allowOther && (
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    checked={arr.includes("__other__")}
                    onCheckedChange={() => toggle("__other__")}
                  />
                  <span className="text-sm">Outros:</span>
                  <Input
                    value={others[f.id] || ""}
                    onChange={e => setOthers(prev => ({ ...prev, [f.id]: e.target.value }))}
                    disabled={!arr.includes("__other__")}
                    className="h-8 text-sm flex-1"
                    placeholder="Descreva..."
                  />
                </div>
              )}
            </div>
          </div>
        );
      }
      case "yesno":
        return (
          <div key={f.id} className="space-y-2 p-3 rounded-lg bg-muted/30 border">
            <Label className="text-sm font-semibold">{f.label}</Label>
            <RadioGroup value={v || ""} onValueChange={val => setA(f.id, val)} className="flex gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="Sim" id={`${f.id}-sim`} /> Sim
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="Não" id={`${f.id}-nao`} /> Não
              </label>
            </RadioGroup>
          </div>
        );
      case "number":
        return (
          <div key={f.id} className="space-y-2 p-3 rounded-lg bg-muted/30 border">
            <Label className="text-sm font-semibold">{f.label} <span className="text-muted-foreground text-xs">(0 a {f.max})</span></Label>
            <Input
              type="number"
              min={0}
              max={f.max}
              value={v ?? ""}
              onChange={e => {
                const n = Math.min(f.max!, Math.max(0, Number(e.target.value || 0)));
                setA(f.id, isNaN(n) ? 0 : n);
              }}
              className="h-9 text-sm w-40"
            />
          </div>
        );
      case "textarea":
        return (
          <div key={f.id} className="space-y-2 p-3 rounded-lg bg-muted/30 border">
            <Label className="text-sm font-semibold">{f.label}</Label>
            <Textarea value={v || ""} onChange={e => setA(f.id, e.target.value)} rows={4} className="text-sm" />
          </div>
        );
      case "text":
        return (
          <div key={f.id} className="space-y-2 p-3 rounded-lg bg-muted/30 border">
            <Label className="text-sm font-semibold">{f.label}</Label>
            <Input value={v || ""} onChange={e => setA(f.id, e.target.value)} className="h-9 text-sm" />
          </div>
        );
      default:
        return null;
    }
  };

  const validate = (): string[] => {
    const errs: string[] = [];
    if (!pacienteId) errs.push("Selecione um paciente");
    if (!answers.parecer || String(answers.parecer).trim().length < 10) errs.push("Parecer Fonoaudiológico é obrigatório");
    if (!dataRelatorio) errs.push("Data do relatório é obrigatória");
    FONO_STEPS.forEach(step => step.sections.forEach(sec => sec.fields.forEach(f => {
      if (f.requireJustification && answers[f.id] === "Não foi possível avaliar" && !justifs[f.id]?.trim()) {
        errs.push(`Justificativa obrigatória em: ${f.label}`);
      }
    })));
    return errs;
  };

  const ptsResumo = (p: any) => p ? {
    pts_id: p.id,
    status: p.status,
    created_at: p.created_at,
    professional_id: p.professional_id,
    unit_id: p.unit_id,
    objetivo_geral: p.objetivo_geral || "",
    objetivos_terapeuticos: p.objetivos_terapeuticos || "",
    metas_curto_prazo: p.metas_curto_prazo || "",
    metas_medio_prazo: p.metas_medio_prazo || "",
    metas_longo_prazo: p.metas_longo_prazo || "",
    plano_conduta: p.plano_conduta || "",
    frequencia_planejada: p.frequencia_planejada || "",
    especialidades_envolvidas: p.especialidades_envolvidas || [],
  } : null;

  const cycleResumo = (c: any) => c ? {
    cycle_id: c.id,
    treatment_type: c.treatment_type,
    specialty: c.specialty,
    status: c.status,
    start_date: c.start_date,
    end_date_predicted: c.end_date_predicted,
    total_sessions: c.total_sessions,
    sessions_done: c.sessions_done,
    frequency: c.frequency,
    clinical_notes: c.clinical_notes || "",
    pts_id: c.pts_id || null,
  } : null;

  const buildPayload = () => ({
    template: FONO_AVALIATIVO_TIPO_REGISTRO,
    templateVersion: FONO_AVALIATIVO_VERSION,
    answers, obs, others, justifs,
    procTotal,
    dataRelatorio,
    unidade_id: user?.unidadeId || "",
    unidade_nome: unidadeNome,
    pts_id: selectedPtsId || null,
    pts_resumo: ptsResumo(selectedPts),
    treatment_cycle_id: selectedCycleId || null,
    treatment_cycle_resumo: cycleResumo(selectedCycle),
  });

  const handleSave = async (finalize: boolean) => {
    if (!pacienteId || !user?.id) { toast.error("Selecione um paciente"); return; }
    if (finalize) {
      const errs = validate();
      if (errs.length) { toast.error(errs[0]); return; }
    }
    setLoading(true);
    try {
      const record: any = {
        paciente_id: pacienteId,
        paciente_nome: paciente?.nome || "",
        profissional_id: user.id,
        profissional_nome: user.nome || "",
        unidade_id: user.unidadeId || "",
        data_atendimento: dataRelatorio,
        tipo_registro: FONO_AVALIATIVO_TIPO_REGISTRO,
        observacoes: JSON.stringify(buildPayload()),
        status: finalize ? "concluido" : "rascunho",
        evolucao: `Relatório Fonoaudiológico Avaliativo — Versão ${FONO_AVALIATIVO_VERSION} — Unidade: ${unidadeNome}${selectedPtsId ? ` — PTS vinculado` : ""}${selectedCycleId ? ` — Ciclo vinculado` : ""}`,
      };
      let result;
      if (reportId) {
        result = await supabase.from("prontuarios").update(record).eq("id", reportId);
      } else {
        result = await supabase.from("prontuarios").insert(record).select().single();
        if (!result.error && result.data) setReportId((result.data as any).id);
      }
      if (result.error) {
        toast.error("Erro ao salvar: " + result.error.message);
      } else {
        setStatus(finalize ? "concluido" : "rascunho");
        toast.success(finalize ? "Relatório concluído" : "Rascunho salvo");
        await auditService.log({
          acao: finalize ? "finalizar_relatorio_fono_avaliativo" : "salvar_rascunho_fono_avaliativo",
          modulo: "prontuario",
          entidade: "prontuario",
          entidadeId: reportId || (result.data as any)?.id,
          pacienteId, pacienteNome: paciente?.nome,
          profissionalId: user.id, profissionalNome: user.nome,
          detalhes: { template: FONO_AVALIATIVO_TIPO_REGISTRO, version: FONO_AVALIATIVO_VERSION, finalize },
        });
      }
    } finally { setLoading(false); }
  };

  const buildPrintBody = (): string => {
    const p = paciente!;
    const profNome = user?.nome || "";
    const conselho = funcionario
      ? `${funcionario.tipoConselho || "CRFa"} ${funcionario.numeroConselho || ""}${funcionario.ufConselho ? "/" + funcionario.ufConselho : ""}`
      : "CRFa —";

    const renderAnswer = (f: FieldDef): string => {
      const v = answers[f.id];
      if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) return "";
      let txt = "";
      if (Array.isArray(v)) {
        const items = v.filter(x => x !== "__other__");
        if (v.includes("__other__") && others[f.id]) items.push(`Outros: ${others[f.id]}`);
        txt = items.join("; ");
      } else txt = String(v);
      let extra = "";
      if (justifs[f.id]) extra += ` — Justificativa: ${justifs[f.id]}`;
      if (obs[f.id]) extra += ` — Obs.: ${obs[f.id]}`;
      return `<div class="field"><span class="field-label">${f.label}</span><div class="field-value">${txt}${extra}</div></div>`;
    };

    let body = `
      <div class="info-grid">
        <div class="info-item"><span class="info-label">Paciente</span><br/><span class="info-value">${p.nome}</span></div>
        <div class="info-item"><span class="info-label">Nascimento / Idade</span><br/><span class="info-value">${fmtBr(p.dataNascimento)} (${calcIdadeStr(p.dataNascimento, dataRelatorio)})</span></div>
        <div class="info-item"><span class="info-label">Queixa principal</span><br/><span class="info-value">${answers.queixa_principal || "—"}</span></div>
        <div class="info-item"><span class="info-label">Data do Relatório</span><br/><span class="info-value">${fmtBr(dataRelatorio)}</span></div>
        <div class="info-item"><span class="info-label">Profissional</span><br/><span class="info-value">${profNome}</span></div>
        <div class="info-item"><span class="info-label">CBO / Conselho</span><br/><span class="info-value">223810 — ${conselho}</span></div>
        <div class="info-item"><span class="info-label">Unidade</span><br/><span class="info-value">${unidadeNome}</span></div>
      </div>
    `;

    // 2. Identificação do PTS
    if (selectedPts) {
      const pts = selectedPts;
      body += `
        <div class="section" style="page-break-inside:avoid">
          <div class="section-title">2. Identificação do PTS</div>
          <div class="field"><span class="field-label">PTS ID</span><div class="field-value">${pts.id}</div></div>
          <div class="field"><span class="field-label">Status</span><div class="field-value">${pts.status || "—"}</div></div>
          <div class="field"><span class="field-label">Data de criação</span><div class="field-value">${pts.created_at ? fmtBr(pts.created_at) : "—"}</div></div>
          <div class="field"><span class="field-label">Equipe / Especialidades</span><div class="field-value">${(pts.especialidades_envolvidas || []).join(", ") || "—"}</div></div>
          <div class="field"><span class="field-label">Objetivo geral</span><div class="field-value">${pts.objetivo_geral || "—"}</div></div>
          <div class="field"><span class="field-label">Objetivos terapêuticos</span><div class="field-value">${pts.objetivos_terapeuticos || "—"}</div></div>
          <div class="field"><span class="field-label">Metas (curto prazo)</span><div class="field-value">${pts.metas_curto_prazo || "—"}</div></div>
          <div class="field"><span class="field-label">Metas (médio prazo)</span><div class="field-value">${pts.metas_medio_prazo || "—"}</div></div>
          <div class="field"><span class="field-label">Metas (longo prazo)</span><div class="field-value">${pts.metas_longo_prazo || "—"}</div></div>
          <div class="field"><span class="field-label">Plano de conduta</span><div class="field-value">${pts.plano_conduta || "—"}</div></div>
        </div>`;
    } else {
      body += `<div class="section"><div class="section-title">2. Identificação do PTS</div><div class="field-value">Nenhum PTS vinculado encontrado para este paciente.</div></div>`;
    }

    // 3. Gestão de Tratamento
    if (selectedCycle) {
      const c = selectedCycle;
      body += `
        <div class="section" style="page-break-inside:avoid">
          <div class="section-title">3. Gestão de Tratamento e Ciclo Terapêutico</div>
          <div class="field"><span class="field-label">Tipo de tratamento</span><div class="field-value">${c.treatment_type || "—"}</div></div>
          <div class="field"><span class="field-label">Especialidade</span><div class="field-value">${c.specialty || "—"}</div></div>
          <div class="field"><span class="field-label">Status</span><div class="field-value">${c.status || "—"}</div></div>
          <div class="field"><span class="field-label">Início</span><div class="field-value">${c.start_date ? fmtBr(c.start_date) : "—"}</div></div>
          <div class="field"><span class="field-label">Previsão de término</span><div class="field-value">${c.end_date_predicted ? fmtBr(c.end_date_predicted) : "—"}</div></div>
          <div class="field"><span class="field-label">Frequência</span><div class="field-value">${c.frequency || "—"}</div></div>
          <div class="field"><span class="field-label">Sessões realizadas</span><div class="field-value">${c.sessions_done ?? 0} / ${c.total_sessions ?? 0}</div></div>
          <div class="field"><span class="field-label">Observações clínicas</span><div class="field-value">${c.clinical_notes || "—"}</div></div>
        </div>`;
    } else {
      body += `<div class="section"><div class="section-title">3. Gestão de Tratamento e Ciclo Terapêutico</div><div class="field-value">Nenhuma gestão de tratamento vinculada encontrada para este paciente.</div></div>`;
    }

    FONO_STEPS.forEach(step => {
      if (step.id === "identificacao") return;
      let stepHtml = "";
      step.sections.forEach(sec => {
        let secHtml = "";
        sec.fields.forEach(f => { secHtml += renderAnswer(f); });
        if (secHtml) stepHtml += `<div class="section" style="page-break-inside:avoid"><div class="section-title">${sec.title}</div>${secHtml}</div>`;
      });
      if (stepHtml) body += stepHtml;
    });

    // PROC
    body += `
      <div class="section" style="page-break-inside:avoid">
        <div class="section-title">Pontuação PROC</div>
        <div class="field"><span class="field-label">Habilidades comunicativas (expressiva)</span><div class="field-value">${answers.proc_habilidades || 0} / 70</div></div>
        <div class="field"><span class="field-label">Compreensão da linguagem oral</span><div class="field-value">${answers.proc_compreensao || 0} / 60</div></div>
        <div class="field"><span class="field-label">Aspectos do desenvolvimento cognitivo</span><div class="field-value">${answers.proc_cognitivo || 0} / 70</div></div>
        <div class="field"><span class="field-label">TOTAL</span><div class="field-value"><strong>${procTotal} / 200</strong></div></div>
      </div>
    `;

    body += `
      <div class="signature" style="margin-top:60px">
        <div class="signature-line"></div>
        <div class="name">${profNome}</div>
        <div class="role">Fonoaudiólogo(a) — CBO 223810 — ${conselho}</div>
      </div>
    `;
    return body;
  };

  const handlePrint = () => {
    const errs = validate();
    if (errs.length) { toast.error(errs[0]); return; }
    openPrintDocument(
      `Relatório Fonoaudiológico Avaliativo — Versão ${FONO_AVALIATIVO_VERSION}`,
      buildPrintBody(),
      { Paciente: paciente?.nome || "", Data: fmtBr(dataRelatorio) },
    );
  };

  const buildReportSections = (): ReportSection[] => {
    const sections: ReportSection[] = [];
    // 2. PTS
    if (selectedPts) {
      const pts = selectedPts;
      sections.push({
        title: "2. Identificação do PTS",
        fields: [
          { label: "Status", value: pts.status || "—" },
          { label: "Data de criação", value: pts.created_at ? fmtBr(pts.created_at) : "—" },
          { label: "Equipe / Especialidades", value: (pts.especialidades_envolvidas || []).join(", ") || "—" },
          { label: "Objetivo geral", value: pts.objetivo_geral || "—" },
          { label: "Objetivos terapêuticos", value: pts.objetivos_terapeuticos || "—" },
          { label: "Metas (curto prazo)", value: pts.metas_curto_prazo || "—" },
          { label: "Metas (médio prazo)", value: pts.metas_medio_prazo || "—" },
          { label: "Metas (longo prazo)", value: pts.metas_longo_prazo || "—" },
          { label: "Plano de conduta", value: pts.plano_conduta || "—" },
        ],
      });
    } else {
      sections.push({ title: "2. Identificação do PTS", emptyMessage: "Nenhum PTS vinculado encontrado para este paciente." });
    }
    // 3. Ciclo
    if (selectedCycle) {
      const c = selectedCycle;
      sections.push({
        title: "3. Gestão de Tratamento e Ciclo Terapêutico",
        fields: [
          { label: "Tipo de tratamento", value: c.treatment_type || "—" },
          { label: "Especialidade", value: c.specialty || "—" },
          { label: "Status", value: c.status || "—" },
          { label: "Início", value: c.start_date ? fmtBr(c.start_date) : "—" },
          { label: "Previsão de término", value: c.end_date_predicted ? fmtBr(c.end_date_predicted) : "—" },
          { label: "Frequência", value: c.frequency || "—" },
          { label: "Sessões realizadas", value: `${c.sessions_done ?? 0} / ${c.total_sessions ?? 0}` },
          { label: "Observações clínicas", value: c.clinical_notes || "—" },
        ],
      });
    } else {
      sections.push({ title: "3. Gestão de Tratamento e Ciclo Terapêutico", emptyMessage: "Nenhuma gestão de tratamento vinculada encontrada para este paciente." });
    }
    // 4..N. Avaliação / Protocolos / Parecer (sections from FONO_STEPS)
    let n = 4;
    FONO_STEPS.forEach(step => {
      if (step.id === "identificacao") return;
      step.sections.forEach(sec => {
        const fields: ReportField[] = [];
        sec.fields.forEach(f => {
          const v = answers[f.id];
          if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) return;
          let txt = "";
          if (Array.isArray(v)) {
            const items = v.filter(x => x !== "__other__");
            if (v.includes("__other__") && others[f.id]) items.push(`Outros: ${others[f.id]}`);
            txt = items.join("; ");
          } else txt = String(v);
          if (justifs[f.id]) txt += ` — Justificativa: ${justifs[f.id]}`;
          if (obs[f.id]) txt += ` — Obs.: ${obs[f.id]}`;
          fields.push({ label: f.label, value: txt });
        });
        if (fields.length) {
          sections.push({ title: `${n}. ${sec.title}`, fields });
          n++;
        }
      });
    });
    // PROC
    sections.push({
      title: `${n}. Pontuação PROC`,
      fields: [
        { label: "Habilidades comunicativas (expressiva)", value: `${answers.proc_habilidades || 0} / 70` },
        { label: "Compreensão da linguagem oral", value: `${answers.proc_compreensao || 0} / 60` },
        { label: "Aspectos do desenvolvimento cognitivo", value: `${answers.proc_cognitivo || 0} / 70` },
        { label: "TOTAL", value: `${procTotal} / 200` },
      ],
    });
    return sections;
  };

  const handleExportWord = async () => {
    const errs = validate();
    if (errs.length) { toast.error(errs[0]); return; }
    try {
      const profNome = user?.nome || "";
      const conselho = funcionario
        ? `${funcionario.tipoConselho || "CRFa"} ${funcionario.numeroConselho || ""}${funcionario.ufConselho ? "/" + funcionario.ufConselho : ""}`
        : "CRFa —";
      await exportFonoAvaliativoDocx({
        pacienteNome: paciente?.nome || "",
        dataRelatorio: fmtBr(dataRelatorio),
        profissionalNome: profNome,
        conselho,
        unidadeNome,
        sections: buildReportSections(),
      });
      toast.success("Arquivo .docx gerado");
    } catch (e: any) {
      toast.error("Falha ao gerar Word: " + (e?.message || ""));
    }
  };


  const step: StepDef = FONO_STEPS[stepIdx];
  const errors = validate();

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-primary" />
              Relatório Fonoaudiológico Avaliativo
            </h1>
            <p className="text-xs text-muted-foreground">
              Modelo exclusivo Fonoaudiologia • Versão {FONO_AVALIATIVO_VERSION}
            </p>
          </div>
        </div>
        {pacienteId && (
          <Badge variant={status === "rascunho" ? "secondary" : "default"} className="px-3 py-1">
            {status === "rascunho" ? "Rascunho" : "Concluído"}
          </Badge>
        )}
      </div>

      <Card>
        <CardContent className="pt-4 space-y-4">
          <BuscaPaciente pacientes={pacientes} value={pacienteId} onChange={setPacienteId} />
          {paciente && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-muted/40 rounded-lg text-sm">
              <div><span className="text-xs text-muted-foreground block">Nome</span><strong>{paciente.nome}</strong></div>
              <div><span className="text-xs text-muted-foreground block">Nascimento</span>{fmtBr(paciente.dataNascimento)}</div>
              <div><span className="text-xs text-muted-foreground block">Idade</span>{calcIdadeStr(paciente.dataNascimento, dataRelatorio)}</div>
              <div>
                <span className="text-xs text-muted-foreground block">Data do relatório</span>
                <Input type="date" value={dataRelatorio} onChange={e => setDataRelatorio(e.target.value)} className="h-7 text-xs" />
              </div>
              <div><span className="text-xs text-muted-foreground block">Profissional</span>{user?.nome}</div>
              <div><span className="text-xs text-muted-foreground block">CBO</span>223810 — FONOAUDIÓLOGO</div>
              <div><span className="text-xs text-muted-foreground block">Conselho</span>{funcionario?.tipoConselho || "CRFa"} {funcionario?.numeroConselho || "—"}{funcionario?.ufConselho ? "/" + funcionario.ufConselho : ""}</div>
              <div><span className="text-xs text-muted-foreground block">Unidade</span>{unidadeNome}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {pacienteId && (
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div>
              <Label className="text-sm font-semibold">Identificação do PTS</Label>
              {ptsList.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-1">Nenhum PTS vinculado encontrado para este paciente.</p>
              ) : (
                <>
                  <Select value={selectedPtsId} onValueChange={setSelectedPtsId}>
                    <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Selecione o PTS" /></SelectTrigger>
                    <SelectContent>
                      {ptsList.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {(p.status || "—")} • {fmtBr(p.created_at)} • {(p.especialidades_envolvidas || []).join(", ") || "Sem especialidade"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedPts && (
                    <div className="mt-2 p-2 rounded bg-muted/40 text-xs space-y-1">
                      <div><strong>Objetivo geral:</strong> {selectedPts.objetivo_geral || "—"}</div>
                      <div><strong>Plano de conduta:</strong> {selectedPts.plano_conduta || "—"}</div>
                    </div>
                  )}
                </>
              )}
            </div>
            <Separator />
            <div>
              <Label className="text-sm font-semibold">Gestão de Tratamento e Ciclo Terapêutico</Label>
              {cycleList.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-1">Nenhuma gestão de tratamento vinculada encontrada para este paciente.</p>
              ) : (
                <>
                  <Select value={selectedCycleId} onValueChange={setSelectedCycleId}>
                    <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Selecione o ciclo" /></SelectTrigger>
                    <SelectContent>
                      {cycleList.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {(c.treatment_type || c.specialty || "Ciclo")} • {c.status} • {fmtBr(c.start_date)} • {c.sessions_done ?? 0}/{c.total_sessions ?? 0}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedCycle && (
                    <div className="mt-2 p-2 rounded bg-muted/40 text-xs">
                      <strong>Observações:</strong> {selectedCycle.clinical_notes || "—"}
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}


      {pacienteId && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <Card className="lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>{step.title}</span>
                <span className="text-xs text-muted-foreground font-normal">
                  Etapa {stepIdx + 1} de {FONO_STEPS.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {step.sections.map(sec => (
                <div key={sec.id} className="space-y-3">
                  <h3 className="font-semibold text-sm text-primary">{sec.title}</h3>
                  {sec.fields.map(renderField)}
                </div>
              ))}

              {/* PROC total auto */}
              {step.id === "linguagem_proc" && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm font-semibold">
                  TOTAL PROC (calculado): {procTotal} / 200
                </div>
              )}

              <Separator />
              <div className="flex justify-between">
                <Button variant="outline" disabled={stepIdx === 0} onClick={() => setStepIdx(stepIdx - 1)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
                </Button>
                <Button
                  variant="outline"
                  disabled={stepIdx === FONO_STEPS.length - 1}
                  onClick={() => setStepIdx(stepIdx + 1)}
                >
                  Próxima <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Card>
              <CardContent className="pt-4 space-y-2">
                <p className="text-xs text-muted-foreground">Navegação rápida</p>
                <div className="flex flex-col gap-1 max-h-72 overflow-auto">
                  {FONO_STEPS.map((s, i) => (
                    <Button
                      key={s.id}
                      variant={i === stepIdx ? "default" : "ghost"}
                      size="sm"
                      className="justify-start text-xs h-8"
                      onClick={() => setStepIdx(i)}
                    >
                      {s.title}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 flex flex-col gap-2">
                <Button variant="outline" size="sm" onClick={() => handleSave(false)} disabled={loading}>
                  <Save className="w-4 h-4 mr-2" /> Salvar Rascunho
                </Button>
                <Button size="sm" onClick={() => handleSave(true)} disabled={loading}>
                  <CheckCircle className="w-4 h-4 mr-2" /> Finalizar
                </Button>
                <Button variant="ghost" size="sm" onClick={handlePrint} disabled={status !== "concluido"}>
                  <Printer className="w-4 h-4 mr-2" /> Imprimir / PDF
                </Button>
                <Button variant="ghost" size="sm" onClick={handleExportWord} disabled={status !== "concluido"}>
                  <FileText className="w-4 h-4 mr-2" /> Exportar Word (.docx)
                </Button>
              </CardContent>
            </Card>

            {errors.length > 0 && (
              <Alert variant="destructive" className="py-2 px-3">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="text-xs">Pendências</AlertTitle>
                <AlertDescription className="text-[10px]">
                  <ul className="list-disc ml-4 space-y-1">
                    {errors.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RelatorioFonoAvaliativo;
