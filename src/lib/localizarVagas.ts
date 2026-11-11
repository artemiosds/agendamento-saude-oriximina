import { classifyTreatmentCapacitySpecialty } from "@/lib/treatmentCapacityAnalytics";

/**
 * Regras puras da busca "Localizar Vagas" da Agenda.
 * Não calcula horários: recebe o que a Agenda (getAvailableSlots) já calculou.
 */

export type DayAvailabilityState = "com_vagas" | "sem_vaga" | "nao_carregado" | "erro";

export function classifyDayAvailability(args: { loadError: boolean; dayLoaded: boolean; slots: readonly string[] }): DayAvailabilityState {
  if (args.loadError) return "erro";
  if (!args.dayLoaded) return "nao_carregado";
  return args.slots.length > 0 ? "com_vagas" : "sem_vaga";
}

/** Especialidades efetivamente reconhecidas pelo classificador oficial. */
export const KNOWN_SPECIALTIES = [
  "Fisioterapia", "Fonoaudiologia", "Psicologia", "Nutrição", "Serviço Social", "Enfermagem", "Medicina", "Odontologia",
] as const;
const KNOWN = new Set<string>(KNOWN_SPECIALTIES);

/** Especialidade reconhecida; nome não reconhecido = null (nunca compatível consigo mesmo). */
export function strictSpecialtyOf(profissao?: string | null): string | null {
  const value = String(profissao || "").trim();
  if (!value) return null;
  const s = classifyTreatmentCapacitySpecialty(value);
  return s && KNOWN.has(s) ? s : null;
}

export function isStrictlyCompatible(
  service: string,
  profissao?: string | null,
  options: { requiredCbo?: string | null; professionalCbo?: string | null } = {},
): boolean {
  const s = strictSpecialtyOf(service);
  const p = strictSpecialtyOf(profissao);
  if (!s || !p || s !== p) return false;
  const req = String(options.requiredCbo || "").trim();
  if (req) return String(options.professionalCbo || "").trim() === req;
  return true;
}

/** Situação geral do cartão: só diz "sem vaga" quando todos os dias foram confirmados. */
export type CardAvailability = "avaliacao_disponivel" | "sem_vaga_periodo" | "nao_confirmada";
export function classifyCardAvailability(states: readonly DayAvailabilityState[]): CardAvailability {
  if (states.includes("com_vagas")) return "avaliacao_disponivel";
  if (states.length === 0 || states.some((s) => s === "erro" || s === "nao_carregado")) return "nao_confirmada";
  return "sem_vaga_periodo";
}

export const ACTIVE_CYCLE_STATUSES = ["em_andamento"] as const;

export interface PendingSessionRow {
  status?: string | null;
  appointment_id?: string | null;
  scheduled_date?: string | null;
  professional_id?: string | null;
  cycle_status?: string | null;
  unit_id?: string | null;
}

export interface PendingBreakdown { semData: number; noPeriodo: number; aposPeriodo: number; vencidas: number; total: number }
const emptyBreakdown = (): PendingBreakdown => ({ semData: 0, noPeriodo: 0, aposPeriodo: 0, vencidas: 0, total: 0 });

function isCountablePending(r: PendingSessionRow): boolean {
  return r.status === "pendente_agendamento" && !r.appointment_id
    && (ACTIVE_CYCLE_STATUSES as readonly string[]).includes(String(r.cycle_status || ""));
}

function addTo(b: PendingBreakdown, r: PendingSessionRow, start: string, end: string) {
  const d = String(r.scheduled_date || "").slice(0, 10);
  if (!d) b.semData++;
  else if (d < start) b.vencidas++;
  else if (d <= end) b.noPeriodo++;
  else b.aposPeriodo++;
  b.total++;
}

/** Pendentes sem vínculo, de ciclos ativos, por chave profissional|unidade (unidade do ciclo). */
export function breakdownPendingByProfessionalUnit(rows: readonly PendingSessionRow[], start: string, end: string): Map<string, PendingBreakdown> {
  const map = new Map<string, PendingBreakdown>();
  for (const r of rows) {
    if (!isCountablePending(r) || !r.professional_id) continue;
    const key = `${r.professional_id}|${r.unit_id || ""}`;
    const b = map.get(key) || emptyBreakdown();
    addTo(b, r, start, end);
    map.set(key, b);
  }
  return map;
}

/** Mantido por compatibilidade: total por profissional (sem filtro de ciclo). */
export function countUnlinkedPendingByProfessional(rows: ReadonlyArray<{ professional_id?: string | null; status?: string | null; appointment_id?: string | null }>): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== "pendente_agendamento" || r.appointment_id || !r.professional_id) continue;
    map.set(r.professional_id, (map.get(r.professional_id) || 0) + 1);
  }
  return map;
}

export type ContinuityEstimate = "estimada_favoravel" | "comprometida" | "nao_confirmada";

export interface ContinuityResult {
  estimate: ContinuityEstimate;
  /** Demanda do período (com data no período + vencidas) que não cabe nos horários livres. */
  naoDistribuivel: number | null;
  /** Pendências sem data: não entram na conta, mostradas à parte. */
  semData: number | null;
}

/**
 * Estimativa (nunca garantia). Só é calculada com todos os dias confirmados e pendências disponíveis.
 * Compara apenas a demanda que precisa caber NO período (datadas no período + vencidas);
 * sessões sem data e após o período são informadas separadamente.
 */
export function estimateContinuity(args: { freeSlotsInPeriod: number | null; pending: PendingBreakdown | null; allDaysLoaded: boolean }): ContinuityResult {
  if (!args.allDaysLoaded || args.freeSlotsInPeriod === null || !args.pending) {
    return { estimate: "nao_confirmada", naoDistribuivel: null, semData: args.pending ? args.pending.semData : null };
  }
  const demanda = args.pending.noPeriodo + args.pending.vencidas;
  const naoDistribuivel = Math.max(0, demanda - args.freeSlotsInPeriod);
  const estimate: ContinuityEstimate = args.freeSlotsInPeriod <= 0 || naoDistribuivel > 0 || demanda >= args.freeSlotsInPeriod ? "comprometida" : "estimada_favoravel";
  return { estimate, naoDistribuivel, semData: args.pending.semData };
}

/** Totais por unidade x especialidade (sem nomes de pacientes). */
export function totalsByUnitSpecialty(items: ReadonlyArray<{ unitId: string; specialty: string; pending: PendingBreakdown | null }>): { unitId: string; specialty: string; total: PendingBreakdown | null }[] {
  const map = new Map<string, { unitId: string; specialty: string; total: PendingBreakdown | null }>();
  for (const it of items) {
    const key = `${it.unitId}|${it.specialty}`;
    const cur = map.get(key) || { unitId: it.unitId, specialty: it.specialty, total: emptyBreakdown() };
    if (!it.pending || !cur.total) cur.total = null;
    else for (const k of Object.keys(cur.total) as (keyof PendingBreakdown)[]) cur.total[k] += it.pending[k];
    map.set(key, cur);
  }
  return [...map.values()];
}
