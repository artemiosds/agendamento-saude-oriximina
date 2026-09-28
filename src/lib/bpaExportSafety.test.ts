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

  it("carrega os três arquivos do ZIP da competência sem gravar no banco", async () => {
    const zip = new JSZip();
    zip.file("tb_procedimento.txt", proc("0301100039"));
    zip.file("rl_procedimento_registro.txt", `030110003902${comp}`);
    zip.file("rl_procedimento_ocupacao.txt", `0301100039322205${comp}`);
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
