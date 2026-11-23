import { describe, expect, it } from "vitest";
import { parseBpaSigtapCatalog } from "./bpaSigtapCatalog";
import { normalizeBpaTxtAddress, prepareBpaTxtRecord, type BpaTxtPreparationInput } from "./bpaTxtPreparation";
import { auditBpaTxtFinal, auditRegistro03Serialization, buildHeaderBpa, buildRegistro03, calcularCampoControleBpa, readRegistro03Field } from "./bpaTxtLayout";

const competence = "202611";
const procedure = "0301010048";
const cns = "700000000000005";
const cpf = "52998224725";
const dictionary = ["Z000", "Z018", "M545", "F840"].map((code) => code.padEnd(4) + `Descrição ${code}`.padEnd(100)).join("\n");

function catalog({ mandatoryCpf = false, cids = [] as string[], definitions = dictionary, details = true, month = competence, indigenousException = true } = {}) {
  return parseBpaSigtapCatalog(month, {
    procedimentos: procedure.padEnd(330) + month,
    registros: `${procedure}02${month}`, ocupacoes: `${procedure}223605${month}`,
    detalhes: details ? mandatoryCpf ? `${procedure}058${month}` : "" : undefined,
    cids: cids.map((cid) => `${procedure}${cid.padEnd(4)}1${month}`).join("\n"),
    cidDefinitions: definitions,
    descricoesDetalhes: indigenousException
      ? "058" + "Excetuam-se a este regramento a população indígena, a qual poderá ser identificada por meio do Cartão Nacional de Saúde (CNS).".padEnd(4000) + month
      : "",
  });
}

function input(): BpaTxtPreparationInput {
  return {
    record: {
      tipoRegistro: "03", cnes: "1234567", competencia: competence,
      cnsProfissional: cns, cbo: "223605", dataAtendimento: "20261123",
      folha: 1, sequencia: 1, procedimento: procedure, cnsPaciente: cns, cpfPaciente: cpf,
      sexo: "F", municipioIbge: "150530", cid: "Z000", idade: 30, quantidade: 1,
      caraterAtendimento: "01", origem: "BPA", nomePaciente: "Paciente de teste",
      dataNascimento: "19961123", racaCor: "01", nacionalidade: "010",
      logradouro: "Rua Barão do Rio Beanco", bairro: "ST TEREZINHA", cep: "", numero: "10",
    },
    catalog: catalog(), declaredMunicipality: "150530",
    address: { catalog: [], street: "Rua Barão do Rio Beanco", number: "10" },
  };
}

