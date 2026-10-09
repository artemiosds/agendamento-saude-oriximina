import { sanitizeBpaText } from "./bpaTxtLayout";

export interface DneLogradouroEntry {
  codigo: string;
  descricao: string;
}

export interface BpaAddressNormalizationInput {
  catalog: DneLogradouroEntry[];
  savedCode?: unknown;
  structuredType?: unknown;
  street?: unknown;
  number?: unknown;
}

export interface BpaAddressNormalizationResult {
  codigoLogradouro: string;
  tipoLogradouro: string;
  logradouro: string;
  numero: string;
  adjustments: string[];
  alerts: string[];
}

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

// Abreviações linguísticas somente ajudam a localizar uma descrição que
// obrigatoriamente exista no catálogo real. Nenhum código é definido aqui.
const SAFE_TYPE_ALIASES: Record<string, string> = {
  R: "RUA",
  RUA: "RUA",
  AV: "AVENIDA",
  AVE: "AVENIDA",
  AVENIDA: "AVENIDA",
  TR: "TRAVESSA",
  TV: "TRAVESSA",
  TRAV: "TRAVESSA",
  TRAVESSA: "TRAVESSA",
  BC: "BECO",
  BECO: "BECO",
  AC: "ACESSO",
  ACESSO: "ACESSO",
  AT: "ATALHO",
  ATALHO: "ATALHO",
  AL: "ALAMEDA",
  ALAMEDA: "ALAMEDA",
  EST: "ESTRADA",
  ESTRADA: "ESTRADA",
  ROD: "RODOVIA",
  RODOVIA: "RODOVIA",
  VL: "VIELA",
  VIELA: "VIELA",
  PSG: "PASSAGEM",
  PASSAGEM: "PASSAGEM",
  PAS: "PASSAGEM",
  PASS: "PASSAGEM",
  AVN: "AVENIDA",
  TRV: "TRAVESSA",
  ESTR: "ESTRADA",
  PC: "PRACA",
  PCA: "PRACA",
  PRACA: "PRACA",
  LG: "LARGO",
  LGO: "LARGO",
  LARGO: "LARGO",
  RAM: "RAMAL",
  RAMAL: "RAMAL",
  CJ: "CONJUNTO",
  CONJ: "CONJUNTO",
  CONJUNTO: "CONJUNTO",
  VILA: "VILA",
  QD: "QUADRA",
  QUADRA: "QUADRA",
};

const MAX_COMPOUND_WORDS = 4;

function normalizedCatalog(catalog: DneLogradouroEntry[]) {
  return catalog
    .map((entry) => ({
      codigo: digits(entry.codigo).slice(-3).padStart(3, "0"),
      descricao: sanitizeBpaText(entry.descricao),
    }))
    .filter((entry) => entry.codigo.length === 3 && entry.descricao);
}

function resolveTypeCandidate(value: unknown, descriptions: Set<string>): string {
  const normalized = sanitizeBpaText(value);
  if (!normalized) return "";
  if (descriptions.has(normalized)) return normalized;
  // Prefere a descrição composta mais longa existente no catálogo real
  // (ex.: "RUA PROJETADA"), sempre em palavras inteiras.
  const words = normalized.split(" ");
  for (let n = Math.min(MAX_COMPOUND_WORDS, words.length - 1); n >= 2; n--) {
    const prefix = words.slice(0, n).join(" ");
    if (descriptions.has(prefix)) return prefix;
  }
  const first = normalized.split(" ")[0];
  const alias = SAFE_TYPE_ALIASES[first] || first;
  return descriptions.has(alias) ? alias : "";
}

function stripRepeatedType(street: string, type: string): string {
  let result = street;
  while (type.includes(" ") && (result === type || result.startsWith(`${type} `))) {
    result = result.slice(type.length).trim();
  }
  while (result) {
    const first = result.split(" ")[0];
    const firstType = SAFE_TYPE_ALIASES[first] || first;
    if (firstType !== type) break;
    result = result.slice(first.length).trim();
  }
  return result;
}

