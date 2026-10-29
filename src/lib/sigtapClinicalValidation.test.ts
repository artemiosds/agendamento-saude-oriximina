import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./bpaSigtapCatalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bpaSigtapCatalog")>()),
  loadBpaSigtapCatalog: vi.fn(),
}));

import { loadBpaSigtapCatalog } from "./bpaSigtapCatalog";
import {
  calcularIdadeMesesSigtap,
  competenciaFromDate,
  resolveProfessionalCbo,
  validarCompatibilidadeClinicaSigtap,
} from "./sigtapClinicalValidation";

const loadMock = vi.mocked(loadBpaSigtapCatalog);

describe("validação clínica SIGTAP", () => {
  beforeEach(() => {
    loadMock.mockReset();
    loadMock.mockResolvedValue(
      new Map([
        [
          "0301010048",
          {
            instrumentos: new Set(["02"]),
            cbos: new Set(["223810"]),
            sexo: "I",
            quantidadeMaxima: 1,
            idadeMinimaMeses: 12,
            idadeMaximaMeses: 1560,
            servicosClassificacoes: new Set(),
            cids: new Set(["F840"]),
          },
        ],
        [
          "0101040121",
          {
            instrumentos: new Set(["10"]),
            cbos: new Set(["223710"]),
            sexo: "I",
            quantidadeMaxima: null,
            idadeMinimaMeses: 216,
            idadeMaximaMeses: null,
            servicosClassificacoes: new Set(),
            cids: new Set(),
          },
        ],
      ]),
    );
  });

  it("calcula idade em meses usando a data do atendimento", () => {
    expect(calcularIdadeMesesSigtap("2020-01-20", "2021-01-19")).toBe(11);
    expect(calcularIdadeMesesSigtap("2020-01-20", "2021-01-20")).toBe(12);
    expect(competenciaFromDate("2026-09-28")).toBe("202609");
  });

  it("resolve CBO por campos usuais do profissional", () => {
    expect(resolveProfessionalCbo({ custom_data: { cbo_codigo: "223810" } })).toBe("223810");
    expect(resolveProfessionalCbo({ customData: { cbo_codigo: "223605" } })).toBe("223605");
    expect(resolveProfessionalCbo({ custom_data: {}, customData: { cbo_codigo: "223605" } })).toBe("223605");
    expect(resolveProfessionalCbo({ cbo: "2236-05" })).toBe("223605");
  });

  it("marca compatível quando competência, CBO, idade, sexo e instrumento atendem ao SIGTAP", async () => {
    const result = await validarCompatibilidadeClinicaSigtap({
      procedimento: "0301010048",
      competencia: "202609",
      cbo: "223810",
      dataNascimento: "2010-01-01",
      dataAtendimento: "2026-09-28",
      sexo: "F",
    });
    expect(result.status).toBe("compatível");
    expect(result.bpaICompativel).toBe(true);
  });

  it("permite registro clínico da nutricionista com instrumento 10 e o exclui do BPA-I", async () => {
    const result = await validarCompatibilidadeClinicaSigtap({
      procedimento: "0101040121",
      competencia: "202609",
      cbo: "223710",
      dataNascimento: "1980-01-01",
      dataAtendimento: "2026-09-29",
      sexo: "F",
    });
    expect(result.status).toBe("compatível");
    expect(result.motivos).toEqual([]);
    expect(result.bpaICompativel).toBe(false);
    expect(result.avisos.join(" ")).toContain("fora do BPA-I");
    expect(result.avisos.join(" ")).toContain("10 — e-SUS APS");
  });

  it("mantém incompatibilidade real de CBO mesmo quando o instrumento também é fora do BPA-I", async () => {
    const result = await validarCompatibilidadeClinicaSigtap({
      procedimento: "0101040121",
      competencia: "202609",
      cbo: "322205",
      dataNascimento: "1980-01-01",
      dataAtendimento: "2026-09-29",
      sexo: "F",
    });
    expect(result.status).toBe("incompatível");
    expect(result.motivos.join(" ")).toContain("CBO 322205");
    expect(result.bpaICompativel).toBe(false);
  });

  it("marca incompatível por CBO e idade quando as regras oficiais falham", async () => {
    const result = await validarCompatibilidadeClinicaSigtap({
      procedimento: "0301010048",
      competencia: "202609",
      cbo: "322205",
      dataNascimento: "2026-09-20",
      dataAtendimento: "2026-09-28",
      sexo: "F",
    });
    expect(result.status).toBe("incompatível");
    expect(result.motivos.join(" ")).toContain("CBO 322205");
    expect(result.motivos.join(" ")).toContain("Idade mínima");
  });

  it("não chama indisponibilidade do catálogo de incompatibilidade", async () => {
    loadMock.mockRejectedValueOnce(new Error("offline"));
    const result = await validarCompatibilidadeClinicaSigtap({
      procedimento: "0301010048",
      competencia: "202609",
      cbo: "223810",
      dataNascimento: "2010-01-01",
      dataAtendimento: "2026-09-28",
      sexo: "F",
    });
    expect(result.status).toBe("indeterminado");
    expect(result.avisos.join(" ")).toContain("indisponível");
  });

  it("usa a competência anterior apenas como referência clínica quando a atual não existe", async () => {
    loadMock.mockRejectedValueOnce(new Error("competência ainda não publicada"));
    const result = await validarCompatibilidadeClinicaSigtap({
      procedimento: "0301010048",
      competencia: "202610",
      usarReferenciaAnterior: true,
      cbo: "322205",
      dataNascimento: "2026-09-20",
      dataAtendimento: "2026-10-01",
      sexo: "F",
    });
    expect(loadMock).toHaveBeenNthCalledWith(2, "202609");
    expect(result.status).toBe("indeterminado");
    expect(result.competenciaReferencia).toBe("202609");
    expect(result.motivos.join(" ")).toContain("CBO 322205");
    expect(result.motivos.join(" ")).toContain("Idade abaixo");
    expect(result.bpaICompativel).toBe(true);
  });

  it("na seleção clínica preserva o instrumento conhecido mesmo com referência anterior habilitada", async () => {
    const result = await validarCompatibilidadeClinicaSigtap({
      procedimento: "0101040121",
      competencia: "202609",
      usarReferenciaAnterior: true,
      cbo: "223710",
      dataNascimento: "1980-01-01",
      dataAtendimento: "2026-09-29",
      sexo: "F",
    });
    expect(result.status).toBe("compatível");
    expect(result.validacaoClinicaLimitada).toBe(true);
    expect(result.bpaICompativel).toBe(false);
    expect(result.instrumentoRotulo).toContain("e-SUS APS");
    expect(result.avisos.join(" ")).toContain("sem instrumento 02");
  });

  it("não impede o registro clínico de um código ausente no catálogo do mês", async () => {
    const result = await validarCompatibilidadeClinicaSigtap({
      procedimento: "0302050027",
      competencia: "202609",
      usarReferenciaAnterior: true,
      cbo: "223810",
    });
    expect(result.status).toBe("indeterminado");
    expect(result.semRegrasProcedimento).toBe(true);
    expect(result.motivos).toEqual([]);
  });

  it("mantém o registro clínico sem parecer quando nenhuma referência está acessível", async () => {
    loadMock.mockRejectedValue(new Error("offline"));
    const result = await validarCompatibilidadeClinicaSigtap({
      procedimento: "0301010048",
      competencia: "202610",
      usarReferenciaAnterior: true,
      cbo: "223810",
    });
    expect(result.status).toBe("indeterminado");
    expect(result.catalogoIndisponivel).toBe(true);
    expect(result.competenciaReferencia).toBeUndefined();
    expect(loadMock).toHaveBeenCalledTimes(4);
  });
});