describe("preparação isolada do TXT BPA-I", () => {
  it("preserva o registro de origem da Conferência/Excel, inclusive CNS, CPF e grafias", () => {
    const source = input();
    const snapshot = structuredClone(source.record);
    Object.freeze(source.record);
    const result = prepareBpaTxtRecord(source);
    expect(result.errors).toEqual([]);
    expect(source.record).toEqual(snapshot);
    expect(result.record).not.toBe(source.record);
    expect(result.record).toMatchObject({ cnsPaciente: cns, cpfPaciente: "", logradouro: "BARAO DO RIO BRANCO", bairro: "SANTA TEREZINHA", cep: "68270000" });
  });

  it.each(["", "000000000000000", "123"])("aceita CPF válido com CNS %j e mantém os offsets oficiais", (invalidCns) => {
    const source = input();
    source.record = { ...source.record, cnsPaciente: invalidCns, cpfPaciente: "529.982.247-25" };
    const result = prepareBpaTxtRecord(source);
    expect(result.errors).toEqual([]);
    const built = buildRegistro03(result.record);
    expect(built.line).toHaveLength(351);
    expect(built.line.slice(59, 74)).toBe(" ".repeat(15));
    expect(built.line.slice(338, 349)).toBe(cpf);
    expect(built.line.slice(202, 232).trim()).toBe("BARAO DO RIO BRANCO");
    expect(auditRegistro03Serialization(result.record, built.line, { allowValidCpfIdentification: true })).toEqual([]);
    expect(result.adjustments.join(" ")).toContain("CPF válido");
  });

  it.each(["", "11111111111", "52998224724", "12345678901", "texto52998224725"])(
    "não libera documento inválido por opção de pendências: %j", (invalidCpf) => {
      const source = input();
      source.record = { ...source.record, cnsPaciente: "", cpfPaciente: invalidCpf };
      expect(prepareBpaTxtRecord(source).errors.join(" ")).toContain("sem CNS válido e sem CPF válido");
    },
  );

  it("exige CPF pelo atributo 058 mesmo que exista CNS válido", () => {
    const source = input();
    source.catalog = catalog({ mandatoryCpf: true });
    expect(prepareBpaTxtRecord(source).record).toMatchObject({ cnsPaciente: "", cpfPaciente: cpf });
    source.record = { ...source.record, cpfPaciente: "" };
    expect(prepareBpaTxtRecord(source).errors.join(" ")).toContain("CPF válido obrigatório");
  });

  it("respeita a exceção indígena e não estende essa exceção às demais raças", () => {
    const source = input();
    source.catalog = catalog({ mandatoryCpf: true });
    source.record = { ...source.record, cpfPaciente: "", racaCor: "05" };
    expect(prepareBpaTxtRecord(source).errors).toEqual([]);
    expect(prepareBpaTxtRecord(source).record.cnsPaciente).toBe(cns);
    source.record = { ...source.record, racaCor: "01" };
    expect(prepareBpaTxtRecord(source).errors.join(" ")).toContain("CPF válido obrigatório");
  });

  it("não presume exceção indígena sem a descrição oficial da competência", () => {
    const source = input();
    source.catalog = catalog({ mandatoryCpf: true, indigenousException: false });
    source.record = { ...source.record, cpfPaciente: "", racaCor: "05" };
    expect(prepareBpaTxtRecord(source).errors.join(" ")).toContain("CPF válido obrigatório");
  });

  it.each([
    [catalog({ details: false }), "Atributos oficiais"],
    [catalog({ definitions: "" }), "Dicionário oficial"],
    [catalog({ month: "202610" }), "competência 202611 indisponível"],
  ])("não presume regras de arquivos ausentes ou competência anterior", (metadata, message) => {
    expect(prepareBpaTxtRecord({ ...input(), catalog: metadata }).errors.join(" ")).toContain(message);
  });

  it.each(["ECG", "Z999", "Z000 texto", "0000"])("rejeita CID inválido/inexistente %s sem criar diagnóstico", (cidOriginal) => {
    const result = prepareBpaTxtRecord({ ...input(), cidOriginal });
    expect(result.errors.some((error) => error.includes("CID"))).toBe(true);
  });

  it("confere a relação restritiva e aceita CID existente quando não há lista restritiva", () => {
    const source = { ...input(), cidOriginal: "M54.5" };
    expect(prepareBpaTxtRecord(source).errors).toEqual([]);
    expect(prepareBpaTxtRecord(source).record.cid).toBe("M545");
    source.catalog = catalog({ cids: ["F840"] });
    expect(prepareBpaTxtRecord(source).errors.join(" ")).toContain("CID M545 incompatível");
  });

  it("não apaga silenciosamente um CID explícito inválido nem presume CID quando ausente", () => {
    expect(prepareBpaTxtRecord({ ...input(), explicitProcedureCids: ["ECG"] }).errors.join(" ")).toContain("CID inválido informado");
    const source = input();
    source.record = { ...source.record, cid: "" };
    const result = prepareBpaTxtRecord(source);
    expect(result.errors).toEqual([]);
    expect(result.record.cid).toBe("");
  });

  it("mantém IBGE declarado apesar do CEP de outro município", () => {
    const source = input();
    source.declaredMunicipality = "150040";
    source.record = { ...source.record, municipioIbge: "150510", cep: "68200000" };
    const result = prepareBpaTxtRecord(source);
    expect(result.record.municipioIbge).toBe("150040");
    expect(result.record.cep).toBe("68200000");
    expect(result.record.bairro).toBe("ST TEREZINHA");
    expect(prepareBpaTxtRecord({ ...source, declaredMunicipality: "" }).errors.join(" ")).toContain("Município declarado");
  });

  it("gera 21 registros CPF com duas folhas, controle oficial, CRLF e bytes sem BOM", () => {
    const source = input();
    const lines = Array.from({ length: 21 }, (_, index) => {
      const result = prepareBpaTxtRecord({ ...source,
        record: { ...source.record, cnsPaciente: "", folha: Math.floor(index / 20) + 1, sequencia: index % 20 + 1 },
      });
      expect(result.errors).toEqual([]);
      return buildRegistro03(result.record).line;
    });
    const control = calcularCampoControleBpa(lines.map(() => ({ procedimento: procedure, quantidade: 1 })));
    const header = buildHeaderBpa({ competencia: competence, totalRegistros: 21, totalFolhas: 2, campoControle: control,
      orgaoOrigem: "SMS", siglaOrigem: "SMS", documentoOrigem: "12345678000199", orgaoDestino: "SMS", indicadorDestino: "M", versaoSistema: "TESTE" }).line;
    const serialized = [header, ...lines, ""].join("\r\n");
    const bytes = Uint8Array.from(serialized, (character) => character.charCodeAt(0));
    expect([...bytes.slice(0, 3)]).toEqual([48, 49, 35]);
    expect(new TextDecoder("iso-8859-1").decode(bytes)).toBe(serialized);
    expect(auditBpaTxtFinal(serialized, competence)).toEqual([]);
    expect(readRegistro03Field(lines[20], "folha")).toBe("002");
    expect(readRegistro03Field(lines[20], "sequencia")).toBe("01");
    expect(header.slice(25, 29)).toBe(String((21 * (Number(procedure) + 1)) % 1111 + 1111));
  });
});

