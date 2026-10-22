/**
 * Generates session dates based on frequency, weekdays, duration in months.
 * Supports skipping blocked dates (holidays, professional blocks, etc.)
 */

export const FREQUENCY_OPTIONS_NEW = [
  { value: '1x_semana', label: '1x por semana' },
  { value: '2x_semana', label: '2x por semana' },
  { value: '3x_semana', label: '3x por semana' },
  { value: '4x_semana', label: '4x por semana' },
  { value: '5x_semana', label: '5x por semana' },
  { value: '6x_semana', label: '6x por semana' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'manual', label: 'Manual' },
];

export const WEEKDAY_LABELS = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
];

export function getMaxWeekdays(frequency: string): number {
  switch (frequency) {
    case '1x_semana': return 1;
    case '2x_semana': return 2;
    case '3x_semana': return 3;
    case '4x_semana': return 4;
    case '5x_semana': return 5;
    case '6x_semana': return 6;
    default: return 0;
  }
}

export function isWeekdayFrequency(frequency: string): boolean {
  return ['1x_semana', '2x_semana', '3x_semana', '4x_semana', '5x_semana', '6x_semana'].includes(frequency);
}

/**
 * Calculate total sessions from duration in months + frequency + weekdays
 */
export function calculateTotalSessions(
  frequency: string,
  durationMonths: number,
  weekdays: number[],
): number {
  if (frequency === 'manual') return 1;
  if (frequency === 'mensal') return durationMonths;

  // Weekly-based: count weeks in duration * days per week
  const weeksApprox = durationMonths * 4.33;
  const daysPerWeek = weekdays.length || 1;
  return Math.round(weeksApprox * daysPerWeek);
}

export interface GenerateSessionResult {
  dates: string[];
  skippedCount: number;
}

/**
 * Check if a date string (YYYY-MM-DD) falls within any blocked range.
 */
function isDateBlocked(dateStr: string, blockedRanges: BlockedRange[]): boolean {
  for (const range of blockedRanges) {
    if (dateStr >= range.start && dateStr <= range.end) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a date string (YYYY-MM-DD) is a weekend (Saturday or Sunday).
 * Uses local timezone (date-only) to avoid UTC drift.
 */
export function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + 'T12:00:00');
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

/**
 * Centralized rule: a date is INVALID for a treatment session if it is
 * a weekend OR falls in any blocked range (holiday/professional/unit block).
 */
export function isInvalidSessionDate(dateStr: string, blockedRanges: BlockedRange[]): boolean {
  if (!dateStr) return false;
  return isWeekend(dateStr) || isDateBlocked(dateStr, blockedRanges);
}

export interface BlockedRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
}
// Bounded fallback horizon when blocks or availability shift planned dates.
const MAX_ADDITIONAL_SEARCH_DAYS = 3650;

