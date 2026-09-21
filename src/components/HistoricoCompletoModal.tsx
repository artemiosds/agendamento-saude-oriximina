import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  X, Loader2, ChevronDown, ChevronUp, FileText, Activity,
  Calendar, Stethoscope, ListOrdered, UserCheck, Clock,
  AlertTriangle, RefreshCw, Filter, Pill, FlaskConical,
  HeartPulse, Eye, FileDown,
} from "lucide-react";
import { downloadFullHistoryPdf } from "@/lib/prontuarioPdf";
import { openPrintDocument, docCarimboFor } from "@/lib/printLayout";
import { Printer } from "lucide-react";
import { getSpecialtyColors } from "@/lib/specialtyColors";

// ── Types ──────────────────────────────────────────────────
type EventType = "avaliacao_inicial" | "retorno" | "sessao" | "urgencia" | "procedimento" | "alta" | "falta" | "consulta";

interface FullEvent {
  id: string;
  type: EventType;
  date: string;
  time?: string;
  professional: string;
  professionalId?: string;
  specialty?: string;
  summary: string;
  soapSubjetivo?: string;
  soapObjetivo?: string;
  soapAvaliacao?: string;
  soapPlano?: string;
  queixaPrincipal?: string;
  conduta?: string;
  especialidadeFields?: Record<string, string>;
  prescricao?: { medicamentos: { nome: string; dosagem: string; via: string; posologia: string; duracao: string }[] } | null;
  exames?: { exames: { nome: string; codigo_sus: string; indicacao: string }[] } | null;
  sinaisVitais?: Record<string, string | number>;
  unidade?: string;
  sessionInfo?: string;
  procedimentos?: string;
  status?: string;
  rawProntuario?: any;
  source: HistorySource;
  sourceId: string;
  detailsLoaded?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pacienteId: string;
  pacienteNome: string;
  unidades: { id: string; nome: string }[];
  currentProfissionalId?: string;
  onViewProntuario?: (prontuario: any) => void;
}

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string; border: string }> = {
  avaliacao_inicial: { icon: <Stethoscope className="w-3.5 h-3.5" />, color: "bg-green-500 text-white", label: "Avaliação Inicial", border: "border-l-green-500" },
  retorno: { icon: <Calendar className="w-3.5 h-3.5" />, color: "bg-blue-500 text-white", label: "Retorno", border: "border-l-blue-500" },
  sessao: { icon: <Activity className="w-3.5 h-3.5" />, color: "bg-yellow-500 text-white", label: "Sessão", border: "border-l-yellow-500" },
  urgencia: { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "bg-red-500 text-white", label: "Urgência", border: "border-l-red-500" },
  procedimento: { icon: <ListOrdered className="w-3.5 h-3.5" />, color: "bg-purple-500 text-white", label: "Procedimento", border: "border-l-purple-500" },
  consulta: { icon: <Stethoscope className="w-3.5 h-3.5" />, color: "bg-blue-400 text-white", label: "Consulta", border: "border-l-blue-400" },
  alta: { icon: <UserCheck className="w-3.5 h-3.5" />, color: "bg-gray-400 text-white", label: "Alta", border: "border-l-gray-400" },
  falta: { icon: <X className="w-3.5 h-3.5" />, color: "bg-red-400 text-white", label: "Falta", border: "border-l-red-400" },
};

function formatDateBR(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");
}

function parseJsonSafe(json: string | null | undefined) {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}

// ── Data Loading ───────────────────────────────────────────
const HISTORY_WINDOW_DAYS = 90;
const SOURCE_PAGE_SIZE = 200;
const SOURCE_PRIORITY: Record<HistorySource, number> = {
  prontuario: 4,
  falta: 3,
  sessao: 2,
  alta: 1,
};

type HistorySource = "prontuario" | "falta" | "sessao" | "alta";
type DateRange = { start: string; end: string };
type SourceCursor = { date: string; time?: string; sourceId: string };

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function previousRange(end: string): DateRange {
  const endDate = new Date(`${end}T12:00:00`);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - HISTORY_WINDOW_DAYS);
  return { start: localIsoDate(startDate), end };
}

function initialRange(): DateRange {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return previousRange(localIsoDate(tomorrow));
}

export function compareEvents(a: FullEvent, b: FullEvent) {
  const dateOrder = b.date.localeCompare(a.date);
  if (dateOrder !== 0) return dateOrder;
  const timeOrder = (b.time || "00:00").localeCompare(a.time || "00:00");
  if (timeOrder !== 0) return timeOrder;
  const sourceOrder = SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source];
  if (sourceOrder !== 0) return sourceOrder;
  return b.sourceId.localeCompare(a.sourceId);
}

