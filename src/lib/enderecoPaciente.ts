import { getCodigoIbge, getMunicipioEndereco } from "@/lib/municipiosIbge";

export interface EnderecoPaciente {
  cep: string;
  municipio: string;
  uf: string;
  ibge_municipio: string;
  logradouro: string;
  bairro: string;
}

export const sanitizeUpper = (v: string) => (v || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toUpperCase();
export const cepDigits = (v: string) => (v || "").replace(/\D/g, "");

async function consultar<T = Record<string, unknown>>(url: string, signal: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(abort, 2500);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: "omit" });
    if (!response.ok) throw new Error("CEP não encontrado");
    const data = await response.json();
    if (controller.signal.aborted) throw new DOMException("Consulta cancelada", "AbortError");
    return data;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

function normalizar(data: Record<string, unknown>, cep: string, brasil: boolean): EnderecoPaciente {
  const texto = (key: string) => typeof data[key] === "string" ? data[key] as string : "";
  const municipio = sanitizeUpper(texto(brasil ? "city" : "localidade").trim());
  const uf = sanitizeUpper(texto(brasil ? "state" : "uf").trim());
  const ibge = getCodigoIbge(municipio, uf);
  // Valida também o município/UF na base oficial; nunca fabrica um código BPA-I.
  if (data.erro || cepDigits(texto("cep")) !== cep || !ibge) throw new Error("CEP não encontrado");
  return {
    cep, municipio, uf, ibge_municipio: ibge,
    logradouro: sanitizeUpper(texto(brasil ? "street" : "logradouro")),
    bairro: sanitizeUpper(texto(brasil ? "neighborhood" : "bairro")),
  };
}

export async function buscarEnderecoCep(cep: string, signal: AbortSignal): Promise<EnderecoPaciente> {
  const digits = cepDigits(cep);
  if (!/^\d{8}$/.test(digits)) throw new Error("CEP inválido");
  try {
    return normalizar(await consultar(`https://brasilapi.com.br/api/cep/v2/${digits}`, signal), digits, true);
  } catch (error) {
    if (signal.aborted) throw error;
    return normalizar(await consultar(`https://viacep.com.br/ws/${digits}/json/`, signal), digits, false);
  }
}

const cacheRua = new Map<string, { expires: number; rows: EnderecoPaciente[] }>();
const CACHE_RUA_TTL = 5 * 60_000;
const CACHE_RUA_MAX = 80;
export const LIMITE_CEPS_POR_RUA = 8;

/** Consulta pontual e limitada: não baixa nem varre bases completas de CEP. */
export async function buscarCepsPorEndereco(
  uf: string, municipio: string, logradouro: string, signal: AbortSignal,
): Promise<EnderecoPaciente[]> {
  const info = getMunicipioEndereco(municipio, uf);
  const rua = logradouro.trim().replace(/\s+/g, " ");
  if (!info || info.nome.length < 3 || rua.length < 3 || signal.aborted) return [];
  const key = `${info.ibge}|${sanitizeUpper(rua)}`;
  const cached = cacheRua.get(key);
  if (cached && cached.expires > Date.now()) return cached.rows.map(row => ({ ...row }));
  const data = await consultar<unknown>(
    `https://viacep.com.br/ws/${info.uf}/${encodeURIComponent(info.nome)}/${encodeURIComponent(rua)}/json/`, signal,
  );
  if (!Array.isArray(data)) throw new Error("Resposta inválida na busca de endereço");
  const rows: EnderecoPaciente[] = [];
  const seen = new Set<string>();
  for (const item of data.slice(0, 50)) {
    if (!item || typeof item !== "object" || typeof item.cep !== "string") continue;
    try {
      const digits = cepDigits(item.cep);
      if (digits.length !== 8) continue;
      const row = normalizar(item, digits, false);
      if (row.ibge_municipio !== info.ibge) continue;
      const id = `${row.cep}|${row.logradouro}|${row.bairro}`;
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push(row);
      if (rows.length === LIMITE_CEPS_POR_RUA) break;
    } catch { /* Ignora apenas linhas inválidas ou de outra localidade. */ }
  }
  if (signal.aborted) throw new DOMException("Consulta cancelada", "AbortError");
  for (const [oldKey, entry] of cacheRua) if (entry.expires <= Date.now()) cacheRua.delete(oldKey);
  if (cacheRua.size >= CACHE_RUA_MAX) cacheRua.delete(cacheRua.keys().next().value);
  cacheRua.set(key, { expires: Date.now() + CACHE_RUA_TTL, rows });
  return rows.map(row => ({ ...row }));
}
