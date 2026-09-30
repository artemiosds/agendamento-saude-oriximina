export interface AppointmentTurnWindow {
  horaInicio: string;
  horaFim: string;
}

function toMinutes(value: string): number | null {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value);
  if (!match) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Turno é um intervalo; horários digitados nele não precisam ser iguais ao início. */
export function isTimeWithinTurnWindow(
  value: string,
  windows: readonly AppointmentTurnWindow[],
): boolean {
  const minutes = toMinutes(value);
  if (minutes === null) return false;
  return windows.some((window) => {
    const start = toMinutes(window.horaInicio);
    const end = toMinutes(window.horaFim);
    return start !== null && end !== null && minutes >= start && minutes < end;
  });
}

export function isTimeAfterSchedulingCutoff(
  value: string,
  date: string,
  today: string,
  currentMinutes: number,
  leadMinutes = 30,
): boolean {
  if (date !== today) return toMinutes(value) !== null;
  const minutes = toMinutes(value);
  return minutes !== null && minutes > currentMinutes + leadMinutes;
}

export function isAppointmentTimeSelectable(
  value: string,
  availableSlots: readonly string[],
  turnWindows: readonly AppointmentTurnWindow[],
): boolean {
  return availableSlots.includes(value) || isTimeWithinTurnWindow(value, turnWindows);
}
