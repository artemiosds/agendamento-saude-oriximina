import { describe, expect, it } from "vitest";
import { avaliarCboSigtap, parseBpaSigtapCatalog } from "./bpaSigtapCatalog";
import { validarProcedimentoBpaI } from "./bpaFinalValidation";

const proc = (cbos: string[], detalhes?: string[]) => ({
  cbos: new Set(cbos),
  detalhes: detalhes ? new Set(detalhes) : undefined,
});

describe("regra única CBO × SIGTAP", () => {
  it("CBO listado e permitido", () => expect(avaliarCboSigtap(proc(["223810"]), "223810")).toBe("permitido"));
  it("CBO listado e não permitido", () => expect(avaliarCboSigtap(proc(["223810"]), "251605")).toBe("incompativel"));
  it("lista vazia com atributo 021", () => expect(avaliarCboSigtap(proc([], ["021"]), "251605")).toBe("nao_exige_cbo"));
  it("lista vazia sem 021 não é incompatível", () => expect(avaliarCboSigtap(proc([], ["009"]), "251605")).toBe("nao_confirmavel"));
  it("lista vazia com arquivo de atributos ausente", () => expect(avaliarCboSigtap(proc([]), "251605")).toBe("nao_confirmavel"));

  it("lê o atributo 021 de rl_procedimento_detalhe na competência", () => {
    const linhaProc = "0301040079".padEnd(330, " ") + "202609";
    const cat = parseBpaSigtapCatalog("202609", {
      procedimentos: linhaProc,
      registros: "030104007902202609",
      ocupacoes: "",
      detalhes: "0301040079009202609\n0301040079021202608",
    });
    expect(cat.get("0301040079")?.detalhes?.has("009")).toBe(true);
    expect(cat.get("0301040079")?.detalhes?.has("021")).toBe(false);
  });

  it("0301040079 com CBO 251605 não é rejeitado por CBO na validação final", () => {
    const catalogo = new Map([["0301040079", {
      instrumentos: new Set(["01", "02"]), cbos: new Set<string>(), sexo: "I",
      quantidadeMaxima: null, idadeMinimaMeses: null, idadeMaximaMeses: null,
      servicosClassificacoes: new Set<string>(), cids: new Set<string>(), detalhes: new Set(["009"]),
    }]]);
    const r = validarProcedimentoBpaI({ codigo: "0301040079" } as any, {
      cbo: "251605", competencia: "202609", catalogoOficial: catalogo,
    } as any);
    expect(r.rejeicoes.some((m: string) => m.includes("CBO incompatível"))).toBe(false);
    expect(r.avisos.some((m: string) => m.includes("não confirmada"))).toBe(true);
  });
});
