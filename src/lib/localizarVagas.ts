import { classifyTreatmentCapacitySpecialty } from "@/lib/treatmentCapacityAnalytics";

/**
 * Regras puras da busca "Localizar Vagas" da Agenda.
 * Não calcula horários: recebe o que a Agenda (getAvailableSlots) já calculou.
 */

export type DayAvailabilityState = "com_vagas" | "sem_vaga" | "nao_carregado" | "erro";

export function classifyDayAvailability(args: {
  loadError: boolean;
  dayLoaded: boolean;
  slots: readonly string[];
}): DayAvailabilityState {
  if (args.loadError) return "erro";
  if (!args.dayLoaded) return "nao_carregado";
  return args.slots.length > 0 ? "com_vagas" : "sem_vaga";
}

/** Especialidade identificável da profissão; vazio = não identificável. */
export function strictSpecialtyOf(profissao?: string | null): string | null {
  const value = String(profissao || "").trim();
  if (!value) return null;
  return classifyTreatmentCapacitySpecialty(value);
}

/**
 * Compatibilidade rigorosa (não usa a regra permissiva da Fila):
 * só é compatível quando serviço e profissão são identificáveis e iguais.
 * Se houver CBO exigido pelo serviço, o profissional precisa ter o mesmo CBO.
 */
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

export type ContinuityEstimate = "estimada_favoravel" | "comprometida" | "nao_confirmada";

/**
 * Estimativa de continuidade (nunca garantia de sessões futuras).
 * pendingUnlinked = sessões pendente_agendamento SEM appointment_id (as com vínculo já estão na Agenda).
 * null = informação não disponível.
 */
export function estimateContinuity(args: {
  freeSlotsInPeriod: number | null;
  pendingUnlinked: number | null;
  allDaysLoaded: boolean;
}): ContinuityEstimate {
  if (!args.allDaysLoaded || args.freeSlotsInPeriod === null || args.pendingUnlinked === null) return "nao_confirmada";
  if (args.freeSlotsInPeriod <= 0) return "comprometida";
  return args.pendingUnlinked >= args.freeSlotsInPeriod ? "comprometida" : "estimada_favoravel";
}

/** Conta pendentes sem vínculo por profissional; sessões já ligadas a um agendamento não contam em dobro. */
export function countUnlinkedPendingByProfessional(
  rows: ReadonlyArray<{ professional_id?: string | null; status?: string | null; appointment_id?: string | null }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== "pendente_agendamento" || r.appointment_id || !r.professional_id) continue;
    map.set(r.professional_id, (map.get(r.professional_id) || 0) + 1);
  }
  return map;
}
