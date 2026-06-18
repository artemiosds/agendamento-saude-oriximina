// Consulta o código IBGE oficial do município pelo nome + UF.
// API oficial: https://servicodados.ibge.gov.br/api/v1/localidades
// Cache em memória durante a sessão. Timeout curto e tolerante a falhas.

const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const norm = (s: string) =>
  stripAccents((s || "").trim().toLowerCase()).replace(/\s+/g, " ");

const cache = new Map<string, string>(); // chave `${UF}|${municipioNormalizado}`
const inflight = new Map<string, Promise<string>>();

async function fetchUfMunicipios(uf: string): Promise<Array<{ nome: string; id: number }>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`,
      { signal: ctrl.signal },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ id: number; nome: string }>;
    return data || [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupIbgeCode(
  municipio: string,
  uf: string,
): Promise<string> {
  const ufUp = (uf || "").toUpperCase();
  const mNorm = norm(municipio);
  if (!ufUp || !mNorm || ufUp.length !== 2) return "";

  const key = `${ufUp}|${mNorm}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    const list = await fetchUfMunicipios(ufUp);
    const hit = list.find((m) => norm(m.nome) === mNorm);
    const code = hit ? String(hit.id) : "";
    if (code) cache.set(key, code);
    return code;
  })();
  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}
