import { describe, it, expect } from "vitest";
import { ACTIVE_TREATMENT_CYCLE_STATUSES, isActiveTreatmentCycleStatus } from "./treatmentCycleStatus";
import { breakdownPendingByProfessionalUnit, estimateContinuityByDay, isStrictlyCompatible, strictSpecialtyOf, totalsByUnitSpecialty, emptyBreakdown } from "./localizarVagas";

const row = (o: any) => ({ professional_id: "p1", unit_id: "u1", status: "pendente_agendamento", appointment_id: null, cycle_status: "em_andamento", scheduled_date: null, ...o });

describe("ajustes finais Localizar Vagas", () => {
  it("estados ativos: em_andamento, aguardando_vaga, em_fila; encerrados fora", () => {
    expect([...ACTIVE_TREATMENT_CYCLE_STATUSES]).toEqual(["em_andamento", "aguardando_vaga", "em_fila"]);
    for (const s of ["finalizado_alta", "concluido", "cancelado", "ativo", "", null]) expect(isActiveTreatmentCycleStatus(s as any)).toBe(false);
    const m = breakdownPendingByProfessionalUnit([row({ cycle_status: "finalizado_alta" }), row({ cycle_status: "concluido" }), row({ cycle_status: "aguardando_vaga" })], "2026-11-11", "2026-11-25");
    expect(m.get("p1|u1")?.total).toBe(1);
  });
  it("unidades separadas e sessões vinculadas não contam", () => {
    const m = breakdownPendingByProfessionalUnit([row({}), row({ unit_id: "u2" }), row({ appointment_id: "a1" })], "2026-11-11", "2026-11-25");
    expect(m.get("p1|u1")?.total).toBe(1);
    expect(m.get("p1|u2")?.total).toBe(1);
    const t = totalsByUnitSpecialty([{ unitId: "u1", specialty: "Fono", pending: m.get("p1|u1")! }, { unitId: "u2", specialty: "Fono", pending: m.get("p1|u2")! }]);
    expect(t.map((x) => x.total?.total)).toEqual([1, 1]);
    expect(totalsByUnitSpecialty([{ unitId: "u1", specialty: "Fono", pending: null }])[0].total).toBeNull();
  });
  it("profissões cadastradas e Terapia Ocupacional reconhecidas; desconhecidas nunca", () => {
    for (const p of ["Fonoaudióloga", "Psicóloga", "Nutricionista", "Fisioterapeuta", "Assistente Social", "Odontóloga", "Médica", "Enfermeiro"]) expect(strictSpecialtyOf(p)).not.toBeNull();
    expect(strictSpecialtyOf("Terapeuta Ocupacional")).toBe("Terapia Ocupacional");
    expect(isStrictlyCompatible("Terapia Ocupacional", "terapeuta ocupacional")).toBe(true);
    expect(isStrictlyCompatible("Terapia Ocupacional", "Fisioterapeuta")).toBe(false);
    expect(isStrictlyCompatible("Xyz", "Xyz")).toBe(false);
  });
  it("CBO exigido: igual, diferente e ausente", () => {
    expect(isStrictlyCompatible("Fisioterapia", "Fisioterapeuta", { requiredCbo: "223605", professionalCbo: "223605" })).toBe(true);
    expect(isStrictlyCompatible("Fisioterapia", "Fisioterapeuta", { requiredCbo: "223605", professionalCbo: "223810" })).toBe(false);
    expect(isStrictlyCompatible("Fisioterapia", "Fisioterapeuta", { requiredCbo: "223605", professionalCbo: null })).toBe(false);
  });
  it("sessões concentradas num dia: total sobra, mas o dia não comporta", () => {
    const m = breakdownPendingByProfessionalUnit([1, 2, 3].map(() => row({ scheduled_date: "2026-11-12" })), "2026-11-11", "2026-11-13");
    const r = estimateContinuityByDay({ freeSlotsByDate: { "2026-11-11": 10, "2026-11-12": 1, "2026-11-13": 10 }, pending: m.get("p1|u1")!, allDaysLoaded: true });
    expect(r.estimate).toBe("comprometida");
    expect(r.naoDistribuivel).toBe(2);
    expect(r.diasEmConflito).toEqual(["2026-11-12"]);
  });
  it("vencidas e sem data ficam separadas e pedem revisão, sem abater capacidade", () => {
    const m = breakdownPendingByProfessionalUnit([row({ scheduled_date: "2026-11-01" }), row({})], "2026-11-11", "2026-11-12");
    const b = m.get("p1|u1")!;
    expect([b.vencidas, b.semData, b.noPeriodo]).toEqual([1, 1, 0]);
    const r = estimateContinuityByDay({ freeSlotsByDate: { "2026-11-11": 0, "2026-11-12": 0 }, pending: b, allDaysLoaded: true });
    expect(r.estimate).toBe("estimada_favoravel");
    expect(r.precisaRevisao).toBe(true);
  });
  it("falha de acesso ou dias não carregados = não confirmada", () => {
    expect(estimateContinuityByDay({ freeSlotsByDate: {}, pending: null, allDaysLoaded: true }).estimate).toBe("nao_confirmada");
    expect(estimateContinuityByDay({ freeSlotsByDate: null, pending: emptyBreakdown(), allDaysLoaded: false }).estimate).toBe("nao_confirmada");
  });
});
