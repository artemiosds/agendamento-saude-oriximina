import React, { createContext, useContext, useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import type { Paciente } from "@/types";

/**
 * PacientesContext — slice memoizado do DataContext.
 *
 * Fase 2 (parcial): possui o canal Realtime de `public.pacientes`.
 * A ownership do state ainda vive no DataProvider; o canal chama
 * `refreshPacientes()` a cada evento (mesma função usada como poll
 * fallback). Move state para cá em passo posterior.
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
  const { user: authUser } = useAuth();

  // Realtime ownership migrado do DataProvider (rt:public:pacientes:all).
  useRealtimeSync({
    enabled: !!authUser,
    table: "pacientes",
    onEvent: () => {
      refreshPacientes();
    },
    poll: refreshPacientes,
  });

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
