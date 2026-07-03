import React, { createContext, useContext, useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import type { Paciente } from "@/types";

/**
 * PacientesContext — slice memoizado do DataContext.
 *
 * Fase 1: fachada. Fase 2 (TODO): mover useRealtimeSync("pacientes") e
 * loadPacientes para este provider.
 */
interface PacientesContextType {
  pacientes: Paciente[];
  addPaciente: (p: Paciente) => Promise<void>;
  updatePaciente: (id: string, data: Partial<Paciente>) => Promise<void>;
  refreshPacientes: () => Promise<void>;
}

const PacientesContext = createContext<PacientesContextType | null>(null);

export const PacientesSliceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pacientes, addPaciente, updatePaciente, refreshPacientes } = useData();

  const value = useMemo<PacientesContextType>(
    () => ({ pacientes, addPaciente, updatePaciente, refreshPacientes }),
    [pacientes, addPaciente, updatePaciente, refreshPacientes],
  );

  return <PacientesContext.Provider value={value}>{children}</PacientesContext.Provider>;
};

export const usePacientes = () => {
  const ctx = useContext(PacientesContext);
  if (!ctx) throw new Error("usePacientes must be used within PacientesSliceProvider");
  return ctx;
};
