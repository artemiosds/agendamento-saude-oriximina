import React, { createContext, useContext, useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import type { Agendamento, Atendimento, FilaEspera } from "@/types";

/**
 * AgendamentosContext — slice memoizado do DataContext.
 *
 * Fase 1 (atual): é uma fachada que consome useData() e memoiza apenas
 * o slice de agendamentos + atendimentos. Nenhum consumidor precisa mudar;
 * quem migrar para useAgendamentos() deixa de re-renderizar quando pacientes/
 * fila/config/operacional mudam.
 *
 * TODO (Fase 2): mover useRealtimeSync("agendamentos"|"atendimentos") e
 * loaders para este provider e remover do DataProvider.
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
  atendimentos: Atendimento[];
  addAtendimento: (a: Atendimento) => Promise<void>;
  updateAtendimento: (id: string, data: Partial<Atendimento>) => void;
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
    atendimentos,
    addAtendimento,
    updateAtendimento,
    applyAgendamentoRealtimeEvent,
  } = useData();
  const { user: authUser } = useAuth();

  // Realtime ownership migrado do DataProvider (rt:public:agendamentos:all).
  // Handler preserva upsert incremental via applyAgendamentoRealtimeEvent
  // (exposto temporariamente por useData enquanto o state ainda vive lá).
  useRealtimeSync({
    enabled: !!authUser,
    table: "agendamentos",
    onEvent: applyAgendamentoRealtimeEvent,
    poll: refreshAgendamentos,
  });

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
      atendimentos,
      addAtendimento,
      updateAtendimento,
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
      atendimentos,
      addAtendimento,
      updateAtendimento,
    ],
  );

  return <AgendamentosContext.Provider value={value}>{children}</AgendamentosContext.Provider>;
};

export const useAgendamentos = () => {
  const ctx = useContext(AgendamentosContext);
  if (!ctx) throw new Error("useAgendamentos must be used within AgendamentosSliceProvider");
  return ctx;
};
