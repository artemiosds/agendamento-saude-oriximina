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

    // Todas as ações administrativas abaixo exigem funcionário autenticado e
    // a permissão efetiva do módulo Usuários. A service role nunca substitui
    // a autorização do chamador.
    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Autenticação necessária." }), { status: 401, headers: corsHeaders });
    }
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida." }), { status: 401, headers: corsHeaders });
    }
    const { data: actor } = await supabaseAdmin.from("funcionarios")
      .select("id,nome,usuario,role,unidade_id,ativo")
      .eq("auth_user_id", authData.user.id).eq("ativo", true).maybeSingle();
    if (!actor) {
      return new Response(JSON.stringify({ error: "Funcionário ativo não encontrado." }), { status: 403, headers: corsHeaders });
    }
    const normalizeRole = (role: string) => {
      const value = String(role || "").trim().toLowerCase();
      if (["coordenador", "coordenacao", "gestor", "gestão"].includes(value)) return "gestao";
      if (value === "recepção") return "recepcao";
      return value;
    };
    const profile = normalizeRole(actor.role);
    const isGlobalAdmin = actor.usuario === "admin.sms";
    const hasUsersPermission = async (field: "can_view" | "can_edit", unitId: string) => {
      if (isGlobalAdmin) return true;
      if (!unitId || actor.unidade_id !== unitId) return false;
      if (profile === "master") return true;
      const { data: userRows } = await supabaseAdmin.from("permissoes_usuario")
        .select(`unidade_id,${field}`).eq("user_id", actor.id).eq("modulo", "usuarios")
        .in("unidade_id", ["", unitId]).order("unidade_id", { ascending: false });
      if (userRows?.length) {
        const exact = userRows.find((row: any) => row.unidade_id === unitId) || userRows[0];
        return exact?.[field] === true;
      }
      const { data: roleRows } = await supabaseAdmin.from("permissoes")
        .select(`perfil,unidade_id,${field}`).in("perfil", [profile, String(actor.role || "").toLowerCase()])
        .eq("modulo", "usuarios").in("unidade_id", ["", unitId]);
      const ordered = (roleRows || []).sort((a: any, b: any) =>
        Number(b.unidade_id === unitId) - Number(a.unidade_id === unitId)
        || Number(b.perfil === profile) - Number(a.perfil === profile));
      return ordered[0]?.[field] === true;
    };

    // ── CREATE external professional ──
    if (action === "create") {
      const { 
        nome, email, senha, unidade_id, criado_por, 
        telefone, documento, orgao_origem, responsavel, 
        observacoes, permissoes, data_validade 
      } = body;
      if (!nome || !email || !senha) {
        return new Response(JSON.stringify({ error: "Nome, e-mail e senha são obrigatórios." }), { status: 200, headers: corsHeaders });
      }
      if (!(await hasUsersPermission("can_edit", unidade_id || actor.unidade_id || ""))) {
        return new Response(JSON.stringify({ error: "Sem permissão para criar profissional externo nesta unidade." }), { status: 403, headers: corsHeaders });
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
        telefone: telefone || null,
        documento: documento || null,
        orgao_origem: orgao_origem || null,
        responsavel: responsavel || null,
        observacoes: observacoes || null,
        permissoes: permissoes || {
          pode_agendar: true,
          pode_visualizar: true,
          pode_cancelar: true,
          pode_editar_paciente: true,
          pode_cadastrar_paciente: true,
          pode_selecionar_paciente: true,
          pode_anexar_documento: true
        },
        data_validade: data_validade || null
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
      if (!(await hasUsersPermission("can_edit", current.unidade_id || actor.unidade_id || ""))
          || (body.unidade_id && !(await hasUsersPermission("can_edit", body.unidade_id)))) {
        return new Response(JSON.stringify({ error: "Sem permissão para editar este profissional externo." }), { status: 403, headers: corsHeaders });
      }

      const dbFields: Record<string, any> = {};
      const allowedFields = [
        "nome", "email", "unidade_id", "ativo", "telefone", "documento", 
        "orgao_origem", "responsavel", "observacoes", "permissoes", "data_validade"
      ];
      for (const key of allowedFields) {
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
      const { data: ext } = await supabaseAdmin.from("profissionais_externos").select("auth_user_id,unidade_id").eq("id", id).single();
      if (!ext || !(await hasUsersPermission("can_edit", ext.unidade_id || actor.unidade_id || ""))) {
        return new Response(JSON.stringify({ error: "Sem permissão para excluir este profissional externo." }), { status: 403, headers: corsHeaders });
      }
      if (ext?.auth_user_id) await supabaseAdmin.auth.admin.deleteUser(ext.auth_user_id);
      await supabaseAdmin.from("profissionais_externos").delete().eq("id", id);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // ── LIST external professionals ──
    if (action === "list") {
      const targetUnit = actor.unidade_id || "";
      if (!isGlobalAdmin && !(await hasUsersPermission("can_view", targetUnit))) {
        return new Response(JSON.stringify({ error: "Sem permissão para visualizar profissionais externos." }), { status: 403, headers: corsHeaders });
      }
      let listQuery = supabaseAdmin.from("profissionais_externos").select("*").order("criado_em", { ascending: false });
      if (!isGlobalAdmin) listQuery = listQuery.eq("unidade_id", targetUnit);
      const { data } = await listQuery;
      return new Response(JSON.stringify({ profissionais: data || [] }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "Ação inválida." }), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("External management error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }), { status: 500, headers: corsHeaders });
  }
});
