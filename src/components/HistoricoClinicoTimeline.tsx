import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  FileText,
  ChevronDown,
  ChevronUp,
  Activity,
  Calendar,
  UserCheck,
  Clock,
  X,
  ListOrdered,
  Stethoscope,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

// ============================================================
// TIPOS E CONSTANTES
// ============================================================

type EventType = "consulta" | "retorno" | "sessao" | "procedimento" | "alta" | "fila" | "falta";

interface TimelineEvent {
  id: string;
  type: EventType;
  date: string;
  time?: string;
  professional: string;
  specialtyOrType: string;
  summary: string;
  procedimentos?: string;
  unidade?: string;
  episodioTitle?: string;
  sessionInfo?: string;
  status?: string;
}

interface Unidade {
  id: string;
  nome: string;
}

interface Props {
  pacienteId: string;
  unidades: Unidade[];
  currentProfissionalId?: string;
}

const PAGE_SIZE = 20;
const SUMMARY_PREVIEW_LENGTH = 150;
const SUMMARY_EXPAND_THRESHOLD = 50;

const TYPE_CONFIG: Record<EventType, { icon: React.ReactNode; color: string; label: string }> = {
  consulta: { icon: <Stethoscope className="w-3.5 h-3.5" />, color: "bg-blue-500 text-white", label: "1ª Consulta" },
  retorno: { icon: <Calendar className="w-3.5 h-3.5" />, color: "bg-emerald-500 text-white", label: "Retorno" },
  sessao: { icon: <Activity className="w-3.5 h-3.5" />, color: "bg-orange-500 text-white", label: "Sessão" },
  procedimento: {
    icon: <ListOrdered className="w-3.5 h-3.5" />,
    color: "bg-violet-500 text-white",
    label: "Procedimento",
  },
  alta: { icon: <UserCheck className="w-3.5 h-3.5" />, color: "bg-muted text-muted-foreground", label: "Alta" },
  fila: { icon: <Clock className="w-3.5 h-3.5" />, color: "bg-amber-500 text-white", label: "Entrada na Fila" },
  falta: { icon: <X className="w-3.5 h-3.5" />, color: "bg-red-500 text-white", label: "Falta" },
};

// ============================================================
// HELPERS
// ============================================================

function toMap<T>(items: T[], keyFn: (item: T) => string): Map<string, T> {
  return new Map(items.map((item) => [keyFn(item), item]));
}

function formatDateBR(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("pt-BR");
}

function classifyProntuarioType(p: any): EventType {
  if (p.procedimentos_texto || p.outro_procedimento) return "procedimento";
  if (p.indicacao_retorno) return "retorno";
  return "consulta";
}

function safeData<T = any[]>(result: { data: T | null; error: any }, context: string): T {
  if (result.error) {
    console.error(`[Timeline] Erro em ${context}:`, result.error);
    return [] as unknown as T;
  }
  return result.data ?? ([] as unknown as T);
}

// ============================================================
// FUNÇÕES DE FETCH
// ============================================================

async function fetchProntuarios(pacienteId: string) {
  const result = await (supabase as any)
    .from("prontuarios")
    .select(
      `
      id, data_atendimento, hora_atendimento,
      profissional_nome, queixa_principal, evolucao,
      procedimentos_texto, outro_procedimento,
      indicacao_retorno, unidade_id, episodio_id
    `,
    )
    .eq("paciente_id", pacienteId)
    .order("data_atendimento", { ascending: false });
  return safeData(result, "prontuários");
}

async function fetchEpisodios(pacienteId: string): Promise<Map<string, string>> {
  const result = await (supabase as any).from("episodios_clinicos").select("id, titulo").eq("paciente_id", pacienteId);
  const data = safeData(result, "episódios");
  return new Map((data as any[]).map((e: any) => [e.id, e.titulo]));
}

