import React, { createContext, useContext, useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import type { Agendamento, FilaEspera } from "@/types";

/**
 * AgendamentosContext — slice memoizado do DataContext.
 *
 * Fase 1 (atual): é uma fachada que consome useData() e memoiza apenas
 * o slice de agendamentos. Nenhum consumidor precisa mudar; quem migrar
 * para useAgendamentos() deixa de re-renderizar quando pacientes/fila/
 * config/operacional mudam.
 *
 * TODO (Fase 2): mover useRealtimeSync("agendamentos") e loadAgendamentos
 * para este provider e remover do DataProvider.
 */
interface AgendamentosContextType {
  agendamentos: Agendamento[];
  addAgendamento: (ag: Agendamento) => Promise<void>;
  updateAgendamento: (id: string, data: Partial<Agendamento>) => Promise<void>;
  cancelAgendamento: (id: string) => Promise<FilaEspera[]>;
  deleteAgendamento: (id: string) => Promise<void>;
  refreshAgendamentos: () => Promise<void>;
  ensureAgendamentosForDate: (date: string) => Promise<void>;
  ensureAgendamentosForRange: (startDate: string, endDate: string) => Promise<void>;
}

const AgendamentosContext = createContext<AgendamentosContextType | null>(null);

export const AgendamentosSliceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    agendamentos,
    addAgendamento,
    updateAgendamento,
    cancelAgendamento,
    deleteAgendamento,
    refreshAgendamentos,
    ensureAgendamentosForDate,
    ensureAgendamentosForRange,
  } = useData();

  const value = useMemo<AgendamentosContextType>(
    () => ({
      agendamentos,
      addAgendamento,
      updateAgendamento,
      cancelAgendamento,
      deleteAgendamento,
      refreshAgendamentos,
      ensureAgendamentosForDate,
      ensureAgendamentosForRange,
    }),
    [
      agendamentos,
      addAgendamento,
      updateAgendamento,
      cancelAgendamento,
      deleteAgendamento,
      refreshAgendamentos,
      ensureAgendamentosForDate,
      ensureAgendamentosForRange,
    ],
  );

  return <AgendamentosContext.Provider value={value}>{children}</AgendamentosContext.Provider>;
};

export const useAgendamentos = () => {
  const ctx = useContext(AgendamentosContext);
  if (!ctx) throw new Error("useAgendamentos must be used within AgendamentosSliceProvider");
  return ctx;
};
