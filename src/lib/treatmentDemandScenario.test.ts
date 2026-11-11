import { describe, expect, it } from "vitest";
import { buildTreatmentDemandScenario } from "./treatmentDemandScenario";

describe("simulação gerencial da demanda de tratamentos", () => {
  it("distribui o estoque por idade e separa datas ausentes ou inválidas", () => {
    const result = buildTreatmentDemandScenario({
      today: "2026-11-10",
      periodDays: 30,
      additionalSlotsPerWeek: 0,
      groups: [{
        unitId: "u1",
        unitName: "Unidade A",
        specialty: "Fisioterapia",
        availableAppointments: 20,
        pendingSessions: 0,
        requestDates: [
          "2026-11-10",
          "2026-11-03",
          "2026-10-20",
          "2026-08-01",
          null,
          "2026-11-11",
          "2026-02-30",
        ],
      }],
    });

    expect(result[0]).toMatchObject({
      backlog: 7,
      datedRequests: 4,
      withoutDate: 3,
      cohort0To7: 2,
      cohort8To30: 1,
      cohort31To90: 0,
      cohortOver90: 1,
      managementStatus: "priority_wait",
    });
  });

  it("desconta sessões pendentes e calcula o efeito de vagas adicionais por semana", () => {
    const result = buildTreatmentDemandScenario({
      today: "2026-11-10",
      periodDays: 30,
      additionalSlotsPerWeek: 7,
      groups: [{
        unitId: "u1",
        unitName: "Unidade A",
        specialty: "Fonoaudiologia",
        availableAppointments: 40,
        pendingSessions: 10,
        requestDates: Array.from({ length: 14 }, () => "2026-11-01"),
      }],
    });

    expect(result[0].netPeriodCapacity).toBe(30);
    expect(result[0].baselineSlotsPerWeek).toBeCloseTo(7);
    expect(result[0].simulatedSlotsPerWeek).toBeCloseTo(14);
    expect(result[0].baselineWeeksToClear).toBeCloseTo(2);
    expect(result[0].simulatedWeeksToClear).toBeCloseTo(1);
    expect(result[0].estimatedDaysReduced).toBeCloseTo(7);
  });

  it("não inventa prazo quando a capacidade atual é zero", () => {
    const result = buildTreatmentDemandScenario({
      today: "2026-11-10",
      periodDays: 30,
      additionalSlotsPerWeek: 0,
      groups: [{
        unitId: "u1",
        unitName: "Unidade sem vagas",
        specialty: "Fisioterapia",
        availableAppointments: 2,
        pendingSessions: 3,
        requestDates: ["2026-11-01"],
      }],
    });

    expect(result[0].baselineWeeksToClear).toBeNull();
    expect(result[0].simulatedWeeksToClear).toBeNull();
    expect(result[0].estimatedDaysReduced).toBeNull();
    expect(result[0].managementStatus).toBe("capacity_bottleneck");
  });

  it("simula prazo quando não há capacidade atual, mas há vagas adicionais informadas", () => {
    const result = buildTreatmentDemandScenario({
      today: "2026-11-10",
      periodDays: 14,
      additionalSlotsPerWeek: 4,
      groups: [{
        unitId: "u1",
        unitName: "Unidade A",
        specialty: "Fisioterapia",
        availableAppointments: 0,
        pendingSessions: 0,
        requestDates: ["2026-11-10", "2026-11-09"],
      }],
    });

    expect(result[0].baselineWeeksToClear).toBeNull();
    expect(result[0].simulatedSlotsPerWeek).toBe(4);
    expect(result[0].simulatedWeeksToClear).toBeCloseTo(0.5);
  });

  it("não apresenta grupo sem demanda como backlog e limita entrada negativa", () => {
    const result = buildTreatmentDemandScenario({
      today: "2026-11-10",
      periodDays: 30,
      additionalSlotsPerWeek: -8,
      groups: [{
        unitId: "u1",
        unitName: "Unidade A",
        specialty: "Fisioterapia",
        availableAppointments: 30,
        pendingSessions: 0,
        requestDates: [],
      }],
    });

    expect(result).toHaveLength(0);
  });

  it("permite configurar vagas adicionais diferentes por unidade e especialidade", () => {
    const result = buildTreatmentDemandScenario({
      today: "2026-11-10",
      periodDays: 14,
      additionalSlotsPerWeek: 5,
      groups: [
        {
          unitId: "u1",
          unitName: "Unidade A",
          specialty: "Fisioterapia",
          availableAppointments: 0,
          pendingSessions: 0,
          requestDates: ["2026-11-10"],
          additionalSlotsPerWeek: 2,
        },
        {
          unitId: "u2",
          unitName: "Unidade B",
          specialty: "Fonoaudiologia",
          availableAppointments: 0,
          pendingSessions: 0,
          requestDates: ["2026-11-10"],
        },
      ],
    });

    expect(result.find((row) => row.unitId === "u1")?.additionalSlotsPerWeek).toBe(2);
    expect(result.find((row) => row.unitId === "u2")?.additionalSlotsPerWeek).toBe(5);
  });

  it("prioriza espera acima de 90 dias e separa capacidade maior que a fila", () => {
    const result = buildTreatmentDemandScenario({
      today: "2026-11-10",
      periodDays: 30,
      additionalSlotsPerWeek: 0,
      groups: [
        {
          unitId: "u1",
          unitName: "Unidade A",
          specialty: "Fisioterapia",
          availableAppointments: 30,
          pendingSessions: 0,
          requestDates: ["2026-08-01"],
        },
        {
          unitId: "u2",
          unitName: "Unidade B",
          specialty: "Fonoaudiologia",
          availableAppointments: 20,
          pendingSessions: 0,
          requestDates: ["2026-11-10"],
        },
      ],
    });

    expect(result[0].unitId).toBe("u1");
    expect(result[0].managementStatus).toBe("priority_wait");
    expect(result.find((row) => row.unitId === "u2")?.managementStatus)
      .toBe("capacity_above_unassigned_backlog");
  });
});
