import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const { nome, usuario, email, cpf, senha, setor, unidade_id, sala_id, cargo, role, criado_por, tempo_atendimento, profissao, tipo_conselho, numero_conselho, uf_conselho, pode_agendar_retorno } = body;

      if (!nome || !usuario || !email || !senha) {
        return new Response(
          JSON.stringify({ error: "Nome, usuário, e-mail e senha são obrigatórios." }),
          { status: 200, headers: corsHeaders }
        );
      }

      // Check if email already exists in auth.users
      const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (!listError && existingUsers?.users) {
        const emailExists = existingUsers.users.some(u => u.email === email);
        if (emailExists) {
          return new Response(
            JSON.stringify({ error: "Este e-mail já está registrado no sistema." }),
            { status: 200, headers: corsHeaders }
          );
        }
      }

      // Create auth user
      const { data: authUser, error: authErr } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password: senha,
          email_confirm: true,
        });

      if (authErr) {
        return new Response(
          JSON.stringify({ error: "Erro ao criar acesso: " + authErr.message }),
          { status: 200, headers: corsHeaders }
        );
      }

      // Insert into funcionarios
      const { data: func, error: dbErr } = await supabaseAdmin
        .from("funcionarios")
        .insert({
          auth_user_id: authUser.user.id,
          nome,
          usuario,
          email,
          setor: setor || "",
          unidade_id: unidade_id || "",
          sala_id: sala_id || "",
          cargo: cargo || "",
          role: role || "recepcao",
          ativo: true,
          criado_por: criado_por || "",
          tempo_atendimento: tempo_atendimento || 30,
          profissao: profissao || "",
          tipo_conselho: tipo_conselho || "",
          numero_conselho: numero_conselho || "",
          uf_conselho: uf_conselho || "",
          pode_agendar_retorno: pode_agendar_retorno ?? false,
          cpf: cpf || "",
        })
        .select()
        .single();

      if (dbErr) {
        // Rollback auth user
        await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
        return new Response(
          JSON.stringify({ error: "Erro ao salvar funcionário: " + dbErr.message }),
          { status: 200, headers: corsHeaders }
        );
      }

      return new Response(JSON.stringify({ success: true, funcionario: func }), {
        headers: corsHeaders,
      });
    }

    if (action === "update") {
      const { id, senha, ...fields } = body;
      delete fields.action;

      // Get current record
      const { data: current } = await supabaseAdmin
        .from("funcionarios")
        .select("auth_user_id, email")
        .eq("id", id)
        .single();

      if (!current) {
        return new Response(
          JSON.stringify({ error: "Funcionário não encontrado." }),
          { status: 200, headers: corsHeaders }
        );
      }

      // Update DB
      const { data: func, error: dbErr } = await supabaseAdmin
        .from("funcionarios")
        .update(fields)
        .eq("id", id)
        .select()
        .single();

      if (dbErr) {
        return new Response(
          JSON.stringify({ error: "Erro ao atualizar: " + dbErr.message }),
          { status: 200, headers: corsHeaders }
        );
      }

      // Update auth user if password or email changed
      if (current.auth_user_id) {
        const authUpdate: Record<string, string> = {};
        if (senha) authUpdate.password = senha;
        if (fields.email && fields.email !== current.email) authUpdate.email = fields.email;

        if (Object.keys(authUpdate).length > 0) {
          await supabaseAdmin.auth.admin.updateUserById(current.auth_user_id, authUpdate);
        }
      }

      return new Response(JSON.stringify({ success: true, funcionario: func }), {
        headers: corsHeaders,
      });
    }

    if (action === "delete") {
      const { id } = body;

      const { data: func } = await supabaseAdmin
        .from("funcionarios")
        .select("auth_user_id")
        .eq("id", id)
        .single();

      if (func?.auth_user_id) {
        await supabaseAdmin.auth.admin.deleteUser(func.auth_user_id);
      }

      await supabaseAdmin.from("funcionarios").delete().eq("id", id);

      return new Response(JSON.stringify({ success: true }), {
        headers: corsHeaders,
      });
    }

    if (action === "list") {
      const { data, error } = await supabaseAdmin
        .from("funcionarios")
        .select("*")
        .order("criado_em", { ascending: false });

      return new Response(JSON.stringify({ funcionarios: data || [] }), {
        headers: corsHeaders,
      });
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida." }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("Employee management error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Erro interno",
      }),
      { status: 200, headers: corsHeaders }
    );
  }
});
