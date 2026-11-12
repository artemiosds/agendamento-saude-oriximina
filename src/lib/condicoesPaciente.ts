/** Condições do paciente: armazenadas em pacientes.tipo_condicao como texto separado por vírgula (ex: "fisica,intelectual"). Valor antigo único continua válido. */
export const CONDICOES_PACIENTE = [
  { value: "fisica", label: "Física" },
  { value: "intelectual", label: "Intelectual" },
  { value: "tea", label: "TEA" },
  { value: "visual", label: "Visual" },
  { value: "auditiva", label: "Auditiva" },
] as const;

const VALID = new Set<string>(CONDICOES_PACIENTE.map(c => c.value));

export function parseCondicoes(raw?: string | null): string[] {
  return Array.from(new Set(String(raw ?? "").toLowerCase().split(/[,;|]/).map(s => s.trim()).filter(s => VALID.has(s))));
}
export function hasCondicao(raw: string | null | undefined, value: string): boolean {
  return parseCondicoes(raw).includes(value);
}
export function toggleCondicao(raw: string | null | undefined, value: string, checked: boolean): string {
  const set = new Set(parseCondicoes(raw));
  if (checked) set.add(value); else set.delete(value);
  return CONDICOES_PACIENTE.map(c => c.value).filter(v => set.has(v)).join(",");
}
