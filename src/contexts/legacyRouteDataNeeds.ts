const PATIENT_ROUTES = new Set([
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
