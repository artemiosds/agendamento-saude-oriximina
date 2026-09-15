import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getStaffScope } from "../supabase";

export default defineTool({
  name: "get_patient_appointments",
  title: "Consultar histórico de agendamentos",
  description: "Consulta os agendamentos recentes de um paciente dentro da unidade permitida.",
  inputSchema: {
    patient_id: z.string().min(1).max(100).describe("ID do paciente retornado pela busca."),
    limit: z.number().int().min(1).max(50).default(10).describe("Máximo de agendamentos."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ patient_id, limit }, ctx) => {
    try {
      const { supabase, unidadeId } = await getStaffScope(ctx);
      let patientQuery = supabase.from("pacientes").select("id, nome, unidade_id").eq("id", patient_id);
      if (unidadeId) patientQuery = patientQuery.eq("unidade_id", unidadeId);
      const { data: patient, error: patientError } = await patientQuery.maybeSingle();
      if (patientError) throw patientError;
      if (!patient) throw new ToolError("Paciente não encontrado na unidade permitida.");

      let query = supabase
        .from("agendamentos")
        .select("id, data, hora, turno, profissional_nome, status, tipo, nome_procedimento, tipo_falta")
        .eq("paciente_id", patient_id)
        .order("data", { ascending: false })
        .order("hora", { ascending: false })
        .limit(limit);
      if (unidadeId) query = query.eq("unidade_id", unidadeId);

      const { data, error } = await query;
      if (error) throw error;
      const appointments = data ?? [];
      return {
        content: [{ type: "text", text: JSON.stringify({ patient: patient.nome, appointments }) }],
        structuredContent: { patient, appointments },
      };
    } catch (error) {
      if (error instanceof ToolError) throw error;
      throw new ToolError(error instanceof Error ? error.message : "Falha ao consultar o histórico");
    }
  },
});