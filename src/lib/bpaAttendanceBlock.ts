/** Visual BPA selection only. Uses the Agenda's per-day block boundaries. */
export const UNKNOWN_BPA_BLOCK = "sem_bloco";
export interface BpaAvailability {
  id: string; profissional_id: string; unidade_id: string; sala_id?: string | null;
  data_inicio: string; data_fim: string; dias_semana: number[];
  hora_inicio: string; hora_fim: string; vagas_por_hora: number;
}
export interface BpaBlock { key: string; label: string; unit: string; start: string; end: string }
export function describeBpaBlock(d: BpaAvailability, names: Map<string, string>): BpaBlock {
  const start = d.hora_inicio.slice(0, 5), end = d.hora_fim.slice(0, 5);
  const period = start < "12:00" ? "Manhã" : start < "18:00" ? "Tarde" : "Noite";
  const rawName = names.get(d.sala_id || "") || d.sala_id || period;
  const name = rawName.replace(/^(manhã|manha|tarde|noite)\s*[-–—•:]\s*/i, "").trim() || period;
  return { key: JSON.stringify([d.unidade_id, name.toLocaleUpperCase("pt-BR"), start, end]),
    label: `${period}${name === period ? "" : ` — ${name}`} · ${start} às ${end}`,
    unit: d.unidade_id, start, end };
}
export function bpaAvailabilityOnDate(d: BpaAvailability, date: string): boolean {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d.vagas_por_hora === 0 && date >= d.data_inicio && date <= d.data_fim && d.dias_semana.includes(weekday);
}
export function resolveBpaAppointmentBlock(a: any, availability: BpaAvailability[], names: Map<string, string>): string {
  const date = String(a?.data || "").slice(0, 10), hour = String(a?.hora || "").slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(hour)) return UNKNOWN_BPA_BLOCK;
  const day = availability.filter(d => d.profissional_id === a.profissional_id && d.unidade_id === a.unidade_id && bpaAvailabilityOnDate(d, date))
    .sort((x, y) => x.hora_inicio.localeCompare(y.hora_inicio));
  if (!day.length) return UNKNOWN_BPA_BLOCK;
  // Agenda allocates before the first start to the first block, and each block
  // until the next start. Identical starts with conflicting labels are ambiguous.
  const starts = [...new Set(day.map(d => d.hora_inicio.slice(0, 5)))];
  const start = [...starts].reverse().find(s => hour >= s) || starts[0];
  const keys = new Set(day.filter(d => d.hora_inicio.slice(0, 5) === start).map(d => describeBpaBlock(d, names).key));
  return keys.size === 1 ? [...keys][0] : UNKNOWN_BPA_BLOCK;
}
export function createBpaAttendanceBlockResolver(appointments: any[], availability: BpaAvailability[], names: Map<string, string>) {
  const byId = new Map(appointments.map(a => [String(a.id), a]));
  const key = (p: any, date: any) => `${p.paciente_id}|${p.profissional_id}|${p.unidade_id}|${String(date || "").slice(0, 10)}`;
  const byEncounter = new Map<string, any[]>();
  for (const a of appointments) { const k = key(a, a.data); const rows = byEncounter.get(k) || []; rows.push(a); byEncounter.set(k, rows); }
  return (p: any): string => {
    if (p.agendamento_id) {
      const a = byId.get(String(p.agendamento_id));
      // A stale/broken explicit link must never fall through to another encounter.
      if (!a || a.paciente_id !== p.paciente_id || a.unidade_id !== p.unidade_id ||
          (p.tipo_registro !== "triagem" && a.profissional_id !== p.profissional_id) ||
          String(a.data).slice(0, 10) !== String(p.data_atendimento).slice(0, 10)) return UNKNOWN_BPA_BLOCK;
      return resolveBpaAppointmentBlock(a, availability, names);
    }
    const candidates = byEncounter.get(key(p, p.data_atendimento)) || [];
    // Never guess between two appointments for the same patient/day.
    return candidates.length === 1 ? resolveBpaAppointmentBlock(candidates[0], availability, names) : UNKNOWN_BPA_BLOCK;
  };
}

/** Empty selection means all blocks; keys are opaque and never split on names. */
export function toggleBpaBlockSelection(selected: string[], key: string): string[] {
  return selected.includes(key) ? selected.filter(k => k !== key) : [...new Set([...selected, key])];
}

/** Union in source order, with each record visited once (no duplicated production). */
export function filterBpaAttendanceBlocks<T>(records: T[], selected: string[], resolveBlock: (record: T) => string): T[] {
  if (selected.length === 0) return records;
  const keys = new Set(selected);
  return records.filter(record => keys.has(resolveBlock(record)));
}
