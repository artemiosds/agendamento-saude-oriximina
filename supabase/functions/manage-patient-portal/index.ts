import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Autorização: somente Master ativo
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Autenticação necessária." }, 401);
    const { data: authData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !authData.user) return json({ error: "Sessão inválida." }, 401);
    const { data: actor } = await admin.from("funcionarios")
      .select("id,nome,usuario,role,unidade_id,ativo")
      .eq("auth_user_id", authData.user.id).eq("ativo", true).maybeSingle();
    if (!actor || String(actor.role || "").trim().toLowerCase() !== "master") {
      return json({ error: "Apenas o perfil Master pode gerenciar acessos ao portal." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const { action, pacienteId, novaSenha, motivo } = body || {};
    if (typeof pacienteId !== "string" || !pacienteId) return json({ error: "Paciente não informado." }, 400);
    if (typeof motivo !== "string" || motivo.trim().length < 3) return json({ error: "Informe o motivo da alteração." }, 400);
    if (!["reset_password", "create_access"].includes(action)) return json({ error: "Ação inválida." }, 400);
    if (typeof novaSenha !== "string" || novaSenha.length < 6 || novaSenha.length > 100) {
      return json({ error: "A senha deve ter entre 6 e 100 caracteres." }, 400);
    }

    const { data: pac } = await admin.from("pacientes").select("id,nome,email,auth_user_id,unidade_id").eq("id", pacienteId).maybeSingle();
    if (!pac) return json({ error: "Paciente não encontrado." }, 404);
    if (actor.usuario !== "admin.sms" && actor.unidade_id && pac.unidade_id && pac.unidade_id !== actor.unidade_id) {
      return json({ error: "Paciente de outra unidade." }, 403);
    }

    let authUserId = pac.auth_user_id as string | null;
    if (action === "reset_password") {
      if (!authUserId) return json({ error: "Paciente ainda não possui acesso. Use 'Criar acesso'." });
      const { error } = await admin.auth.admin.updateUserById(authUserId, {
        password: novaSenha, user_metadata: { tipo: "paciente", senha_temporaria: true },
      });
      if (error) return json({ error: "Erro ao alterar senha: " + error.message });
    } else {
      const email = String(pac.email || "").trim().toLowerCase();
      if (!email) return json({ error: "Paciente sem e-mail cadastrado. Cadastre um e-mail primeiro." });
      if (authUserId) return json({ error: "Paciente já possui acesso." });
      const { data: created, error } = await admin.auth.admin.createUser({
        email, password: novaSenha, email_confirm: true,
        user_metadata: { tipo: "paciente", senha_temporaria: true },
      });
      if (error) {
        if (!/already/i.test(error.message)) return json({ error: "Erro ao criar acesso: " + error.message });
        const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
        const found = list?.users?.find((u: any) => u.email === email);
        if (!found) return json({ error: "E-mail já registrado e não localizado." });
        // Não sobrescreve contas de funcionários
        const { data: func } = await admin.from("funcionarios").select("id").eq("auth_user_id", found.id).maybeSingle();
        if (func) return json({ error: "Este e-mail pertence a um funcionário. Use outro e-mail para o paciente." });
        authUserId = found.id;
        await admin.auth.admin.updateUserById(found.id, { password: novaSenha, user_metadata: { tipo: "paciente", senha_temporaria: true } });
      } else {
        authUserId = created.user.id;
      }
      await admin.from("pacientes").update({ auth_user_id: authUserId }).eq("id", pacienteId);
    }

    await admin.from("action_logs").insert({
      user_id: actor.id, user_nome: actor.nome, role: actor.role,
      acao: action === "reset_password" ? "portal_redefinir_senha" : "portal_criar_acesso",
      entidade: "paciente", entidade_id: pacienteId, modulo: "portal_paciente", status: "sucesso",
      detalhes: { paciente_nome: pac.nome, motivo_alteracao: motivo.trim() },
    });

    return json({ success: true });
  } catch (e) {
    console.error(e);
    return json({ error: "Erro interno." }, 500);
  }
});