export function mergeEvents(current: FullEvent[], incoming: FullEvent[]) {
  const byCanonicalKey = new Map(current.map(event => [event.id, event]));
  for (const event of incoming) byCanonicalKey.set(event.id, { ...byCanonicalKey.get(event.id), ...event });
  return Array.from(byCanonicalKey.values()).sort(compareEvents);
}

function cursorFilter(dateField: string, timeField: string | undefined, cursor: SourceCursor) {
  if (!timeField) {
    return `${dateField}.lt.${cursor.date},and(${dateField}.eq.${cursor.date},id.lt.${cursor.sourceId})`;
  }
  if (!cursor.time) {
    return `${dateField}.lt.${cursor.date},and(${dateField}.eq.${cursor.date},${timeField}.is.null,id.lt.${cursor.sourceId})`;
  }
  return `${dateField}.lt.${cursor.date},and(${dateField}.eq.${cursor.date},${timeField}.lt.${cursor.time}),and(${dateField}.eq.${cursor.date},${timeField}.eq.${cursor.time},id.lt.${cursor.sourceId}),and(${dateField}.eq.${cursor.date},${timeField}.is.null)`;
}

async function fetchSourcePages(
  source: HistorySource,
  pacienteId: string,
  range: DateRange,
  signal: AbortSignal,
): Promise<any[]> {
  const config = {
    prontuario: { table: "prontuarios", patient: "paciente_id", date: "data_atendimento", time: "hora_atendimento", select: "id, agendamento_id, data_atendimento, hora_atendimento, profissional_nome, profissional_id, tipo_registro, queixa_principal, unidade_id, procedimentos_texto" },
    falta: { table: "agendamentos", patient: "paciente_id", date: "data", time: "hora", select: "id, data, hora, profissional_nome, profissional_id, tipo, status, unidade_id" },
    sessao: { table: "treatment_sessions", patient: "patient_id", date: "scheduled_date", select: "id, cycle_id, session_number, total_sessions, scheduled_date, status, clinical_notes, procedure_done, professional_id" },
    alta: { table: "patient_discharges", patient: "patient_id", date: "discharge_date", select: "id, cycle_id, professional_id, discharge_date, reason, final_notes" },
  }[source];
  const rows: any[] = [];
  let cursor: SourceCursor | null = null;

  while (!signal.aborted) {
    let query = (supabase as any)
      .from(config.table)
      .select(config.select)
      .eq(config.patient, pacienteId)
      .gte(config.date, range.start)
      .lt(config.date, range.end);
    if (source === "falta") query = query.eq("status", "falta");
    if (source === "sessao") query = query.neq("status", "agendada");
    if (cursor) query = query.or(cursorFilter(config.date, config.time, cursor));
    query = query.order(config.date, { ascending: false });
    if (config.time) query = query.order(config.time, { ascending: false, nullsFirst: false });
    query = query.order("id", { ascending: false }).limit(SOURCE_PAGE_SIZE).abortSignal(signal);

    const { data, error } = await query;
    if (error) throw error;
    const page = (data || []) as any[];
    rows.push(...page);
    if (page.length < SOURCE_PAGE_SIZE) break;
    const last = page[page.length - 1];
    const nextCursor = { date: last[config.date], time: config.time ? last[config.time] || undefined : undefined, sourceId: String(last.id) };
    if (cursor && cursor.date === nextCursor.date && cursor.time === nextCursor.time && cursor.sourceId === nextCursor.sourceId) break;
    cursor = nextCursor;
  }
  return rows;
}

async function hasEventsBefore(source: HistorySource, pacienteId: string, before: string, signal: AbortSignal) {
  const config = {
    prontuario: { table: "prontuarios", patient: "paciente_id", date: "data_atendimento" },
    falta: { table: "agendamentos", patient: "paciente_id", date: "data" },
    sessao: { table: "treatment_sessions", patient: "patient_id", date: "scheduled_date" },
    alta: { table: "patient_discharges", patient: "patient_id", date: "discharge_date" },
  }[source];
  let query = (supabase as any).from(config.table).select("id").eq(config.patient, pacienteId).lt(config.date, before);
  if (source === "falta") query = query.eq("status", "falta");
  if (source === "sessao") query = query.neq("status", "agendada");
  const { data, error } = await query.limit(1).abortSignal(signal);
  if (error) throw error;
  return Boolean(data?.length);
}

