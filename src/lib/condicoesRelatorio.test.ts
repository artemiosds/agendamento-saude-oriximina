import { describe, it, expect } from "vitest";
import { pertenceAoGrupo } from "./condicoesRelatorio";

describe("pertenceAoGrupo", () => {
  it("conta autismo por flag, condição ou CID F84", () => {
    expect(pertenceAoGrupo({ is_autista: true }, "tea")).toBe(true);
    expect(pertenceAoGrupo({ tipo_condicao: "fisica,tea" }, "tea")).toBe(true);
    expect(pertenceAoGrupo({ cid: "F84.0" }, "tea")).toBe(true);
    expect(pertenceAoGrupo({ tipo_condicao: "fisica" }, "tea")).toBe(false);
  });
  it("conta surdez por condição auditiva ou CID H90/H91", () => {
    expect(pertenceAoGrupo({ cid: "H90.3" }, "auditiva")).toBe(true);
    expect(pertenceAoGrupo({ tipo_condicao: "auditiva" }, "auditiva")).toBe(true);
    expect(pertenceAoGrupo({ cid: "F84" }, "auditiva")).toBe(false);
  });
});
