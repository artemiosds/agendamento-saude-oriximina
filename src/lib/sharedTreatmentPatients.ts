/**
 * Pacientes compartilhados: pacientes com ciclos ativos em 2+ especialidades distintas.
 * Somente leitura/visual — não altera ciclos, sessões nem fila. Não expõe nomes.
 */
export interface SharedCycleInput { patientId: string; specialty: string | null | undefined }
export interface SharedPatientsSummary { totalPatients: number; combinations: { label: string; count: number }[] }

function normalizeSpecialty(value: string | null | undefined): string {
  const text = String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!text) return "";
  if (text.includes("fisioterap")) return "Fisioterapia";
  if (text.includes("fonoaud")) return "Fonoaudiologia";
  if (text.includes("psicolog")) return "Psicologia";
  if (text.includes("nutri")) return "Nutrição";
  if (text.includes("terapia ocup") || text === "to") return "Terapia Ocupacional";
  if (text.includes("assistente social") || text.includes("servico social")) return "Serviço Social";
  return String(value).trim();
}

export function buildSharedPatientsSummary(cycles: SharedCycleInput[]): SharedPatientsSummary {
  const byPatient = new Map<string, Set<string>>();
  for (const cycle of cycles) {
    const specialty = normalizeSpecialty(cycle.specialty);
    if (!cycle.patientId || !specialty) continue;
    if (!byPatient.has(cycle.patientId)) byPatient.set(cycle.patientId, new Set());
    byPatient.get(cycle.patientId)!.add(specialty);
  }
  const combos = new Map<string, number>();
  let total = 0;
  for (const set of byPatient.values()) {
    if (set.size < 2) continue;
    total += 1;
    const label = [...set].sort((a, b) => a.localeCompare(b, "pt-BR")).join(" + ");
    combos.set(label, (combos.get(label) || 0) + 1);
  }
  return {
    totalPatients: total,
    combinations: [...combos.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR")),
  };
}
