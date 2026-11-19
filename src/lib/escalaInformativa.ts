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
      if (day >= row.data && !exceptions.has(row.id + '/' + day)) result.get(day)?.push(row);
    }
  }
  return result;
}
