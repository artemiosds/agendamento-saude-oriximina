// Cores semânticas por especialidade (HSL via classes Tailwind utilitárias).
// Mapa baseado em especialidade/profissão do profissional autor do prontuário.

export interface SpecialtyColorTokens {
  border: string;       // border-l-* token
  badge: string;        // bg + text token for badge
  dot: string;          // bg-* color of marker dot
  ring: string;         // ring-* hover/focus color
}

const PALETTE: Record<string, SpecialtyColorTokens> = {
  fisioterapia:        { border: "border-l-emerald-500", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500", ring: "ring-emerald-500/40" },
  fonoaudiologia:      { border: "border-l-sky-500",     badge: "bg-sky-500/15 text-sky-700 dark:text-sky-300",             dot: "bg-sky-500",     ring: "ring-sky-500/40" },
  psicologia:          { border: "border-l-purple-500",  badge: "bg-purple-500/15 text-purple-700 dark:text-purple-300",    dot: "bg-purple-500",  ring: "ring-purple-500/40" },
  neuropsicologia:     { border: "border-l-fuchsia-500", badge: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300", dot: "bg-fuchsia-500", ring: "ring-fuchsia-500/40" },
  psicopedagogia:      { border: "border-l-pink-500",    badge: "bg-pink-500/15 text-pink-700 dark:text-pink-300",          dot: "bg-pink-500",    ring: "ring-pink-500/40" },
  "terapia ocupacional": { border: "border-l-orange-500", badge: "bg-orange-500/15 text-orange-700 dark:text-orange-300",   dot: "bg-orange-500",  ring: "ring-orange-500/40" },
  nutricao:            { border: "border-l-lime-500",    badge: "bg-lime-500/15 text-lime-700 dark:text-lime-300",          dot: "bg-lime-500",    ring: "ring-lime-500/40" },
  enfermagem:          { border: "border-l-teal-500",    badge: "bg-teal-500/15 text-teal-700 dark:text-teal-300",          dot: "bg-teal-500",    ring: "ring-teal-500/40" },
  "servico social":    { border: "border-l-amber-500",   badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300",       dot: "bg-amber-500",   ring: "ring-amber-500/40" },
  medicina:            { border: "border-l-blue-500",    badge: "bg-blue-500/15 text-blue-700 dark:text-blue-300",          dot: "bg-blue-500",    ring: "ring-blue-500/40" },
  odontologia:         { border: "border-l-cyan-500",    badge: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",          dot: "bg-cyan-500",    ring: "ring-cyan-500/40" },
};

const FALLBACK: SpecialtyColorTokens = {
  border: "border-l-primary",
  badge: "bg-primary/10 text-primary",
  dot: "bg-primary",
  ring: "ring-primary/40",
};

function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function getSpecialtyColors(specialty: string | null | undefined): SpecialtyColorTokens {
  const key = normalize(specialty);
  if (!key) return FALLBACK;
  if (PALETTE[key]) return PALETTE[key];
  // partial match (e.g. "Fisioterapeuta" → "fisioterapia")
  for (const k of Object.keys(PALETTE)) {
    if (key.includes(k.split(" ")[0])) return PALETTE[k];
  }
  if (key.startsWith("fisio")) return PALETTE.fisioterapia;
  if (key.startsWith("fono")) return PALETTE.fonoaudiologia;
  if (key.startsWith("psico")) return PALETTE.psicologia;
  if (key.startsWith("med") || key.includes("medic")) return PALETTE.medicina;
  if (key.startsWith("enferm")) return PALETTE.enfermagem;
  if (key.startsWith("nutri")) return PALETTE.nutricao;
  return FALLBACK;
}
