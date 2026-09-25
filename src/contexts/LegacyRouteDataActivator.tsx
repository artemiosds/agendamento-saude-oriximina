import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAgendamentos } from "@/contexts/AgendamentosContext";
import { usePacientes } from "@/contexts/PacientesContext";
import { getLegacyRouteDataNeeds } from "@/contexts/legacyRouteDataNeeds";

export const LegacyRouteDataActivator = () => {
  const { pathname } = useLocation();
  const { activateLegacyPacientes, activateAgendaPatients } = usePacientes();
  const { activateLegacyAgendamentos, activateAgendaMode } = useAgendamentos();

  useEffect(() => {
    const needs = getLegacyRouteDataNeeds(pathname);
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (pathname === '/painel/agenda') {
        activateAgendaPatients();
        activateAgendaMode();
        return;
      }
      if (needs.pacientes) void activateLegacyPacientes();
      if (needs.agendamentos) void activateLegacyAgendamentos();
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, activateLegacyPacientes, activateLegacyAgendamentos, activateAgendaPatients, activateAgendaMode]);

  return null;
};
