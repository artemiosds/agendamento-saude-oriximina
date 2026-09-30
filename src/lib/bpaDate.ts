export interface BpaDateParts { ano: number; mes: number; dia: number }

/** Parses dates as returned by PostgREST and dates already compacted for BPA. */
export function parseBpaDate(value: unknown): BpaDateParts | null {
  if (value == null) return null;
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  const parts = iso
    ? { ano: Number(iso[1]), mes: Number(iso[2]), dia: Number(iso[3]) }
    : compact
      ? { ano: Number(compact[1]), mes: Number(compact[2]), dia: Number(compact[3]) }
      : dmy
        ? { ano: Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]), mes: Number(dmy[2]), dia: Number(dmy[1]) }
        : null;
  if (!parts || parts.ano < 1900 || parts.ano > 2100 || parts.mes < 1 || parts.mes > 12 || parts.dia < 1 || parts.dia > 31) return null;
  const check = new Date(Date.UTC(parts.ano, parts.mes - 1, parts.dia));
  return check.getUTCFullYear() === parts.ano && check.getUTCMonth() + 1 === parts.mes && check.getUTCDate() === parts.dia
    ? parts
    : null;
}
