import { describe, expect, it } from "vitest";
import {
  buildTreatmentCapacitySnapshot,
  classifyTreatmentCapacitySpecialty,
  extractExplicitCboCode,
  isTreatmentSchedulingDemand,
  eligibleEvaluationRequests,
} from "./treatmentCapacityAnalytics";

describe("tratamento: capacidade e demanda — leitura gerencial", () => {
  it("normaliza as profissões usadas em Tratamentos sem restringir a capacidade a duas áreas", () => {
    expect(classifyTreatmentCapacitySpecialty("Fisioterapeuta")).toBe("Fisioterapia");
    expect(classifyTreatmentCapacitySpecialty("FISIOTERAPIA")).toBe("Fisioterapia");
    expect(classifyTreatmentCapacitySpecialty("Fonoaudióloga")).toBe("Fonoaudiologia");
    expect(classifyTreatmentCapacitySpecialty("Nutricionista")).toBe("Nutrição");
    expect(classifyTreatmentCapacitySpecialty("Psicóloga")).toBe("Psicologia");
    expect(classifyTreatmentCapacitySpecialty("Médico")).toBe("Medicina");
    expect(classifyTreatmentCapacitySpecialty("Assistente Social")).toBe("Serviço Social");
  });

  it("lê CBO somente quando está explicitamente cadastrado", () => {
    expect(extractExplicitCboCode({ cbo_codigo: "223605" })).toBe("223605");
    expect(extractExplicitCboCode({}, "Fisioterapeuta • CBO 223605")).toBe("223605");
    expect(extractExplicitCboCode({}, "Fisioterapeuta")).toBeNull();
  });

  it("mantém a capacidade configurada mesmo nos dias integralmente bloqueados e separa a capacidade operacional", () => {
    const result = buildTreatmentCapacitySnapshot({
      today: "2026-11-10",
      periodDates: ["2026-11-10", "2026-11-11"],
      professionals: [{ id: "p1", name: "Profissional A", profession: "Fisioterapeuta", unitId: "u1" }],
      availabilities: [
        { professionalId: "p1", unitId: "u1", startDate: "2026-11-01", endDate: "2026-11-30", weekdays: [2, 3], vacanciesPerDay: 8 },
      ],
      appointments: [
        { professionalId: "p1", unitId: "u1", date: "2026-11-10", time: "08:00", status: "confirmado" },
        { professionalId: "p1", unitId: "u1", date: "2026-11-10", time: "08:30", status: "cancelado" },
        { professionalId: "p1", unitId: "u1", date: "2026-11-11", time: "08:00", status: "falta" },
      ],
      blocks: [{ startDate: "2026-11-11", endDate: "2026-11-11", unitId: "u1", allDay: true }],
      pendingSessions: [],
      queueDemand: [],
    });
    expect(result.professionals).toHaveLength(1);
    expect(result.professionals[0].configuredSlots).toBe(16);
    expect(result.professionals[0].scheduledDays).toBe(1);
    expect(result.professionals[0].blockedDays).toBe(1);
    expect(result.professionals[0].occupiedAppointments).toBe(1);
  });

  it("não retira o dia inteiro por bloqueio parcial de horário", () => {
    const result = buildTreatmentCapacitySnapshot({
      today: "2026-11-10",
      periodDates: ["2026-11-10"],
      professionals: [{ id: "p1", name: "Profissional A", profession: "Fisioterapeuta", unitId: "u1" }],
      availabilities: [{ professionalId: "p1", unitId: "u1", startDate: "2026-11-01", endDate: "2026-11-30", weekdays: [2], vacanciesPerDay: 8 }],
      appointments: [
        { professionalId: "p1", unitId: "u1", date: "2026-11-10", time: "08:30", status: "confirmado" },
        { professionalId: "p1", unitId: "u1", date: "2026-11-10", time: "10:30", status: "confirmado" },
      ],
      blocks: [{ startDate: "2026-11-10", endDate: "2026-11-10", unitId: "u1", allDay: false, startTime: "08:00", endTime: "09:00" }],
      pendingSessions: [],
      queueDemand: [],
    });
    expect(result.professionals[0].configuredSlots).toBe(8);
    expect(result.professionals[0].partialBlockDays).toBe(1);
    expect(result.professionals[0].appointmentsWithoutAvailableSchedule).toBe(1);
  });

  it("usa o limite padrão da Agenda quando um bloqueio parcial não informa hora final", () => {
    const result = buildTreatmentCapacitySnapshot({
      today: "2026-11-10",
      periodDates: ["2026-11-10"],
      professionals: [{ id: "p1", name: "Profissional A", profession: "Fisioterapeuta", unitId: "u1" }],
      availabilities: [{ professionalId: "p1", unitId: "u1", startDate: "2026-11-01", endDate: "2026-11-30", weekdays: [2], vacanciesPerDay: 8 }],
      appointments: [
        { professionalId: "p1", unitId: "u1", date: "2026-11-10", time: "10:30", status: "confirmado" },
      ],
      blocks: [{ startDate: "2026-11-10", endDate: "2026-11-10", unitId: "u1", allDay: false, startTime: "08:00" }],
      pendingSessions: [],
      queueDemand: [],
    });
    // A Agenda treats a missing partial end as 23:59, so 10:30 remains blocked.
    expect(result.professionals[0].appointmentsWithoutAvailableSchedule).toBe(1);
  });

  it("isola demanda Fisio/Fono por destino explícito e origem sem chamar Triagem", () => {
    const row = { id: "1", unitId: "u1", destinationProfession: "Fonoaudiologia" };
    expect(isTreatmentSchedulingDemand({ ...row, status: "apto_atendimento" })).toBe(true);
    expect(isTreatmentSchedulingDemand({ ...row, status: "apto_agendamento" })).toBe(true);
    expect(isTreatmentSchedulingDemand({ ...row, status: "aguardando_agendamento_interno", origin: "encaminhamento_interno" })).toBe(true);
    expect(isTreatmentSchedulingDemand({ ...row, status: "aguardando_agendamento_interno", origin: "normal" })).toBe(false);
    expect(isTreatmentSchedulingDemand({ ...row, status: "aguardando" })).toBe(false);
    expect(isTreatmentSchedulingDemand({ id: "2", unitId: "u1", sector: "Fisioterapia", status: "apto_atendimento" })).toBe(false);
    expect(isTreatmentSchedulingDemand({ id: "3", unitId: "u1", destinationProfession: "Nutrição", status: "apto_atendimento" })).toBe(true);
  });

  it("seleciona pacientes aptos por solicitação válida, CBO, unidade e especialidade sem duplicar", () => {
    const prof = {id:"p1",unitId:"u1",name:"A",profession:"Fisioterapeuta",cboCode:"223605"};
    const base = {unitId:"u1",status:"apto_agendamento",destinationProfession:"Fisioterapia",cboCode:"223605",linkedToAppointment:false,inTreatment:false};
    const rows = [
      { ...base,id:"new",patientId:"person1",requestDate:"2026-11-12" },
      { ...base,id:"old",patientId:"person1",requestDate:"2026-11-09" },
      { ...base,id:"without",patientId:"person2",requestDate:null },
      { ...base,id:"wrong-cbo",patientId:"person3",cboCode:"223810" },
      { ...base,id:"wrong-unit",patientId:"person4",unitId:"u2" },
      { ...base,id:"booked",patientId:"person5",linkedToAppointment:true },
      { ...base,id:"fono",patientId:"person6",destinationProfession:"Fonoaudiologia" },
    ];
    expect(eligibleEvaluationRequests(rows,prof,"2026-11-13").map(r=>r.id)).toEqual(["old","without"]);
  });

  it("mantém sessões pendentes sem vínculo como demanda e separa datas vencidas e não informadas", () => {
    const result = buildTreatmentCapacitySnapshot({
      today: "2026-11-10",
      periodDates: ["2026-11-10"],
      professionals: [{ id: "p1", name: "Profissional A", profession: "Fisioterapeuta", unitId: "u1" }],
      availabilities: [],
      appointments: [],
      blocks: [],
      pendingSessions: [
        { professionalId: "p1", unitId: "u1", status: "pendente_agendamento", scheduledDate: "2026-11-09", appointmentId: null },
        { professionalId: "p1", unitId: "u1", status: "pendente_agendamento", scheduledDate: null, appointmentId: null },
        { professionalId: "p1", unitId: "u1", status: "pendente_agendamento", scheduledDate: "2026-11-12", appointmentId: null },
        { professionalId: "p1", unitId: "u1", status: "pendente_agendamento", scheduledDate: "2026-11-12", appointmentId: "appointment-1" },
      ],
      queueDemand: [],
    });
    expect(result.professionals[0].pendingSessions).toBe(3);
    expect(result.professionals[0].pendingDated).toBe(1);
    expect(result.professionals[0].pendingUndated).toBe(1);
    expect(result.professionals[0].pendingOverdue).toBe(1);
    expect(result.professionals[0].pendingWithAppointmentLink).toBe(1);
  });

  it("não inventa tempo de espera quando a data original é ausente ou inválida e distingue CBO incompatível", () => {
    const result = buildTreatmentCapacitySnapshot({
      today: "2026-11-10",
      periodDates: ["2026-11-10"],
      professionals: [
        { id: "p1", name: "Profissional A", profession: "Fisioterapeuta", unitId: "u1", cboCode: "223605" },
      ],
      availabilities: [],
      appointments: [],
      blocks: [],
      pendingSessions: [],
      queueDemand: [
        { id: "q1", unitId: "u1", destinationProfession: "Fisioterapia", professionalId: "p1", requestDate: "2026-11-01", cboCode: "223605" },
        { id: "q2", unitId: "u1", destinationProfession: "Fisioterapia", professionalId: "p1", requestDate: "", cboCode: null },
        { id: "q3", unitId: "u1", destinationProfession: "Fisioterapia", professionalId: "p1", requestDate: "2026-11-01", cboCode: "223606" },
        { id: "q4", unitId: "u1", destinationProfession: "Fonoaudiologia", requestDate: "inválida", cboCode: null },
      ],
    });
    const fisio = result.specialties.find((row) => row.specialty === "Fisioterapia")!;
    const fono = result.specialties.find((row) => row.specialty === "Fonoaudiologia")!;
    expect(fisio.queueDemand).toBe(3);
    expect(fisio.queueAssignedCompatible).toBe(1);
    expect(fisio.queueAssignedIncompatible).toBe(1);
    expect(fisio.queueAssignedUnconfirmable).toBe(1);
    expect(fisio.queueWithoutValidRequestDate).toBe(1);
    expect(fisio.queueWithoutCbo).toBe(1);
    expect(fisio.averageWaitDays).toBe(9);
    expect(fono.queueWithoutValidRequestDate).toBe(1);
    expect(fono.averageWaitDays).toBeNull();
  });
});
