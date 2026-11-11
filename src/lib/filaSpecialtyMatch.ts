import { classifyTreatmentCapacitySpecialty } from "@/lib/treatmentCapacityAnalytics";

/**
 * Compatibilidade entre uma entrada da Lista de Espera e a profissão de quem
 * oferece a vaga. Não altera a ordem de prioridade nem a Triagem: apenas evita
 * convocar um paciente para uma categoria profissional diferente da destinada.
 * - Entrada já vinculada a um profissional: segue a regra anterior.
 * - Sem especialidade de destino ou sem profissão conhecida: mantém o comportamento anterior.
 */
export function filaEntryMatchesProfession(
  entry: { profissionalId?: string | null; especialidadeDestino?: string | null },
  profissionalId: string,
  profissao?: string | null,
): boolean {
  if (entry.profissionalId) return entry.profissionalId === profissionalId;
  const destino = classifyTreatmentCapacitySpecialty(entry.especialidadeDestino || "");
  const prof = classifyTreatmentCapacitySpecialty(profissao || "");
  if (!destino || !prof) return true;
  return destino === prof;
}
