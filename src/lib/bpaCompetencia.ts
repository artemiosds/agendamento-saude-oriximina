export function isBpaAttendanceInCompetence(value: unknown, competencia: string, dataEspecifica = ""): boolean {
  const date = String(value ?? "").slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match || !/^\d{4}(0[1-9]|1[0-2])$/.test(competencia)) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const checked = new Date(Date.UTC(year, month - 1, day));
  return checked.getUTCFullYear() === year && checked.getUTCMonth() + 1 === month && checked.getUTCDate() === day &&
    `${match[1]}${match[2]}` === competencia && (!dataEspecifica || date === dataEspecifica);
}
