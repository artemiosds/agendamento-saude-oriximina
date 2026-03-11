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

    const { cpf, email, novaSenha, tipo } = await req.json();

    if (!cpf || !email || !novaSenha) {
      return new Response(
        JSON.stringify({ error: "CPF, e-mail e nova senha são obrigatórios." }),
        { status: 200, headers: corsHeaders }
      );
    }

    if (novaSenha.length < 6) {
      return new Response(
        JSON.stringify({ error: "A senha deve ter no mínimo 6 caracteres." }),
        { status: 200, headers: corsHeaders }
      );
    }

    const cpfNorm = cpf.replace(/\D/g, "");
    const emailNorm = email.trim().toLowerCase();

    if (tipo === "funcionario") {
      // Find funcionario by CPF + email
      const { data: func, error: funcErr } = await supabaseAdmin
        .from("funcionarios")
        .select("id, auth_user_id, cpf, email")
        .eq("ativo", true)
        .single() === undefined
        ? { data: null, error: null }
        : await supabaseAdmin
            .from("funcionarios")
            .select("id, auth_user_id, cpf, email")
            .eq("ativo", true);

      if (funcErr || !func) {
        return new Response(
          JSON.stringify({ error: "CPF ou e-mail não encontrado. Verifique os dados informados." }),
          { status: 200, headers: corsHeaders }
        );
      }

      // Find matching record
      const records = Array.isArray(func) ? func : [func];
      const match = records.find(
        (f: any) =>
          f.cpf?.replace(/\D/g, "") === cpfNorm &&
          f.email?.toLowerCase() === emailNorm
      );

      if (!match) {
        return new Response(
          JSON.stringify({ error: "CPF ou e-mail não encontrado. Verifique os dados informados." }),
          { status: 200, headers: corsHeaders }
        );
      }

      if (!match.auth_user_id) {
        return new Response(
          JSON.stringify({ error: "Este funcionário não possui acesso configurado. Contate o administrador." }),
          { status: 200, headers: corsHeaders }
        );
      }

      // Update auth password
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(
        match.auth_user_id,
        { password: novaSenha }
      );

      if (authErr) {
        return new Response(
          JSON.stringify({ error: "Erro ao atualizar senha: " + authErr.message }),
          { status: 200, headers: corsHeaders }
        );
      }

      // Log action
      await supabaseAdmin.from("action_logs").insert({
        user_id: match.id,
        user_nome: "sistema",
        role: "sistema",
        acao: "redefinir_senha",
        entidade: "funcionario",
        entidade_id: match.id,
        modulo: "autenticacao",
        status: "sucesso",
        detalhes: { tipo: "recuperacao_senha_funcionario" },
      });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: corsHeaders }
      );
    }

    if (tipo === "paciente") {
      // Find paciente by CPF + email
      const { data: pacs, error: pacErr } = await supabaseAdmin
        .from("pacientes")
        .select("id, auth_user_id, cpf, email");

      if (pacErr || !pacs) {
        return new Response(
          JSON.stringify({ error: "CPF ou e-mail não encontrado. Verifique os dados informados." }),
          { status: 200, headers: corsHeaders }
        );
      }

      const match = pacs.find(
        (p: any) =>
          p.cpf?.replace(/\D/g, "") === cpfNorm &&
          p.email?.toLowerCase() === emailNorm
      );

      if (!match) {
        return new Response(
          JSON.stringify({ error: "CPF ou e-mail não encontrado. Verifique os dados informados." }),
          { status: 200, headers: corsHeaders }
        );
      }

      if (!match.auth_user_id) {
        return new Response(
          JSON.stringify({ error: "Você ainda não possui acesso ao portal. Agende uma consulta para criar seu acesso." }),
          { status: 200, headers: corsHeaders }
        );
      }

      // Update auth password
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(
        match.auth_user_id,
        { password: novaSenha }
      );

      if (authErr) {
        return new Response(
          JSON.stringify({ error: "Erro ao atualizar senha: " + authErr.message }),
          { status: 200, headers: corsHeaders }
        );
      }

      // Log action
      await supabaseAdmin.from("action_logs").insert({
        user_id: match.id,
        user_nome: "sistema",
        role: "sistema",
        acao: "redefinir_senha",
        entidade: "paciente",
        entidade_id: match.id,
        modulo: "autenticacao",
        status: "sucesso",
        detalhes: { tipo: "recuperacao_senha_paciente" },
      });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ error: "Tipo inválido." }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("Reset password error:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor." }),
      { status: 200, headers: corsHeaders }
    );
  }
});
