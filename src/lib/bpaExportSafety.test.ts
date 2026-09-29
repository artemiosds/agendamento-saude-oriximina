import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { isBpaAttendanceInCompetence } from "./bpaCompetencia";
import { loadBpaSigtapCatalog, parseBpaSigtapCatalog } from "./bpaSigtapCatalog";
import { validarListaProcedimentosBpaI } from "./bpaFinalValidation";
import { auditBpaTxtFinal, buildHeaderBpa, buildRegistro03, calcularCampoControleBpa } from "./bpaTxtLayout";

const comp = "202608";
const proc = (codigo: string) => `${codigo}${"NOME".padEnd(250)}1I${"0".repeat(68)}${comp}`;
const catalogo = parseBpaSigtapCatalog(comp, {
  procedimentos: [proc("0301100039"), proc("0301100268"), proc("0301010048")].join("\n"),
  registros: [`030110003902${comp}`, `030110026810${comp}`, `030101004802${comp}`].join("\n"),
  ocupacoes: [`0301100039322205${comp}`, `0301100268322205${comp}`, `0301010048223605${comp}`].join("\n"),
});
const ctx = {
  competencia: comp, catalogoOficial: catalogo, cbo: "322205", cnes: "1234567",
  cnsProfissional: "700000000000005", municipioPaciente: "150530",
  sexoPaciente: "F", idadePaciente: 30,
};

