import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: corsHeaders });

const fmtCpf = (d: string) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
const mascararNome = (n: string) =>
  String(n || "").trim().split(/\s+/).map((p, i) => (i === 0 ? p : p[0] + "***")).join(" ");
const mascararEmail = (e: string) => {
  const [u, d] = String(e || "").split("@");
  if (!u || !d) return "";
  return `${u.slice(0, 2)}***@${d}`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const { action, cpf, dataNascimento, email, senha } = body || {};
    const cpfD = String(cpf || "").replace(/\D/g, "");
    const nasc = String(dataNascimento || "").trim();
    if (cpfD.length !== 11) return json({ error: "CPF inválido." }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nasc)) return json({ error: "Data de nascimento inválida." }, 400);
    if (!["verify", "activate"].includes(action)) return json({ error: "Ação inválida." }, 400);

    // Portal globalmente desativado?
    const { data: cfg } = await admin.from("system_config").select("configuracoes").eq("id", "default").maybeSingle();
    const portalCfg = (cfg as any)?.configuracoes?.portalPaciente;
    if (portalCfg && portalCfg.ativo === false) return json({ error: "O portal do paciente está desativado no momento." });

    const { data: lista } = await admin.from("pacientes")
      .select("id,nome,email,auth_user_id,data_nascimento,custom_data")
      .in("cpf", [cpfD, fmtCpf(cpfD)]);
    const pac = (lista || []).find((p: any) => String(p.data_nascimento || "").slice(0, 10) === nasc);
    if (!pac) {
      return json({ notFound: true, error: "Não encontramos cadastro com esse CPF e data de nascimento. Procure a unidade de saúde ou faça um agendamento online." });
    }
    if ((pac as any).custom_data?.portal_bloqueado === true) {
      return json({ error: "Seu acesso ao portal está bloqueado. Procure a unidade de saúde." });
    }
    if (pac.auth_user_id) {
      return json({ jaAtivo: true, error: "Você já possui acesso ao portal. Use \"Esqueci minha senha\" se não lembrar a senha.", emailMascarado: mascararEmail(pac.email) });
    }

    if (action === "verify") {
      return json({ ok: true, nome: mascararNome(pac.nome), temEmail: !!pac.email, emailMascarado: mascararEmail(pac.email) });
    }

    // activate
    const em = String(email || pac.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) || em.length > 255) return json({ error: "Informe um e-mail válido." }, 400);
    if (typeof senha !== "string" || senha.length < 6 || senha.length > 100) return json({ error: "A senha deve ter entre 6 e 100 caracteres." }, 400);

    // E-mail já usado por outro paciente?
    const { data: outro } = await admin.from("pacientes").select("id").ilike("email", em).neq("id", pac.id).not("auth_user_id", "is", null).limit(1);
    if (outro && outro.length) return json({ error: "Este e-mail já está em uso por outro cadastro. Use outro e-mail." });

    let authUserId: string;
    const { data: created, error } = await admin.auth.admin.createUser({
      email: em, password: senha, email_confirm: true, user_metadata: { tipo: "paciente", nome: pac.nome },
    });
    if (error) {
      if (!/already|registered|exists/i.test(error.message)) return json({ error: "Erro ao ativar acesso: " + error.message });
      return json({ error: "Este e-mail já possui uma conta. Use outro e-mail ou procure a unidade de saúde." });
    }
    authUserId = created.user.id;

    const upd: Record<string, unknown> = { auth_user_id: authUserId };
    if (!pac.email) upd.email = em;
    const { error: uErr } = await admin.from("pacientes").update(upd).eq("id", pac.id);
    if (uErr) {
      await admin.auth.admin.deleteUser(authUserId).catch(() => {});
      return json({ error: "Erro ao vincular cadastro." });
    }

    await admin.from("action_logs").insert({
      user_id: pac.id, user_nome: pac.nome, role: "paciente",
      acao: "portal_primeiro_acesso", entidade: "paciente", entidade_id: pac.id,
      modulo: "portal_paciente", status: "sucesso",
      detalhes: { motivo_alteracao: "Ativação de primeiro acesso pelo próprio paciente (CPF + data de nascimento)", email_definido: !pac.email },
    }).then(() => {}, () => {});

    return json({ success: true, email: em });
  } catch (e) {
    console.error(e);
    return json({ error: "Erro interno." }, 500);
  }
});
