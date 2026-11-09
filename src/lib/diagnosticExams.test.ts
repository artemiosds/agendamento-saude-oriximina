import { describe, expect, it } from "vitest";
import {
  canTransitionDiagnosticExam,
  getAvailableDiagnosticSlots,
  getDiagnosticRoomConfig,
  isDiagnosticAppointment,
  normalizeDiagnosticRoomConfig,
  createDiagnosticExamConfig,
  DIAGNOSTIC_EXAM_CATALOG,
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
    expect(config?.prazoResultadoDias).toBe(0);
  });

  it("preserves a legacy single-exam room as a one-item exam list", () => {
    const config = normalizeDiagnosticRoomConfig({ finalidade: "aparelho_diagnostico", tipoExame: "Tomografia", duracaoSlot: 30, exigePreparo: true, instrucoesPreparo: "Orientação antiga" });
    expect(config.exames).toHaveLength(1);
    expect(config.exames[0]).toMatchObject({ tipoExame: "Tomografia", duracaoSlot: 30, exigePreparo: true, instrucoesPreparo: "Orientação antiga" });
  });

  it("keeps multiple exam configurations independent", () => {
    const config = normalizeDiagnosticRoomConfig({ finalidade: "aparelho_diagnostico", horarioInicio: "07:00", horarioFim: "17:00", exames: [
      { id: "rx", tipoExame: "Radiografia (Raio-X)", duracaoSlot: 10, exigePreparo: false },
      { id: "tc", tipoExame: "Tomografia Computadorizada", duracaoSlot: 45, exigePreparo: true, instrucoesPreparo: "Orientação da unidade", exigeContraste: "opcional", prazoResultadoDias: 4 },
    ] });
    expect(config.exames).toHaveLength(2);
    expect(config.exames[0].duracaoSlot).toBe(10);
    expect(config.exames[1]).toMatchObject({ duracaoSlot: 45, exigePreparo: true, instrucoesPreparo: "Orientação da unidade", exigeContraste: "opcional", prazoResultadoDias: 4 });
  });

  it("provides a standardized catalog and allows a custom exam entry", () => {
    expect(DIAGNOSTIC_EXAM_CATALOG.some(item => item.label === "Tomografia Computadorizada")).toBe(true);
    expect(createDiagnosticExamConfig("Exame personalizado").tipoExame).toBe("Exame personalizado");
  });

  it("normalizes invalid slot durations and unsafe values", () => {
    expect(normalizeDiagnosticRoomConfig({ finalidade: "aparelho_diagnostico", duracaoSlot: 13 }).duracaoSlot).toBe(15);
    expect(normalizeDiagnosticRoomConfig({ prazoResultadoDias: 3 }).prazoResultadoDias).toBe(3);
    expect(normalizeDiagnosticRoomConfig({ prazoResultadoDias: 120 }).prazoResultadoDias).toBe(0);
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
    expect(isDiagnosticAppointment({ tipo: "Exame", custom_data: { sala_tipo: "aparelho_diagnostico" } })).toBe(true);
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
