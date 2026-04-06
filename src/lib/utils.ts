import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const BRAZIL_TIMEZONE = "America/Sao_Paulo";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a Date object as YYYY-MM-DD using America/Sao_Paulo timezone. */
export function localDateStr(date: Date): string {
  return date.toLocaleDateString("sv-SE", { timeZone: BRAZIL_TIMEZONE });
}

/** Get today's date as YYYY-MM-DD in America/Sao_Paulo timezone. */
export function todayLocalStr(): string {
  return localDateStr(new Date());
}

function parseDateParts(dateStr: string): [number, number, number] {
  const [year, month, day] = dateStr.split("-").map(Number);
  return [year, month, day];
}

/** Parse an ISO date string into a stable UTC date at noon to avoid timezone drift. */
export function dateStrToUtcDate(dateStr: string): Date {
  const [year, month, day] = parseDateParts(dateStr);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

/** Day-of-week for an ISO date string using fixed calendar semantics (0=Sun...6=Sat). */
export function isoDayOfWeek(dateStr: string): number {
  return dateStrToUtcDate(dateStr).getUTCDay();
}

/** Add days to an ISO date string and keep the result normalized to America/Sao_Paulo. */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const date = dateStrToUtcDate(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return localDateStr(date);
}

/** Current time in minutes for America/Sao_Paulo. */
export function nowMinutesInBrazil(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BRAZIL_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);

  return hour * 60 + minute;
}
