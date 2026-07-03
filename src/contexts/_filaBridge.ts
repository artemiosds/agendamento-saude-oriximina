/**
 * Bridge transitório (Fase 5, Passo 3.1) para permitir que o `DataProvider`
 * (que roda por fora do `FilaSliceProvider`) consulte o snapshot atual da
 * fila sem re-introduzir o state no DataContext.
 *
 * Usado por `cancelAgendamento` para devolver a lista de candidatos da fila
 * elegíveis para o slot liberado. Será eliminado quando `cancelAgendamento`
 * migrar para AgendamentosContext e passar a consumir `useFila()` diretamente.
 */
import type { FilaEspera } from "@/types";

let snapshot: FilaEspera[] = [];

export const setFilaSnapshot = (next: FilaEspera[]) => {
  snapshot = next;
};

export const getFilaSnapshot = (): FilaEspera[] => snapshot;
