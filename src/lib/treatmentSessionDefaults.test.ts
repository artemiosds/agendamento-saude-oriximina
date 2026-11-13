import { describe, expect, it } from "vitest";
import { getDefaultSessionsByProfession, suggestSessionsForProfessional } from "./treatmentSessionDefaults";

describe("sugestões editáveis de sessões", () => {
  it.each([
    ["Fisioterapeuta", 12], ["Fonoaudióloga", 12], ["Terapeuta Ocupacional", 12],
    ["Psicóloga", 6], ["Nutrição", 5], ["Medicina", 10],
  ])("sugere %s sem gravar nada", (profession, expected) => {
    expect(getDefaultSessionsByProfession(profession)).toBe(expected);
  });

  it("preserva o número digitado e também um campo apagado ao trocar profissional", () => {
    expect(suggestSessionsForProfessional(8, true, "Fisioterapia")).toBe(8);
    expect(suggestSessionsForProfessional("", true, "Psicologia")).toBe("");
    expect(suggestSessionsForProfessional(10, false, "Nutrição")).toBe(5);
  });
});
