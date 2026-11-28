/** Administrative catalog helpers. No clinical prescribing rules. */
export async function readCompleteCatalog<T extends { id: string }>(read: (from: number, to: number) => Promise<T[]>, pageSize = 200): Promise<T[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw Error('Tamanho de página inválido.');
  const result: T[] = [];
  const seen = new Set<string>();
  for (;;) {
    const page = await read(result.length, result.length + pageSize - 1);
    if (!page.length) return result;
    if (page.length > pageSize) throw Error('Consulta de catálogo inconsistente.');
    for (const row of page) {
      if (!row.id || seen.has(row.id)) throw Error('O catálogo mudou durante a consulta. Recarregue antes de editar.');
      seen.add(row.id); result.push(row);
    }
    if (result.length > 100000) throw Error('Limite de consulta atingido. Nenhuma lista parcial será usada.');
  }
}
export function missingCatalogSeeds<T extends { codigo_rename: string }>(seeds: readonly T[], existing: readonly { codigo_rename: string | null }[]): T[] {
  const seen = new Set(existing.map(row => row.codigo_rename).filter(Boolean));
  const result: T[] = [];
  for (const seed of seeds) {
    if (!seed.codigo_rename || !seed.codigo_rename.trim()) throw Error('Código de origem inválido.');
    if (seen.has(seed.codigo_rename)) continue;
    seen.add(seed.codigo_rename); result.push(seed);
  }
  return result;
}
export function catalogEdit<T extends object, K extends keyof T>(original: T, draft: T, keys: readonly K[]) {
  const patch: Partial<Pick<T, K>> = {};
  const expected: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    if (!Object.is(original[key], draft[key])) {
      patch[key] = draft[key]; expected[key] = original[key];
    }
  }
  return { patch, expected };
}
export function normalizeCatalogSearch(value: string | null | undefined) {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}
export function matchesCatalogSearch(query: string, fields: readonly (string | null | undefined)[]) {
  const terms = normalizeCatalogSearch(query).split(/\s+/).filter(Boolean);
  const haystack = fields.map(normalizeCatalogSearch).join(' ');
  return terms.every(term => haystack.includes(term));
}
