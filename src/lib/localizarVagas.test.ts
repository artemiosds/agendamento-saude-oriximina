import { describe, it, expect } from "vitest";
import { classifyDayAvailability, isStrictlyCompatible, estimateContinuity, countUnlinkedPendingByProfessional } from "./localizarVagas";

describe("localizarVagas", () => {
  it("dia não carregado nunca vira sem vaga", () => {
    expect(classifyDayAvailability({ loadError: false, dayLoaded: false, slots: [] })).toBe("nao_carregado");
    expect(classifyDayAvailability({ loadError: true, dayLoaded: false, slots: [] })).toBe("erro");
    expect(classifyDayAvailability({ loadError: false, dayLoaded: true, slots: [] })).toBe("sem_vaga");
    expect(classifyDayAvailability({ loadError: false, dayLoaded: true, slots: ["08:00"] })).toBe("com_vagas");
  });
  it("compatibilidade desconhecida não é recomendada", () => {
    expect(isStrictlyCompatible("Fonoaudiologia", "")).toBe(false);
    expect(isStrictlyCompatible("Fonoaudiologia", null)).toBe(false);
    expect(isStrictlyCompatible("Fonoaudiologia", "Fisioterapeuta")).toBe(false);
    expect(isStrictlyCompatible("Fonoaudiologia", "Fonoaudióloga")).toBe(true);
    expect(isStrictlyCompatible("Terapia Ocupacional", "Terapia Ocupacional")).toBe(true);
    expect(isStrictlyCompatible("Fisioterapia", "Fisioterapeuta", { requiredCbo: "223605", professionalCbo: "" })).toBe(false);
  });
  it("sem informação de pendentes = não confirmada, nunca favorável", () => {
    expect(estimateContinuity({ freeSlotsInPeriod: 10, pendingUnlinked: null, allDaysLoaded: true })).toBe("nao_confirmada");
    expect(estimateContinuity({ freeSlotsInPeriod: 10, pendingUnlinked: 0, allDaysLoaded: false })).toBe("nao_confirmada");
    expect(estimateContinuity({ freeSlotsInPeriod: 10, pendingUnlinked: 10, allDaysLoaded: true })).toBe("comprometida");
    expect(estimateContinuity({ freeSlotsInPeriod: 10, pendingUnlinked: 3, allDaysLoaded: true })).toBe("estimada_favoravel");
  });
  it("sessão pendente já vinculada à agenda não conta em dobro", () => {
    const m = countUnlinkedPendingByProfessional([
      { professional_id: "p1", status: "pendente_agendamento", appointment_id: null },
      { professional_id: "p1", status: "pendente_agendamento", appointment_id: "a1" },
      { professional_id: "p1", status: "agendada", appointment_id: "a2" },
      { professional_id: "p1", status: "cancelada", appointment_id: null },
    ]);
    expect(m.get("p1")).toBe(1);
  });
});