async function fetchFaltas(pacienteId: string) {
  const result = await (supabase as any)
    .from("agendamentos")
    .select("id, data, hora, profissional_nome, tipo, status, unidade_id")
    .eq("paciente_id", pacienteId)
    .eq("status", "falta")
    .order("data", { ascending: false });
  return safeData(result, "faltas");
}

async function fetchSessions(pacienteId: string) {
  const result = await (supabase as any)
    .from("treatment_sessions")
    .select(
      `
      id, cycle_id, session_number, total_sessions,
      scheduled_date, status, clinical_notes,
      procedure_done, professional_id
    `,
    )
    .eq("patient_id", pacienteId)
    .neq("status", "agendada")
    .order("scheduled_date", { ascending: false });
  return safeData(result, "sessões");
}

async function fetchCycles(cycleIds: string[]) {
  if (cycleIds.length === 0) return new Map<string, any>();
  const result = await (supabase as any)
    .from("treatment_cycles")
    .select("id, treatment_type, specialty, unit_id")
    .in("id", cycleIds);
  const data = safeData(result, "ciclos");
  return toMap(data as any[], (c: any) => c.id);
}

async function fetchDischarges(pacienteId: string) {
  const result = await (supabase as any)
    .from("patient_discharges")
    .select("id, cycle_id, professional_id, discharge_date, reason, final_notes")
    .eq("patient_id", pacienteId)
    .order("discharge_date", { ascending: false });
  return safeData(result, "altas");
}

// ============================================================
// TRANSFORMADORES
// ============================================================

function transformProntuarios(
  prontuarios: any[],
  unidadeMap: Map<string, Unidade>,
  episodioMap: Map<string, string>,
): TimelineEvent[] {
  return (prontuarios || []).map((p: any) => ({
    id: `pront_${p.id}`,
    type: classifyProntuarioType(p),
    date: p.data_atendimento,
    time: p.hora_atendimento || undefined,
    professional: p.profissional_nome || "",
    specialtyOrType: "Consulta",
    summary: p.queixa_principal || p.evolucao || "",
    procedimentos: p.procedimentos_texto || undefined,
    unidade: unidadeMap.get(p.unidade_id)?.nome,
    episodioTitle: p.episodio_id ? episodioMap.get(p.episodio_id) || "" : "",
  }));
}

function transformFaltas(faltas: any[], unidadeMap: Map<string, Unidade>): TimelineEvent[] {
  return (faltas || []).map((a: any) => ({
    id: `falta_${a.id}`,
    type: "falta" as EventType,
    date: a.data,
    time: a.hora || undefined,
    professional: a.profissional_nome || "",
    specialtyOrType: a.tipo || "Consulta",
    summary: "Paciente não compareceu",
    unidade: unidadeMap.get(a.unidade_id)?.nome,
    status: "falta",
  }));
}

function transformSessions(
  sessions: any[],
  cycleMap: Map<string, any>,
  unidadeMap: Map<string, Unidade>,
): TimelineEvent[] {
  return (sessions || []).map((s: any) => {
    const cycle = cycleMap.get(s.cycle_id);
    return {
      id: `session_${s.id}`,
      type: "sessao" as EventType,
      date: s.scheduled_date,
      professional: "",
      specialtyOrType: cycle?.treatment_type || "Tratamento",
      summary: s.clinical_notes || s.procedure_done || "",
      sessionInfo: `Sessão ${s.session_number}/${s.total_sessions}`,
      unidade: cycle?.unit_id ? unidadeMap.get(cycle.unit_id)?.nome : undefined,
      status: s.status,
    };
  });
}

function transformDischarges(discharges: any[], cycleMap: Map<string, any>): TimelineEvent[] {
  return (discharges || []).map((d: any) => {
    const cycle = cycleMap.get(d.cycle_id);
    return {
      id: `alta_${d.id}`,
      type: "alta" as EventType,
      date: d.discharge_date,
      professional: "",
      specialtyOrType: cycle?.treatment_type || "Tratamento",
      summary: [d.reason, d.final_notes].filter(Boolean).join(" — "),
    };
  });
}

