import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canManagePortalPatient, portalEmail, portalAccountExclusive } from "../_shared/portal-credentials.ts";
import { parsePortalChange, readPortalConfig, applyPortalChange, persistPortalChange } from "../_shared/portal-admin-config.ts";
import { portalAccountDiagnosis, projectPortalHistory, PORTAL_HISTORY_ACTIONS } from "../_shared/portal-patient-detail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Autorização: somente Master ativo
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Autenticação necessária." }, 401);
    const { data: authData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !authData.user) return json({ error: "Sessão inválida." }, 401);
    const { data: actor, error: actorError } = await admin.from("funcionarios")
      .select("id,nome,usuario,role,unidade_id,ativo")
      .eq("auth_user_id", authData.user.id).eq("ativo", true).maybeSingle();
    if (actorError || !actor || String(actor.role || "").trim().toLowerCase() !== "master") {
      return json({ error: "Apenas o perfil Master pode gerenciar acessos ao portal." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const { action, pacienteId, novaSenha, motivo } = body || {};
    if (action === "read_settings" || action === "update_settings") {
      const global = actor.usuario === "admin.sms";
      if (!global && !actor.unidade_id) return json({ error: "Unidade não autorizada." }, 403);
      const read = async () => {
        const { data, error } = await admin.from("system_config").select("configuracoes,updated_at").eq("id", "default").maybeSingle();
        if (error || !data || typeof data.updated_at !== "string" || !Number.isFinite(Date.parse(data.updated_at))) throw Error("portal_config_unavailable");
        return { config: data.configuracoes, version: data.updated_at };
      };
      if (action === "read_settings") {
        try {
          const current = readPortalConfig((await read()).config);
          let blocked = [...new Set(current.blocked)];
          if (!global) {
            // Only disclose blocked identifiers belonging to this administrator's unit.
            const scoped: string[] = [];
            for (let i = 0; i < blocked.length; i += 100) {
              const { data, error } = await admin.from("pacientes").select("id").eq("unidade_id", actor.unidade_id).in("id", blocked.slice(i, i + 100));
              if (error || !data) throw Error("portal_scope_unavailable");
              scoped.push(...data.map(p => p.id));
            }
            blocked = scoped;
          }
          return json({ success: true, settings: { enabled: current.enabled, permissions: current.permissions, blocked }, canEditInstitutional: global });
        } catch { return json({ error: "Não foi possível confirmar as configurações do portal." }, 503); }
      }
      const change = parsePortalChange(body.change);
      if (!change || typeof motivo !== "string" || motivo.trim().length < 3 || motivo.trim().length > 500) return json({ error: "Informe uma alteração válida e seu motivo." }, 400);
      if (change.kind !== "block" && !global) return json({ error: "Somente o Master Global pode alterar as regras institucionais." }, 403);
      const checkPatient = async () => {
        if (change.kind !== "block") return;
        const { data, error } = await admin.from("pacientes").select("id,unidade_id,auth_user_id").eq("id", change.patientId).maybeSingle();
        if (error) throw Error("portal_scope_unavailable");
        if (!data || !canManagePortalPatient(actor, data) || !data.auth_user_id) throw Error("portal_scope_denied");
      };
      try {
        await checkPatient();
        const result = await persistPortalChange(change, read, async (snapshot, next) => {
          await checkPatient();
          // Explicit monotonic version, including when two requests arrive in the same millisecond.
          const version = new Date(Math.max(Date.now(), Date.parse(snapshot.version) + 1)).toISOString();
          const { data, error } = await admin.from("system_config").update({ configuracoes: next, updated_at: version })
            .eq("id", "default").eq("updated_at", snapshot.version).select("id,configuracoes,updated_at").maybeSingle();
          if (error) throw Error("portal_write_unconfirmed");
          if (!data) return false;
          if (data.id !== "default" || !data.updated_at || data.updated_at === snapshot.version ||
              applyPortalChange(data.configuracoes, change).changed) throw Error("portal_write_unconfirmed");
          return true;
        });
        if (!result.changed) return json({ success: true, changed: false, value: change.value, auditConfirmed: true });
        let auditConfirmed = false;
        try {
          const { error: auditError } = await admin.from("action_logs").insert({
          user_id: actor.id, user_nome: actor.nome, role: actor.role, unidade_id: actor.unidade_id || "",
          acao: change.kind === "block" ? (change.value ? "portal_bloquear" : "portal_desbloquear") : "portal_alterar_regra",
          entidade: change.kind === "block" ? "paciente" : "system_config",
          entidade_id: change.kind === "block" ? change.patientId : "default",
          modulo: "portal_paciente", status: "sucesso",
          detalhes: { campo: change.kind === "permission" ? change.key : change.kind, anterior: result.previous, novo: change.value, motivo_alteracao: motivo.trim() },
          });
          auditConfirmed = !auditError;
        } catch { /* The setting was committed; do not repeat the write. */ }
        if (!auditConfirmed) console.error("portal settings audit unconfirmed", { actorId: actor.id });
        return json({ success: true, changed: true, value: change.value, auditConfirmed });
      } catch (e) {
        const reason = e instanceof Error ? e.message : "";
        if (reason === "portal_scope_denied") return json({ error: "Paciente sem acesso vinculado ou fora da unidade autorizada." }, 403);
        if (reason === "portal_config_conflict") return json({ error: "Configuração alterada simultaneamente. Atualize e confira antes de tentar novamente." }, 409);
        return json({ error: "Não foi possível confirmar a alteração. Atualize os dados antes de tentar novamente." }, 503);
      }
    }

    if (action === "read_patient_detail") {
      if (typeof pacienteId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pacienteId)) return json({ error: "Paciente inválido." }, 400);
      const global = actor.usuario === "admin.sms";
      if (!global && !actor.unidade_id) return json({ error: "Unidade não autorizada." }, 403);
      let patientQuery = admin.from("pacientes").select("id,nome,cpf,email,auth_user_id,unidade_id").eq("id", pacienteId);
      if (!global) patientQuery = patientQuery.eq("unidade_id", actor.unidade_id);
      const { data: patient, error: patientError } = await patientQuery.maybeSingle();
      if (patientError) return json({ error: "Não foi possível consultar o cadastro." }, 503);
      if (!patient || !canManagePortalPatient(actor, patient)) return json({ error: "Paciente não disponível na abrangência autorizada." }, 403);
      const inspectAccount = async () => {
        if (!patient.auth_user_id) return portalAccountDiagnosis(patient, null);
        try {
          const [patients, staff, external, account] = await Promise.all([
            admin.from("pacientes").select("id").eq("auth_user_id", patient.auth_user_id).limit(2),
            admin.from("funcionarios").select("id", { count: "exact", head: true }).eq("auth_user_id", patient.auth_user_id),
            admin.from("profissionais_externos").select("id", { count: "exact", head: true }).eq("auth_user_id", patient.auth_user_id),
            admin.auth.admin.getUserById(patient.auth_user_id),
          ]);
          if (patients.error || staff.error || external.error || account.error || !patients.data || staff.count === null || external.count === null || !account.data?.user)
            return portalAccountDiagnosis(patient, null);
          return portalAccountDiagnosis(patient, { patientIds: patients.data.map(p => p.id), staffCount: staff.count,
            externalCount: external.count, accountEmail: account.data.user.email ?? null, confirmedAt: account.data.user.email_confirmed_at ?? null,
            lastSignIn: account.data.user.last_sign_in_at ?? null });
        } catch { return portalAccountDiagnosis(patient, null); }
      };
      const readHistory = async () => {
        try {
          let q = admin.from("action_logs").select("id,acao,created_at,user_nome,status,unidade_id,entidade_id,entidade,modulo")
            .eq("entidade_id", pacienteId).eq("entidade", "paciente").eq("modulo", "portal_paciente").in("acao", [...PORTAL_HISTORY_ACTIONS]);
          if (!global) q = q.eq("unidade_id", actor.unidade_id);
          const { data, error } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(21);
          if (error || !data) return null;
          const rows = projectPortalHistory(data, pacienteId, global ? null : actor.unidade_id);
          return { entries: rows.slice(0, 20), hasMore: rows.length > 20 };
        } catch { return null; }
      };
      const [diagnosis, history] = await Promise.all([inspectAccount(), readHistory()]);
      // Revalidate scope and identity fields after privileged reads; discard a changed snapshot.
      const { data: latest, error: latestError } = await admin.from("pacientes").select("id,nome,cpf,email,auth_user_id,unidade_id").eq("id", pacienteId).maybeSingle();
      if (latestError || !latest || !canManagePortalPatient(actor, latest) || latest.unidade_id !== patient.unidade_id ||
          latest.auth_user_id !== patient.auth_user_id || latest.email !== patient.email)
        return json({ error: "Cadastro alterado durante a consulta. Atualize e tente novamente." }, 409);
      return json({ success: true, patient: latest, diagnosis, history });
    }

    if (typeof pacienteId !== "string" || !pacienteId) return json({ error: "Paciente não informado." }, 400);
    if (typeof motivo !== "string" || motivo.trim().length < 3 || motivo.trim().length > 500) return json({ error: "Informe o motivo da alteração." }, 400);
    if (!["reset_password", "create_access"].includes(action)) return json({ error: "Ação inválida." }, 400);
    if (typeof novaSenha !== "string" || novaSenha.length < 8 || novaSenha.length > 100) {
      return json({ error: "A senha deve ter entre 8 e 100 caracteres." }, 400);
    }

    const { data: pac, error: patientError } = await admin.from("pacientes").select("id,nome,email,auth_user_id,unidade_id").eq("id", pacienteId).maybeSingle();
    if (patientError) return json({ error: "Não foi possível verificar o cadastro." }, 503);
    if (!pac) return json({ error: "Paciente não encontrado." }, 404);
    if (!canManagePortalPatient(actor, pac)) {
      return json({ error: "Paciente de outra unidade." }, 403);
    }

    let authUserId = pac.auth_user_id as string | null;
    if (action === "reset_password") {
      if (!authUserId) return json({ error: "Paciente ainda não possui acesso. Use 'Criar acesso'." });
      // Fail closed on conflicting account ownership, including inactive staff and external professionals.
      const [patients, staff, external, account] = await Promise.all([
        admin.from("pacientes").select("id").eq("auth_user_id", authUserId).limit(2),
        admin.from("funcionarios").select("id", { count: "exact", head: true }).eq("auth_user_id", authUserId),
        admin.from("profissionais_externos").select("id", { count: "exact", head: true }).eq("auth_user_id", authUserId),
        admin.auth.admin.getUserById(authUserId),
      ]);
      if (patients.error || staff.error || external.error || account.error || !patients.data || staff.count === null || external.count === null || !account.data?.user) {
        return json({ error: "Não foi possível confirmar a titularidade da conta." }, 503);
      }
      if (!portalAccountExclusive(patients.data.map(p => p.id), pac.id, staff.count, external.count) ||
          !portalEmail(pac.email) || portalEmail(pac.email) !== portalEmail(account.data.user.email)) {
        return json({ error: "Vínculo de conta divergente. Solicite conferência administrativa antes de redefinir a senha." }, 409);
      }
      const { error } = await admin.auth.admin.updateUserById(authUserId, {
        password: novaSenha, user_metadata: { tipo: "paciente", senha_temporaria: true },
      });
      if (error) return json({ error: "Não foi possível alterar a senha." }, 503);
    } else {
      const email = portalEmail(pac.email);
      if (!email) return json({ error: "Paciente sem e-mail válido cadastrado. Atualize o cadastro primeiro." });
      if (authUserId) return json({ error: "Paciente já possui acesso." }, 409);
      const escapedEmail = email.replace(/[\\%_]/g, value => "\\" + value);
      const { data: duplicates, error: duplicateError } = await admin.from("pacientes").select("id").ilike("email", escapedEmail).neq("id", pac.id).limit(1);
      if (duplicateError) return json({ error: "Não foi possível conferir o e-mail cadastrado." }, 503);
      if (duplicates?.length) return json({ error: "E-mail compartilhado entre fichas. Confira a titularidade antes de criar o acesso." }, 409);
      const { data: created, error } = await admin.auth.admin.createUser({
        email, password: novaSenha, email_confirm: true,
        user_metadata: { tipo: "paciente", senha_temporaria: true },
      });
      if (error || !created?.user?.id) {
        // Never adopt an existing authentication account or reset its password on an email collision.
        return json({ error: "Não foi possível criar acesso. Confira se o e-mail já pertence a outra conta." }, 409);
      }
      authUserId = created.user.id;
      let update = admin.from("pacientes").update({ auth_user_id: authUserId })
        .eq("id", pacienteId).is("auth_user_id", null).eq("email", pac.email);
      if (actor.usuario !== "admin.sms") update = update.eq("unidade_id", actor.unidade_id);
      const { data: linked, error: linkError } = await update.select("id").maybeSingle();
      if (linkError || linked?.id !== pacienteId) {
        // An ambiguous write must never trigger deletion of an account that may already be linked.
        console.error("portal account link unconfirmed", { patientId: pacienteId, authUserId });
        return json({ error: "Não foi possível confirmar o vínculo da nova conta. Solicite conferência administrativa." }, 409);
      }
    }

    const { error: auditError } = await admin.from("action_logs").insert({
      user_id: actor.id, user_nome: actor.nome, role: actor.role, unidade_id: pac.unidade_id || "",
      acao: action === "reset_password" ? "portal_redefinir_senha" : "portal_criar_acesso",
      entidade: "paciente", entidade_id: pacienteId, modulo: "portal_paciente", status: "sucesso",
      detalhes: { paciente_nome: pac.nome, motivo_alteracao: motivo.trim() },
    });

    if (auditError) console.error("portal account audit unconfirmed", { patientId: pacienteId, action });
    return json({ success: true, authUserId, auditConfirmed: !auditError });
  } catch (e) {
    console.error(e);
    return json({ error: "Erro interno." }, 500);
  }
});
