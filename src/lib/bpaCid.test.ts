import { describe, expect, it } from "vitest";
import { extractBpaCidCodes, resolveBpaCid, resolveBpaCidDetails } from "./bpaCid";

describe("CID estruturado sem perda de vínculo", () => {
  it("lê listas, objetos e JSON e prioriza o diagnóstico marcado", () => {
    const valores = [{ codigo: "F82" }, { cid_codigo: "G80.9", principal: true }, { value: "M54.5" }];
    expect(extractBpaCidCodes(valores)).toEqual(["G809", "F82", "M545"]);
    expect(extractBpaCidCodes(JSON.stringify(valores))).toEqual(["G809", "F82", "M545"]);
  });
  it("preserva cinco CIDs do procedimento sem misturar outro diagnóstico do paciente", () => {
    expect(resolveBpaCidDetails({ procedureCid: ["F82", "G809", "M545", "F840", "R262"], paciente: { cid: "I10" } }))
      .toEqual({ cid: "F82", adicionais: ["G809", "M545", "F840", "R262"] });
  });
  it("aceita prontuário sem PTS e PTS estruturado apenas como fallback", () => {
    expect(resolveBpaCid({ prontuario: { custom_data: { esp_hipotese_cid: { codigo: "F82" } } }, ptsCid: "G809" })).toBe("F82");
    expect(resolveBpaCidDetails({ ptsCid: [{ cid_codigo: "G809" }, { cid_codigo: "F82" }] })).toEqual({ cid: "G809", adicionais: ["F82"] });
  });
  it("não extrai diagnósticos de propriedades sem vínculo e suporta objetos circulares", () => {
    const v: any = { observacao: "I10", codigo: "F82" }; v.cids = v;
    expect(extractBpaCidCodes(v)).toEqual(["F82"]);
  });
});

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

describe("resolveBpaCid — hipótese e PTS", () => {
  it("usa a hipótese do prontuário", () => {
    expect(resolveBpaCid({ prontuario: { hipotese: "F84.0 autismo" } })).toBe("F840");
  });
  it("usa o CID do PTS quando o prontuário não tem CID", () => {
    expect(resolveBpaCid({ prontuario: {}, ptsCid: "G80.9" })).toBe("G809");
  });
  it("prontuário tem prioridade sobre o PTS", () => {
    expect(resolveBpaCid({ prontuario: { custom_data: { esp_hipotese_cid: "M54.5" } }, ptsCid: "G80.9" })).toBe("M545");
  });
});
