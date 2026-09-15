import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchPatientsTool from "./tools/search-patients";
import getDailyAgendaTool from "./tools/get-daily-agenda";
import getPatientAppointmentsTool from "./tools/get-patient-appointments";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "agendamento-saude-oriximina",
  title: "AGENDAMENTO SAÚDE ORIXIMINÁ",
  version: "0.1.0",
  instructions: "Ferramentas somente leitura para localizar pacientes e consultar agendas. Respeite a unidade e as permissões do usuário conectado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchPatientsTool, getDailyAgendaTool, getPatientAppointmentsTool],
});