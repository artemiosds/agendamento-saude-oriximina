import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAgendamentos } from "@/contexts/AgendamentosContext";
import { usePacientes } from "@/contexts/PacientesContext";

const PATIENT_ROUTES = new Set([
  "/painel/agenda",
  "/painel/pacientes",
  "/painel/atualizacao-cadastral",
  "/painel/fila",
  "/painel/prontuario",
  "/painel/triagem",
  "/painel/tratamentos",
  "/painel/pts",
  "/painel/relatorios",
  "/painel/alta",
]);

const APPOINTMENT_ROUTES = new Set([
  "/painel/agenda",
  "/painel/pacientes",
  "/painel/fila",
  "/painel/prontuario",
  "/painel/triagem",
  "/painel/tratamentos",
  "/painel/multiprofissional",
]);

export const getLegacyRouteDataNeeds = (pathname: string) => ({
  pacientes: PATIENT_ROUTES.has(pathname),
  agendamentos: APPOINTMENT_ROUTES.has(pathname),
});

export const LegacyRouteDataActivator = () => {
  const { pathname } = useLocation();
  const { activateLegacyPacientes } = usePacientes();
  const { activateLegacyAgendamentos } = useAgendamentos();

  useEffect(() => {
    const needs = getLegacyRouteDataNeeds(pathname);
    if (needs.pacientes) void activateLegacyPacientes();
    if (needs.agendamentos) void activateLegacyAgendamentos();
  }, [pathname, activateLegacyPacientes, activateLegacyAgendamentos]);

  return null;
};