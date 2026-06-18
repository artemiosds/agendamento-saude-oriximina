// Mapeamento nome do estado → sigla (UF), normalização sem acentos.

const STATES: Array<[string, string]> = [
  ["acre", "AC"],
  ["alagoas", "AL"],
  ["amapa", "AP"],
  ["amazonas", "AM"],
  ["bahia", "BA"],
  ["ceara", "CE"],
  ["distrito federal", "DF"],
  ["espirito santo", "ES"],
  ["goias", "GO"],
  ["maranhao", "MA"],
  ["mato grosso", "MT"],
  ["mato grosso do sul", "MS"],
  ["minas gerais", "MG"],
  ["para", "PA"],
  ["paraiba", "PB"],
  ["parana", "PR"],
  ["pernambuco", "PE"],
  ["piaui", "PI"],
  ["rio de janeiro", "RJ"],
  ["rio grande do norte", "RN"],
  ["rio grande do sul", "RS"],
  ["rondonia", "RO"],
  ["roraima", "RR"],
  ["santa catarina", "SC"],
  ["sao paulo", "SP"],
  ["sergipe", "SE"],
  ["tocantins", "TO"],
];

const VALID_UFS = new Set(STATES.map(([, sigla]) => sigla));
const NAME_TO_UF = new Map(STATES);

const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function normalizeUF(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";

  // Já é sigla?
  const upper = trimmed.toUpperCase().replace(/\s+/g, "");
  if (upper.length === 2 && VALID_UFS.has(upper)) return upper;

  // Nome completo
  const key = stripAccents(trimmed.toLowerCase()).replace(/\s+/g, " ").trim();
  const sigla = NAME_TO_UF.get(key);
  if (sigla) return sigla;

  return "";
}