function stripDuplicatedNumber(street: string, number: string): string {
  if (!street || !number) return street;
  const streetParts = street.split(" ");
  const last = streetParts.at(-1) || "";
  return last === number ? streetParts.slice(0, -1).join(" ").trim() : street;
}

export function normalizeBpaAddress(input: BpaAddressNormalizationInput): BpaAddressNormalizationResult {
  const catalog = normalizedCatalog(input.catalog);
  const byCode = new Map(catalog.map((entry) => [entry.codigo, entry]));
  const byDescription = new Map<string, DneLogradouroEntry[]>();
  for (const entry of catalog) {
    const entries = byDescription.get(entry.descricao) || [];
    entries.push(entry);
    byDescription.set(entry.descricao, entries);
  }
  const descriptions = new Set(byDescription.keys());
  const streetOriginal = sanitizeBpaText(input.street);
  let number = sanitizeBpaText(input.number);
  const extracted: string[] = [];
  // Número digitado junto do logradouro ("R. Magalhães Barata, 120") só é
  // extraído quando o campo estruturado está vazio/S/N e há vírgula ou "Nº".
  if (!number || number === "SN") {
    const raw = String(input.street ?? "");
    const match = raw.match(/(?:,\s*|\s+N[º°o.]?\s*)(\d{1,5}[A-Za-z]?)\s*$/i);
    if (match) {
      number = sanitizeBpaText(match[1]);
      extracted.push(`Número ${number} extraído do campo logradouro.`);
    }
  }
  const typeFromStructured = resolveTypeCandidate(input.structuredType, descriptions);
  const typeFromStreet = resolveTypeCandidate(streetOriginal, descriptions);
  const detectedType = typeFromStructured || typeFromStreet;
  const savedCodeDigits = digits(input.savedCode);
  const savedCode = savedCodeDigits ? savedCodeDigits.slice(-3).padStart(3, "0") : "";
  const savedEntry = savedCode ? byCode.get(savedCode) : undefined;
  const adjustments: string[] = [...extracted];
  const alerts: string[] = [];

  let resolved: DneLogradouroEntry | undefined;
  if (savedEntry && detectedType && savedEntry.descricao === detectedType) {
    resolved = savedEntry;
  } else if (savedCode && !savedEntry) {
    alerts.push(`Código DNE salvo ${savedCode} não existe no catálogo real.`);
  } else if (savedEntry && detectedType && savedEntry.descricao !== detectedType) {
    alerts.push(`Código DNE salvo ${savedCode} (${savedEntry.descricao}) diverge do tipo ${detectedType}.`);
  } else if (savedEntry && !detectedType) {
    alerts.push(`Código DNE salvo ${savedCode} não pôde ser confirmado pela descrição do endereço.`);
  }

  if (!resolved && detectedType) {
    const matches = byDescription.get(detectedType) || [];
    if (matches.length === 1) resolved = matches[0];
    else if (matches.length > 1) alerts.push(`Tipo ${detectedType} possui correspondência ambígua no catálogo DNE.`);
  }
  if (!resolved && streetOriginal && !alerts.some((alert) => alert.includes("ambígua"))) {
    alerts.push("Tipo de logradouro sem correspondência segura no catálogo DNE.");
  }

  let street = streetOriginal;
  if (resolved) {
    const withoutType = stripRepeatedType(street, resolved.descricao);
    if (withoutType !== street) adjustments.push(`Tipo ${resolved.descricao} removido do campo logradouro.`);
    street = withoutType;
  }
  const withoutDuplicatedNumber = stripDuplicatedNumber(street, number);
  if (withoutDuplicatedNumber !== street) adjustments.push("Número final duplicado removido do campo logradouro.");
  street = withoutDuplicatedNumber;
  if (extracted.length) {
    const parts = street.split(" ");
    const last = parts.at(-1);
    if (last === "N" || last === "NO") street = parts.slice(0, -1).join(" ");
  }

  return {
    codigoLogradouro: resolved?.codigo || "",
    tipoLogradouro: resolved?.descricao || detectedType,
    logradouro: street,
    numero: number,
    adjustments,
    alerts,
  };
}