import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getStaffScope } from "../supabase";

export default defineTool({
  name: "get_daily_agenda",
  title: "Consultar agenda diária",
  description: "Lista os agendamentos de uma data dentro da unidade permitida ao usuário conectado.",
  inputSchema: {
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Data no formato AAAA-MM-DD."),
    professional_id: z.string().uuid().optional().describe("ID opcional do profissional."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ date, professional_id }, ctx) => {
    try {
      const { supabase, unidadeId } = await getStaffScope(ctx);
      let query = supabase
        .from("agendamentos")
        .select("id, paciente_id, paciente_nome, profissional_id, profissional_nome, data, hora, turno, status, tipo, nome_procedimento")
        .eq("data", date)
        .order("hora")
        .limit(500);

      if (unidadeId) query = query.eq("unidade_id", unidadeId);
      if (professional_id) query = query.eq("profissional_id", professional_id);
      const { data, error } = await query;
      if (error) throw error;

      const appointments = data ?? [];
      return {
        content: [{ type: "text", text: appointments.length ? JSON.stringify(appointments) : "Nenhum agendamento encontrado." }],
        structuredContent: { appointments },
      };
    } catch (error) {
      throw new ToolError(error instanceof Error ? error.message : "Falha ao consultar a agenda");
    }
  },
});