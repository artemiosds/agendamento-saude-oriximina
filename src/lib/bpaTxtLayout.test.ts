import { describe, expect, it } from "vitest";
import {
  BPA_HEADER_LENGTH,
  BPA_I_FIELDS,
  BPA_I_RECORD_LENGTH,
  buildHeaderBpa,
  buildRegistro03,
  auditRegistro03Serialization,
  calcularCampoControleBpa,
  readRegistro03Field,
} from "./bpaTxtLayout";
import { resolveMunicipioBpa } from "./bpaNormalization";

const registroValido = () => ({
  tipoRegistro: "03",
  cnes: "1234567",
  competencia: "202609",
  cnsProfissional: "123456789012345",
  cbo: "223605",
  dataAtendimento: "20260919",
  folha: 1,
  sequencia: 1,
  procedimento: "03.01.01.004-8",
  cnsPaciente: "987654321098765",
  sexo: "F",
  municipioIbge: "150530",
  cid: "F84.0",
  idade: 12,
  quantidade: 1,
  caraterAtendimento: "01",
  autorizacao: "",
  origem: "BPA",
  nomePaciente: "João\tda\nSilva",
  dataNascimento: "20140120",
  racaCor: "03",
  etnia: "",
  nacionalidade: "010",
  servico: "",
  classificacao: "",
  sequenciaEquipe: "",
  areaEquipe: "",
  cnpj: "",
  cep: "68270000",
  codigoLogradouro: "081",
  logradouro: "Rua César Guerreiro com nome excessivamente longo 1021",
  complemento: "Casa A",
  numero: "1021",
  bairro: "Cidade Nova",
  telefone: "93999999999",
  email: "paciente@example.com",
  ineEquipe: "",
});

