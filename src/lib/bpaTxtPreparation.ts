import { normalizeBpaAddress, type BpaAddressNormalizationInput, type DneLogradouroEntry } from "./bpaAddressNormalization";
import { extractBpaCidCodes } from "./bpaCid";
import { isValidCnsAlgo } from "./bpaNormalization";
import { normalizePatientCpf, patientCpfError } from "./patientCpf";
import { allowsBpaIndigenousCnsIdentification, getCidFromBpaCatalog, getCompetenciaReferenciaCatalogo, hasBpaCidDictionary, type BpaSigtapCatalog } from "./bpaSigtapCatalog";
import { sanitizeBpaText, type BpaRegistroFinal } from "./bpaTxtLayout";

// Descrições/códigos oficiais DNE/CORE; nunca são fallback para tipo desconhecido.
const OFFICIAL_TYPES: DneLogradouroEntry[] = [
  { codigo: "081", descricao: "RUA" }, { codigo: "008", descricao: "AVENIDA" },
  { codigo: "100", descricao: "TRAVESSA" }, { codigo: "004", descricao: "ALAMEDA" },
  { codigo: "074", descricao: "PASSAGEM" }, { codigo: "082", descricao: "RAMAL" },
  { codigo: "031", descricao: "ESTRADA" }, { codigo: "499", descricao: "LAGO" },
  { codigo: "021", descricao: "COLONIA" },
];

const STREET_SPELLINGS = [
  ["BARAO DO RIO BRANCO", "BARAO DO RIO BEANCO", "BARRAO DO RIO BRANCO", "BARAO O RIO BRANCO"],
  ["ANTONIO IMBIRIBA", "ANTONIO IMBRIRIBA", "ANTONIO IBIRIBA", "ANTONIO EMBIRIBA"],
  ["INDEPENDENCIA", "ENDEPENDENCIA", "INDEPENDECIA", "INDEPENCIA"],
  ["CAZUZA GUERREIRO", "CASUZA GUERREIRO", "SEZA GUEREIRO", "CAZUZA GUREIRO"],
  ["CEZAR GUERREIRO", "CESAR GUERREIRO"],
  ["ARMANDO GATO", "AMARDO GATO", "AMANDO GATO"],
  ["ACIOLE RAMOS", "ALCIOLE RAMOS", "ACIOLIES RAMOS"],
  ["URUA TAPERA", "URUATAPERA"], ["DOM FLORIANO", "DON FLORIANO"],
  ["BRAZ SARUBI", "BRAZ SARUBE"], ["BRAZ MILEO", "BRAS MILEO"],
  ["TANCREDO NEVES", "TRANQUETO NEVES"], ["VIGESIMA", "VIGESSIMA"],
];
const NEIGHBORHOOD_SPELLINGS = [
  ["SANTA TEREZINHA", "ST TEREZINHA", "SANT TEREZINHA", "SANTAS TEREZINHA", "SANTA TERREZINHA"],
  ["SANTISSIMO", "SANTISSEMO"], ["PERPETUO SOCORRO", "PERPETUO ZOCORRO", "PEPERTUO SOCORRO"],
  ["PARAISOPOLIS", "PARALISOPOLIS", "PARAISOPOLES"],
  ["SAO JOSE OPERARIO", "SAO JOSE OEPERARIO", "SAO JOSE OP"],
  ["NOSSA SENHORA DAS GRACAS", "NOSSA SENHRA DAS GRACAS", "N S DAS GRACAS", "NS SENHORA DAS GRACAS"],
  ["NOSSA SENHORA DE FATIMA", "NOSSA DE FATIMA", "NS DE FATIMA"],
  ["SANTA LUZIA", "ST LUZIA"], ["SAO PEDRO", "SSO PEDRO"],
];
const spellingMap = (groups: string[][]) => new Map(groups.flatMap(([correct, ...variants]) =>
  variants.map((variant) => [variant, correct] as const),
));
const streets = spellingMap(STREET_SPELLINGS);
const neighborhoods = spellingMap(NEIGHBORHOOD_SPELLINGS);
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

export function hasValidBpaPatientCpf(value: unknown): boolean {
  return !patientCpfError(String(value ?? ""));
}