describe('instrumento na seleção clínica',()=>{
 it.each([['01',false],['02',true],['06',false],['08',false],['09',false]])('preserva instrumento %s mesmo no modo de referência',async(code,expected)=>{
  loadMock.mockReset();loadMock.mockResolvedValue(new Map([['0101010010',{instrumentos:new Set([code]),cbos:new Set(['223810']),sexo:'I',quantidadeMaxima:null,idadeMinimaMeses:null,idadeMaximaMeses:null,servicosClassificacoes:new Set(),cids:new Set()}]]));
  const result=await validarCompatibilidadeClinicaSigtap({procedimento:'0101010010',competencia:'202610',cbo:'223810',usarReferenciaAnterior:true});
  expect(result.status).toBe('compatível');
  expect(result.bpaICompativel).toBe(expected);expect(result.instrumentos).toEqual([code]);expect(result.instrumentoRotulo).toContain(code);
 });
 it('mantém o instrumento da referência realmente encontrada sem atribuir vigência ao mês solicitado',async()=>{
  loadMock.mockReset();loadMock.mockRejectedValueOnce(new Error('sem catálogo')).mockResolvedValue(new Map([['0101010010',{instrumentos:new Set(['01']),cbos:new Set(['223810']),sexo:'I',quantidadeMaxima:null,idadeMinimaMeses:null,idadeMaximaMeses:null,servicosClassificacoes:new Set(),cids:new Set()}]]));
  const r=await validarCompatibilidadeClinicaSigtap({procedimento:'0101010010',competencia:'202610',cbo:'223810',usarReferenciaAnterior:true});
  expect(r.status).toBe('indeterminado');expect(r.competenciaReferencia).toBe('202609');expect(r.bpaICompativel).toBe(false);expect(r.instrumentos).toEqual(['01']);
 });
});
