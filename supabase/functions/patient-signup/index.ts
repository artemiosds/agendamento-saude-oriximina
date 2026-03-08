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
    const { email, senha, pacienteId } = await req.json();

    if (!email || !senha || !pacienteId) {
      return new Response(
        JSON.stringify({ error: "E-mail, senha e ID do paciente são obrigatórios." }),
        { status: 400, headers: corsHeaders }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Check if patient already has an auth account
    const { data: existingPaciente } = await supabaseAdmin
      .from("pacientes")
      .select("auth_user_id")
      .eq("id", pacienteId)
      .single();

    if (existingPaciente?.auth_user_id) {
      // Already has account, just sign in
      const supabaseAnon = createClient(supabaseUrl, anonKey);
      const { data: signInData, error: signInErr } =
        await supabaseAnon.auth.signInWithPassword({ email, password: senha });

      if (signInErr) {
        return new Response(
          JSON.stringify({ error: "Erro ao entrar. Verifique suas credenciais." }),
          { status: 401, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ session: signInData.session, alreadyExists: true }),
        { headers: corsHeaders }
      );
    }

    // Check if auth user with this email already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthUser = existingUsers?.users?.find(
      (u: any) => u.email === email.trim().toLowerCase()
    );

    let authUserId: string;

    if (existingAuthUser) {
      authUserId = existingAuthUser.id;
      // Update password
      await supabaseAdmin.auth.admin.updateUserById(authUserId, { password: senha });
    } else {
      // Create new auth user with email confirmed
      const { data: authUser, error: createErr } =
        await supabaseAdmin.auth.admin.createUser({
          email: email.trim().toLowerCase(),
          password: senha,
          email_confirm: true,
          user_metadata: { tipo: "paciente" },
        });

      if (createErr) {
        return new Response(
          JSON.stringify({ error: "Erro ao criar conta: " + createErr.message }),
          { status: 500, headers: corsHeaders }
        );
      }
      authUserId = authUser.user.id;
    }

    // Link auth user to paciente record
    await supabaseAdmin
      .from("pacientes")
      .update({ auth_user_id: authUserId })
      .eq("id", pacienteId);

    // Sign in to get session
    const supabaseAnon = createClient(supabaseUrl, anonKey);
    const { data: signInData, error: signInErr } =
      await supabaseAnon.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: senha,
      });

    if (signInErr) {
      return new Response(
        JSON.stringify({ error: "Conta criada, mas erro ao entrar: " + signInErr.message }),
        { status: 500, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ session: signInData.session, created: true }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("Patient signup error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Erro interno",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
