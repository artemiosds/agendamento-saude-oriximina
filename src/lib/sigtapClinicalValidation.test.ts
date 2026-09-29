import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./bpaSigtapCatalog", () => ({
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
});