describe("endereço exclusivo do TXT", () => {
  const address = (street: string, extra: Record<string, unknown> = {}) => normalizeBpaTxtAddress({
    catalog: [], street, municipality: "150530", ...extra,
  });

  it.each([
    ["RUSA JOAO", "081"], ["AV JOAO", "008"], ["TV JOAO", "100"], ["TRAVESA JOAO", "100"],
    ["AL JOAO", "004"], ["PASSAGEM JOAO", "074"], ["RAMAL JOAO", "082"],
    ["EST JOAO", "031"], ["LAGO SAPUCUA", "499"], ["COLONIA DO NORTE", "021"],
  ])("resolve o prefixo %s para o código comprovado %s", (street, code) => {
    expect(address(street).codigoLogradouro).toBe(code);
  });

  it.each(["COMUNIDADE BOA ESPERANCA", "ZONA RURAL", "POVOADO CENTRAL", "ENDERECO DESCONHECIDO"])(
    "não inventa tipo para %s e não gera erro bloqueante", (street) => {
      const result = address(street);
      expect(result.codigoLogradouro).toBe("");
      expect(result.alerts.length).toBeGreaterThan(0);
      expect(buildRegistro03({ codigoLogradouro: result.codigoLogradouro }).line.slice(199, 202)).toBe("   ");
    },
  );

  it("corrige código salvo divergente e não utiliza associação errada do catálogo", () => {
    const result = address("PASSAGEM DO NORTE", { savedCode: "065", catalog: [{ codigo: "065", descricao: "PASSAGEM" }] });
    expect(result.codigoLogradouro).toBe("074");
    expect(result.alerts.length).toBeGreaterThan(0);
  });

  it.each([
    ["BARAO DO RIO BEANCO", "BARAO DO RIO BRANCO"], ["BARRAO DO RIO BRANCO", "BARAO DO RIO BRANCO"],
    ["ANTONIO IMBRIRIBA", "ANTONIO IMBIRIBA"], ["INDEPENCIA", "INDEPENDENCIA"],
    ["SEZA GUEREIRO", "CAZUZA GUERREIRO"], ["CESAR GUERREIRO", "CEZAR GUERREIRO"],
    ["AMANDO GATO", "ARMANDO GATO"], ["ACIOLIES RAMOS", "ACIOLE RAMOS"], ["URUATAPERA", "URUA TAPERA"],
    ["DON FLORIANO", "DOM FLORIANO"], ["BRAZ SARUBE", "BRAZ SARUBI"], ["BRAS MILEO", "BRAZ MILEO"],
    ["TRANQUETO NEVES", "TANCREDO NEVES"], ["VIGESSIMA", "VIGESIMA"],
  ])("corrige a grafia %s sem atribuir tipo pelo nome da rua", (original, expected) => {
    const result = address(original);
    expect(result.logradouro).toBe(expected);
    expect(result.codigoLogradouro).toBe("");
  });

  it.each([
    ["SANTA TERREZINHA", "SANTA TEREZINHA"], ["SANTISSEMO", "SANTISSIMO"], ["PEPERTUO SOCORRO", "PERPETUO SOCORRO"],
    ["PARAISOPOLES", "PARAISOPOLIS"], ["SAO JOSE OP", "SAO JOSE OPERARIO"],
    ["N S DAS GRACAS", "NOSSA SENHORA DAS GRACAS"], ["NS DE FATIMA", "NOSSA SENHORA DE FATIMA"],
    ["ST LUZIA", "SANTA LUZIA"], ["SSO PEDRO", "SAO PEDRO"],
  ])("normaliza bairro %s para %s", (neighborhood, expected) => {
    expect(address("RUA TESTE", { neighborhood }).bairro).toBe(expected);
  });

  it("abrevia antes do corte, mantém palavras inteiras e extrai número sem perder pontuação", () => {
    const result = address("COMUNIDADE NOSSA SENHORA DO LIVRAMENTO PADRE JOSE");
    expect(result.logradouro).toBe("COM NS DO LIVRAMENTO PE JOSE");
    expect(result.logradouro.length).toBeLessThanOrEqual(30);
    expect(address("Rua Joao, 120")).toMatchObject({ numero: "120", logradouro: "JOAO" });
  });

  it.each(["", "00000000", "123", "682700001"])("usa CEP padrão autorizado apenas para Oriximiná com CEP %j inválido", (cep) => {
    expect(address("RUA TESTE", { cep }).cep).toBe("68270000");
    expect(address("RUA TESTE", { cep, municipality: "150040" }).cep).not.toBe("68270000");
  });
});
