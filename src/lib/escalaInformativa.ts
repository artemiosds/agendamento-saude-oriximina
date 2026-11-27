import { format } from 'date-fns';
import type { User } from '@/types';

export const MAX_DATAS_ESCALA = 90;

export interface RegistroEscala {
  id: string;
  unidade: string;
  sala: string | null;
  local_avulso?: string | null;
  profissional?: string;
  unidade_oficial?: string | null;
  local?: string;
  setor?: string | null;
  duracao?: number;
  data: string;
  inicio: string;
  fim: string;
  semanal: boolean;
  fim_recorrencia?: string | null;
  origem?: string | null;
}

export const weekdayEscala = (date: string) => new Date(date + 'T12:00:00').getDay();
export const dateKeyEscala = (date: Date) => format(date, 'yyyy-MM-dd');
export const localKeyEscala = (name: string) => 'avulso:' + name.trim().toLocaleLowerCase('pt-BR');
export const minutesEscala = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

export function durationEscala(start: string, end: string, fullDay = false) {
  if (!start || !end) return 0;
  if (fullDay) return 1440;
  return (minutesEscala(end) - minutesEscala(start) + 1440) % 1440;
}

export function registros(p: User): RegistroEscala[] {
  const rows = p.customData?.escala_informativa;
  return Array.isArray(rows) ? rows.filter(r => r &&
    typeof r.id === 'string' && typeof r.unidade === 'string' &&
    typeof r.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.data) &&
    typeof r.inicio === 'string' && typeof r.fim === 'string') : [];
}

export function primeirasDatasSemanais(datas: string[]) {
  const firstByWeekday = new Map<number, string>();
  for (const date of [...datas].sort()) {
    const weekday = weekdayEscala(date);
    if (!firstByWeekday.has(weekday)) firstByWeekday.set(weekday, date);
  }
  return [...firstByWeekday.values()];
}

/** Indexes recurrence by weekday and applies one-date exceptions without changing the original. */
export function distribuirRegistros(rows: RegistroEscala[], days: Date[]) {
  const result = new Map<string, RegistroEscala[]>();
  const daysByWeekday = new Map<number, string[]>();
  for (const day of days) {
    const key = dateKeyEscala(day);
    result.set(key, []);
    const list = daysByWeekday.get(day.getDay()) ?? [];
    list.push(key);
    daysByWeekday.set(day.getDay(), list);
  }
  const exceptions = new Set(rows.filter(r => r.origem).map(r => r.origem + '/' + r.data));
  for (const row of rows) {
    if (!row.semanal) {
      result.get(row.data)?.push(row);
      continue;
    }
    for (const day of daysByWeekday.get(weekdayEscala(row.data)) ?? []) {
      if (day >= row.data && (!row.fim_recorrencia || day <= row.fim_recorrencia) && !exceptions.has(row.id + '/' + day)) result.get(day)?.push(row);
    }
  }
  return result;
}


/** Accounting only: the displayed intervals are never changed in the Agenda. */
export function summarizeEscalaDay(entries: readonly {personId:string;hours:string;minutes:number}[]) {
  const byPerson = new Map<string, {start:number;end:number;index:number}[]>();
  const conflicts = new Set<number>();
  let rawMinutes = 0, invalid = 0, uniqueMinutes = 0;
  entries.forEach((entry,index) => {
    if (entry.minutes === 0 && !entry.hours) return;
    const intervals = entry.hours.split(',').map(part => {
      const m = /^\s*(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})\s*$/.exec(part);
      if (!m) return null;
      const valid = (t:string) => /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(t);
      if (!valid(m[1]) || !valid(m[2])) return null;
      const start = minutesEscala(m[1]), end = minutesEscala(m[2]);
      return end > start ? {start,end,index} : null;
    });
    if (!entry.personId || !Number.isFinite(entry.minutes) || entry.minutes < 0 ||
        intervals.some(interval => interval === null) ||
        intervals.reduce((sum, interval) => sum + (interval ? interval.end-interval.start : 0), 0) !== entry.minutes) {
      invalid++; return;
    }
    rawMinutes += entry.minutes;
    const list = byPerson.get(entry.personId) ?? [];
    for (const interval of intervals) if (interval) list.push(interval);
    byPerson.set(entry.personId, list);
  });
  for (const list of byPerson.values()) {
    list.sort((a,b) => a.start-b.start || a.end-b.end);
    let end = 0;
    for (let i=0;i<list.length;i++) {
      const current=list[i];
      uniqueMinutes += Math.max(0,current.end-Math.max(end,current.start));
      end=Math.max(end,current.end);
      for(let j=i+1;j<list.length && list[j].start<current.end;j++) {
        conflicts.add(current.index); conflicts.add(list[j].index);
      }
    }
  }
  return {uniqueMinutes,rawMinutes,overlapMinutes:rawMinutes-uniqueMinutes,conflicts,invalid};
}
