import React, { createContext, useContext, useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import type { Agendamento, FilaEspera } from "@/types";

/**
 * FilaContext — slice memoizado do DataContext.
 *
 * Fase 1: fachada. Fase 2 (TODO): mover useRealtimeSync("fila_espera") e
 * loadFila para este provider.
 */
interface FilaContextType {
  fila: FilaEspera[];
  addToFila: (f: FilaEspera) => Promise<void>;
  updateFila: (id: string, data: Partial<FilaEspera>) => Promise<void>;
  removeFromFila: (id: string) => Promise<void>;
  refreshFila: () => Promise<void>;
  checkFilaForSlot: (profissionalId: string, unidadeId: string, data: string, hora: string) => FilaEspera[];
  encaixarDaFila: (filaId: string, agendamento: Omit<Agendamento, "id" | "criadoEm">) => void;
}

const FilaContext = createContext<FilaContextType | null>(null);

export const FilaSliceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    fila,
    addToFila,
    updateFila,
    removeFromFila,
    refreshFila,
    checkFilaForSlot,
    encaixarDaFila,
  } = useData();

  const value = useMemo<FilaContextType>(
    () => ({
      fila,
      addToFila,
      updateFila,
      removeFromFila,
      refreshFila,
      checkFilaForSlot,
      encaixarDaFila,
    }),
    [fila, addToFila, updateFila, removeFromFila, refreshFila, checkFilaForSlot, encaixarDaFila],
  );

  return <FilaContext.Provider value={value}>{children}</FilaContext.Provider>;
};

export const useFila = () => {
  const ctx = useContext(FilaContext);
  if (!ctx) throw new Error("useFila must be used within FilaSliceProvider");
  return ctx;
};
