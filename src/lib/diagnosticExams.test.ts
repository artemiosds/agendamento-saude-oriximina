import { describe, expect, it } from "vitest";
import {
  canTransitionDiagnosticExam,
  getAvailableDiagnosticSlots,
  getDiagnosticRoomConfig,
  isDiagnosticAppointment,
  normalizeDiagnosticRoomConfig,
} from "./diagnosticExams";

describe("diagnostic room configuration", () => {
  it("keeps ordinary rooms disabled by default", () => {
    expect(getDiagnosticRoomConfig({}, "room-1")).toBeNull();
  });

  it("reads room configuration from unit custom_data without replacing other metadata", () => {
    const config = getDiagnosticRoomConfig({
      cnes: "1234567",
      salas_exames: {
        "room-1": { finalidade: "aparelho_diagnostico", tipoExame: "Tomografia", duracaoSlot: 30 },
      },
    }, "room-1");
    expect(config?.tipoExame).toBe("Tomografia");
    expect(config?.duracaoSlot).toBe(30);
  });

  it("normalizes invalid slot durations and unsafe values", () => {
    expect(normalizeDiagnosticRoomConfig({ finalidade: "aparelho_diagnostico", duracaoSlot: 13 }).duracaoSlot).toBe(15);
    expect(normalizeDiagnosticRoomConfig({ exigePreparo: "yes", exigeContraste: "maybe" })).toMatchObject({
      exigePreparo: false,
      exigeContraste: "nao",
    });
  });
});

describe("diagnostic slots", () => {
  const config = normalizeDiagnosticRoomConfig({
    finalidade: "aparelho_diagnostico",
    duracaoSlot: 30,
    horarioInicio: "08:00",
    horarioFim: "10:00",
  });

  it("generates slots based on device duration", () => {
    expect(getAvailableDiagnosticSlots(config, [])).toEqual(["08:00", "08:30", "09:00", "09:30"]);
  });

  it("blocks overlapping occupied slots and frees cancelled slots", () => {
    expect(getAvailableDiagnosticSlots(config, [
      { id: "a", hora: "08:30", status: "confirmado", custom_data: { duracao_slot_minutos: 30 } },
      { id: "b", hora: "09:00", status: "cancelado", custom_data: { duracao_slot_minutos: 30 } },
    ])).toEqual(["08:00", "09:00", "09:30"]);
  });

  it("recognizes only exam appointments tagged as diagnostic-room bookings", () => {
    expect(isDiagnosticAppointment({ tipo: "exame", custom_data: { sala_tipo: "aparelho_diagnostico" } })).toBe(true);
    expect(isDiagnosticAppointment({ tipo: "consulta", custom_data: { sala_tipo: "aparelho_diagnostico" } })).toBe(false);
  });
});

describe("diagnostic status workflow", () => {
  it("allows only forward transitions and no changes after release", () => {
    expect(canTransitionDiagnosticExam("agendado", "paciente_chegou")).toBe(true);
    expect(canTransitionDiagnosticExam("paciente_chegou", "exame_realizado_em_laudo")).toBe(true);
    expect(canTransitionDiagnosticExam("exame_realizado_em_laudo", "laudo_liberado")).toBe(true);
    expect(canTransitionDiagnosticExam("agendado", "laudo_liberado")).toBe(false);
    expect(canTransitionDiagnosticExam("laudo_liberado", "cancelado")).toBe(false);
  });
});
