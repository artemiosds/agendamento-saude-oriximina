/**
 * Generates session dates based on frequency, weekdays, duration in months.
 * Supports skipping blocked dates (holidays, professional blocks, etc.)
 */

export const FREQUENCY_OPTIONS_NEW = [
  { value: '1x_semana', label: '1x por semana' },
  { value: '2x_semana', label: '2x por semana' },
  { value: '3x_semana', label: '3x por semana' },
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
    default: return 0;
  }
}

export function isWeekdayFrequency(frequency: string): boolean {
  return ['1x_semana', '2x_semana', '3x_semana'].includes(frequency);
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
    }))
    .filter((b) => {
      if (!b.dataInicio) return false;
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
  maxAttempts: number = 365,
): { date: Date; skipped: number } | null {
  let skipped = 0;
  const d = new Date(current);
  for (let i = 0; i < maxAttempts; i++) {
    const dow = d.getDay();
    const mappedDow = dow === 0 ? 7 : dow;
    if (dow !== 0 && dow !== 6 && sortedDays.includes(mappedDow)) {
      const dateStr = d.toISOString().split('T')[0];
      if (!isDateBlocked(dateStr, blockedRanges)) {
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
): GenerateSessionResult {
  const dates: string[] = [];
  const start = new Date(startDate + 'T12:00:00');
  let totalSkipped = 0;

  if (frequency === 'manual') {
    for (let i = 0; i < totalSessions; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i * 7);
      const dateStr = d.toISOString().split('T')[0];
      if (isDateBlocked(dateStr, blockedRanges)) {
        // Find next valid weekday
        const valid = findNextValidDate(d, [d.getDay() === 0 ? 7 : d.getDay()], blockedRanges);
        if (valid) {
          dates.push(valid.date.toISOString().split('T')[0]);
          totalSkipped += valid.skipped;
        } else {
          dates.push(dateStr); // fallback
        }
      } else {
        dates.push(dateStr);
      }
    }
    return { dates, skippedCount: totalSkipped };
  }

  if (frequency === 'mensal') {
    for (let i = 0; i < totalSessions; i++) {
      const d = new Date(start);
      d.setMonth(d.getMonth() + i);
      const dateStr = d.toISOString().split('T')[0];
      if (isDateBlocked(dateStr, blockedRanges)) {
        const dow = d.getDay() === 0 ? 7 : d.getDay();
        const valid = findNextValidDate(d, [dow], blockedRanges);
        if (valid) {
          dates.push(valid.date.toISOString().split('T')[0]);
          totalSkipped += valid.skipped;
        } else {
          dates.push(dateStr);
        }
      } else {
        dates.push(dateStr);
      }
    }
    return { dates, skippedCount: totalSkipped };
  }

  // Weekly-based: iterate day by day from start, pick matching weekdays
  if (weekdays.length === 0) {
    weekdays = [start.getDay() === 0 ? 1 : start.getDay()];
  }

  const sortedDays = [...weekdays].sort((a, b) => a - b);
  const current = new Date(start);
  let count = 0;
  const maxIterations = totalSessions * 60; // increased safety margin for skips
  let iter = 0;

  while (count < totalSessions && iter < maxIterations) {
    const dow = current.getDay();
    const mappedDow = dow === 0 ? 7 : dow;
    if (sortedDays.includes(mappedDow)) {
      const dateStr = current.toISOString().split('T')[0];
      if (!isDateBlocked(dateStr, blockedRanges)) {
        dates.push(dateStr);
        count++;
      } else {
        totalSkipped++;
      }
    }
    current.setDate(current.getDate() + 1);
    iter++;
  }

  return { dates, skippedCount: totalSkipped };
}

/**
 * Calculate predicted end date
 */
export function calcEndDateFromSessions(sessionDates: string[]): string {
  if (sessionDates.length === 0) return new Date().toISOString().split('T')[0];
  return sessionDates[sessionDates.length - 1];
}
