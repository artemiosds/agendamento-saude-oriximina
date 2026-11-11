import { describe, it, expect } from "vitest";
import { buildSharedPatientsSummary } from "./sharedTreatmentPatients";

describe("pacientes compartilhados", () => {
  it("conta paciente com Fisioterapia e Fonoaudiologia como compartilhado", () => {
    const r = buildSharedPatientsSummary([
      { patientId: "p1", specialty: "Fisioterapia" },
      { patientId: "p1", specialty: "fonoaudiologia" },
      { patientId: "p2", specialty: "Fisioterapia" },
    ]);
    expect(r.totalPatients).toBe(1);
    expect(r.combinations).toEqual([{ label: "Fisioterapia + Fonoaudiologia", count: 1 }]);
  });
  it("dois ciclos da mesma especialidade não contam", () => {
    const r = buildSharedPatientsSummary([
      { patientId: "p1", specialty: "Fisioterapia" },
      { patientId: "p1", specialty: "FISIOTERAPIA" },
    ]);
    expect(r.totalPatients).toBe(0);
  });
});
