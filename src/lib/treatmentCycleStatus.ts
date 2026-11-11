/**
 * Estados de ciclo considerados ATIVOS (ainda com sessões elegíveis para agendamento).
 * Mesma definição já usada pela Gestão de Tratamentos (duplicidade de ciclo ativo).
 * Encerrados: finalizado_alta, concluido, cancelado — nunca entram.
 * Regra única para Recepção (Localizar Vagas) e Gestão de Tratamentos (Painel de Capacidade).
 */
export const ACTIVE_TREATMENT_CYCLE_STATUSES = ["em_andamento", "aguardando_vaga", "em_fila"] as const;
export function isActiveTreatmentCycleStatus(status?: string | null): boolean {
  return (ACTIVE_TREATMENT_CYCLE_STATUSES as readonly string[]).includes(String(status || ""));
}
