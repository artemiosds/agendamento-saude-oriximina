import { describe, expect, it } from "vitest";
import {
  BPA_HEADER_LENGTH,
  BPA_I_RECORD_LENGTH,
  buildHeaderBpa,
  buildRegistro03,
  normalizeBpaStreetNumber,
} from "@/lib/bpaTxtLayout";

const registroBase = {
  tipoRegistro: "03",
  cnes: "1234567",
  competencia: "202609",
  cnsProfissional: "123456789010000",
  cbo: "223710",
  dataAtendimento: "20260919",
  folha: "001",
  sequencia: "01",
  procedimento: "0301010048",
  cnsPaciente: "165760001230004",
  sexo: "F",
  municipioIbge: "150530",
  cid: "M545",
  idade: "035",
  quantidade: "000001",
  caraterAtendimento: "01",
  autorizacao: "",
  origem: "BPA",
  nomePaciente: "PACIENTE TESTE",
  dataNascimento: "19910101",
  racaCor: "03",
  etnia: "",
  nacionalidade: "010",
  servico: "",
  classificacao: "",
  sequenciaEquipe: "",
  areaEquipe: "",
  cnpj: "",
  cep: "68270000",
  codigoLogradouro: "100",
  logradouro: "TR DA CONQUISTA 632",
  complemento: "",
  numero: "632",
  bairro: "CENTRO",
  telefone: "93999999999",
  email: "TESTE@EXEMPLO.COM",
  ineEquipe: "",
};

describe("BPA-I TXT layout", () => {
  it("preserva o tamanho oficial do Registro 03", () => {
    const result = buildRegistro03(registroBase);
    expect(result.line).toHaveLength(BPA_I_RECORD_LENGTH);
    expect(result.errors).toEqual([]);
  });

  it("remove somente número comprovadamente duplicado no final do logradouro", () => {
    const result = normalizeBpaStreetNumber("TR DA CONQUISTA 632", "632");
    expect(result).toEqual({ logradouro: "TR DA CONQUISTA", numero: "632", adjusted: true });
  });

  it("preserva número alfanumérico válido", () => {
    expect(normalizeBpaStreetNumber("RUA TESTE", "35B")).toEqual({
      logradouro: "RUA TESTE",
      numero: "35B",
      adjusted: false,
    });
    expect(normalizeBpaStreetNumber("RUA TESTE", "SN")).toEqual({
      logradouro: "RUA TESTE",
      numero: "SN",
      adjusted: false,
    });
  });

  it("não remove número que faz parte real do nome quando não coincide com o campo estruturado", () => {
    const result = normalizeBpaStreetNumber("RUA 7 DE SETEMBRO", "120");
    expect(result.logradouro).toBe("RUA 7 DE SETEMBRO");
    expect(result.adjusted).toBe(false);
  });

  it("bloqueia campo obrigatório vazio antes do download", () => {
    const result = buildRegistro03({ ...registroBase, cnes: "" });
    expect(result.errors.some((e) => e.field === "cnes")).toBe(true);
    expect(result.line).toHaveLength(BPA_I_RECORD_LENGTH);
  });

  it("preserva o cabeçalho oficial de 130 posições", () => {
    const header = buildHeaderBpa({
      competencia: "202609",
      totalRegistros: 3,
      totalFolhas: 1,
      campoControle: "1234",
      orgaoOrigem: "SECRETARIA MUNICIPAL DE SAUDE",
      siglaOrigem: "SMS",
      documentoOrigem: "12345678000199",
      orgaoDestino: "SECRETARIA MUNICIPAL DE SAUDE",
      indicadorDestino: "M",
      versaoSistema: "SMSORIXI",
    });
    expect(header.line).toHaveLength(BPA_HEADER_LENGTH);
    expect(header.errors).toEqual([]);
  });
});
