/**
 * Bridge transitório (Fase 5, Passo 3.1) para permitir que o `DataProvider`
 * (que roda por fora do `AgendamentosSliceProvider`) leia — de forma reativa —
 * o array de agendamentos, sem reintroduzir esse state no DataContext.
 *
 * Usado internamente por `getAvailableSlots`, `getTurnoInfo`, `getDayInfoMap`
 * (memos `appointmentCountsByKey` e `appointmentsByDateProfUnit`). Será
 * eliminado quando esses helpers migrarem para OperacionalContext e passarem
 * a consumir `useAgendamentos()` diretamente.
 */
import type { Agendamento } from "@/types";

let snapshot: Agendamento[] = [];
const listeners = new Set<() => void>();

export const setAgendamentosSnapshot = (next: Agendamento[]) => {
  snapshot = next;
  listeners.forEach((l) => l());
};

export const getAgendamentosSnapshot = (): Agendamento[] => snapshot;

export const subscribeAgendamentosSnapshot = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