function mapRangeEvents(
  rows: Record<HistorySource, any[]>,
  specialtyMap: Map<string, string>,
  cycleMap: Map<string, any>,
  unidadeMap: Map<string, string>,
): FullEvent[] {
  const result: FullEvent[] = [];
  for (const p of rows.prontuario) {
    let type: EventType = (p.tipo_registro || "consulta") as EventType;
    if (!TYPE_CONFIG[type]) type = "consulta";
    const isReport = p.tipo_registro === "alta_multiprofissional" || p.tipo_registro === "alta_individual";
    result.push({
      id: `prontuario:${p.id}`, source: "prontuario", sourceId: String(p.id), type: isReport ? "alta" : type,
      date: p.data_atendimento, time: p.hora_atendimento || undefined, professional: p.profissional_nome || "",
      professionalId: p.profissional_id, specialty: specialtyMap.get(p.profissional_id), summary: p.queixa_principal || "",
      queixaPrincipal: p.queixa_principal || undefined, unidade: unidadeMap.get(p.unidade_id), procedimentos: p.procedimentos_texto || undefined,
      rawProntuario: p, detailsLoaded: false,
    });
  }
  for (const a of rows.falta) {
    result.push({
      id: `falta:${a.id}`, source: "falta", sourceId: String(a.id), type: "falta", date: a.data, time: a.hora || undefined,
      professional: a.profissional_nome || "", professionalId: a.profissional_id, specialty: specialtyMap.get(a.profissional_id),
      summary: "Paciente não compareceu", unidade: unidadeMap.get(a.unidade_id), status: "falta", detailsLoaded: true,
    });
  }
  for (const s of rows.sessao) {
    const cycle = cycleMap.get(s.cycle_id);
    result.push({
      id: `sessao:${s.id}`, source: "sessao", sourceId: String(s.id), type: "sessao", date: s.scheduled_date,
      professional: "", professionalId: s.professional_id, specialty: specialtyMap.get(s.professional_id) || cycle?.specialty,
      summary: s.clinical_notes || s.procedure_done || "", sessionInfo: `Sessão ${s.session_number}/${s.total_sessions}`,
      unidade: cycle?.unit_id ? unidadeMap.get(cycle.unit_id) : undefined, status: s.status, detailsLoaded: true,
    });
  }
  for (const d of rows.alta) {
    const cycle = cycleMap.get(d.cycle_id);
    result.push({
      id: `alta:${d.id}`, source: "alta", sourceId: String(d.id), type: "alta", date: d.discharge_date,
      professional: "", professionalId: d.professional_id, specialty: specialtyMap.get(d.professional_id) || cycle?.specialty,
      summary: [d.reason, d.final_notes].filter(Boolean).join(" — "), detailsLoaded: true,
    });
  }
  return result.sort(compareEvents);
}

async function fetchHistoryRange(pacienteId: string, range: DateRange, unidades: { id: string; nome: string }[], signal: AbortSignal) {
  const sources: HistorySource[] = ["prontuario", "falta", "sessao", "alta"];
  const [prontuario, falta, sessao, alta] = await Promise.all(sources.map(source => fetchSourcePages(source, pacienteId, range, signal)));
  const rows = { prontuario, falta, sessao, alta };
  const professionalIds = [...new Set(Object.values(rows).flat().map((row: any) => row.profissional_id || row.professional_id).filter(Boolean))];
  const cycleIds = [...new Set([...sessao, ...alta].map((row: any) => row.cycle_id).filter(Boolean))];
  const [professionalsRes, cyclesRes, olderFlags] = await Promise.all([
    professionalIds.length ? (supabase as any).from("funcionarios").select("id, profissao").in("id", professionalIds).abortSignal(signal) : Promise.resolve({ data: [] }),
    cycleIds.length ? (supabase as any).from("treatment_cycles").select("id, treatment_type, specialty, unit_id").in("id", cycleIds).abortSignal(signal) : Promise.resolve({ data: [] }),
    Promise.all(sources.map(source => hasEventsBefore(source, pacienteId, range.start, signal))),
  ]);
  const specialtyMap = new Map<string, string>((professionalsRes.data || []).map((f: any) => [String(f.id), f.profissao]));
  const cycleMap = new Map<string, any>((cyclesRes.data || []).map((cycle: any) => [String(cycle.id), cycle]));
  const unidadeMap = new Map(unidades.map(unit => [unit.id, unit.nome]));
  return { events: mapRangeEvents(rows, specialtyMap, cycleMap, unidadeMap), hasOlder: olderFlags.some(Boolean) };
}

