import { describe, expect, it } from "vitest";
import { resolveBpaHeaderDocument } from "./bpaHeaderSource";

describe("documento de origem do cabeçalho BPA-I", () => {
  it("prioriza o documento cadastrado na unidade", () => {
    expect(resolveBpaHeaderDocument({ unidadeCustomData: { cnpj: "12.345.678/0001-99" } }))
      .toBe("12345678000199");
  });

  it("reutiliza a configuração institucional quando a unidade não possui documento", () => {
    expect(resolveBpaHeaderDocument({
      systemConfig: { config_sistema: { instituicao: { cnpj: "98.765.432/0001-10" } } },
    })).toBe("98765432000110");
  });

  it("preserva o preenchimento numérico aceito quando não existe CNPJ cadastrado", () => {
    expect(resolveBpaHeaderDocument({})).toBe("00000000000000");
  });
});