describe("segurança da exportação BPA-I", () => {
  it("aceita somente data real dentro da competência ou do dia escolhido", () => {
    expect(isBpaAttendanceInCompetence("2026-08-31", comp)).toBe(true);
    expect(isBpaAttendanceInCompetence("2026-09-01", comp)).toBe(false);
    expect(isBpaAttendanceInCompetence("2026-10-01", comp)).toBe(false);
    expect(isBpaAttendanceInCompetence("2026-07-31", comp)).toBe(false);
    expect(isBpaAttendanceInCompetence("2026-08-31", comp, "2026-08-30")).toBe(false);
  });

  it("preserva válido e rejeita separadamente instrumento, CBO e vigência", () => {
    const result = validarListaProcedimentosBpaI([
      { codigo: "0301100039" }, { codigo: "0301100268" },
      { codigo: "0301010048" }, { codigo: "0301109999" },
    ], ctx);
    expect(result.validos.map((item) => item.codigo)).toEqual(["0301100039"]);
    expect(result.rejeitados).toHaveLength(3);
    expect(result.rejeitados[0].rejeicoes.join(" ")).toContain("Instrumento incompatível");
    expect(result.rejeitados[1].rejeicoes.join(" ")).toContain("CBO incompatível");
    expect(result.rejeitados[2].rejeicoes.join(" ")).toContain("não vigente");
  });

  it("libera somente a relação CBO por opção manual, preservando os demais bloqueios", () => {
    const contextoExcecao = { ...ctx, permitirCboIncompativel: true };
    const cboIncompativel = validarListaProcedimentosBpaI([{ codigo: "0301010048" }], contextoExcecao);
    expect(cboIncompativel.validos).toHaveLength(1);
    expect(cboIncompativel.validos[0].avisos.join(" ")).toContain("Exportação autorizada por opção manual");

    const instrumento = validarListaProcedimentosBpaI([{ codigo: "0301100268" }], contextoExcecao);
    expect(instrumento.rejeitados[0].rejeicoes.join(" ")).toContain("Instrumento incompatível");

    const cboAusente = validarListaProcedimentosBpaI(
      [{ codigo: "0301010048" }], { ...contextoExcecao, cbo: "" },
    );
    expect(cboAusente.rejeitados[0].rejeicoes.join(" ")).toContain("CBO do profissional inválido ou ausente");
  });

  it("não exporta no BPA-I procedimento clínico da nutricionista com instrumento 10", () => {
    const catalogoNutri = parseBpaSigtapCatalog(comp, {
      procedimentos: proc("0101040121"),
      registros: `010104012110${comp}`,
      ocupacoes: `0101040121223710${comp}`,
    });
    const result = validarListaProcedimentosBpaI(
      [{ codigo: "0101040121" }],
      { ...ctx, cbo: "223710", catalogoOficial: catalogoNutri },
    );
    expect(result.validos).toHaveLength(0);
    expect(result.rejeitados).toHaveLength(1);
    expect(result.rejeitados[0].rejeicoes.join(" ")).toContain("Instrumento incompatível com BPA-I");
    expect(result.rejeitados[0].rejeicoes.join(" ")).not.toContain("CBO incompatível");
  });

  it("mantém CBO ausente fora do TXT sem classificá-lo como incompatibilidade SIGTAP", () => {
    for (const cbo of ["", "000000"]) {
      const result = validarListaProcedimentosBpaI([{ codigo: "0301100039" }], { ...ctx, cbo });
      expect(result.validos).toHaveLength(0);
      expect(result.rejeitados).toHaveLength(1);
      expect(result.rejeitados[0].rejeicoes).toContain(`CBO do profissional inválido ou ausente (${cbo || "vazio"})`);
      expect(result.rejeitados[0].rejeicoes.join(" ")).not.toContain("CBO incompatível");
    }
  });

  it("carrega os arquivos oficiais necessários do ZIP da competência sem gravar no banco", async () => {
    const zip = new JSZip();
    zip.file("tb_procedimento.txt", proc("0301100039"));
    zip.file("tb_procedimento_layout.txt", [
      "Coluna,Tamanho,Inicio,Fim,Tipo",
      "CO_PROCEDIMENTO,10,1,10,VARCHAR2",
      "TP_SEXO,1,262,262,VARCHAR2",
      "QT_MAXIMA_EXECUCAO,4,263,266,NUMBER",
      "VL_IDADE_MINIMA,4,275,278,NUMBER",
      "VL_IDADE_MAXIMA,4,279,282,NUMBER",
      "DT_COMPETENCIA,6,331,336,CHAR",
    ].join("\n"));
    zip.file("rl_procedimento_registro.txt", `030110003902${comp}`);
    zip.file("rl_procedimento_ocupacao.txt", `0301100039322205${comp}`);
    zip.file("rl_procedimento_servico.txt", "");
    zip.file("rl_procedimento_cid.txt", "");
    const archive = await zip.generateAsync({ type: "arraybuffer" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("api.github.com")) return { ok: true, json: async () => [
        { name: `TabelaUnificada_${comp}_v1.zip`, download_url: "https://example.test/sigtap.zip" },
      ] } as Response;
      return { ok: true, arrayBuffer: async () => archive } as Response;
    });
    try {
      const loaded = await loadBpaSigtapCatalog(comp);
      expect(loaded.get("0301100039")?.instrumentos.has("02")).toBe(true);
      expect(loaded.get("0301100039")?.cbos.has("322205")).toBe(true);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("valida idade em meses, quantidade, serviço/classificação e CID do SIGTAP oficial", () => {
    const layout = [
      "Coluna,Tamanho,Inicio,Fim,Tipo",
      "CO_PROCEDIMENTO,10,1,10,VARCHAR2",
      "TP_SEXO,1,262,262,VARCHAR2",
      "QT_MAXIMA_EXECUCAO,4,263,266,NUMBER",
      "VL_IDADE_MINIMA,4,275,278,NUMBER",
      "VL_IDADE_MAXIMA,4,279,282,NUMBER",
      "DT_COMPETENCIA,6,331,336,CHAR",
    ].join("\n");
    const row = Array(336).fill(" ");
    const put = (inicio: number, fim: number, value: string) => {
      const txt = value.padEnd(fim - inicio + 1, " ").slice(0, fim - inicio + 1);
      for (let i = 0; i < txt.length; i++) row[inicio - 1 + i] = txt[i];
    };
    put(1, 10, "0301010048");
    put(262, 262, "I");
    put(263, 266, "0002");
    put(275, 278, "0012");
    put(279, 282, "0240");
    put(331, 336, comp);
    const oficial = parseBpaSigtapCatalog(comp, {
      procedimentos: row.join(""),
      procedimentosLayout: layout,
      registros: `030101004802${comp}`,
      ocupacoes: `0301010048223810${comp}`,
      servicos: `0301010048123123${comp}`,
      cids: `0301010048F8401${comp}`,
    });
    const base = {
      ...ctx,
      catalogoOficial: oficial,
      cbo: "223810",
      idadePaciente: 10,
      idadePacienteMeses: 120,
      quantidade: 1,
      servico: "123",
      classificacao: "123",
    };

    expect(validarListaProcedimentosBpaI([{ codigo: "0301010048", cid: "F840" }], base).validos).toHaveLength(1);

    const menor = validarListaProcedimentosBpaI(
      [{ codigo: "0301010048", cid: "F840" }],
      { ...base, idadePacienteMeses: 11 },
    );
    expect(menor.rejeitados[0].rejeicoes.join(" ")).toContain("Idade incompatível");
    const menorComExcecaoCbo = validarListaProcedimentosBpaI(
      [{ codigo: "0301010048", cid: "F840" }],
      { ...base, cbo: "322205", permitirCboIncompativel: true, idadePacienteMeses: 11 },
    );
    expect(menorComExcecaoCbo.rejeitados[0].rejeicoes.join(" ")).toContain("Idade incompatível");

    const excesso = validarListaProcedimentosBpaI(
      [{ codigo: "0301010048", cid: "F840" }],
      { ...base, quantidade: 3 },
    );
    expect(excesso.rejeitados[0].rejeicoes.join(" ")).toContain("Quantidade incompatível");

    const servico = validarListaProcedimentosBpaI(
      [{ codigo: "0301010048", cid: "F840" }],
      { ...base, servico: "999", classificacao: "999" },
    );
    expect(servico.rejeitados[0].rejeicoes.join(" ")).toContain("Serviço/classificação incompatível");

    const cid = validarListaProcedimentosBpaI(
      [{ codigo: "0301010048", cid: "M545" }],
      base,
    );
    expect(cid.rejeitados[0].rejeicoes.join(" ")).toContain("CID incompatível");

    const allowlistLocalNaoPodeNegarOficial = validarListaProcedimentosBpaI(
      [{ codigo: "0301010048", cid: "F840" }],
      { ...base, permitidosPorCbo: { "223810": ["9999999999"] } },
    );
    expect(allowlistLocalNaoPodeNegarOficial.validos).toHaveLength(1);
  });

  it("audita 338 posições, cabeçalho 130, competência, controle e sequência do TXT final", () => {
    const record = buildRegistro03({
      tipoRegistro: "03", cnes: "1234567", competencia: comp,
      cnsProfissional: ctx.cnsProfissional, cbo: ctx.cbo, dataAtendimento: "20260831",
      folha: 1, sequencia: 1, procedimento: "0301100039", cnsPaciente: ctx.cnsProfissional,
      sexo: "F", municipioIbge: "150530", idade: 30, quantidade: 1,
      caraterAtendimento: "01", origem: "BPA", nomePaciente: "TESTE",
      dataNascimento: "19960101", racaCor: "01", nacionalidade: "010",
    }).line;
    const control = calcularCampoControleBpa([{ procedimento: "0301100039", quantidade: "000001" }]);
    const header = buildHeaderBpa({
      competencia: comp, totalRegistros: 1, totalFolhas: 1, campoControle: control,
      orgaoOrigem: "SMS", siglaOrigem: "SMS", documentoOrigem: "12345678000199",
      orgaoDestino: "SMS", indicadorDestino: "M", versaoSistema: "SMS",
    }).line;
    expect(record).toHaveLength(338);
    expect(header).toHaveLength(130);
    expect(auditBpaTxtFinal(`${header}\r\n${record}\r\n`, comp)).toEqual([]);
    const nextMonth = `${record.slice(0, 36)}20260901${record.slice(44)}`;
    expect(auditBpaTxtFinal(`${header}\r\n${nextMonth}\r\n`, comp)).toContain("Registro 03 1: Atendimento fora da competência selecionada");
  });

  it("rejeita folha e sequência incoerentes quando a produção passa de vinte linhas", () => {
    const records = Array.from({ length: 21 }, (_, index) => buildRegistro03({
      tipoRegistro: "03", cnes: "1234567", competencia: comp,
      cnsProfissional: ctx.cnsProfissional, cbo: ctx.cbo, dataAtendimento: "20260831",
      folha: Math.floor(index / 20) + 1, sequencia: (index % 20) + 1,
      procedimento: "0301100039", cnsPaciente: ctx.cnsProfissional,
      sexo: "F", municipioIbge: "150530", idade: 30, quantidade: 1,
      caraterAtendimento: "01", origem: "BPA", nomePaciente: "TESTE",
      dataNascimento: "19960101", racaCor: "01", nacionalidade: "010",
    }).line);
    const header = buildHeaderBpa({
      competencia: comp, totalRegistros: 21, totalFolhas: 2,
      campoControle: calcularCampoControleBpa(records.map(() => ({ procedimento: "0301100039", quantidade: 1 }))),
      orgaoOrigem: "SMS", siglaOrigem: "SMS", documentoOrigem: "12345678000199",
      orgaoDestino: "SMS", indicadorDestino: "M", versaoSistema: "SMS",
    }).line;
    expect(auditBpaTxtFinal([header, ...records].join("\r\n") + "\r\n", comp)).toEqual([]);
    const malformed = `${records[20].slice(0, 44)}00101${records[20].slice(49)}`;
    expect(auditBpaTxtFinal([header, ...records.slice(0, 20), malformed].join("\r\n") + "\r\n", comp))
      .toContain("Registro 03 21: folha ou sequência divergente");
  });
});
