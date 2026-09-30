import { describe, expect, it } from "vitest";
import { extractBpaCidCodes, resolveBpaCid } from "./bpaCid";

describe("CID da linha BPA-I", () => {
  it("recupera CID salvo pelo resolvedor nos campos cid10/cid_principal", () => {
    expect(resolveBpaCid({ prontuario: { custom_data: { cid10: "M54.5 - Lombalgia" } } })).toBe("M545");
    expect(resolveBpaCid({ prontuario: { custom_data: { cid_principal: "F84.0" } } })).toBe("F840");
  });

  it("prioriza vínculo específico do SIGTAP e não fabrica um código", () => {
    expect(resolveBpaCid({
      procedureCid: "G80",
      prontuario: { custom_data: { cid10: "M54.5" } },
    })).toBe("G80");
    expect(resolveBpaCid({ prontuario: { custom_data: { evolucao: "dor crônica" } } })).toBe("");
  });

  it("mantém compatibilidade com código simples e com CID embutido em texto", () => {
    expect(extractBpaCidCodes("CID: I64 / AVC")).toEqual(["I64"]);
  });
});
