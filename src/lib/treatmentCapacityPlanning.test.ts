import { describe, expect, it } from "vitest";
import { buildTreatmentCapacityPlan, buildTreatmentCycleFeasibility, type CapacityPlanningInput } from "./treatmentCapacityPlanning";

const baseInput = (): CapacityPlanningInput => ({
  today: "2026-11-10",
  endDate: "2026-11-11",
  periodDates: ["2026-11-11"],
  professionals: [{ id: "p1", name: "Profissional A", profession: "Fisioterapeuta", unitId: "u1", cboCode: "223605", appointmentDurationMinutes: 30 }],
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

  it("soma turnos independentes da mesma data sem misturar ocupação entre faixas", () => {
    const input = baseInput();
    input.availabilities = [
      { ...input.availabilities[0], weekdays: [3], startTime: "08:00", endTime: "12:00", vacanciesPerDay: 2, vacanciesPerHour: 0 },
      { ...input.availabilities[0], weekdays: [3], startTime: "13:00", endTime: "17:00", vacanciesPerDay: 3, vacanciesPerHour: 0 },
    ];
    input.appointments = [
      { professionalId: "p1", unitId: "u1", date: "2026-11-11", time: "09:00", status: "confirmado", origin: "recepcao" },
      { professionalId: "p1", unitId: "u1", date: "2026-11-11", time: "14:00", status: "confirmado", origin: "recepcao" },
    ];

    const result = buildTreatmentCapacityPlan(input);
    expect(result.professionals[0]).toMatchObject({
      configuredSlots: 5,
      confirmedOccupancy: 2,
      availableAppointments: 3,
      openWindows: 2,
    });
    expect(result.professionals[0].shiftCapacity).toEqual([
      { shift: "Manhã", availableAppointments: 1 },
      { shift: "Tarde", availableAppointments: 2 },
    ]);
  });


  it("calcula turnos usando somente o horário inicial que a Agenda realmente oferece", () => {

const input = baseInput();
    input.availabilities = [{
      ...input.availabilities[0],
      weekdays: [3],
      vacanciesPerDay: 5,
      startTime: "08:00",
      endTime: "12:00",
      vacanciesPerHour: 0,
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
    expect(result.professionals[0].nextWindows.map((window) => window.label)).toEqual(["08:00"]);
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
      availableAppointments: 4,
      pendingSessions: 1,
      residualCapacity: 3,
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

  it("usa o tempo de atendimento do profissional para gerar os inícios dos horários", () => {
    const input = baseInput();
    input.professionals[0].appointmentDurationMinutes = 45;
    const result = buildTreatmentCapacityPlan(input);
    expect(result.professionals[0].nextWindows[0].label).toBe("08:00, 08:45, 09:30");
    expect(result.professionals[0].openWindows).toBe(3);
  });

  it("um bloqueio que cobre o início do turno remove o horário do turno", () => {
    const input = baseInput();
    input.availabilities = [{
      ...input.availabilities[0],
      weekdays: [3],
      vacanciesPerDay: 5,
      startTime: "08:00",
      endTime: "12:00",
      vacanciesPerHour: 0,
    }];
    input.blocks = [{
      startDate: "2026-11-11", endDate: "2026-11-11", unitId: "u1",
      allDay: false, startTime: "07:30", endTime: "08:30",
    }];
    const result = buildTreatmentCapacityPlan(input);
    expect(result.professionals[0]).toMatchObject({ availableAppointments: 0, openWindows: 0 });
  });

  it("restringe a sugestão ao CBO explícito da fila e do profissional", () => {
    const input = baseInput();
    input.periodDates = ["2026-11-11"];
    input.professionals.push({
      id: "p2", name: "Profissional B", profession: "Fisioterapeuta",
      unitId: "u1", cboCode: "223606", appointmentDurationMinutes: 30,
    });
    input.availabilities.push({
      ...input.availabilities[0],
      professionalId: "p2",
      weekdays: [3],
    });
    input.queueDemand = [
      { id: "q1", unitId: "u1", destinationProfession: "Fisioterapia", requestDate: "2026-11-01", cboCode: "223605" },
    ];
    const result = buildTreatmentCapacityPlan(input);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({
      professionalId: "p1",
      cboStatus: "compatível",
      unassignedDemand: 1,
    });
  });

  it("não conta vagas horárias maiores que os inícios de horário realmente livres", () => {
    const input = baseInput();
    input.periodDates = ["2026-11-11"];
    input.blocks = [{
      startDate: "2026-11-11", endDate: "2026-11-11", unitId: "u1",
      allDay: false, startTime: "08:00", endTime: "08:30",
    }];
    const result = buildTreatmentCapacityPlan(input);
    expect(result.professionals[0]).toMatchObject({
      availableAppointments: 3,
      openWindows: 3,
    });
  });

  it("não soma recomendações de candidatos acima da demanda sem profissional", () => {
    const input = baseInput();
    input.periodDates = ["2026-11-11"];
    input.professionals.push({
      id: "p2", name: "Profissional B", profession: "Fisioterapeuta",
      unitId: "u1", cboCode: "223605", appointmentDurationMinutes: 30,
    });
    input.availabilities.push({ ...input.availabilities[0], professionalId: "p2", weekdays: [3] });
    input.queueDemand = [
      { id: "q1", unitId: "u1", destinationProfession: "Fisioterapia", requestDate: "2026-11-01", cboCode: null },
      { id: "q2", unitId: "u1", destinationProfession: "Fisioterapia", requestDate: "2026-11-02", cboCode: null },
    ];
    const result = buildTreatmentCapacityPlan(input);
    expect(result.suggestions.reduce((sum, row) => sum + row.suggestedForReview, 0)).toBe(2);
  });

  it("classifica como incompatível quando todos os CBOs da unidade são conhecidos e diferentes do destino", () => {
    const input = baseInput();
    input.periodDates = ["2026-11-11"];
    input.professionals[0].cboCode = "223606";
    input.queueDemand = [
      { id: "q1", unitId: "u1", destinationProfession: "Fisioterapia", requestDate: "2026-11-01", cboCode: "223605" },
    ];
    const result = buildTreatmentCapacityPlan(input);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({
      professionalId: null,
      cboStatus: "incompatível",
      unassignedDemand: 1,
    });
  });


  it("separa capacidade configurada, ocupação, demanda projetada e vaga para avaliação inicial", () => {
    const input = baseInput();
    input.periodDates = ["2026-11-11"];
    input.appointments = [
      { professionalId: "p1", unitId: "u1", date: "2026-11-11", time: "08:00", status: "confirmado", origin: "recepcao" },
    ];
    input.pendingSessions = [
      { professionalId: "p1", unitId: "u1", status: "pendente_agendamento", scheduledDate: "2026-11-12", appointmentId: null },
      { professionalId: "p1", unitId: "u1", status: "pendente_agendamento", scheduledDate: null, appointmentId: null },
    ];

    const result = buildTreatmentCapacityPlan(input);
    expect(result.professionals[0]).toMatchObject({
      configuredSlots: 6,
      confirmedOccupancy: 1,
      projectedTreatmentDemand: 1,
      availableAppointments: 3,
      availableAfterProjectedDemand: 2,
      availableForInitialEvaluation: 2,
    });
    expect(result.professionals[0].shiftCapacity).toEqual([
      { shift: "Manhã", availableAppointments: 3 },
    ]);
  });


  it("simula todas as sessões semanais com capacidade nas datas escolhidas", () => {
    const input = baseInput();
    input.endDate = "2026-12-31";
    input.periodDates = Array.from({ length: 52 }, (_, index) => {
      const d = new Date("2026-11-10T12:00:00"); d.setDate(d.getDate() + index); return d.toISOString().slice(0, 10);
    });
    input.availabilities[0].weekdays = [2];
    input.availabilities[0].endDate = "2026-12-31";
    const result = buildTreatmentCycleFeasibility({ ...input, professionalId: "p1", unitId: "u1", startDate: "2026-11-10", frequency: "1x_semana", weekdays: [2], totalSessions: 4 });
    expect(result).toMatchObject({ status: "confirmável", requestedSessions: 4, feasibleSessions: 4 });
    expect(result.dates.map((row) => row.date)).toEqual(["2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01"]);
  });

  it("pula datas bloqueadas respeitando o dia semanal escolhido", () => {
    const input = baseInput();
    input.endDate = "2026-12-31";
    input.periodDates = Array.from({ length: 52 }, (_, index) => {
      const d = new Date("2026-11-10T12:00:00"); d.setDate(d.getDate() + index); return d.toISOString().slice(0, 10);
    });
    input.blocks = [{ startDate: "2026-11-17", endDate: "2026-11-17", unitId: "u1", allDay: true, startTime: null, endTime: null }];
    const result = buildTreatmentCycleFeasibility({ ...input, professionalId: "p1", unitId: "u1", startDate: "2026-11-10", frequency: "1x_semana", weekdays: [2], totalSessions: 2 });
    expect(result.status).toBe("confirmável");
    expect(result.dates.map((row) => row.date)).toEqual(["2026-11-10", "2026-11-24"]);
  });

  it("exige revisão para sessões pendentes sem data futura", () => {
    const input = baseInput();
    input.pendingSessions = [{ professionalId: "p1", unitId: "u1", status: "pendente_agendamento", scheduledDate: null, appointmentId: null }];
    const result = buildTreatmentCycleFeasibility({ ...input, professionalId: "p1", unitId: "u1", startDate: "2026-11-11", frequency: "1x_semana", weekdays: [3], totalSessions: 2 });
    expect(result.status).toBe("revisão");
    expect(result.unresolvedSessions).toBe(1);
  });

  it("desconta sessões pendentes agendadas para datas futuras", () => {
    const input = baseInput();
    input.availabilities[0].vacanciesPerDay = 1;
    input.pendingSessions = [{ professionalId: "p1", unitId: "u1", status: "pendente_agendamento", scheduledDate: "2026-11-11", appointmentId: null }];
    input.endDate = "2026-12-31";
    input.periodDates = Array.from({ length: 52 }, (_, index) => {
      const d = new Date("2026-11-10T12:00:00"); d.setDate(d.getDate() + index); return d.toISOString().slice(0, 10);
    });
    const result = buildTreatmentCycleFeasibility({ ...input, professionalId: "p1", unitId: "u1", startDate: "2026-11-11", frequency: "1x_semana", weekdays: [3], totalSessions: 2 });
    expect(result.status).toBe("confirmável");
    expect(result.dates.map((row) => row.date)).toEqual(["2026-11-18", "2026-11-25"]);
  });

  it("respeita o turno escolhido na simulação completa", () => {
    const input = baseInput();
    input.availabilities = [{ ...input.availabilities[0], weekdays: [3], startTime: "13:00", endTime: "17:00", vacanciesPerHour: 2 }];
    input.endDate = "2026-12-31";
    input.periodDates = Array.from({ length: 52 }, (_, index) => {
      const d = new Date("2026-11-10T12:00:00"); d.setDate(d.getDate() + index); return d.toISOString().slice(0, 10);
    });
    const result = buildTreatmentCycleFeasibility({ ...input, professionalId: "p1", unitId: "u1", startDate: "2026-11-11", frequency: "1x_semana", weekdays: [3], totalSessions: 2, shift: "Tarde" });
    expect(result.status).toBe("confirmável");
    expect(result.dates.every((row) => row.shiftLabels.every((label) => label.startsWith("Tarde")))).toBe(true);
  });

  it("não confirma ciclo se a janela não comporta todas as sessões", () => {
    const input = baseInput();
    input.periodDates = ["2026-11-11"]; input.endDate = "2026-11-11";
    const result = buildTreatmentCycleFeasibility({ ...input, professionalId: "p1", unitId: "u1", startDate: "2026-11-11", frequency: "1x_semana", weekdays: [3], totalSessions: 3 });
    expect(result.status).toBe("insuficiente");
  });


  it("separa manhã e tarde quando uma mesma faixa atravessa o meio-dia", () => {
    const input = baseInput();
    input.availabilities = [{ ...input.availabilities[0], weekdays: [3], startTime: "08:00", endTime: "14:00", vacanciesPerDay: 12, vacanciesPerHour: 2 }];
    const result = buildTreatmentCapacityPlan(input);
    expect(result.professionals[0].shiftCapacity).toEqual([
      { shift: "Manhã", availableAppointments: 8 },
      { shift: "Tarde", availableAppointments: 4 },
    ]);
  });

  it("reproduz a Agenda quando há uma faixa horária e um turno independente no mesmo dia", () => {
    const input = baseInput();
    input.periodDates = ["2026-11-11"];
    input.availabilities = [
      { ...input.availabilities[0], weekdays: [3], startTime: "08:00", endTime: "12:00", vacanciesPerDay: 4, vacanciesPerHour: 2 },
      { ...input.availabilities[0], weekdays: [3], startTime: "13:00", endTime: "17:00", vacanciesPerDay: 2, vacanciesPerHour: 0 },
    ];
    input.appointments = [
      { professionalId: "p1", unitId: "u1", date: "2026-11-11", time: "08:00", status: "confirmado", origin: "recepcao" },
      { professionalId: "p1", unitId: "u1", date: "2026-11-11", time: "14:00", status: "confirmado", origin: "recepcao" },
    ];

    const result = buildTreatmentCapacityPlan(input);
    expect(result.professionals[0]).toMatchObject({
      configuredSlots: 6,
      confirmedOccupancy: 2,
      availableAppointments: 3,
    });
    expect(result.professionals[0].shiftCapacity).toEqual([
      { shift: "Manhã", availableAppointments: 2 },
      { shift: "Tarde", availableAppointments: 1 },
    ]);
  });

  it("não confirma ciclo no turno solicitado quando só existe capacidade em outro turno", () => {
    const input = baseInput();
    input.periodDates = ["2026-11-11"];
    input.endDate = "2026-11-11";
    input.availabilities = [{
      ...input.availabilities[0],
      weekdays: [3],
      startTime: "08:00",
      endTime: "12:00",
      vacanciesPerDay: 4,
      vacanciesPerHour: 2,
    }];

    const result = buildTreatmentCycleFeasibility({
      ...input,
      professionalId: "p1",
      unitId: "u1",
      startDate: "2026-11-11",
      frequency: "1x_semana",
      weekdays: [3],
      totalSessions: 1,
      shift: "Tarde",
    });
    expect(result.status).toBe("insuficiente");
    expect(result.feasibleSessions).toBe(0);
  });

});
