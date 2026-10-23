export interface AuditActorSource {
  user_nome?: string | null;
  origem?: string | null;
}

const SYSTEM_ORIGINS = new Set([
  "sistema",
  "system",
  "automacao",
  "automação",
  "automation",
  "backend",
  "cron",
  "scheduled_job",
  "edge_function",
]);

export function isSystemAuditOrigin(origin?: string | null): boolean {
  const normalized = (origin || "").trim().toLocaleLowerCase("pt-BR");
  return SYSTEM_ORIGINS.has(normalized);
}

export function getAuditActorLabel(entry: AuditActorSource): string {
  const name = (entry.user_nome || "").trim();
  if (name) return name;
  if (isSystemAuditOrigin(entry.origem)) return "Sistema / Automação";
  return "Responsável não registrado";
}