function useFullHistory(open: boolean, pacienteId: string, unidades: { id: string; nome: string }[]) {
  const [events, setEvents] = useState<FullEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [printingProgress, setPrintingProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>(() => initialRange());
  const [hasOlder, setHasOlder] = useState(false);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const eventsRef = useRef<FullEvent[]>([]);
  const rangeRef = useRef(range);
  const hasOlderRef = useRef(false);

  const commitEvents = useCallback((next: FullEvent[]) => {
    eventsRef.current = next;
    setEvents(next);
  }, []);

  const loadInitial = useCallback(async () => {
    abortControllerRef.current?.abort();
    const requestId = ++requestIdRef.current;
    if (!open || !pacienteId) { setLoading(false); return; }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const firstRange = initialRange();
    rangeRef.current = firstRange;
    setRange(firstRange);
    setLoading(true);
    setError(null);
    commitEvents([]);
    setHasOlder(false);
    hasOlderRef.current = false;
    try {
      const result = await fetchHistoryRange(pacienteId, firstRange, unidades, controller.signal);
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      commitEvents(result.events);
      setHasOlder(result.hasOlder);
      hasOlderRef.current = result.hasOlder;
    } catch (err) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      console.error("[HistoricoCompleto] Erro:", err);
      setError("Erro ao carregar histórico completo.");
    } finally {
      if (!controller.signal.aborted && requestId === requestIdRef.current) setLoading(false);
    }
  }, [open, pacienteId, unidades, commitEvents]);

  useEffect(() => {
    loadInitial();
    return () => {
      requestIdRef.current += 1;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (!open || !pacienteId || loadingMore || !hasOlderRef.current) return;
    const requestId = requestIdRef.current;
    const controller = abortControllerRef.current;
    if (!controller || controller.signal.aborted) return;
    const nextRange = previousRange(rangeRef.current.start);
    setLoadingMore(true);
    setError(null);
    try {
      const result = await fetchHistoryRange(pacienteId, nextRange, unidades, controller.signal);
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      commitEvents(mergeEvents(eventsRef.current, result.events));
      rangeRef.current = nextRange;
      setRange(nextRange);
      hasOlderRef.current = result.hasOlder;
      setHasOlder(result.hasOlder);
    } catch (err) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      console.error("[HistoricoCompleto] Erro ao carregar anteriores:", err);
      setError("Erro ao carregar atendimentos anteriores.");
    } finally {
      if (!controller.signal.aborted && requestId === requestIdRef.current) setLoadingMore(false);
    }
  }, [open, pacienteId, unidades, loadingMore, commitEvents]);

  const loadDetail = useCallback(async (event: FullEvent) => {
    if (event.source !== "prontuario" || event.detailsLoaded) return event;
    const requestId = requestIdRef.current;
    const controller = abortControllerRef.current;
    if (!controller || controller.signal.aborted) return event;
    setLoadingDetailId(event.id);
    try {
      const { data: prontuario, error: detailError } = await (supabase as any).from("prontuarios").select("*").eq("id", event.sourceId).single().abortSignal(controller.signal);
      if (detailError) throw detailError;
      let triage: any = null;
      if (prontuario?.agendamento_id) {
        const { data, error: triageError } = await (supabase as any).from("triage_records").select("agendamento_id, pressao_arterial, temperatura, frequencia_cardiaca, saturacao_oxigenio, glicemia, peso, altura, imc").eq("agendamento_id", prontuario.agendamento_id).maybeSingle().abortSignal(controller.signal);
        if (triageError) throw triageError;
        triage = data;
      }
      if (controller.signal.aborted || requestId !== requestIdRef.current) return event;
      const prescricaoParsed = parseJsonSafe(prontuario.prescricao);
      const examesParsed = parseJsonSafe(prontuario.solicitacao_exames);
      const obsParsed = parseJsonSafe(prontuario.observacoes);
      const detailed: FullEvent = {
        ...event, summary: prontuario.queixa_principal || prontuario.evolucao || event.summary,
        soapSubjetivo: prontuario.soap_subjetivo || undefined, soapObjetivo: prontuario.soap_objetivo || undefined,
        soapAvaliacao: prontuario.soap_avaliacao || undefined, soapPlano: prontuario.soap_plano || undefined,
        queixaPrincipal: prontuario.queixa_principal || undefined, conduta: prontuario.conduta || undefined,
        especialidadeFields: obsParsed?.especialidade_fields || undefined,
        prescricao: prescricaoParsed?.medicamentos ? prescricaoParsed : null,
        exames: examesParsed?.exames ? examesParsed : null,
        sinaisVitais: triage ? { PA: triage.pressao_arterial, FC: triage.frequencia_cardiaca, Temp: triage.temperatura, "SatO₂": triage.saturacao_oxigenio, Glicemia: triage.glicemia, Peso: triage.peso, Altura: triage.altura, IMC: triage.imc } : undefined,
        rawProntuario: prontuario, detailsLoaded: true,
      };
      commitEvents(eventsRef.current.map(item => item.id === event.id ? detailed : item));
      return detailed;
    } catch (err) {
      if (!controller.signal.aborted && requestId === requestIdRef.current) console.error("[HistoricoCompleto] Erro no detalhe:", err);
      return event;
    } finally {
      if (!controller.signal.aborted && requestId === requestIdRef.current) setLoadingDetailId(null);
    }
  }, [commitEvents]);

  const drainAll = useCallback(async () => {
    if (!open || !pacienteId) return eventsRef.current;
    const requestId = requestIdRef.current;
    const controller = abortControllerRef.current;
    if (!controller || controller.signal.aborted) return eventsRef.current;
    let nextEvents = eventsRef.current;
    let nextRange = rangeRef.current;
    let more = hasOlderRef.current;
    let loadedRanges = 0;
    setPrintingProgress(0);
    try {
      while (more && !controller.signal.aborted && requestId === requestIdRef.current) {
        nextRange = previousRange(nextRange.start);
        const result = await fetchHistoryRange(pacienteId, nextRange, unidades, controller.signal);
        nextEvents = mergeEvents(nextEvents, result.events);
        more = result.hasOlder;
        loadedRanges += 1;
        setPrintingProgress(loadedRanges);
      }
      if (!controller.signal.aborted && requestId === requestIdRef.current) {
        commitEvents(nextEvents);
        rangeRef.current = nextRange;
        setRange(nextRange);
        hasOlderRef.current = more;
        setHasOlder(more);
      }
      return nextEvents;
    } finally {
      if (!controller.signal.aborted && requestId === requestIdRef.current) setPrintingProgress(null);
    }
  }, [open, pacienteId, unidades, commitEvents]);

  const professionals = useMemo(() => Array.from(new Set(events.map(event => event.professional).filter(Boolean))).sort(), [events]);
  return { events, professionals, loading, loadingMore, loadingDetailId, printingProgress, hasOlder, error, reload: loadInitial, loadMore, loadDetail, drainAll };
}

