import { describe, it, expect } from "vitest";
import {
  classifyDayAvailability, isStrictlyCompatible, estimateContinuity, countUnlinkedPendingByProfessional,
  classifyCardAvailability, breakdownPendingByProfessionalUnit, totalsByUnitSpecialty, strictSpecialtyOf,
} from "./localizarVagas";

describe("localizarVagas", () => {
  it("dia não carregado nunca vira sem vaga", () => {
    expect(classifyDayAvailability({ loadError: false, dayLoaded: false, slots: [] })).toBe("nao_carregado");
    expect(classifyDayAvailability({ loadError: true, dayLoaded: false, slots: [] })).toBe("erro");
    expect(classifyDayAvailability({ loadError: false, dayLoaded: true, slots: [] })).toBe("sem_vaga");
    expect(classifyDayAvailability({ loadError: false, dayLoaded: true, slots: ["08:00"] })).toBe("com_vagas");
  });
  it("cartão: erro ou dia não carregado = disponibilidade não confirmada", () => {
    expect(classifyCardAvailability(["sem_vaga", "nao_carregado"])).toBe("nao_confirmada");
    expect(classifyCardAvailability(["erro", "erro"])).toBe("nao_confirmada");
    expect(classifyCardAvailability(["sem_vaga", "sem_vaga"])).toBe("sem_vaga_periodo");
    expect(classifyCardAvailability(["nao_carregado", "com_vagas"])).toBe("avaliacao_disponivel");
  });
  it("profissão não reconhecida não é compatível nem consigo mesma", () => {
    expect(strictSpecialtyOf("Profissão Inventada")).toBeNull();
    expect(isStrictlyCompatible("Profissão Inventada", "Profissão Inventada")).toBe(false);
    expect(isStrictlyCompatible("Fonoaudiologia", "")).toBe(false);
    expect(isStrictlyCompatible("Fonoaudiologia", "Fisioterapeuta")).toBe(false);
    expect(isStrictlyCompatible("Fonoaudiologia", "Fonoaudióloga")).toBe(true);
    expect(isStrictlyCompatible("Fisioterapia", "Fisioterapeuta", { requiredCbo: "223605", professionalCbo: "" })).toBe(false);
  });
  it("pendências: só ciclos ativos, sem vínculo, separadas por unidade do ciclo e por data", () => {
    const m = breakdownPendingByProfessionalUnit([
      { professional_id: "p1", unit_id: "u1", status: "pendente_agendamento", appointment_id: null, cycle_status: "em_andamento", scheduled_date: null },
      { professional_id: "p1", unit_id: "u1", status: "pendente_agendamento", appointment_id: null, cycle_status: "em_andamento", scheduled_date: "2026-11-15" },
      { professional_id: "p1", unit_id: "u1", status: "pendente_agendamento", appointment_id: null, cycle_status: "em_andamento", scheduled_date: "2026-12-30" },
      { professional_id: "p1", unit_id: "u1", status: "pendente_agendamento", appointment_id: null, cycle_status: "em_andamento", scheduled_date: "2026-11-01" },
      { professional_id: "p1", unit_id: "u2", status: "pendente_agendamento", appointment_id: null, cycle_status: "em_andamento", scheduled_date: null },
      { professional_id: "p1", unit_id: "u1", status: "pendente_agendamento", appointment_id: "a1", cycle_status: "em_andamento" },
      { professional_id: "p1", unit_id: "u1", status: "pendente_agendamento", appointment_id: null, cycle_status: "finalizado_alta" },
      { professional_id: "p1", unit_id: "u1", status: "pendente_agendamento", appointment_id: null, cycle_status: "concluido" },
    ], "2026-11-11", "2026-11-25");
    expect(m.get("p1|u1")).toMatchObject({ semData: 1, noPeriodo: 1, aposPeriodo: 1, vencidas: 1, total: 4 });
    expect(m.get("p1|u2")?.total).toBe(1);
  });
  it("continuidade: sem dados = não confirmada; sem data fica à parte; excedente é não distribuível", () => {
    const p = { semData: 5, noPeriodo: 2, aposPeriodo: 9, vencidas: 1, total: 17 };
    expect(estimateContinuity({ freeSlotsInPeriod: 10, pending: null, allDaysLoaded: true }).estimate).toBe("nao_confirmada");
    expect(estimateContinuity({ freeSlotsInPeriod: 10, pending: p, allDaysLoaded: false }).estimate).toBe("nao_confirmada");
    expect(estimateContinuity({ freeSlotsInPeriod: 10, pending: p, allDaysLoaded: true })).toEqual({ estimate: "estimada_favoravel", naoDistribuivel: 0, semData: 5 });
    expect(estimateContinuity({ freeSlotsInPeriod: 2, pending: p, allDaysLoaded: true })).toEqual({ estimate: "comprometida", naoDistribuivel: 1, semData: 5 });
  });
  it("totais por unidade e especialidade não se misturam; falta de dado vira indisponível", () => {
    const b = (t: number) => ({ semData: t, noPeriodo: 0, aposPeriodo: 0, vencidas: 0, total: t });
    const r = totalsByUnitSpecialty([
      { unitId: "u1", specialty: "Fisioterapia", pending: b(2) },
      { unitId: "u1", specialty: "Fisioterapia", pending: b(3) },
      { unitId: "u2", specialty: "Fisioterapia", pending: b(4) },
      { unitId: "u3", specialty: "Fisioterapia", pending: null },
    ]);
    expect(r.find((x) => x.unitId === "u1")?.total?.total).toBe(5);
    expect(r.find((x) => x.unitId === "u2")?.total?.total).toBe(4);
    expect(r.find((x) => x.unitId === "u3")?.total).toBeNull();
  });
  it("sessão pendente já vinculada à agenda não conta em dobro", () => {
    const m = countUnlinkedPendingByProfessional([
      { professional_id: "p1", status: "pendente_agendamento", appointment_id: null },
      { professional_id: "p1", status: "pendente_agendamento", appointment_id: "a1" },
    ]);
    expect(m.get("p1")).toBe(1);
  });
});
