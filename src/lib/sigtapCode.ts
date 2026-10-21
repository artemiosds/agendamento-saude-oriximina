/** Compare SIGTAP codes without changing the identifiers stored in clinical records. */
export const sigtapCodeKey = (code: string): string => {
  const value = String(code || "").trim();
  if (!/^[\d.\-\s]+$/.test(value)) return value;
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 ? digits : value;
};

export const sigtapCodeLabel = (code: string): string => sigtapCodeKey(code);

/** Prefer the official ten-digit row while keeping the original row untouched. */
export function uniqueSigtapCodes<T extends { codigo: string }>(items: T[]): T[] {
  const byCode = new Map<string, T>();
  for (const item of items) {
    const key = sigtapCodeKey(item.codigo);
    const current = byCode.get(key);
    if (!current || (item.codigo === key && current.codigo !== key)) byCode.set(key, item);
  }
  return [...byCode.values()];
}
