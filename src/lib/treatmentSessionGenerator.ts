/**
 * Generates session dates based on frequency, weekdays, duration in months.
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

/**
 * Generate session dates based on start date, frequency, weekdays, and total sessions.
 */
export function generateSessionDates(
  startDate: string,
  frequency: string,
  weekdays: number[],
  totalSessions: number,
): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + 'T12:00:00');

  if (frequency === 'manual') {
    // Just one date at start
    for (let i = 0; i < totalSessions; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i * 7);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  }

  if (frequency === 'mensal') {
    for (let i = 0; i < totalSessions; i++) {
      const d = new Date(start);
      d.setMonth(d.getMonth() + i);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  }

  // Weekly-based: iterate day by day from start, pick matching weekdays
  if (weekdays.length === 0) {
    // fallback: use start day's weekday
    weekdays = [start.getDay() === 0 ? 1 : start.getDay()];
  }

  const sortedDays = [...weekdays].sort((a, b) => a - b);
  const current = new Date(start);
  let count = 0;
  const maxIterations = totalSessions * 30; // safety
  let iter = 0;

  while (count < totalSessions && iter < maxIterations) {
    const dow = current.getDay();
    // JS: 0=Sun, 1=Mon... our labels: 1=Mon, 6=Sat
    if (sortedDays.includes(dow === 0 ? 7 : dow)) {
      dates.push(current.toISOString().split('T')[0]);
      count++;
    }
    current.setDate(current.getDate() + 1);
    iter++;
  }

  return dates;
}

/**
 * Calculate predicted end date
 */
export function calcEndDateFromSessions(sessionDates: string[]): string {
  if (sessionDates.length === 0) return new Date().toISOString().split('T')[0];
  return sessionDates[sessionDates.length - 1];
}
