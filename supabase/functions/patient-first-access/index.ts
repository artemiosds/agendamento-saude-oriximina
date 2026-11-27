import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { portalEmail, portalCanInvite, PORTAL_INVITE_RESPONSE, portalAccountExclusive } from "../_shared/portal-credentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: corsHeaders });

const fmtCpf = (d: string) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const body = await req.json().catch(() => ({}));
    const { action, cpf, dataNascimento } = body || {};
    // Old clients cannot set a password using demographic information alone.
    if (action !== "request_invite") return json({ error: "Atualize o portal para solicitar um link seguro de primeiro acesso." });
    const cpfD = String(cpf || "").replace(/\D/g, "");
    const nasc = String(dataNascimento || "").trim();
    if (cpfD.length !== 11 || !/^\d{4}-\d{2}-\d{2}$/.test(nasc)) return json({ error: "Confira o CPF e a data de nascimento." }, 400);

    const redirectTo = Deno.env.get("PORTAL_AUTH_REDIRECT_URL") || "https://agendamento-saude-oriximina.lovable.app/portal?credencial=1";
    const redirect = new URL(redirectTo);
    if (!anonKey || redirect.protocol !== "https:" || redirect.pathname !== "/portal" || redirect.searchParams.get("credencial") !== "1") {
      console.error("Portal auth configuration unavailable");
      return json({ error: "Serviço temporariamente indisponível. Procure a unidade." }, 503);
    }
    const { data: cfg, error: configError } = await admin.from("system_config").select("configuracoes").eq("id", "default").maybeSingle();
    if (configError) return json({ error: "Serviço temporariamente indisponível. Tente novamente ou procure a unidade." }, 503);
    const { data: lista, error: lookupError } = await admin.from("pacientes")
      .select("id,email,auth_user_id,data_nascimento").in("cpf", [cpfD, fmtCpf(cpfD)]);
    if (lookupError) return json({ error: "Serviço temporariamente indisponível. Procure a unidade." }, 503);
    const matches = (lista || []).filter(p => String(p.data_nascimento || "").slice(0, 10) === nasc);
    if (matches.length !== 1) return json(PORTAL_INVITE_RESPONSE);
    const pac = matches[0];
    const email = portalEmail(pac.email);
    if (!email || !portalCanInvite((cfg as any)?.configuracoes?.portalPaciente, pac.id)) return json(PORTAL_INVITE_RESPONSE);
    const escapedEmail = email.replace(/[\\%_]/g, value => "\\" + value);
    const { data: duplicates, error: duplicateError } = await admin.from("pacientes").select("id").ilike("email", escapedEmail).neq("id", pac.id).limit(1);
    if (duplicateError || duplicates?.length) return json(PORTAL_INVITE_RESPONSE);

    let authUserId = pac.auth_user_id as string | null;
    if (!authUserId) {
      // createUser rejects an existing email. No adoption of pending or active auth users.
      // No caller-chosen password: only possession of the recorded mailbox can establish a session.
      const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("") + "aA1!";
      const { data: created, error } = await admin.auth.admin.createUser({
        email, password: secret, email_confirm: false, user_metadata: { tipo: "paciente" },
      });
      if (error || !created?.user?.id) return json(PORTAL_INVITE_RESPONSE);
      authUserId = created.user.id;
      const { data: linked, error: linkError } = await admin.from("pacientes").update({ auth_user_id: authUserId })
        .eq("id", pac.id).is("auth_user_id", null).eq("email", pac.email).eq("data_nascimento", pac.data_nascimento)
        .select("id").maybeSingle();
      if (linkError || linked?.id !== pac.id) {
        console.error("portal first access link unconfirmed", { patientId: pac.id, authUserId });
        return json(PORTAL_INVITE_RESPONSE);
      }
    } else {
      // Retry only a pending account already exclusively linked to this patient.
      const [patients, staff, external, account] = await Promise.all([
        admin.from("pacientes").select("id").eq("auth_user_id", authUserId).limit(2),
        admin.from("funcionarios").select("id", { count: "exact", head: true }).eq("auth_user_id", authUserId),
        admin.from("profissionais_externos").select("id", { count: "exact", head: true }).eq("auth_user_id", authUserId),
        admin.auth.admin.getUserById(authUserId),
      ]);
      if (patients.error || staff.error || external.error || account.error || !patients.data || staff.count === null || external.count === null ||
          !account.data?.user || account.data.user.email_confirmed_at || portalEmail(account.data.user.email) !== email ||
          !portalAccountExclusive(patients.data.map(p => p.id), pac.id, staff.count, external.count)) return json(PORTAL_INVITE_RESPONSE);
    }
    // Use the public Auth client so the normal provider email/rate limits apply.
    const publicAuth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { error: sendError } = await publicAuth.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
    if (sendError) {
      console.error("portal first access email unconfirmed", { patientId: pac.id });
      return json(PORTAL_INVITE_RESPONSE);
    }
    const { error: auditError } = await admin.from("action_logs").insert({
      user_id: pac.id, role: "paciente", acao: "portal_convite_primeiro_acesso",
      entidade: "paciente", entidade_id: pac.id, modulo: "portal_paciente", status: "sucesso",
      detalhes: { motivo_alteracao: "Solicitação de link ao e-mail previamente cadastrado; não confirma ativação." },
    });
    if (auditError) console.error("portal invite audit unconfirmed", { patientId: pac.id });
    return json(PORTAL_INVITE_RESPONSE);
  } catch (e) {
    console.error("portal first access unavailable");
    return json({ error: "Erro interno." }, 500);
  }
});
