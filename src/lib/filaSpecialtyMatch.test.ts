import { describe, it, expect } from "vitest";
import { filaEntryMatchesProfession } from "./filaSpecialtyMatch";

describe("fila por especialidade", () => {
  it("vaga de Fono não chama paciente destinado à Fisioterapia", () => {
    expect(filaEntryMatchesProfession({ especialidadeDestino: "Fisioterapia" }, "p1", "Fonoaudióloga")).toBe(false);
  });
  it("vaga de Fono chama paciente destinado à Fonoaudiologia", () => {
    expect(filaEntryMatchesProfession({ especialidadeDestino: "fonoaudiologia" }, "p1", "Fonoaudiólogo")).toBe(true);
  });
  it("entrada sem especialidade de destino mantém regra anterior", () => {
    expect(filaEntryMatchesProfession({ especialidadeDestino: "" }, "p1", "Fisioterapeuta")).toBe(true);
  });
  it("entrada vinculada a outro profissional não é chamada", () => {
    expect(filaEntryMatchesProfession({ profissionalId: "p2", especialidadeDestino: "Fisioterapia" }, "p1", "Fisioterapeuta")).toBe(false);
  });
});
