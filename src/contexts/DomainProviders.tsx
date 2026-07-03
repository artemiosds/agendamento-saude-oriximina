import React from "react";
import { AgendamentosSliceProvider } from "@/contexts/AgendamentosContext";
import { PacientesSliceProvider } from "@/contexts/PacientesContext";
import { FilaSliceProvider } from "@/contexts/FilaContext";
import { OperacionalSliceProvider } from "@/contexts/OperacionalContext";

/**
 * DomainProviders — aninha os 4 sub-contextos de domínio.
 *
 * DEVE ficar DENTRO do <DataProvider>. Cada slice lê de useData() e
 * memoiza seu próprio valor, permitindo migração incremental de
 * consumidores sem quebrar quem ainda usa useData().
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