// ============================================================
// CUSTOM HOOK
// ============================================================

function useTimeline(pacienteId: string, unidades: Unidade[]) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    if (!pacienteId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    cancelledRef.current = false;
    setLoading(true);
    setError(null);

    try {
      const unidadeMap = toMap(unidades, (u) => u.id);

      const [prontuarios, episodioMap, faltas, sessions, discharges] = await Promise.all([
        fetchProntuarios(pacienteId),
        fetchEpisodios(pacienteId),
        fetchFaltas(pacienteId),
        fetchSessions(pacienteId),
        fetchDischarges(pacienteId),
      ]);

      if (cancelledRef.current) return;

      const allCycleIds = [
        ...new Set(
          [
            ...(sessions as any[]).map((s: any) => s.cycle_id),
            ...(discharges as any[]).map((d: any) => d.cycle_id),
          ].filter(Boolean),
        ),
      ];
      const cycleMap = await fetchCycles(allCycleIds);
      if (cancelledRef.current) return;

      const allEvents: TimelineEvent[] = [
        ...transformProntuarios(prontuarios as any[], unidadeMap, episodioMap),
        ...transformFaltas(faltas as any[], unidadeMap),
        ...transformSessions(sessions as any[], cycleMap, unidadeMap),
        ...transformDischarges(discharges as any[], cycleMap),
      ];

      allEvents.sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return (b.time || "00:00").localeCompare(a.time || "00:00");
      });

      if (!cancelledRef.current) setEvents(allEvents);
    } catch (err) {
      console.error("[Timeline] Erro inesperado:", err);
      if (!cancelledRef.current) setError("Erro ao carregar histórico. Tente novamente.");
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [pacienteId, unidades]);

  useEffect(() => {
    load();
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  return { events, loading, error, reload: load };
}

// ============================================================
// SUB-COMPONENTES
// ============================================================

const LoadingState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-10 gap-2">
    <Loader2 className="w-6 h-6 animate-spin text-primary" />
    <p className="text-xs text-muted-foreground">Carregando histórico...</p>
  </div>
);

const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="flex flex-col items-center justify-center py-10 gap-3">
    <AlertTriangle className="w-8 h-8 text-destructive/60" />
    <p className="text-sm text-destructive text-center">{message}</p>
    <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
      <RefreshCw className="w-3.5 h-3.5" />
      Tentar novamente
    </Button>
  </div>
);

const EmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-10 gap-2">
    <FileText className="w-10 h-10 text-muted-foreground/40" />
    <p className="text-sm text-muted-foreground text-center">Nenhum evento clínico registrado para este paciente.</p>
  </div>
);

const TimelineHeader: React.FC<{ total: number }> = ({ total }) => (
  <div className="flex items-center justify-between mb-3">
    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
      <FileText className="w-4 h-4 text-muted-foreground" />
      Linha do Tempo Clínica
    </h3>
    <Badge variant="secondary" className="text-xs">
      {total} evento{total !== 1 ? "s" : ""}
    </Badge>
  </div>
);

const EventBadges: React.FC<{
  label: string;
  episodioTitle?: string;
  sessionInfo?: string;
  status?: string;
}> = ({ label, episodioTitle, sessionInfo, status }) => (
  <>
    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
      {label}
    </Badge>
    {episodioTitle && (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
        {episodioTitle}
      </Badge>
    )}
    {sessionInfo && (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-500/30 text-orange-600">
        {sessionInfo}
      </Badge>
    )}
    {status === "falta" && (
      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
        Falta
      </Badge>
    )}
  </>
);

