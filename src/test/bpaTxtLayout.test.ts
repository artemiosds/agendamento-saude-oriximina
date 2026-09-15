import { beforeEach, describe, expect, it } from "vitest";
import {
  normalizeEnderecoBpaDne,
  primeDneLogradouros,
} from "@/lib/bpaNormalization";
import {
  documentoOrigemDaUnidade,
  primeBpaDocumentoOrigemInstitucional,
} from "@/lib/bpaHeaderSource";
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

const headerBase = {
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
};

const dneRows = [
  { codigo: "081", descricao: "Rua" },
  { codigo: "008", descricao: "Avenida" },
  { codigo: "100", descricao: "Travessa" },
  { codigo: "011", descricao: "Beco" },
  { codigo: "001", descricao: "Acesso" },
  { codigo: "002", descricao: "Atalho" },
];

beforeEach(() => {
  primeDneLogradouros(dneRows);
  primeBpaDocumentoOrigemInstitucional("");
});

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

  it("normaliza Rua João Stumano com o código existente da tabela DNE", () => {
    const result = normalizeEnderecoBpaDne({ logradouro: "Rua João Stumano" });
    expect(result.codigoLogradouro).toBe("081");
    expect(result.logradouro).toBe("JOAO STUMANO");
    expect(result.correspondenciaSegura).toBe(true);
  });

  it("normaliza Avenida Brasil com o código existente da tabela DNE", () => {
    const result = normalizeEnderecoBpaDne({ logradouro: "Avenida Brasil" });
    expect(result.codigoLogradouro).toBe("008");
    expect(result.logradouro).toBe("BRASIL");
  });

  it("normaliza Travessa da Conquista com o código existente da tabela DNE", () => {
    const result = normalizeEnderecoBpaDne({ logradouro: "Travessa da Conquista" });
    expect(result.codigoLogradouro).toBe("100");
    expect(result.logradouro).toBe("DA CONQUISTA");
  });

  it("preserva tipo já preenchido e remove o texto duplicado do logradouro", () => {
    const result = normalizeEnderecoBpaDne({
      codigoLogradouro: "081",
      tipoLogradouro: "Rua",
      logradouro: "Rua João Stumano",
    });
    expect(result.codigoLogradouro).toBe("081");
    expect(result.logradouro).toBe("JOAO STUMANO");
    expect(result.fonte).toBe("codigo_existente");
  });

  it("sem correspondência segura não inventa código nem altera o nome", () => {
    const result = normalizeEnderecoBpaDne({ logradouro: "Residencial Sol Nascente" });
    expect(result.codigoLogradouro).toBe("");
    expect(result.logradouro).toBe("RESIDENCIAL SOL NASCENTE");
    expect(result.correspondenciaSegura).toBe(false);
  });

  it("usa qualquer tipo carregado de logradouros_dne, inclusive Acesso e Atalho", () => {
    const acesso = normalizeEnderecoBpaDne({ logradouro: "Acesso Norte" });
    const atalho = normalizeEnderecoBpaDne({ logradouro: "Atalho do Porto" });
    expect(acesso).toMatchObject({ codigoLogradouro: "001", logradouro: "NORTE" });
    expect(atalho).toMatchObject({ codigoLogradouro: "002", logradouro: "DO PORTO" });
  });

  it("aplica o DNE na preparação real do Registro 03", () => {
    const result = buildRegistro03({
      ...registroBase,
      codigoLogradouro: "",
      logradouro: "Rua João Stumano",
      numero: "10",
    });
    expect(result.line.slice(199, 202)).toBe("081");
    expect(result.line.slice(202, 232).trim()).toBe("JOAO STUMANO");
  });

  it("bloqueia campo obrigatório vazio antes do download", () => {
    const result = buildRegistro03({ ...registroBase, cnes: "" });
    expect(result.errors.some((e) => e.field === "cnes")).toBe(true);
    expect(result.line).toHaveLength(BPA_I_RECORD_LENGTH);
  });

  it("preserva o mapeamento histórico do documento institucional da unidade", () => {
    expect(documentoOrigemDaUnidade({ custom_data: { cnpj: "12.345.678/0001-99" } })).toBe("12345678000199");
    expect(documentoOrigemDaUnidade({ cnpj: "12345678000199", custom_data: {} })).toBe("12345678000199");
    expect(documentoOrigemDaUnidade({ custom_data: { cpf: "123.456.789-01" } })).toBe("12345678901");
  });

  it("mantém documentoOrigem direto nas posições 66-79 e Header com 130 posições", () => {
    const header = buildHeaderBpa({ ...headerBase, documentoOrigem: "12.345.678/0001-99" });
    expect(header.errors).toEqual([]);
    expect(header.line).toHaveLength(BPA_HEADER_LENGTH);
    expect(header.line.slice(65, 79)).toBe("12345678000199");
  });

  it("reutiliza documento institucional real quando a unidade do Header não o possui", () => {
    primeBpaDocumentoOrigemInstitucional("12.345.678/0001-99");
    const header = buildHeaderBpa({ ...headerBase, documentoOrigem: "" });
    expect(header.errors.some((e) => e.field === "documentoOrigem")).toBe(false);
    expect(header.line.slice(65, 79)).toBe("12345678000199");
    expect(header.line).toHaveLength(BPA_HEADER_LENGTH);
  });

  it("mantém documentoOrigem obrigatório quando não existe fonte institucional segura", () => {
    primeBpaDocumentoOrigemInstitucional("");
    const header = buildHeaderBpa({ ...headerBase, documentoOrigem: "" });
    expect(header.errors.some((e) => e.field === "documentoOrigem")).toBe(true);
    expect(header.line).toHaveLength(BPA_HEADER_LENGTH);
  });

  it("preserva o cabeçalho oficial de 130 posições", () => {
    const header = buildHeaderBpa(headerBase);
    expect(header.line).toHaveLength(BPA_HEADER_LENGTH);
    expect(header.errors).toEqual([]);
  });
});
