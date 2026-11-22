export interface SchedulingWindow {
  profissional_id: string;
  unidade_id: string;
  data_inicio: string;
  data_fim: string;
  dias_semana: number[];
  hora_inicio: string;
  hora_fim: string;
  vagas_por_hora: number;
  vagas_por_dia: number;
  duracao_consulta: number | null;
}

interface SchedulingBlock {
  profissional_id: string | null;
  unidade_id: string | null;
  data_inicio: string;
  data_fim: string;
  dia_inteiro: boolean;
  hora_inicio: string | null;
  hora_fim: string | null;
}

interface SchedulingAppointment {
  profissional_id: string;
  unidade_id: string;
  data: string;
  hora: string;
  origem: string | null;
}

export function addSchedulingDays(date: string, days: number): string {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function buildPublicAvailability(input: {
  from: string;
  to: string;
  windows: SchedulingWindow[];
  blocks: SchedulingBlock[];
  appointments: SchedulingAppointment[];
  onlineLimit: number;
}) {
  const dayKey = (professional: string, date: string) => JSON.stringify([professional, date]);
  const onlineByDay = new Map<string, number>();
  const internalByDay = new Map<string, SchedulingAppointment[]>();
  for (const appointment of input.appointments) {
    const key = dayKey(appointment.profissional_id, appointment.data);
    if (appointment.origem === "online") onlineByDay.set(key, (onlineByDay.get(key) ?? 0) + 1);
    if (appointment.origem !== "externo") {
      if (!internalByDay.has(key)) internalByDay.set(key, []);
      internalByDay.get(key)!.push(appointment);
    }
  }

  // Use the shape consumed by the public calendar, with one synthetic row per bookable slot.
  // Never copy row IDs, original windows, capacity values, closures or bookings to the response.
  const slots = [];
  for (const window of input.windows) {
    const start = toMinutes(window.hora_inicio);
    const end = toMinutes(window.hora_fim);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 1440 || start >= end) continue;

    const byShift = !window.vagas_por_hora;
    const duration = Math.max(1, window.duracao_consulta || 30);
    const firstDate = window.data_inicio > input.from ? window.data_inicio : input.from;
    const lastDate = window.data_fim < input.to ? window.data_fim : input.to;
    for (let date = firstDate; date <= lastDate; date = addSchedulingDays(date, 1)) {
      const weekday = new Date(date + "T12:00:00Z").getUTCDay();
      if (!window.dias_semana.includes(weekday)) continue;
      const key = dayKey(window.profissional_id, date);
      if ((onlineByDay.get(key) ?? 0) >= input.onlineLimit) continue;
      const appointments = (internalByDay.get(key) ?? []).filter(a => a.unidade_id === window.unidade_id);
      const inWindow = (time: string) => toMinutes(time) >= start && toMinutes(time) < end;
      const dayCount = byShift ? appointments.filter(a => inWindow(a.hora)).length : appointments.length;
      if (dayCount >= window.vagas_por_dia) continue;
      const blocks = input.blocks.filter(b => date >= b.data_inicio && date <= b.data_fim &&
        (b.profissional_id ? b.profissional_id === window.profissional_id : !b.unidade_id || b.unidade_id === window.unidade_id));
      if (blocks.some(b => b.dia_inteiro || !b.hora_inicio)) continue;
      const sameDayWindows = input.windows.filter(w => w !== window &&
        w.profissional_id === window.profissional_id && w.unidade_id === window.unidade_id &&
        date >= w.data_inicio && date <= w.data_fim && w.dias_semana.includes(weekday));

      for (let minute = start; byShift ? minute === start : minute + duration <= end; minute += duration) {
        const time = formatTime(minute);
        if (blocks.some(b => time >= b.hora_inicio!.slice(0, 5) && time < (b.hora_fim || "23:59").slice(0, 5))) continue;
        if (sameDayWindows.some(w => minute >= toMinutes(w.hora_inicio) && minute < toMinutes(w.hora_fim))) continue;
        if (!byShift && (appointments.some(a => a.hora.slice(0, 5) === time) ||
          appointments.filter(a => a.hora.slice(0, 2) === time.slice(0, 2)).length >= window.vagas_por_hora)) continue;
        slots.push({
          id: JSON.stringify([window.profissional_id, window.unidade_id, date, time]),
          profissional_id: window.profissional_id,
          unidade_id: window.unidade_id,
          data_inicio: date,
          data_fim: date,
          dias_semana: [weekday],
          hora_inicio: time,
          hora_fim: formatTime(minute + 1),
          vagas_por_hora: 0,
          vagas_por_dia: 1,
          duracao_consulta: 1,
        });
      }
    }
  }
  return slots;
}