function compactAddress(value: string, adjustments: string[]): string {
  if (value.length <= 30) return value;
  const compacted = value.replace(/\bCOMUNIDADE\b/g, "COM")
    .replace(/\bNOSSA SENHORA\b/g, "NS").replace(/\bPADRE\b/g, "PE");
  if (compacted !== value) adjustments.push(`Endereço abreviado somente no TXT: ${value} → ${compacted}.`);
  if (compacted.length <= 30) return compacted;
  const boundary = compacted.lastIndexOf(" ", 30);
  const limited = compacted.slice(0, boundary > 0 ? boundary : 30).trim();
  adjustments.push(`Endereço limitado a 30 posições no TXT: ${compacted} → ${limited}.`);
  return limited;
}

export function normalizeBpaTxtAddress(
  input: BpaAddressNormalizationInput & { municipality: string; neighborhood?: unknown; cep?: unknown },
) {
  const officialCodes = new Set(OFFICIAL_TYPES.map((item) => item.codigo));
  const officialNames = new Set(OFFICIAL_TYPES.map((item) => item.descricao));
  const catalog = [...OFFICIAL_TYPES, ...input.catalog.filter((item) =>
    !officialCodes.has(digits(item.codigo).padStart(3, "0")) && !officialNames.has(sanitizeBpaText(item.descricao)),
  )];
  const normalizePrefix = (value: unknown) => String(value ?? "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/^(?:(?:RUA|RUSA|TRAVESSA|TRAVESA|TV|TR|AVENIDA|AV)(?:\s+|$))+/, (prefix) =>
      prefix.replace(/\bRUSA\b/g, "RUA").replace(/\bTRAVESA\b/g, "TRAVESSA"));
  const address = normalizeBpaAddress({ ...input, catalog,
    street: normalizePrefix(input.street), structuredType: normalizePrefix(input.structuredType),
  });
  const adjustments = [...address.adjustments];
  let street = address.logradouro;
  let neighborhood = sanitizeBpaText(input.neighborhood);
  if (input.municipality === "150530") {
    const correctedStreet = streets.get(street) || street;
    const correctedNeighborhood = neighborhoods.get(neighborhood) || neighborhood;
    if (correctedStreet !== street) adjustments.push(`Logradouro corrigido somente no TXT: ${street} → ${correctedStreet}.`);
    if (correctedNeighborhood !== neighborhood) adjustments.push(`Bairro corrigido somente no TXT: ${neighborhood} → ${correctedNeighborhood}.`);
    street = correctedStreet;
    neighborhood = correctedNeighborhood;
  }
  let cep = digits(input.cep);
  if (input.municipality === "150530" &&
      (!/^(?:\d{8}|\d{5}-\d{3})$/.test(String(input.cep ?? "").trim()) || /^0+$/.test(cep))) {
    cep = "68270000";
    adjustments.push("CEP ausente/inválido: aplicado 68270000 no TXT para município declarado 150530.");
  }
  return { ...address, logradouro: compactAddress(street, adjustments),
    bairro: compactAddress(neighborhood, adjustments), cep, adjustments,
    alerts: [...new Set(address.alerts)],
  };
}

export interface BpaTxtPreparationInput {
  record: BpaRegistroFinal;
  catalog: BpaSigtapCatalog;
  /** Valor anterior ao normalizador legado, que podia apagar um CID inválido. */
  cidOriginal?: unknown;
  explicitProcedureCids?: unknown[];
  address: BpaAddressNormalizationInput;
  /** Município do cadastro; nunca deriva o IBGE do CEP. */
  declaredMunicipality: string;
  rawCep?: unknown;
}