const TimelineEventCard: React.FC<{
  event: TimelineEvent;
  isExpanded: boolean;
  onToggle: () => void;
  isCurrentProfessional?: boolean;
}> = React.memo(({ event, isExpanded, onToggle, isCurrentProfessional }) => {
  const config = TYPE_CONFIG[event.type] || TYPE_CONFIG.consulta;
  const hasLongSummary = Boolean(event.summary) && event.summary.length > SUMMARY_EXPAND_THRESHOLD;

  return (
    <div className="relative group">
      <div
        className={`
          absolute -left-5 top-2 w-7 h-7 rounded-full
          flex items-center justify-center shadow-sm
          transition-transform group-hover:scale-110
          ${config.color}
        `}
        title={config.label}
        aria-hidden="true"
      >
        {config.icon}
      </div>

      <Card
        className={`
          border-0 shadow-sm ml-2 transition-shadow hover:shadow-md
          ${isCurrentProfessional ? "ring-2 ring-primary/20 bg-primary/5" : ""}
        `}
      >
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <time className="text-xs font-bold text-primary" dateTime={event.date}>
                  {formatDateBR(event.date)}
                </time>
                {event.time && <span className="text-xs text-muted-foreground">{event.time}</span>}
                <EventBadges
                  label={config.label}
                  episodioTitle={event.episodioTitle}
                  sessionInfo={event.sessionInfo}
                  status={event.status}
                />
              </div>

              {(event.professional || event.specialtyOrType) && (
                <p className="text-sm text-foreground mt-0.5 font-medium truncate">
                  {event.professional || event.specialtyOrType}
                  {isCurrentProfessional && <span className="text-xs text-primary ml-1">(você)</span>}
                </p>
              )}

              {event.unidade && <p className="text-xs text-muted-foreground">📍 {event.unidade}</p>}

              {event.procedimentos && <p className="text-xs text-muted-foreground mt-1">📋 {event.procedimentos}</p>}

              {event.summary && !isExpanded && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {event.summary.length > SUMMARY_PREVIEW_LENGTH
                    ? `${event.summary.substring(0, SUMMARY_PREVIEW_LENGTH)}…`
                    : event.summary}
                </p>
              )}
            </div>

            {hasLongSummary && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 shrink-0"
                onClick={onToggle}
                aria-label={isExpanded ? "Recolher" : "Expandir"}
                aria-expanded={isExpanded}
              >
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </Button>
            )}
          </div>

          {isExpanded && event.summary && (
            <div className="mt-2 text-xs border-t pt-2 text-foreground whitespace-pre-wrap animate-in fade-in-0 slide-in-from-top-1 duration-200">
              {event.summary}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
});

TimelineEventCard.displayName = "TimelineEventCard";

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export const HistoricoClinicoTimeline: React.FC<Props> = ({ pacienteId, unidades, currentProfissionalId }) => {
  const { events, loading, error, reload } = useTimeline(pacienteId, unidades);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [pacienteId]);

  const paginatedEvents = useMemo(() => events.slice(0, page * PAGE_SIZE), [events, page]);
  const remaining = events.length - paginatedEvents.length;

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleLoadMore = useCallback(() => {
    setPage((prev) => prev + 1);
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (events.length === 0) return <EmptyState />;

  return (
    <div className="space-y-2">
      <TimelineHeader total={events.length} />

      <ScrollArea className="max-h-[500px]">
        <div className="relative pl-8 space-y-3">
          <div className="absolute left-3 top-3 bottom-3 w-px bg-border" aria-hidden="true" />

          {paginatedEvents.map((event) => (
            <TimelineEventCard
              key={event.id}
              event={event}
              isExpanded={expandedId === event.id}
              onToggle={() => handleToggle(event.id)}
              isCurrentProfessional={
                Boolean(currentProfissionalId) &&
                event.professional.toLowerCase().includes(currentProfissionalId?.toLowerCase() || "")
              }
            />
          ))}
        </div>

        {remaining > 0 && (
          <div className="flex justify-center pt-4 pb-2">
            <Button variant="outline" size="sm" onClick={handleLoadMore} className="gap-2">
              <ChevronDown className="w-3.5 h-3.5" />
              Carregar mais ({remaining} restante{remaining !== 1 ? "s" : ""})
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

export default HistoricoClinicoTimeline;
