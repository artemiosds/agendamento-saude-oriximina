import { describe, expect, it } from "vitest";
import { deserializeDadosPaciente, emptyDadosPaciente, serializeDadosPaciente } from "./DadosPacienteBlocos";

describe("compatibilidade dos endereços de pacientes", () => {
  it("sugere Oriximiná/PA/CEP/IBGE somente para cadastro novo", () => {
    expect(emptyDadosPaciente()).toMatchObject({
      municipio: "Oriximiná", endereco_uf: "PA", cep: "68270-000", ibge_municipio: "1505304",
    });
    expect(deserializeDadosPaciente({ municipio: "", custom_data: {} })).toMatchObject({
      municipio: "", endereco_municipio: "", endereco_uf: "", cep: "",
    });
  });
  it("carrega formatos existentes e preserva custom_data, número, complemento e IBGE", () => {
    const cd = { uf: "AM", cep: "69005-010", bairro: "CENTRO", logradouro: "RUA ANTIGA", numero: "24", complemento: "B", ibge_municipio: "1302603", campo_extra: "preservado" };
    const value = deserializeDadosPaciente({ municipio: "Manaus", custom_data: cd });
    expect(value).toMatchObject({ endereco_municipio: "Manaus", endereco_uf: "AM", cep: cd.cep });
    const saved = serializeDadosPaciente(value, cd);
    expect(saved.municipio).toBe("Manaus");
    expect(saved.custom_data).toMatchObject(cd);
    expect(saved.custom_data).not.toHaveProperty("enderecoAtualizado");
  });
  it("sincroniza os dois formatos de UF e o IBGE após uma mudança explícita", () => {
    const value = { ...emptyDadosPaciente(), municipio: "OBIDOS", endereco_municipio: "OBIDOS", endereco_uf: "PA", ibge_municipio: "1505106", enderecoAtualizado: true };
    expect(serializeDadosPaciente(value, { uf: "AM", campo_extra: true }).custom_data).toMatchObject({
      uf: "PA", endereco_uf: "PA", ibge_municipio: "1505106", campo_extra: true,
    });
  });
});
