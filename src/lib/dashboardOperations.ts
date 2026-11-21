import { BRAZIL_TIMEZONE } from './utils';

export const FINISHED = new Set(['concluido', 'finalizado', 'atendido', 'atendimento_encerrado', 'prontuario_finalizado']);
export const ARRIVED = new Set(['confirmado_chegada', 'chegada_confirmada', 'aguardando_triagem', 'triagem_concluida', 'aguardando_enfermagem', 'aguardando_atendimento', 'apto_atendimento', 'chamado', 'em_atendimento']);
export const CANCELLED = new Set(['cancelado', 'cancelada', 'excluido', 'removido', 'inativo', 'remarcado']);
const ABSENT = new Set(['falta', 'faltou']);
export const QUEUE_ALERT_THRESHOLD = 10;
const START = 7 * 60;
const END = 18 * 60;
const BUCKET_SIZE = 60;

type Appointment = { id: string; hora: string; status: string; iniciado_em?: string | null };

const minuteOfDay = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};
const hourLabel = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}h${String(minutes % 60).padStart(2, '0')}`;

export function getDashboardOperations(rows: readonly Appointment[], attendanceIds: ReadonlySet<string>, waiting: number, now: Date, today: string) {
  const localTime = new Intl.DateTimeFormat('en-GB', { timeZone: BRAZIL_TIMEZONE, timeStyle: 'short' }).format(now);
  const clock = minuteOfDay(localTime);
  const sameShift = (minute: number) => (minute < 720 ? 0 : minute < END ? 1 : 2) === (clock < 720 ? 0 : clock < END ? 1 : 2);
  const load = Array.from({ length: (END - START) / BUCKET_SIZE }, (_, index) => {
    const from = START + index * BUCKET_SIZE;
    return { label: hourLabel(from), range: `${hourLabel(from)} às ${hourLabel(from + BUCKET_SIZE)}`, scheduled: 0, present: 0 };
  });
  let considered = 0;
  let absent = 0;
  let over90 = 0;
  for (const row of rows) {
    if (CANCELLED.has(row.status)) continue;
    const minute = minuteOfDay(row.hora || '');
    if (minute >= START && minute < END) {
      const bucket = load[Math.floor((minute - START) / BUCKET_SIZE)];
      bucket.scheduled++;
      if (ARRIVED.has(row.status) || (FINISHED.has(row.status) && row.status !== 'atendimento_encerrado') || attendanceIds.has(row.id)) bucket.present++;
    }
    if (minute <= clock && sameShift(minute)) {
      considered++;
      if (ABSENT.has(row.status)) absent++;
    }
    if (row.status === 'em_atendimento') {
      const started = row.iniciado_em ?? `${today}T${row.hora?.slice(0, 5)}:00-03:00`;
      if (now.getTime() - Date.parse(started) > 90 * 60_000) over90++;
    }
  }
  const rate = considered ? 100 * absent / considered : 0;
  const peak = load.reduce((highest, bucket) => bucket.scheduled > highest.scheduled ? bucket : highest);
  if (over90) return { load, peak, absent, label: 'Gargalo identificado', tone: 'critical', summary: `${over90} em atendimento há mais de 90 min no plantão de hoje.` } as const;
  if (waiting >= QUEUE_ALERT_THRESHOLD) return { load, peak, absent, label: 'Atenção operacional', tone: 'warning', summary: `${waiting} na fila de espera de hoje · patamar de atenção de ${QUEUE_ALERT_THRESHOLD}.` } as const;
  if (rate > 10) return { load, peak, absent, label: 'Atenção operacional', tone: 'warning', summary: `${rate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% de faltas registradas nos horários decorridos do turno atual.` } as const;
  return { load, peak, absent, label: 'Operação fluida', tone: 'normal', summary: 'Sem alerta de fila, faltas ou atendimento prolongado no recorte atual.' } as const;
}
