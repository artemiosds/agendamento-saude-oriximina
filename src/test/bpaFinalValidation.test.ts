import { describe, expect, it } from "vitest";
import { validarListaProcedimentosBpaI } from "@/lib/bpaFinalValidation";

const ctxBase = {
  competencia: "202609",
  cbo: "223710",
  cnes: "1234567",
  cnsProfissional: "123456789010000",
  municipioPaciente: "150530",
  sexoPaciente: "F",
  idadePaciente: 35,
  codigosConhecidos: new Set(["0301010048", "0301010072", "0301010030"]),
  restricoes: {},
  permitidosPorCbo: {},
  bloqueadosPorCbo: {},
  liberarTodos: true,
};

describe("BPA-I final validation", () => {
  it("mantém todos os procedimentos diferentes do mesmo atendimento", () => {
    const result = validarListaProcedimentosBpaI(
      [
        { codigo: "0301010048", origem: "Prontuário" },
        { codigo: "0301010072", origem: "PTS" },
        { codigo: "0301010030", origem: "Procedimentos vinculados" },
      ],
      ctxBase,
    );

    expect(result.validos.map((r) => r.codigo)).toEqual([
      "0301010048",
      "0301010072",
      "0301010030",
    ]);
    expect(result.rejeitados).toHaveLength(0);
  });

  it("não transforma múltiplos procedimentos válidos em erro", () => {
    const result = validarListaProcedimentosBpaI(
      [
        { codigo: "0301010048", origem: "Prontuário" },
        { codigo: "0301010072", origem: "PTS" },
      ],
      ctxBase,
    );
    expect(result.validos).toHaveLength(2);
    expect(result.todos.every((r) => r.valido)).toBe(true);
  });

  it("bloqueia procedimento incompatível com idade mínima", () => {
    const result = validarListaProcedimentosBpaI(
      [{ codigo: "0301010048", origem: "Prontuário" }],
      {
        ...ctxBase,
        idadePaciente: 2,
        restricoes: {
          "0301010048": { idadeMin: 3, instrumento: "BPA-I" },
        },
      },
    );

    expect(result.validos).toHaveLength(0);
    expect(result.rejeitados).toHaveLength(1);
    expect(result.rejeitados[0].rejeicoes.join(" ")).toContain("idade mínima 3");
  });

  it("permite procedimento quando idade está dentro da faixa", () => {
    const result = validarListaProcedimentosBpaI(
      [{ codigo: "0301010048", origem: "Prontuário" }],
      {
        ...ctxBase,
        idadePaciente: 3,
        restricoes: {
          "0301010048": { idadeMin: 3, idadeMax: 10, instrumento: "BPA-I" },
        },
      },
    );

    expect(result.validos).toHaveLength(1);
    expect(result.rejeitados).toHaveLength(0);
  });

  it("bloqueia SIGTAP inexistente no catálogo ativo", () => {
    const result = validarListaProcedimentosBpaI(
      [{ codigo: "9999999999", origem: "Manual" }],
      ctxBase,
    );
    expect(result.rejeitados).toHaveLength(1);
    expect(result.rejeitados[0].rejeicoes.join(" ")).toContain("não encontrado na tabela SIGTAP ativa");
  });
});