// ── Expanded Event Detail ──────────────────────────────────
const EventDetail: React.FC<{ event: FullEvent }> = ({ event }) => {
  const hasSOAP = event.soapSubjetivo || event.soapObjetivo || event.soapAvaliacao || event.soapPlano;
  const hasPrescricao = event.prescricao?.medicamentos && event.prescricao.medicamentos.length > 0;
  const hasExames = event.exames?.exames && event.exames.exames.length > 0;
  const hasVitals = event.sinaisVitais && Object.values(event.sinaisVitais).some(Boolean);
  const hasEspecialidade = event.especialidadeFields && Object.keys(event.especialidadeFields).length > 0;

  return (
    <div className="mt-3 space-y-3 border-t pt-3 animate-in fade-in-0 slide-in-from-top-1 duration-200">
      {/* SOAP */}
      {hasSOAP && (
        <div className="space-y-1.5">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-display)' }}>Evolução SOAP</h5>
          {event.soapSubjetivo && <div className="text-xs"><span className="font-semibold text-foreground">S:</span> <span className="text-muted-foreground">{event.soapSubjetivo}</span></div>}
          {event.soapObjetivo && <div className="text-xs"><span className="font-semibold text-foreground">O:</span> <span className="text-muted-foreground">{event.soapObjetivo}</span></div>}
          {event.soapAvaliacao && <div className="text-xs"><span className="font-semibold text-foreground">A:</span> <span className="text-muted-foreground">{event.soapAvaliacao}</span></div>}
          {event.soapPlano && <div className="text-xs"><span className="font-semibold text-foreground">P:</span> <span className="text-muted-foreground">{event.soapPlano}</span></div>}
        </div>
      )}

      {/* Specialty Fields */}
      {hasEspecialidade && (
        <div className="space-y-1">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-display)' }}>Campos da Especialidade</h5>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {Object.entries(event.especialidadeFields!).map(([key, val]) => (
              val ? <div key={key} className="text-xs"><span className="font-medium text-foreground">{key.replace(/_/g, ' ')}:</span> <span className="text-muted-foreground">{val}</span></div> : null
            ))}
          </div>
        </div>
      )}

      {/* Prescriptions */}
      {hasPrescricao && (
        <div className="border-l-2 pl-3 space-y-1" style={{ borderColor: 'hsl(174, 51%, 36%)' }}>
          <h5 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1 text-muted-foreground" style={{ fontFamily: 'var(--font-display)' }}>
            <Pill className="w-3 h-3" /> Prescrições
          </h5>
          {event.prescricao!.medicamentos.map((med, i) => (
            <div key={i} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{i + 1}. {med.nome}</span> — {med.dosagem} | {med.via} | {med.posologia} | {med.duracao}
            </div>
          ))}
        </div>
      )}

      {/* Exams */}
      {hasExames && (
        <div className="border-l-2 pl-3 space-y-1" style={{ borderColor: 'hsl(174, 51%, 36%)' }}>
          <h5 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1 text-muted-foreground" style={{ fontFamily: 'var(--font-display)' }}>
            <FlaskConical className="w-3 h-3" /> Exames Solicitados
          </h5>
          {event.exames!.exames.map((ex, i) => (
            <div key={i} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{ex.nome}</span>
              {ex.codigo_sus && <span className="ml-1" style={{ fontFamily: 'var(--font-clinical)' }}>({ex.codigo_sus})</span>}
              {ex.indicacao && <span> — {ex.indicacao}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Vital Signs */}
      {hasVitals && (
        <div className="space-y-1">
          <h5 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1 text-muted-foreground" style={{ fontFamily: 'var(--font-display)' }}>
            <HeartPulse className="w-3 h-3" /> Sinais Vitais
          </h5>
          <div className="flex flex-wrap gap-2">
            {Object.entries(event.sinaisVitais!).map(([key, val]) => (
              val ? (
                <span key={key} className="text-xs bg-muted px-2 py-0.5 rounded" style={{ fontFamily: 'var(--font-clinical)' }}>
                  {key}: <strong>{val}</strong>
                </span>
              ) : null
            ))}
          </div>
        </div>
      )}

      {/* Conduta */}
      {event.conduta && (
        <div className="text-xs"><span className="font-semibold text-foreground">Conduta:</span> <span className="text-muted-foreground">{event.conduta}</span></div>
      )}

      {/* Raw summary fallback for old records */}
      {!hasSOAP && event.summary && (
        <div className="text-xs text-muted-foreground whitespace-pre-wrap">{event.summary}</div>
      )}
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────
export const HistoricoCompletoModal: React.FC<Props> = ({
  open, onOpenChange, pacienteId, pacienteNome, unidades, currentProfissionalId, onViewProntuario,
}) => {
  const {
    events, professionals, loading, loadingMore, loadingDetailId, printingProgress,
    hasOlder, error, reload, loadMore, loadDetail, drainAll,
  } = useFullHistory(open, pacienteId, unidades);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setExpandedId(null);
  }, [open]);

  // Filters
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set());
  const [filterProfissional, setFilterProfissional] = useState("todos");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const applyFilters = useCallback((sourceEvents: FullEvent[]) => {
    return sourceEvents.filter(ev => {
      if (filterTypes.size > 0 && !filterTypes.has(ev.type)) return false;
      if (filterProfissional !== "todos" && ev.professional !== filterProfissional) return false;
      if (filterDateFrom && ev.date < filterDateFrom) return false;
      if (filterDateTo && ev.date > filterDateTo) return false;
      return true;
    });
  }, [filterTypes, filterProfissional, filterDateFrom, filterDateTo]);

  const filteredEvents = useMemo(() => applyFilters(events), [events, applyFilters]);

  const toggleType = (type: string) => {
    setFilterTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const clearFilters = () => {
    setFilterTypes(new Set());
    setFilterProfissional("todos");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  const typeOptions = ["avaliacao_inicial", "retorno", "sessao", "urgencia", "procedimento", "consulta", "alta", "falta"];

  // Summary stats
  const summaryStats = useMemo(() => {
    if (events.length === 0) return null;
    const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
    return {
      total: events.length,
      first: sorted[0].date,
      last: sorted[sorted.length - 1].date,
    };
  }, [events]);

  const handleGenerateReport = async () => {
    const completeEvents = applyFilters(await drainAll());
    if (completeEvents.length === 0) return;
    downloadFullHistoryPdf(
      pacienteNome,
      completeEvents.map((e) => ({
        date: e.date,
        type: TYPE_CONFIG[e.type]?.label || e.type,
        professional: e.professional,
        specialty: e.specialty,
        summary: e.summary || e.queixaPrincipal || e.conduta || "",
        unidade: e.unidade,
        sessionInfo: e.sessionInfo,
      })),
      currentProfissionalId,
    );
  };

  const handlePrintOfficial = async () => {
    const completeEvents = applyFilters(await drainAll());
    if (completeEvents.length === 0) return;
    const rows = [...completeEvents]
      .sort(compareEvents)
      .map((e) => `
        <tr>
          <td>${formatDateBR(e.date)}${e.time ? ' ' + e.time : ''}</td>
          <td>${TYPE_CONFIG[e.type]?.label || e.type}${e.sessionInfo ? ' — ' + e.sessionInfo : ''}</td>
          <td>${e.professional || '—'}</td>
          <td>${e.specialty || '—'}</td>
          <td><div style="font-size:9.5pt; line-height:1.2;">${(e.summary || e.queixaPrincipal || e.conduta || '').replace(/</g, '&lt;').slice(0, 800)}</div></td>
        </tr>`).join('');
    
    const carimboHtml = currentProfissionalId ? await docCarimboFor(currentProfissionalId) : "";

    const body = `
      <h3 style="margin:12px 0 8px;font-size:12pt;font-weight:700;color:#0c4a6e;text-transform:uppercase;border-bottom:2px solid #0369a1;">Histórico Clínico Consolidado</h3>
      <table>
        <thead>
          <tr><th>Data</th><th>Tipo</th><th>Profissional</th><th>Especialidade</th><th>Resumo</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      
      <div style="margin-top: 20px;">
        ${carimboHtml}
      </div>
    `;
    openPrintDocument(`Histórico Clínico — ${pacienteNome}`, body, {
      'Paciente': pacienteNome,
      'Total de eventos': String(completeEvents.length),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full max-h-[95vh] h-[95vh] p-0 gap-0 flex flex-col" aria-describedby={undefined}>
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 border-b bg-card shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base sm:text-lg font-semibold uppercase tracking-wide" style={{ fontFamily: 'var(--font-display)' }}>
                Histórico Completo — {pacienteNome}
              </h2>
              <p className="text-xs text-muted-foreground">{filteredEvents.length} de {events.length} evento(s)</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="gap-1.5">
                <Filter className="w-3.5 h-3.5" />
                Filtros
              </Button>
            </div>
          </div>
          {summaryStats && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground border-t pt-2">
              <span className="inline-flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-primary" />
                <strong className="text-foreground">{summaryStats.total}</strong> evento(s)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                Primeiro: <strong className="text-foreground">{formatDateBR(summaryStats.first)}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-primary" />
                Último: <strong className="text-foreground">{formatDateBR(summaryStats.last)}</strong>
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Filters sidebar */}
          {showFilters && (
            <div className="w-56 sm:w-64 border-r bg-muted/30 p-3 space-y-4 overflow-y-auto shrink-0">
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ fontFamily: 'var(--font-display)' }}>Por Tipo</Label>
                <div className="space-y-1.5">
                  {typeOptions.map(t => {
                    const cfg = TYPE_CONFIG[t];
                    if (!cfg) return null;
                    return (
                      <label key={t} className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox checked={filterTypes.has(t)} onCheckedChange={() => toggleType(t)} />
                        <span className={`w-2 h-2 rounded-full ${cfg.color.split(' ')[0]}`} />
                        {cfg.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ fontFamily: 'var(--font-display)' }}>Por Profissional</Label>
                <Select value={filterProfissional} onValueChange={setFilterProfissional}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {professionals.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ fontFamily: 'var(--font-display)' }}>Por Período</Label>
                <div className="space-y-1.5">
                  <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="h-8 text-xs" placeholder="De" />
                  <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="h-8 text-xs" placeholder="Até" />
                </div>
              </div>

              <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full text-xs">
                Limpar filtros
              </Button>
            </div>
          )}

          {/* Timeline */}
          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 sm:p-6 space-y-3">
                {loading && (
                  <div className="flex flex-col items-center justify-center py-16 gap-2">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Carregando histórico completo...</p>
                  </div>
                )}

                {error && (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <AlertTriangle className="w-8 h-8 text-destructive/60" />
                    <p className="text-sm text-destructive">{error}</p>
                    <Button variant="outline" size="sm" onClick={reload}><RefreshCw className="w-3.5 h-3.5 mr-1" /> Tentar novamente</Button>
                  </div>
                )}

                {!loading && !error && filteredEvents.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 gap-2">
                    <FileText className="w-10 h-10 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">{hasOlder ? "Nenhum evento no período recente." : "Nenhum evento encontrado."}</p>
                  </div>
                )}

                {!loading && !error && filteredEvents.map(event => {
                  const config = TYPE_CONFIG[event.type] || TYPE_CONFIG.consulta;
                  const specColors = getSpecialtyColors(event.specialty);
                  const isExpanded = expandedId === event.id;
                  const isCurrent = currentProfissionalId && event.professionalId === currentProfissionalId;

                  return (
                    <div
                      key={event.id}
                      className={`border-l-4 rounded-lg bg-card shadow-sm p-3 sm:p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer ${specColors.border} ${isCurrent ? `ring-1 ${specColors.ring}` : ''}`}
                      onClick={async () => {
                        if (isExpanded) { setExpandedId(null); return; }
                        setExpandedId(event.id);
                        await loadDetail(event);
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <time className="text-xs font-bold text-primary" style={{ fontFamily: 'var(--font-clinical)' }}>{formatDateBR(event.date)}</time>
                            {event.time && <span className="text-xs text-muted-foreground" style={{ fontFamily: 'var(--font-clinical)' }}>{event.time}</span>}
                            <Badge className={`text-[10px] px-1.5 py-0 ${config.color}`}>
                              {config.icon}
                              <span className="ml-1">{config.label}</span>
                            </Badge>
                            {event.specialty && (
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${specColors.badge}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${specColors.dot}`} />
                                {event.specialty}
                              </span>
                            )}
                            {event.sessionInfo && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-yellow-500/30 text-yellow-600" style={{ fontFamily: 'var(--font-clinical)' }}>
                                {event.sessionInfo}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium text-foreground mt-0.5 truncate">
                            {event.professional || "—"}
                            {isCurrent && <span className="text-xs text-primary ml-1">(você)</span>}
                          </p>
                          {event.unidade && <p className="text-xs text-muted-foreground">📍 {event.unidade}</p>}
                          {!isExpanded && event.summary && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{event.summary.substring(0, 150)}{event.summary.length > 150 ? '…' : ''}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {event.source === "prontuario" && onViewProntuario && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs gap-1"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const detailed = await loadDetail(event);
                                if (detailed.rawProntuario) onViewProntuario(detailed.rawProntuario);
                              }}
                              title="Visualizar prontuário"
                            >
                              <Eye className="w-3.5 h-3.5" /> Visualizar
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={async e => {
                            e.stopPropagation();
                            if (isExpanded) { setExpandedId(null); return; }
                            setExpandedId(event.id);
                            await loadDetail(event);
                          }}>
                            {loadingDetailId === event.id ? <Loader2 className="w-4 h-4 animate-spin" /> : isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>

                      {isExpanded && loadingDetailId === event.id && (
                        <div className="mt-3 border-t pt-3 text-xs text-muted-foreground flex items-center gap-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando detalhes...
                        </div>
                      )}
                      {isExpanded && loadingDetailId !== event.id && <EventDetail event={event} />}
                    </div>
                  );
                })}

                {!loading && !error && (events.length > 0 || hasOlder) && (
                  <div className="flex flex-col items-center gap-2 py-4">
                    {hasOlder ? (
                      <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore || printingProgress !== null} className="gap-1.5">
                        {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Carregar atendimentos anteriores
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground">Não há atendimentos anteriores</p>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t bg-card flex flex-wrap items-center justify-end gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrintOfficial}
            disabled={(filteredEvents.length === 0 && !hasOlder) || loading || loadingMore || printingProgress !== null}
            className="gap-1.5"
          >
            {printingProgress !== null ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            Imprimir Oficial (A4)
            {printingProgress !== null && ` — ${printingProgress} faixa(s)`}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleGenerateReport}
            disabled={(filteredEvents.length === 0 && !hasOlder) || loading || loadingMore || printingProgress !== null}
            className="gap-1.5"
          >
            {printingProgress !== null ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            Gerar Relatório Completo
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HistoricoCompletoModal;
