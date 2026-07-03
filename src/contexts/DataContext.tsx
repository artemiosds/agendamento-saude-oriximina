import React from "react";

/**
 * DataContext — Fase 5 (Passo 3.2): estado, CRUDs e derivados foram
 * inteiramente migrados para os slices:
 *
 *   - OperacionalSliceProvider (unidades, salas, setores, funcionários,
 *     disponibilidades, bloqueios, configurações, cálculos de agenda,
 *     logAction, resolveScopedUnidadeId)
 *   - AgendamentosSliceProvider (agendamentos, atendimentos)
 *   - PacientesSliceProvider (pacientes)
 *   - FilaSliceProvider (fila de espera)
 *
 * Este provider agora é apenas um passthrough para preservar a árvore
 * de `<DataProvider>` em `App.tsx` durante o encerramento da migração.
 * Será removido junto com este arquivo assim que o wrapper no `App.tsx`
 * for descartado.
 */
export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

export type { TurnoInfoResult } from "@/contexts/OperacionalContext";
