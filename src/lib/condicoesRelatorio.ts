import { hasCondicao } from "@/lib/condicoesPaciente";

export type GrupoCondicao = "tea" | "auditiva" | "fisica" | "intelectual" | "visual";

export const GRUPOS_RELATORIO: { value: GrupoCondicao; label: string; cid: string[]; termos: string[] }[] = [
  { value: "tea", label: "Autismo (TEA)", cid: ["F84"], termos: ["autis"] },
  { value: "auditiva", label: "Surdos / Def. Auditiva", cid: ["H90", "H91"], termos: ["surd", "auditi", "hipoacus", "libras"] },
  { value: "fisica", label: "Deficiência Física", cid: [], termos: [] },
  { value: "intelectual", label: "Deficiência Intelectual", cid: [], termos: [] },
  { value: "visual", label: "Deficiência Visual", cid: ["H54"], termos: [] },
];

export interface PacienteCondicaoInfo {
  tipo_condicao?: string | null; cid?: string | null; is_autista?: boolean | null;
  diagnostico_resumido?: string | null; descricao_clinica?: string | null; observacoes?: string | null;
}

/** Paciente pertence ao grupo pela condição marcada, pela flag de autismo, pelo CID ou por termos no texto clínico. */
export function pertenceAoGrupo(p: PacienteCondicaoInfo, grupo: GrupoCondicao): boolean {
  const g = GRUPOS_RELATORIO.find(x => x.value === grupo)!;
  if (hasCondicao(p.tipo_condicao, grupo)) return true;
  if (grupo === "tea" && p.is_autista) return true;
  const cid = String(p.cid ?? "").toUpperCase();
  if (g.cid.some(c => cid.includes(c))) return true;
  const texto = [p.diagnostico_resumido, p.descricao_clinica, p.observacoes].join(" ").toLowerCase();
  return g.termos.some(t => texto.includes(t));
}
