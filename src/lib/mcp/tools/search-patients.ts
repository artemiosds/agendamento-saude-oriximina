import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getStaffScope } from "../supabase";

export default defineTool({
  name: "search_patients",
  title: "Buscar pacientes",
  description: "Busca pacientes pelo nome dentro da unidade permitida ao usuário conectado.",
  inputSchema: {
    name: z.string().trim().min(2).max(120).describe("Nome ou parte do nome do paciente."),
    limit: z.number().int().min(1).max(20).default(10).describe("Máximo de resultados."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ name, limit }, ctx) => {
    try {
      const { supabase, unidadeId } = await getStaffScope(ctx);
      const safeName = name.replace(/[%_]/g, "").trim();
      let query = supabase
        .from("pacientes")
        .select("id, nome, data_nascimento, unidade_id")
        .ilike("nome", `%${safeName}%`)
        .order("nome")
        .limit(limit);

      if (unidadeId) query = query.eq("unidade_id", unidadeId);
      const { data, error } = await query;
      if (error) throw error;

      const patients = data ?? [];
      return {
        content: [{ type: "text", text: patients.length ? JSON.stringify(patients) : "Nenhum paciente encontrado." }],
        structuredContent: { patients },
      };
    } catch (error) {
      throw new ToolError(error instanceof Error ? error.message : "Falha ao buscar pacientes");
    }
  },
});