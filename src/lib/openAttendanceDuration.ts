export function formatOpenAttendanceDuration(minutes: number | null, date: string): string {
  const shortDate = date.slice(5, 10).split('-').reverse().join('/');
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return shortDate;
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;

  const days = Math.floor(minutes / 1440);
  const months = Math.floor(days / 30);
  const elapsed = months > 0
    ? `${months} ${months === 1 ? 'mês' : 'meses'}`
    : `${days} ${days === 1 ? 'dia' : 'dias'}`;
  return `há ${elapsed} · ${shortDate}`;
}
