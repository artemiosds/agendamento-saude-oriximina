import React from "react";
import { AgendamentosSliceProvider } from "@/contexts/AgendamentosContext";
import { PacientesSliceProvider } from "@/contexts/PacientesContext";
import { FilaSliceProvider } from "@/contexts/FilaContext";
import { OperacionalSliceProvider } from "@/contexts/OperacionalContext";

/**
 * DomainProviders — aninha os 4 sub-contextos de domínio
 * (Operacional, Pacientes, Agendamentos, Fila).
 */
export const DomainProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <OperacionalSliceProvider>
      <PacientesSliceProvider>
        <AgendamentosSliceProvider>
          <FilaSliceProvider>{children}</FilaSliceProvider>
        </AgendamentosSliceProvider>
      </PacientesSliceProvider>
    </OperacionalSliceProvider>
  );
};