/** Pure TXT projection. Never mutates the conference/Excel record or the patient. */
export function prepareBpaTxtRecord(input: BpaTxtPreparationInput) {
  const record: { -readonly [K in keyof BpaRegistroFinal]: BpaRegistroFinal[K] } = { ...input.record };
  const errors: string[] = [];
  const adjustments: string[] = [];
  const procedure = input.catalog.get(digits(record.procedimento));
  const competence = String(record.competencia ?? "");
  const reference = getCompetenciaReferenciaCatalogo(input.catalog);
  if (reference !== competence) errors.push(`SIGTAP da competência ${competence} indisponível (referência carregada: ${reference || "não identificada"}).`);
  if (!procedure) errors.push("Procedimento não encontrado no catálogo SIGTAP da competência.");
  if (!procedure?.detalhes) errors.push("Atributos oficiais SIGTAP indisponíveis: não foi possível conferir a exigência de CPF.");
  if (!hasBpaCidDictionary(input.catalog)) errors.push("Dicionário oficial CID-10 da competência indisponível para auditoria do TXT.");

  const cns = digits(record.cnsPaciente);
  const cpf = normalizePatientCpf(String(record.cpfPaciente ?? ""));
  const cnsValid = isValidCnsAlgo(cns);
  const cpfValid = hasValidBpaPatientCpf(record.cpfPaciente);
  // Atributo 058 (0058 no relatório de competência): indígena pode usar CNS.
  const cpfRequired = Boolean(procedure?.detalhes?.has("058"));
  const indigenousCnsException = cpfRequired && digits(record.racaCor) === "05" && cnsValid &&
    allowsBpaIndigenousCnsIdentification(input.catalog);
  if (cpfRequired && !cpfValid && !indigenousCnsException) {
    errors.push("CPF válido obrigatório para este procedimento na competência (atributo 058).");
  } else if (cpfValid && (cpfRequired || !cnsValid)) {
    record.cnsPaciente = "";
    record.cpfPaciente = cpf;
    record.semCpf = "N";
    adjustments.push(cnsValid
      ? "Identificação pelo CPF obrigatório; CNS omitido somente no TXT."
      : "CNS ausente/inválido limpo — exportado via CPF válido somente no TXT.");
  } else if (cnsValid) {
    record.cnsPaciente = cns;
    record.cpfPaciente = "";
    if (cpfValid) adjustments.push("Identificação pelo CNS válido; CPF omitido somente no TXT.");
  } else {
    errors.push("Paciente sem CNS válido e sem CPF válido suficiente para identificar esta produção.");
  }

  const rawCid = input.cidOriginal ?? record.cid;
  const codes = extractBpaCidCodes(rawCid);
  const originalPresent = String(rawCid ?? "").trim().length > 0;
  for (const explicit of input.explicitProcedureCids || []) {
    if (String(explicit ?? "").trim() && !extractBpaCidCodes(explicit).length) {
      errors.push(`CID inválido informado no procedimento (${String(explicit)}); corrija o código antes de exportar.`);
    }
  }
  if (originalPresent && !/^[A-Z][0-9]{2}[A-Z0-9]?$/.test(String(rawCid).trim().toUpperCase().replace(/\./g, ""))) {
    errors.push(`CID inválido (${String(rawCid)}); nenhum diagnóstico foi presumido.`);
  }
  const cid = codes[0] || "";
  record.cid = cid;
  if (cid && hasBpaCidDictionary(input.catalog)) {
    if (!getCidFromBpaCatalog(input.catalog, cid)) errors.push(`CID ${cid} não existe no catálogo oficial CID-10 da competência.`);
    else if (procedure?.cids.size && !procedure.cids.has(cid)) errors.push(`CID ${cid} incompatível com o procedimento ${digits(record.procedimento)} na competência.`);
  }

  record.municipioIbge = input.declaredMunicipality;
  if (!/^\d{6}$/.test(input.declaredMunicipality) || /^0+$/.test(input.declaredMunicipality)) {
    errors.push("Município declarado ausente/inválido; o IBGE não foi substituído pelo CEP.");
  }
  const address = normalizeBpaTxtAddress({ ...input.address,
    municipality: input.declaredMunicipality, neighborhood: record.bairro, cep: input.rawCep ?? record.cep,
  });
  Object.assign(record, { codigoLogradouro: address.codigoLogradouro,
    tipoLogradouro: address.tipoLogradouro, logradouro: address.logradouro,
    numero: address.numero, bairro: address.bairro, cep: address.cep,
  });
  adjustments.push(...address.adjustments);
  return { record, errors: [...new Set(errors)], adjustments, warnings: address.alerts };
}
