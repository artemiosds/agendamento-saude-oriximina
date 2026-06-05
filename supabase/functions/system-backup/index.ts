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

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify if user is Master
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } }
    });
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
    const startTime = new Date();
    const timestamp = startTime.toISOString();
    const logEntries: string[] = [`Backup started at: ${timestamp}`, `User ID: ${user.id}`];
    const manifest: any = {
      timestamp,
      environment: "Lovable Cloud",
      user_id: user.id,
      exports: {
        database: { total_tables: 0, total_records: 0, tables: [] },
        auth: { status: "pending" },
        storage: { total_files: 0, files: [] },
        edge_functions: { total: 0 },
        configs: { items: [] }
      },
      failures: []
    };

    // 1. Database Export
    const { data: tablesRaw, error: tablesError } = await supabaseAdmin.rpc('get_tables_info');
    let tablesToExport: string[] = [];
    
    if (tablesError) {
      logEntries.push(`Error fetching table list via RPC: ${tablesError.message}. Falling back to manual list.`);
      tablesToExport = [
        "pacientes", "agendamentos", "atendimentos", "funcionarios", "unidades", "salas",
        "clinica_config", "system_config", "whatsapp_config", "whatsapp_templates",
        "permissoes", "permissoes_usuario", "prontuarios", "triage_records", "especialidades",
        "horarios_funcionamento", "bloqueios", "fila_espera", "prontuario_config", "procedimentos",
        "document_templates", "form_templates", "episodios_clinicos", "pts", "treatment_sessions",
        "notification_logs", "action_logs", "integracoes_log"
      ];
    } else {
      tablesToExport = tablesRaw.map((t: any) => t.table_name);
    }

    for (const table of tablesToExport) {
      try {
        const { data, count, error } = await supabaseAdmin.from(table).select("*", { count: "exact" });
        if (error) throw error;
        
        const rowCount = count || (data ? data.length : 0);
        manifest.exports.database.total_records += rowCount;
        manifest.exports.database.total_tables++;
        manifest.exports.database.tables.push({ name: table, records: rowCount });

        if (data && data.length > 0) {
          zip.addFile(`database/json/${table}.json`, JSON.stringify(data, null, 2));
          const headers = Object.keys(data[0]);
          const csv = [
            headers.join(","),
            ...data.map(r => headers.map(h => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","))
          ].join("\n");
          zip.addFile(`database/csv/${table}.csv`, csv);
        } else {
          zip.addFile(`database/json/${table}.json`, "[]");
        }
        logEntries.push(`Exported table: ${table} (${rowCount} rows)`);
      } catch (err) {
        const msg = `Failed to export table ${table}: ${err.message}`;
        logEntries.push(msg);
        manifest.failures.push({ table, error: err.message });
      }
    }

    // 2. Auth Export (Admin User List)
    try {
      const { data: { users: authUsers }, error: authError } = await supabaseAdmin.auth.admin.listUsers();
      if (authError) throw authError;
      
      const safeUsers = authUsers.map(u => ({
        id: u.id,
        email: u.email,
        phone: u.phone,
        user_metadata: u.user_metadata,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        email_confirmed_at: u.email_confirmed_at
      }));
      
      zip.addFile("auth/users.json", JSON.stringify(safeUsers, null, 2));
      manifest.exports.auth.status = "success";
      manifest.exports.auth.total_users = safeUsers.length;
      logEntries.push(`Exported auth users: ${safeUsers.length} records`);
    } catch (err) {
      manifest.exports.auth.status = "failed";
      manifest.exports.auth.error = err.message;
      logEntries.push(`Auth export failed: ${err.message}`);
    }

    // 3. Storage Export
    try {
      const { data: buckets, error: bucketError } = await supabaseAdmin.storage.listBuckets();
      if (bucketError) throw bucketError;

      for (const bucket of buckets) {
        const { data: files, error: fileError } = await supabaseAdmin.storage.from(bucket.name).list("", { limit: 100 });
        if (fileError) continue;

        for (const file of files) {
          manifest.exports.storage.total_files++;
          manifest.exports.storage.files.push({ bucket: bucket.name, name: file.name, size: file.metadata?.size });
          logEntries.push(`Registered file in storage: ${bucket.name}/${file.name}`);
        }
      }
      zip.addFile("storage/storage-manifest.json", JSON.stringify(manifest.exports.storage, null, 2));
    } catch (err) {
      logEntries.push(`Storage listing failed: ${err.message}`);
    }

    // 4. Configs & Special Items
    const configsToZip = [
      { table: "prontuario_config", name: "prontuario-config.json" },
      { table: "whatsapp_templates", name: "whatsapp-templates.json" },
      { table: "clinica_config", name: "clinica-config.json" },
      { table: "permissoes", name: "permissoes.json" }
    ];

    for (const cfg of configsToZip) {
      const { data } = await supabaseAdmin.from(cfg.table).select("*");
      if (data) {
        zip.addFile(`configs/${cfg.name}`, JSON.stringify(data, null, 2));
        manifest.exports.configs.items.push(cfg.name);
      }
    }

    // 5. Secrets Template
    const secretsTemplate = `
# Template de Secrets do Sistema
# Preencha os valores abaixo para restaurar o ambiente

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
WHATSAPP_API_KEY=
UAZAPI_ADMIN_TOKEN=
EVOLUTION_API_KEY=
EVOLUTION_BASE_URL=
AUTENTIQUE_API_TOKEN=
LOVABLE_API_KEY=
`;
    zip.addFile("secrets/secrets-template.env", secretsTemplate);

    // 6. README and Final Manifest
    const readme = `
# README DE RESTAURAÇÃO - BACKUP COMPLETO

## Conteúdo
- **database/**: Dados exportados em JSON e CSV de todas as tabelas.
- **auth/**: Lista de usuários (sem senhas).
- **configs/**: Configurações específicas de prontuário, WhatsApp e clínica.
- **storage/**: Manifesto de arquivos no Storage (download binário parcial dependendo do tamanho).
- **secrets/**: Template de variáveis de ambiente necessárias.
- **logs/**: Log detalhado da execução.

## Procedimento de Restauração
1. **Banco de Dados**: Crie o schema base e utilize as ferramentas de importação do Supabase/psql para carregar os arquivos CSV ou JSON.
2. **Auth**: Os usuários devem ser recriados via API Admin ou importação de CSV no portal Supabase. Senhas devem ser resetadas pelos usuários.
3. **Secrets**: Utilize o arquivo \`secrets/secrets-template.env\` para configurar o novo ambiente.
4. **Storage**: Utilize o \`storage-manifest.json\` para verificar e subir os arquivos necessários.

## Metadados
- Gerado em: ${timestamp}
- Pelo usuário: ${user.id}
`;
    zip.addFile("README_RESTAURACAO.md", readme);
    
    manifest.duration_ms = new Date().getTime() - startTime.getTime();
    zip.addFile("manifest.json", JSON.stringify(manifest, null, 2));
    zip.addFile("logs/backup-log.txt", logEntries.join("\n"));

    const content = await zip.generateAsync({ type: "uint8array" });

    return new Response(content, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="backup_completo_${new Date().getTime()}.zip"`,
      },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