function toDateOnlyString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date); result.setDate(result.getDate() + days); return result;
}
function addCalendarMonthsClamped(date: Date, months: number): Date {
  const result = new Date(date); const day = result.getDate(); result.setDate(1);
  result.setMonth(result.getMonth() + months);
  result.setDate(Math.min(day, new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
  return result;
}
function getSafeSearchHorizon(startDate: string, frequency: string, totalSessions: number): Date {
  const start = new Date(startDate + 'T12:00:00');
  const end = frequency === 'mensal' ? addCalendarMonthsClamped(start, totalSessions - 1)
    : addCalendarDays(start, frequency === 'manual' ? (totalSessions - 1) * 7 : totalSessions * 7);
  return addCalendarDays(end, MAX_ADDITIONAL_SEARCH_DAYS);
}
function calendarDaysInclusive(from: Date, through: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(through.getFullYear(), through.getMonth(), through.getDate());
  return Math.max(0, Math.floor((b - a) / 86400000) + 1);
}
function assertCompleteSessionPlan(dates: string[], total: number, blocked: BlockedRange[], available?: ReadonlySet<string>): void {
  if (dates.length !== total) throw new Error(`Geração incompleta: ${total} sessões previstas, mas apenas ${dates.length} datas válidas encontradas dentro do limite seguro. Confira disponibilidade, folgas e bloqueios. Nenhum plano foi salvo.`);
  const seen = new Set<string>();
  for (const date of dates) {
    if (seen.has(date) || isInvalidSessionDate(date, blocked) || (available !== undefined && !available.has(date))) {
      throw new Error('O plano contém datas repetidas, bloqueadas ou indisponíveis. Nenhum plano foi salvo.');
    }
    seen.add(date);
  }
}

/**
 * Build blocked ranges from bloqueios data for a specific professional.
 * Includes global blocks (no profissional_id) and professional-specific blocks.
 * Accepts both camelCase (DataContext shape) and snake_case (raw DB) fields.
 */
export function buildBlockedRanges(
  bloqueios: Array<any>,
  profissionalId: string,
  unidadeId?: string,
): BlockedRange[] {
  return (bloqueios || [])
    .map((b) => ({
      dataInicio: b.dataInicio || b.data_inicio || '',
      dataFim: b.dataFim || b.data_fim || b.dataInicio || b.data_inicio || '',
      profissionalId: b.profissionalId ?? b.profissional_id ?? '',
      unidadeId: b.unidadeId ?? b.unidade_id ?? '',
      diaInteiro: b.diaInteiro ?? b.dia_inteiro ?? true,
      horaInicio: b.horaInicio ?? b.hora_inicio ?? '',
    }))
    .filter((b) => {
      if (!b.dataInicio) return false;
      if (!b.diaInteiro && b.horaInicio) return false;
      const isGlobal = !b.profissionalId && !b.unidadeId;
      const isUnit = !!unidadeId && b.unidadeId === unidadeId && !b.profissionalId;
      const isProfessional = !!profissionalId && b.profissionalId === profissionalId;
      return isGlobal || isUnit || isProfessional;
    })
    .map((b) => ({ start: b.dataInicio, end: b.dataFim || b.dataInicio }));
}

/**
 * Find the next valid date on or after `current` that matches one of the given
 * weekdays and is not blocked. Advances day-by-day.
 * NOTE: Weekends (Sat/Sun) are always considered invalid for treatment sessions.
 */
function findNextValidDate(
  current: Date,
  sortedDays: number[],
  blockedRanges: BlockedRange[],
  maxAttempts: number = MAX_ADDITIONAL_SEARCH_DAYS,
  availableDates?: ReadonlySet<string>,
): { date: Date; skipped: number } | null {
  let skipped = 0;
  const d = new Date(current);
  for (let i = 0; i < maxAttempts; i++) {
    const dow = d.getDay();
    const mappedDow = dow === 0 ? 7 : dow;
    if (dow !== 0 && dow !== 6 && sortedDays.includes(mappedDow)) {
      const dateStr = toDateOnlyString(d);
      if (!isDateBlocked(dateStr, blockedRanges) && (!availableDates || availableDates.has(dateStr))) {
        return { date: new Date(d), skipped };
      }
      skipped++;
    }
    d.setDate(d.getDate() + 1);
  }
  return null;
}

/**
 * Generate session dates based on start date, frequency, weekdays, and total sessions.
 * Skips blocked dates (holidays, professional blocks).
 */
export function generateSessionDates(
  startDate: string,
  frequency: string,
  weekdays: number[],
  totalSessions: number,
  blockedRanges: BlockedRange[] = [],
): string[] {
  const result = generateSessionDatesWithInfo(startDate, frequency, weekdays, totalSessions, blockedRanges);
  return result.dates;
}

/**
 * Same as generateSessionDates but also returns how many dates were skipped due to blocks.
 */
export function generateSessionDatesWithInfo(
  startDate: string,
  frequency: string,
  weekdays: number[],
  totalSessions: number,
  blockedRanges: BlockedRange[] = [],
  availableDates?: ReadonlySet<string>,
): GenerateSessionResult {
  if (!Number.isInteger(totalSessions) || totalSessions < 1 || totalSessions > 200) {
    throw new Error('Informe entre 1 e 200 sessões inteiras.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(new Date(startDate + 'T12:00:00').getTime())) {
    throw new Error('Informe uma data inicial válida.');
  }
  const dates: string[] = [];
  const start = new Date(startDate + 'T12:00:00');
  const searchHorizon = getSafeSearchHorizon(startDate, frequency, totalSessions);
  let totalSkipped = 0;

  if (frequency === 'manual') {
    for (let i = 0; i < totalSessions; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i * 7);
      const originalDow = d.getDay() === 0 ? 7 : d.getDay();
      let shifted = false;
      if (dates.length && toDateOnlyString(d) <= dates[dates.length - 1]) {
        shifted = true;
        d.setTime(new Date(dates[dates.length - 1] + 'T12:00:00').getTime());
        d.setDate(d.getDate() + 1);
      }
      const dateStr = toDateOnlyString(d);
      if (shifted || isInvalidSessionDate(dateStr, blockedRanges) || (availableDates && !availableDates.has(dateStr))) {
        // Find next valid weekday (Mon-Fri only)
        const baseDow = originalDow;
        const targetDays = (baseDow >= 1 && baseDow <= 5) ? [baseDow] : [1, 2, 3, 4, 5];
        const valid = findNextValidDate(d, targetDays, blockedRanges, calendarDaysInclusive(d, searchHorizon), availableDates);
        if (valid) {
          dates.push(toDateOnlyString(valid.date));
          totalSkipped += Math.max(1, valid.skipped);
        } else {
          throw new Error('Não foi possível gerar todas as sessões em datas válidas. Confira a disponibilidade da agenda. Nenhum plano foi salvo.');
        }
      } else {
        dates.push(dateStr);
      }
    }
    assertCompleteSessionPlan(dates, totalSessions, blockedRanges, availableDates);
    return { dates, skippedCount: totalSkipped };
  }

  if (frequency === 'mensal') {
    for (let i = 0; i < totalSessions; i++) {
      const d = addCalendarMonthsClamped(start, i);
      const originalDow = d.getDay() === 0 ? 7 : d.getDay();
      let shifted = false;
      if (dates.length && toDateOnlyString(d) <= dates[dates.length - 1]) {
        shifted = true;
        d.setTime(new Date(dates[dates.length - 1] + 'T12:00:00').getTime());
        d.setDate(d.getDate() + 1);
      }
      const dateStr = toDateOnlyString(d);
      if (shifted || isInvalidSessionDate(dateStr, blockedRanges) || (availableDates && !availableDates.has(dateStr))) {
        const baseDow = originalDow;
        const targetDays = (baseDow >= 1 && baseDow <= 5) ? [baseDow] : [1, 2, 3, 4, 5];
        const valid = findNextValidDate(d, targetDays, blockedRanges, calendarDaysInclusive(d, searchHorizon), availableDates);
        if (valid) {
          dates.push(toDateOnlyString(valid.date));
          totalSkipped += Math.max(1, valid.skipped);
        } else {
          throw new Error('Não foi possível gerar todas as sessões em datas válidas. Confira a disponibilidade da agenda. Nenhum plano foi salvo.');
        }
      } else {
        dates.push(dateStr);
      }
    }
    assertCompleteSessionPlan(dates, totalSessions, blockedRanges, availableDates);
    return { dates, skippedCount: totalSkipped };
  }

  // Weekly-based: iterate day by day from start, pick matching weekdays
  if (weekdays.length === 0) {
    weekdays = [start.getDay() === 0 ? 1 : start.getDay()];
  }

  // Filter out weekends from requested weekdays (Sat=6, Sun=7)
  const sortedDays = [...weekdays].filter((d) => d >= 1 && d <= 5).sort((a, b) => a - b);
  if (sortedDays.length === 0) sortedDays.push(1, 2, 3, 4, 5);

  const current = new Date(start);
  let count = 0;
  const maxIterations = calendarDaysInclusive(current, searchHorizon);
  let iter = 0;

  while (count < totalSessions && iter < maxIterations) {
    const dow = current.getDay();
    const mappedDow = dow === 0 ? 7 : dow;
    if (dow !== 0 && dow !== 6 && sortedDays.includes(mappedDow)) {
      const dateStr = toDateOnlyString(current);
      if (!isDateBlocked(dateStr, blockedRanges) && (!availableDates || availableDates.has(dateStr))) {
        dates.push(dateStr);
        count++;
      } else {
        totalSkipped++;
      }
    }
    current.setDate(current.getDate() + 1);
    iter++;
  }

  if (dates.length !== totalSessions) {
    throw new Error(`Geração incompleta: ${totalSessions} sessões previstas, mas apenas ${dates.length} datas disponíveis. Confira a disponibilidade da agenda. Nenhum plano foi salvo.`);
  }
  assertCompleteSessionPlan(dates, totalSessions, blockedRanges, availableDates);
  return { dates, skippedCount: totalSkipped };
}

/**
 * Calculate predicted end date
 */
export function calcEndDateFromSessions(sessionDates: string[]): string {
  if (sessionDates.length === 0) return new Date().toISOString().split('T')[0];
  return sessionDates[sessionDates.length - 1];
}
