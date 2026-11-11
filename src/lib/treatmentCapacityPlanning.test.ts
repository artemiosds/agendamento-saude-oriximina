import { describe, expect, it } from "vitest";
import { buildTreatmentCapacityPlan, type CapacityPlanningInput } from "./treatmentCapacityPlanning";

const baseInput = (): CapacityPlanningInput => ({
  today: "2026-11-10",
  nowTime: "07:00",
  endDate: "2026-11-11",
  periodDates: ["2026-11-11"],
  professionals: [{ id: "p1", name: "Profissional A", profession: "Fisioterapeuta", unitId: "u1" }],
  availabilities: [{
    professionalId: "p1",
    unitId: "u1",
    startDate: "2026-11-01",
    endDate: "2026-11-30",
    weekdays: [2, 3],
    vacanciesPerDay: 6,
    startTime: "08:00",
    endTime: "10:00",
    vacanciesPerHour: 2,
    durationMinutes: 30,
  }],
  appointments: [],
  blocks: [],
  externalQuotas: [],
  pendingSessions: [],
  queueDemand: [],
});

describe("planejamento de capacidade real para tratamentos", () => {
  it("calcula vagas horárias por grade, ocupação, bloqueio parcial e reserva externa da data", () => {
    const input = baseInput();
    input.appointments = [
      { professionalId: "p1", unitId: "u1", date: "2026-11-11", time: "08:00", status: "confirmado", origin: "recepcao" },
      { professionalId: "p1", unitId: "u1", date: "2026-11-11", time: "09:00", status: "confirmado", origin: "externo" },
    ];
    input.blocks = [{
      startDate: "2026-11-11", endDate: "2026-11-11", unitId: "u1",
      allDay: false, startTime: "08:30", endTime: "09:00",
    }];
    input.externalQuotas = [{
      id: "quota-day",
      profissional_interno_id: "p1",
      unidade_id: "u1",
      periodo_inicio: "2026-11-11",
      periodo_fim: "2026-11-11",
      turno: "personalizado",
      horario_inicio: "08:00",
      horario_fim: "10:00",
      ativo: true,
      vagas_total: 1,
      vagas_usadas: 0,
    }];

    const result = buildTreatmentCapacityPlan(input);
    expect(result.professionals[0]).toMatchObject({
      availableAppointments: 2,
      sameDayExternalReserved: 1,
      availableDates: 1,
      reviewDays: 0,
    });
    expect(result.professionals[0].nextWindows[0]).toMatchObject({ date: "2026-11-11", freeAppointments: 2 });
    expect(result.professionals[0].nextWindows[0].label).toContain("08:00");
    expect(result.professionals[0].nextWindows[0].label).not.toContain("08:30");
  });

  it("calcula turnos como faixas e divide a faixa em torno de bloqueios parciais", () => {
    const input = baseInput();
    input.availabilities = [{
      ...input.availabilities[0],
      weekdays: [3],
      vacanciesPerDay: 5,
      startTime: "08:00",
      endTime: "12:00",
      vacanciesPerHour: 0,
      durationMinutes: 0,
    }];
    input.appointments = [
      { professionalId: "p1", unitId: "u1", date: "2026-11-11", time: "08:30", status: "confirmado", origin: "recepcao" },
      { professionalId: "p1", unitId: "u1", date: "2026-11-11", time: "10:30", status: "confirmado", origin: "externo" },
    ];
    input.blocks = [{
      startDate: "2026-11-11", endDate: "2026-11-11", unitId: "u1",
      allDay: false, startTime: "09:00", endTime: "10:00",
    }];
    input.externalQuotas = [{
      id: "quota-turn",
      profissional_interno_id: "p1",
      unidade_id: "u1",
      periodo_inicio: "2026-11-11",
      periodo_fim: "2026-11-11",
      turno: "integral",
      ativo: true,
      vagas_total: 2,
      vagas_usadas: 0,
    }];

    const result = buildTreatmentCapacityPlan(input);
    expect(result.professionals[0]).toMatchObject({
      availableAppointments: 2,
      sameDayExternalReserved: 2,
      availableDates: 1,
    });
    expect(result.professionals[0].nextWindows.map((window) => window.label)).toEqual(["08:00–09:00", "10:00–12:00"]);
  });

  it("conta quota de período uma única vez e não a desconta de cada dia", () => {
    const input = baseInput();
    input.externalQuotas = [{
      id: "quota-period",
      profissional_interno_id: "p1",
      unidade_id: "u1",
      periodo_inicio: "2026-11-01",
      periodo_fim: "2026-11-30",
      turno: "integral",
      ativo: true,
      vagas_total: 10,
      vagas_usadas: 3,
    }];

    const result = buildTreatmentCapacityPlan(input);
    expect(result.professionals[0].periodQuotaRemaining).toBe(7);
    expect(result.professionals[0].periodQuotaCount).toBe(1);
    expect(result.professionals[0].availableAppointments).toBeGreaterThan(0);
    expect(result.professionals[0].sameDayExternalReserved).toBe(0);
  });

  it("não duplica capacidade quando duas faixas se sobrepõem: sinaliza revisão", () => {
    const input = baseInput();
    input.periodDates = ["2026-11-11"];
    input.availabilities.push({ ...input.availabilities[0], startTime: "09:00", endTime: "11:00" });

    const result = buildTreatmentCapacityPlan(input);
    expect(result.professionals[0]).toMatchObject({ availableAppointments: 0, reviewDays: 1 });
  });

  it("não considera cancelados nem faltas, e limita a estimativa ao limite diário e por hora", () => {
    const input = baseInput();
    input.periodDates = ["2026-11-11"];
    input.appointments = [
      { professionalId: "p1", unitId: "u1", date: "2026-11-11", time: "08:00", status: "confirmado", origin: "recepcao" },
      { professionalId: "p1", unitId: "u1", date: "2026-11-11", time: "08:15", status: "cancelado", origin: "recepcao" },
      { professionalId: "p1", unitId: "u1", date: "2026-11-11", time: "09:00", status: "falta", origin: "externo" },
    ];

    const result = buildTreatmentCapacityPlan(input);
    expect(result.professionals[0].availableAppointments).toBe(3);
  });

  it("gera alternativas gerenciais conservadoras sem atribuir pacientes nem presumir CBO", () => {
    const input = baseInput();
    input.periodDates = ["2026-11-11"];
    input.pendingSessions = [
      { professionalId: "p1", unitId: "u1", status: "pendente_agendamento", scheduledDate: null, appointmentId: null },
    ];
    input.queueDemand = [
      { id: "q1", unitId: "u1", destinationProfession: "Fisioterapia", requestDate: "2026-11-01", cboCode: null },
      { id: "q2", unitId: "u1", destinationProfession: "Fisioterapia", requestDate: "2026-11-02", cboCode: null },
      { id: "q3", unitId: "u1", destinationProfession: "Fisioterapia", requestDate: "2026-11-03", cboCode: null },
    ];

    const result = buildTreatmentCapacityPlan(input);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({
      unassignedDemand: 3,
      oldestWaitDays: 9,
      professionalId: "p1",
      availableAppointments: 6,
      pendingSessions: 1,
      residualCapacity: 5,
      suggestedForReview: 3,
    });
  });
  it("suspende a capacidade quando uma cota de data específica não corresponde à faixa cadastrada", () => {
    const input = baseInput();
    input.externalQuotas = [{
      id: "quota-invalid",
      profissional_interno_id: "p1",
      unidade_id: "u1",
      periodo_inicio: "2026-11-11",
      periodo_fim: "2026-11-11",
      turno: "personalizado",
      horario_inicio: "13:00",
      horario_fim: "17:00",
      ativo: true,
      vagas_total: 2,
      vagas_usadas: 0,
    }];

    const result = buildTreatmentCapacityPlan(input);
    expect(result.professionals[0]).toMatchObject({ availableAppointments: 0, reviewDays: 1 });
  });

  it("sinaliza revisão quando existem duas grades horárias no mesmo dia, mesmo sem sobreposição", () => {
    const input = baseInput();
    input.availabilities.push({ ...input.availabilities[0], startTime: "13:00", endTime: "15:00" });

    const result = buildTreatmentCapacityPlan(input);
    expect(result.professionals[0]).toMatchObject({ availableAppointments: 0, reviewDays: 1 });
  });

  it("bloqueio integral elimina a capacidade calculada do dia", () => {
    const input = baseInput();
    input.blocks = [{
      startDate: "2026-11-11", endDate: "2026-11-11", unitId: "u1",
      allDay: true, startTime: null, endTime: null,
    }];

    const result = buildTreatmentCapacityPlan(input);
    expect(result.professionals[0]).toMatchObject({ availableAppointments: 0, blockedDays: 1, reviewDays: 0 });
  });

});
