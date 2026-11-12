import { describe, it, expect } from "vitest";
import { parseCondicoes, hasCondicao, toggleCondicao } from "./condicoesPaciente";
describe("condições múltiplas", () => {
  it("valor antigo único continua reconhecido", () => expect(parseCondicoes("tea")).toEqual(["tea"]));
  it("permite marcar física e intelectual juntas", () => expect(toggleCondicao("fisica", "intelectual", true)).toBe("fisica,intelectual"));
  it("desmarcar remove só a escolhida", () => expect(toggleCondicao("fisica,visual", "fisica", false)).toBe("visual"));
  it("detecta condição em lista combinada", () => expect(hasCondicao("intelectual,auditiva", "auditiva")).toBe(true));
});
