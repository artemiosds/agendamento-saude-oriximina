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

    // ── LOGIN for external professionals ──
    if (action === "login") {
      const { email, senha } = body;
      if (!email || !senha) {
        return new Response(JSON.stringify({ error: "E-mail e senha são obrigatórios." }), { status: 400, headers: corsHeaders });
      }

      // Find external professional
      const { data: externals } = await supabaseAdmin
        .from("profissionais_externos")
        .select("*")
        .eq("email", email.trim().toLowerCase())
        .eq("ativo", true);

      if (!externals?.length) {
        return new Response(JSON.stringify({ error: "Profissional externo não encontrado ou inativo." }), { status: 401, headers: corsHeaders });
      }

      const ext = externals[0];
      if (!ext.auth_user_id) {
        return new Response(JSON.stringify({ error: "Conta sem acesso configurado." }), { status: 401, headers: corsHeaders });
      }

      const supabaseAnon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: signInData, error: signInErr } = await supabaseAnon.auth.signInWithPassword({
        email: ext.email,
        password: senha,
      });

      if (signInErr) {
        return new Response(JSON.stringify({ error: "Senha incorreta." }), { status: 401, headers: corsHeaders });
      }

      return new Response(JSON.stringify({
        session: signInData.session,
        external: {
          id: ext.id,
          nome: ext.nome,
          email: ext.email,
          unidade_id: ext.unidade_id,
        },
      }), { headers: corsHeaders });
    }

    // ── CREATE external professional ──
    if (action === "create") {
      const { nome, email, senha, unidade_id, criado_por } = body;
      if (!nome || !email || !senha) {
        return new Response(JSON.stringify({ error: "Nome, e-mail e senha são obrigatórios." }), { status: 200, headers: corsHeaders });
      }
      if (senha.length < 6) {
        return new Response(JSON.stringify({ error: "A senha deve ter no mínimo 6 caracteres." }), { status: 200, headers: corsHeaders });
      }

      // Check uniqueness
      const { data: existing } = await supabaseAdmin.from("profissionais_externos").select("id").eq("email", email.trim().toLowerCase());
      if (existing && existing.length > 0) {
        return new Response(JSON.stringify({ error: "Este e-mail já está registrado." }), { status: 200, headers: corsHeaders });
      }

      // Create auth user
      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password: senha,
        email_confirm: true,
      });

      if (authErr) {
        return new Response(JSON.stringify({ error: "Erro ao criar acesso: " + authErr.message }), { status: 200, headers: corsHeaders });
      }

      const { data: ext, error: dbErr } = await supabaseAdmin.from("profissionais_externos").insert({
        auth_user_id: authUser.user.id,
        nome,
        email: email.trim().toLowerCase(),
        unidade_id: unidade_id || "",
        criado_por: criado_por || "",
      }).select().single();

      if (dbErr) {
        await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
        return new Response(JSON.stringify({ error: "Erro ao salvar: " + dbErr.message }), { status: 200, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ success: true, profissional: ext }), { headers: corsHeaders });
    }

    // ── UPDATE external professional ──
    if (action === "update") {
      const { id, senha } = body;
      if (!id) return new Response(JSON.stringify({ error: "ID obrigatório." }), { status: 200, headers: corsHeaders });

      const { data: current } = await supabaseAdmin.from("profissionais_externos").select("*").eq("id", id).single();
      if (!current) return new Response(JSON.stringify({ error: "Não encontrado." }), { status: 200, headers: corsHeaders });

      const dbFields: Record<string, any> = {};
      for (const key of ["nome", "email", "unidade_id", "ativo"]) {
        if (body[key] !== undefined) dbFields[key] = body[key];
      }
      if (dbFields.email) dbFields.email = dbFields.email.trim().toLowerCase();

      // Update auth if needed
      if (current.auth_user_id) {
        const authUpdate: Record<string, any> = {};
        if (senha && senha.length >= 6) authUpdate.password = senha;
        if (dbFields.email && dbFields.email !== current.email) {
          authUpdate.email = dbFields.email;
          authUpdate.email_confirm = true;
        }
        if (Object.keys(authUpdate).length > 0) {
          const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(current.auth_user_id, authUpdate);
          if (authErr) return new Response(JSON.stringify({ error: "Erro auth: " + authErr.message }), { status: 200, headers: corsHeaders });
        }
      }

      const { data: updated, error: dbErr } = await supabaseAdmin.from("profissionais_externos").update(dbFields).eq("id", id).select().single();
      if (dbErr) return new Response(JSON.stringify({ error: dbErr.message }), { status: 200, headers: corsHeaders });

      return new Response(JSON.stringify({ success: true, profissional: updated }), { headers: corsHeaders });
    }

    // ── DELETE external professional ──
    if (action === "delete") {
      const { id } = body;
      const { data: ext } = await supabaseAdmin.from("profissionais_externos").select("auth_user_id").eq("id", id).single();
      if (ext?.auth_user_id) await supabaseAdmin.auth.admin.deleteUser(ext.auth_user_id);
      await supabaseAdmin.from("profissionais_externos").delete().eq("id", id);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // ── LIST external professionals ──
    if (action === "list") {
      const { data } = await supabaseAdmin.from("profissionais_externos").select("*").order("criado_em", { ascending: false });
      return new Response(JSON.stringify({ profissionais: data || [] }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "Ação inválida." }), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("External management error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }), { status: 500, headers: corsHeaders });
  }
});
