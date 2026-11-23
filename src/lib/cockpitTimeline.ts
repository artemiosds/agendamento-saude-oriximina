import { cockpitDay } from './unitCockpit';

export type TimelineAppointment = { id: string; paciente_id: string; profissional_id: string; sala_id: string; iniciado_em: string | null };
export type TimelineQueue = { id: string; paciente_id: string; unidade_id: string; hora_chegada: string };
export type TimelineAttendance = {
  id: string; agendamento_id: string; paciente_id: string; profissional_id: string; unidade_id: string;
  data: string; sala_id: string; hora_inicio: string; criado_em: string | null;
};

/** The network's operational clock is UTC-3. Never use scheduled appointment time as arrival. */
export function cockpitRecordedTime(day: string, hour: string | null | undefined) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !hour || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(hour.trim())) return null;
  const value = `${day}T${hour.trim().length === 5 ? hour.trim() + ':00' : hour.trim()}-03:00`;
  return Number.isFinite(Date.parse(value)) && cockpitDay(Date.parse(value)) === day ? value : null;
}

export function cockpitTimeline<T extends TimelineAppointment>(rows: T[], queue: TimelineQueue[], attendances: TimelineAttendance[], unit: string, day: string) {
  const byId = new Map(rows.map(row => [row.id, row]));
  const arrivals: Record<string, string> = {};
  const starts: Record<string, string> = {};
  const byAppointment = new Map<string, TimelineAttendance[]>();
  for (const entry of queue) {
    const row = byId.get(entry.id);
    if (!row || entry.unidade_id !== unit || entry.paciente_id !== row.paciente_id) continue;
    const time = cockpitRecordedTime(day, entry.hora_chegada);
    if (time) arrivals[row.id] = time;
  }
  for (const entry of attendances) {
    const row = byId.get(entry.agendamento_id);
    if (!row || entry.unidade_id !== unit || entry.data !== day || entry.paciente_id !== row.paciente_id || entry.profissional_id !== row.profissional_id) continue;
    const list = byAppointment.get(row.id) ?? [];
    list.push(entry);
    byAppointment.set(row.id, list);
  }
  const mapped = rows.map(row => {
    const matching = byAppointment.get(row.id) ?? [];
    const times = matching.map(entry => cockpitRecordedTime(entry.data, entry.hora_inicio))
      .filter((value): value is string => !!value).sort((a, b) => Date.parse(a) - Date.parse(b));
    const start = row.iniciado_em || times[0];
    if (start && Number.isFinite(Date.parse(start))) starts[row.id] = start;
    // A recorded attendance can identify a room. Conflicting locations remain unresolved.
    const rooms = [...new Set(matching.map(entry => entry.sala_id).filter(Boolean))];
    return !row.sala_id && rooms.length === 1 ? { ...row, sala_id: rooms[0] } : row;
  });
  return { rows: mapped, arrivals, starts };
}
