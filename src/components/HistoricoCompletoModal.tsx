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
function useFullHistory(pacienteId: string, unidades: { id: string; nome: string }[]) {
  const [events, setEvents] = useState<FullEvent[]>([]);
  const [professionals, setProfessionals] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const load = useCallback(async () => {
    if (!pacienteId) { setEvents([]); setLoading(false); return; }
    cancelRef.current = false;
    setLoading(true);
    setError(null);

    try {
      const unidadeMap = new Map(unidades.map(u => [u.id, u.nome]));

      const [prontuariosRes, faltasRes, sessionsRes, dischargesRes, triageRes] = await Promise.all([
        (supabase as any).from("prontuarios").select("*").eq("paciente_id", pacienteId).order("data_atendimento", { ascending: false }),
        supabase.from("agendamentos").select("id, data, hora, profissional_nome, profissional_id, tipo, status, unidade_id").eq("paciente_id", pacienteId).eq("status", "falta").order("data", { ascending: false }),
        (supabase as any).from("treatment_sessions").select("id, cycle_id, session_number, total_sessions, scheduled_date, status, clinical_notes, procedure_done, professional_id").eq("patient_id", pacienteId).neq("status", "agendada").order("scheduled_date", { ascending: false }),
        (supabase as any).from("patient_discharges").select("id, cycle_id, professional_id, discharge_date, reason, final_notes").eq("patient_id", pacienteId),
        (supabase as any).from("triage_records").select("agendamento_id, pressao_arterial, temperatura, frequencia_cardiaca, saturacao_oxigenio, glicemia, peso, altura, imc").eq("agendamento_id", pacienteId).limit(0), // placeholder to batch
      ]);

      if (cancelRef.current) return;

      // Fetch triage for all agendamento_ids from prontuarios
      const prontuarios = (prontuariosRes.data || []) as any[];
      const agendamentoIds = prontuarios.map((p: any) => p.agendamento_id).filter(Boolean);
      let triageMap = new Map<string, any>();
      if (agendamentoIds.length > 0) {
        const { data: triageData } = await (supabase as any).from("triage_records").select("agendamento_id, pressao_arterial, temperatura, frequencia_cardiaca, saturacao_oxigenio, glicemia, peso, altura, imc").in("agendamento_id", agendamentoIds);
        if (triageData) {
          triageMap = new Map((triageData as any[]).map((t: any) => [t.agendamento_id, t]));
        }
      }

      // Fetch cycles for sessions/discharges
      const sessions = (sessionsRes.data || []) as any[];
      const discharges = (dischargesRes.data || []) as any[];
      const cycleIds = [...new Set([...sessions.map((s: any) => s.cycle_id), ...discharges.map((d: any) => d.cycle_id)].filter(Boolean))];
      let cycleMap = new Map<string, any>();
      if (cycleIds.length > 0) {
        const { data: cycleData } = await (supabase as any).from("treatment_cycles").select("id, treatment_type, specialty, unit_id").in("id", cycleIds);
        if (cycleData) cycleMap = new Map((cycleData as any[]).map((c: any) => [c.id, c]));
      }

      if (cancelRef.current) return;

      const profSet = new Set<string>();
      const allEvents: FullEvent[] = [];

      // Transform prontuarios
      for (const p of prontuarios) {
        const triage = triageMap.get(p.agendamento_id);
        const prescricaoParsed = parseJsonSafe(p.prescricao);
        const examesParsed = parseJsonSafe(p.solicitacao_exames);
        const obsParsed = parseJsonSafe(p.observacoes);
        const espFields = obsParsed?.especialidade_fields || null;

        let type: EventType = (p.tipo_registro || "consulta") as EventType;
        if (!TYPE_CONFIG[type]) type = "consulta";

        if (p.profissional_nome) profSet.add(p.profissional_nome);

        allEvents.push({
          id: `pront_${p.id}`,
          type,
          date: p.data_atendimento,
          time: p.hora_atendimento || undefined,
          professional: p.profissional_nome || "",
          professionalId: p.profissional_id,
          summary: p.queixa_principal || p.evolucao || "",
          soapSubjetivo: p.soap_subjetivo || undefined,
          soapObjetivo: p.soap_objetivo || undefined,
          soapAvaliacao: p.soap_avaliacao || undefined,
          soapPlano: p.soap_plano || undefined,
          queixaPrincipal: p.queixa_principal || undefined,
          conduta: p.conduta || undefined,
          especialidadeFields: espFields,
          prescricao: prescricaoParsed?.medicamentos ? prescricaoParsed : null,
          exames: examesParsed?.exames ? examesParsed : null,
          sinaisVitais: triage ? {
            PA: triage.pressao_arterial,
            FC: triage.frequencia_cardiaca,
            Temp: triage.temperatura,
            "SatO₂": triage.saturacao_oxigenio,
            Glicemia: triage.glicemia,
            Peso: triage.peso,
            Altura: triage.altura,
            IMC: triage.imc,
          } : undefined,
          unidade: unidadeMap.get(p.unidade_id),
          procedimentos: p.procedimentos_texto || undefined,
        });
      }

      // Faltas
      for (const a of (faltasRes.data || []) as any[]) {
        if (a.profissional_nome) profSet.add(a.profissional_nome);
        allEvents.push({
          id: `falta_${a.id}`,
          type: "falta",
          date: a.data,
          time: a.hora || undefined,
          professional: a.profissional_nome || "",
          professionalId: a.profissional_id,
          summary: "Paciente não compareceu",
          unidade: unidadeMap.get(a.unidade_id),
          status: "falta",
        });
      }

      // Sessions
      for (const s of sessions) {
        const cycle = cycleMap.get(s.cycle_id);
        allEvents.push({
          id: `session_${s.id}`,
          type: "sessao",
          date: s.scheduled_date,
          professional: "",
          professionalId: s.professional_id,
          summary: s.clinical_notes || s.procedure_done || "",
          sessionInfo: `Sessão ${s.session_number}/${s.total_sessions}`,
          unidade: cycle?.unit_id ? unidadeMap.get(cycle.unit_id) : undefined,
          status: s.status,
        });
      }

      // Discharges
      for (const d of discharges) {
        const cycle = cycleMap.get(d.cycle_id);
        allEvents.push({
          id: `alta_${d.id}`,
          type: "alta",
          date: d.discharge_date,
          professional: "",
          professionalId: d.professional_id,
          summary: [d.reason, d.final_notes].filter(Boolean).join(" — "),
        });
      }

      allEvents.sort((a, b) => {
        const dc = b.date.localeCompare(a.date);
        if (dc !== 0) return dc;
        return (b.time || "00:00").localeCompare(a.time || "00:00");
      });

      if (!cancelRef.current) {
        setEvents(allEvents);
        setProfessionals(Array.from(profSet).sort());
      }
    } catch (err) {
      console.error("[HistoricoCompleto] Erro:", err);
      if (!cancelRef.current) setError("Erro ao carregar histórico completo.");
    } finally {
      if (!cancelRef.current) setLoading(false);
    }
  }, [pacienteId, unidades]);

  useEffect(() => {
    load();
    return () => { cancelRef.current = true; };
  }, [load]);

  return { events, professionals, loading, error, reload: load };
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
  open, onOpenChange, pacienteId, pacienteNome, unidades, currentProfissionalId,
}) => {
  const { events, professionals, loading, error, reload } = useFullHistory(pacienteId, unidades);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set());
  const [filterProfissional, setFilterProfissional] = useState("todos");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      if (filterTypes.size > 0 && !filterTypes.has(ev.type)) return false;
      if (filterProfissional !== "todos" && ev.professional !== filterProfissional) return false;
      if (filterDateFrom && ev.date < filterDateFrom) return false;
      if (filterDateTo && ev.date > filterDateTo) return false;
      return true;
    });
  }, [events, filterTypes, filterProfissional, filterDateFrom, filterDateTo]);

  const toggleType = (type: string) => {
    setFilterTypes(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full max-h-[95vh] h-[95vh] p-0 gap-0 flex flex-col" aria-describedby={undefined}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b bg-card shrink-0">
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
                    <p className="text-sm text-muted-foreground">Nenhum evento encontrado.</p>
                  </div>
                )}

                {!loading && !error && filteredEvents.map(event => {
                  const config = TYPE_CONFIG[event.type] || TYPE_CONFIG.consulta;
                  const isExpanded = expandedId === event.id;
                  const isCurrent = currentProfissionalId && event.professionalId === currentProfissionalId;

                  return (
                    <div
                      key={event.id}
                      className={`border-l-4 rounded-lg bg-card shadow-sm p-3 sm:p-4 transition-shadow hover:shadow-md cursor-pointer ${config.border} ${isCurrent ? 'ring-1 ring-primary/20' : ''}`}
                      onClick={() => setExpandedId(prev => prev === event.id ? null : event.id)}
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
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={e => { e.stopPropagation(); setExpandedId(prev => prev === event.id ? null : event.id); }}>
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                      </div>

                      {isExpanded && <EventDetail event={event} />}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HistoricoCompletoModal;