describe("layout TXT BPA-I", () => {
  it("gera Registro 03 de 338 posições com todos os offsets oficiais contíguos", () => {
    const defs = Object.values(BPA_I_FIELDS);
    defs.forEach((field, index) => {
      expect(field.length).toBe(field.end - field.start + 1);
      if (index > 0) expect(field.start).toBe(defs[index - 1].end + 1);
    });
    expect(defs[0].start).toBe(1);
    expect(defs[defs.length - 1].end).toBe(BPA_I_RECORD_LENGTH);
    expect(buildRegistro03(registroValido()).line).toHaveLength(338);
  });

  it("mantém logradouro, complemento, número e bairro em campos independentes", () => {
    const result = buildRegistro03(registroValido());
    expect(result.errors).toEqual([]);
    expect(result.line.slice(202, 232)).toBe("RUA CESAR GUERREIRO COM NOME E");
    expect(result.line.slice(232, 242)).toBe("CASA A    ");
    expect(result.line.slice(242, 247)).toBe("1021 ");
    expect(result.line.slice(247, 277)).toBe("CIDADE NOVA                   ");
  });

  it("normaliza CID e SIGTAP sem deslocar os campos seguintes", () => {
    const { line } = buildRegistro03(registroValido());
    expect(line.slice(49, 59)).toBe("0301010048");
    expect(line.slice(81, 85)).toBe("F840");
    expect(line.slice(85, 88)).toBe("012");
    expect(line.slice(88, 94)).toBe("000001");
  });

  it("sanitiza acentos, TAB e quebras somente na linha exportada", () => {
    const data = registroValido();
    const { line, adjustments } = buildRegistro03(data);
    expect(data.nomePaciente).toBe("João\t da\nSilva".replace("\t ", "\t"));
    expect(line.slice(112, 142)).toBe("JOAO DA SILVA                 ");
    expect(adjustments.some((item) => item.field === "logradouro")).toBe(true);
  });

  it("gera cabeçalho de 130 posições e aplica o controle oficial", () => {
    const campoControle = calcularCampoControleBpa([
      { procedimento: "0301010048", quantidade: "000001" },
      { procedimento: "0301010072", quantidade: "000002" },
    ]);
    const result = buildHeaderBpa({
      competencia: "202609",
      totalRegistros: 2,
      totalFolhas: 1,
      campoControle,
      orgaoOrigem: "Secretaria Municipal de Saúde",
      siglaOrigem: "SMS",
      documentoOrigem: "12345678000199",
      orgaoDestino: "Secretaria Municipal de Saúde",
      indicadorDestino: "M",
      versaoSistema: "SMSORIXI",
    });
    expect(result.errors).toEqual([]);
    expect(result.line).toHaveLength(BPA_HEADER_LENGTH);
    expect(result.line.slice(0, 7)).toBe("01#BPA#");
    expect(result.line.slice(7, 13)).toBe("202609");
    expect(result.line.slice(13, 19)).toBe("000002");
  });

  it("preserva uma linha por procedimento válido", () => {
    const linhas = ["0301010048", "0301010072"].map((procedimento) =>
      buildRegistro03({ ...registroValido(), procedimento }).line,
    );
    expect(linhas).toHaveLength(2);
    expect(new Set(linhas.map((line) => line.slice(49, 59))).size).toBe(2);
    expect(linhas.every((line) => line.length === 338)).toBe(true);
  });

  it("preserva município estruturado válido quando o CEP diverge", () => {
    const result = resolveMunicipioBpa({
      municipioCadastro: "150530",
      cepInfo: { cep: "68000000", ibge6: "150680", uf: "PA", localidade: "Santarém" },
      municipioPadrao: "150530",
    });
    expect(result.codigo).toBe("150530");
    expect(result.fonte).toBe("cadastro");
    expect(result.autoCorrigido).toBe(false);
  });

  it("preserva CNS existente no campo 60–74 sem fallback zerado", () => {
    const data = { ...registroValido(), cnsPaciente: "706030670706037" };
    const { line } = buildRegistro03(data);
    expect(readRegistro03Field(line, "cnsPaciente")).toBe("706030670706037");
    expect(auditRegistro03Serialization(data, line)).toEqual([]);
  });

  it("bloqueia CNS realmente ausente em vez de serializar zeros", () => {
    const data = { ...registroValido(), cnsPaciente: "" };
    const { line } = buildRegistro03(data);
    expect(readRegistro03Field(line, "cnsPaciente")).toBe(" ".repeat(15));
    expect(auditRegistro03Serialization(data, line)).toEqual([
      expect.objectContaining({ field: "cnsPaciente", problem: "Registro final sem CNS do paciente" }),
    ]);
  });

  it("audita DNE, logradouro, número e bairro sem deslocamento", () => {
    const data = {
      ...registroValido(),
      codigoLogradouro: "100",
      logradouro: "LUIZ INACIO LULA DA SILVA",
      numero: "1261",
      bairro: "PENTA",
    };
    const { line } = buildRegistro03(data);
    expect(readRegistro03Field(line, "codigoLogradouro")).toBe("100");
    expect(readRegistro03Field(line, "logradouro").trim()).toBe("LUIZ INACIO LULA DA SILVA");
    expect(readRegistro03Field(line, "numero").trim()).toBe("1261");
    expect(readRegistro03Field(line, "bairro").trim()).toBe("PENTA");
    expect(auditRegistro03Serialization(data, line)).toEqual([]);
  });

  it.each(["35B", "SN", "S/N"])("preserva número legítimo %s", (numero) => {
    const data = { ...registroValido(), numero };
    const { line } = buildRegistro03(data);
    expect(readRegistro03Field(line, "numero").trim()).toBe(numero.replace("/", ""));
    expect(auditRegistro03Serialization(data, line)).toEqual([]);
  });

  it("detecta divergência entre registro final e linha serializada", () => {
    const data = registroValido();
    const { line } = buildRegistro03(data);
    const adulterada = `${line.slice(0, 59)}000000000000000${line.slice(74)}`;
    expect(auditRegistro03Serialization(data, adulterada)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "cnsPaciente", start: 60, end: 74 }),
      ]),
    );
  });

  it("usa município do CEP somente quando o cadastro está ausente", () => {
    const result = resolveMunicipioBpa({
      municipioCadastro: "",
      cepInfo: { cep: "68000000", ibge6: "150680", uf: "PA", localidade: "Santarém" },
      municipioPadrao: "150530",
    });
    expect(result.codigo).toBe("150680");
    expect(result.fonte).toBe("cep");
  });
});