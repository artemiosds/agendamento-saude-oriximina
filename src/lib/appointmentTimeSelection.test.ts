import { describe, expect, it } from "vitest";
import { isAppointmentTimeSelectable, isTimeAfterSchedulingCutoff, isTimeWithinTurnWindow } from "./appointmentTimeSelection";

const morning = [{ horaInicio: "07:30", horaFim: "09:30" }];

describe("seleção manual de horário em disponibilidade por turno", () => {
  it.each(["07:30", "08:00", "08:45", "09:29"])("aceita %s dentro do turno", (time) => {
    expect(isTimeWithinTurnWindow(time, morning)).toBe(true);
  });

  it.each(["07:29", "09:30", "25:00", "9:00", ""])("rejeita %s fora do turno ou inválido", (time) => {
    expect(isTimeWithinTurnWindow(time, morning)).toBe(false);
  });

  it("preserva os horários da grade convencional e aceita entrada livre apenas no turno", () => {
    expect(isAppointmentTimeSelectable("10:00", ["10:00", "10:30"], [])).toBe(true);
    expect(isAppointmentTimeSelectable("10:15", ["10:00", "10:30"], [])).toBe(false);
    expect(isAppointmentTimeSelectable("08:30", ["07:30"], morning)).toBe(true);
  });

  it("não aceita horário em turno sem vaga quando outro turno ainda tem capacidade", () => {
    const turnosComVaga = [{ horaInicio: "13:00", horaFim: "17:00" }];
    expect(isAppointmentTimeSelectable("08:00", [], turnosComVaga)).toBe(false);
    expect(isAppointmentTimeSelectable("15:30", [], turnosComVaga)).toBe(true);
  });

  it("mantém a antecedência mínima de 30 minutos para agendamentos no mesmo dia", () => {
    expect(isTimeAfterSchedulingCutoff("08:31", "2026-10-01", "2026-10-01", 480)).toBe(true);
    expect(isTimeAfterSchedulingCutoff("08:30", "2026-10-01", "2026-10-01", 480)).toBe(false);
    expect(isTimeAfterSchedulingCutoff("07:30", "2026-10-02", "2026-10-01", 900)).toBe(true);
  });
});
