import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { JSZip } from "https://deno.land/x/jszip@0.11.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify if user is Master
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });

    const { data: func } = await supabaseAdmin
      .from("funcionarios")
      .select("role")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (func?.role !== "master") {
      return new Response(JSON.stringify({ error: "Forbidden: Master only" }), { status: 403, headers: corsHeaders });
    }

    const zip = new JSZip();
    const timestamp = new Date().toISOString();
    const logEntries: string[] = [];

    logEntries.push(`Backup started at: ${timestamp}`);

    // 1. Export Tables as CSV and SQL-like JSON
    const { data: tables } = await supabaseAdmin.rpc('get_tables'); // We'll need a helper or just list manually
    const tablesToExport = [
      "pacientes", "agendamentos", "atendimentos", "funcionarios", "unidades", "salas",
      "clinica_config", "system_config", "whatsapp_config", "whatsapp_templates",
      "permissoes", "permissoes_usuario", "prontuarios", "triage_records"
    ];

    for (const table of tablesToExport) {
      try {
        const { data, error } = await supabaseAdmin.from(table).select("*");
        if (error) throw error;
        
        if (data && data.length > 0) {
          // JSON Export (SQL-like)
          zip.addFile(`database/data/${table}.json`, JSON.stringify(data, null, 2));
          
          // CSV Export
          const headers = Object.keys(data[0]);
          const csv = [
            headers.join(","),
            ...data.map(r => headers.map(h => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","))
          ].join("\n");
          zip.addFile(`database/csv/${table}.csv`, csv);
          
          logEntries.push(`Exported table: ${table} (${data.length} rows)`);
        } else {
          logEntries.push(`Table ${table} is empty.`);
        }
      } catch (err) {
        logEntries.push(`Failed to export table ${table}: ${err.message}`);
      }
    }

    // 2. Export Secrets Names
    const secretsNames = [
      "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
      "EVOLUTION_API_KEY", "LOVABLE_API_KEY", "RESEND_API_KEY"
    ];
    zip.addFile("config/secrets_list.txt", secretsNames.join("\n"));
    logEntries.push("Exported list of required secrets.");

    // 3. README and Logs
    zip.addFile("README_RESTAURACAO.md", `# Guia de Restauração\n\nEste backup contém os dados essenciais do sistema.\n\n1. Importe os arquivos JSON/CSV para o banco de dados.\n2. Configure as secrets listadas em config/secrets_list.txt.\n3. Restaure as Edge Functions se necessário.\n\nData: ${timestamp}`);
    zip.addFile("backup_log.txt", logEntries.join("\n"));

    const content = await zip.generateAsync({ type: "uint8array" });

    return new Response(content, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="backup_${new Date().getTime()}.zip"`,
      },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
