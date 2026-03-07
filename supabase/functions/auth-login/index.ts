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
    const { usuario, senha } = await req.json();

    if (!usuario || !senha) {
      return new Response(
        JSON.stringify({ error: "Usuário e senha são obrigatórios." }),
        { status: 400, headers: corsHeaders }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Check if any funcionarios exist (bootstrap check)
    const { count } = await supabaseAdmin
      .from("funcionarios")
      .select("*", { count: "exact", head: true });

    if (count === 0 && usuario === "admin.sms") {
      // Bootstrap: create the initial admin
      const adminEmail = "admin@sms.oriximina.pa.gov.br";
      const { data: authUser, error: createErr } =
        await supabaseAdmin.auth.admin.createUser({
          email: adminEmail,
          password: senha,
          email_confirm: true,
        });

      if (createErr) {
        return new Response(
          JSON.stringify({ error: "Erro ao criar admin: " + createErr.message }),
          { status: 500, headers: corsHeaders }
        );
      }

      await supabaseAdmin.from("funcionarios").insert({
        auth_user_id: authUser.user.id,
        nome: "Administrador SMS",
        usuario: "admin.sms",
        email: adminEmail,
        setor: "Administração",
        unidade_id: "",
        cargo: "Administrador",
        role: "master",
        ativo: true,
        criado_por: "sistema",
      });
    }

    // Find funcionario by username or email
    const isEmail = usuario.includes("@");
    const { data: funcionarios, error: findErr } = await supabaseAdmin
      .from("funcionarios")
      .select("*")
      .eq(isEmail ? "email" : "usuario", usuario)
      .eq("ativo", true);

    if (findErr || !funcionarios?.length) {
      return new Response(
        JSON.stringify({ error: "Usuário não encontrado ou inativo." }),
        { status: 401, headers: corsHeaders }
      );
    }

    const func = funcionarios[0];

    if (!func.auth_user_id) {
      return new Response(
        JSON.stringify({
          error: "Este funcionário precisa ser recadastrado pelo administrador.",
        }),
        { status: 401, headers: corsHeaders }
      );
    }

    // Sign in with anon client
    const supabaseAnon = createClient(supabaseUrl, anonKey);
    const { data: signInData, error: signInErr } =
      await supabaseAnon.auth.signInWithPassword({
        email: func.email,
        password: senha,
      });

    if (signInErr) {
      return new Response(
        JSON.stringify({ error: "Senha incorreta." }),
        { status: 401, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({
        session: signInData.session,
        user: {
          id: func.id,
          authUserId: func.auth_user_id,
          nome: func.nome,
          usuario: func.usuario,
          email: func.email,
          setor: func.setor || "",
          unidadeId: func.unidade_id || "",
          salaId: func.sala_id || "",
          cargo: func.cargo || "",
          role: func.role,
          ativo: func.ativo,
        },
      }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("Login error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Erro interno",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
