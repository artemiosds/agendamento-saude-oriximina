export type ExpectedConfigSection = { key: string; value: unknown };
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, val]) => [key, canonical(val)]));
  }
  return value;
}
export function sameConfigSection(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
export function assertExpectedConfigSection(values: Record<string, unknown> | null, expected?: ExpectedConfigSection) {
  if (expected && (!values || !sameConfigSection(values[expected.key], expected.value))) {
    throw Error('Esta configuração mudou desde a leitura. Nenhuma gravação realizada. Confira os valores atuais antes de tentar novamente.');
  }
}
export function configObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Formato da configuração inválido.');
  return value as Record<string, unknown>;
}
export function configVersion(value: unknown): number {
  if (value === undefined) return 0;
  const v = configObject(value).version;
  if (v === undefined) return 0;
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0 || v >= Number.MAX_SAFE_INTEGER) throw Error('Versão inválida.');
  return v;
}
