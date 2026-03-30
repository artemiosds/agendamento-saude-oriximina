import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

function generateTempPassword(length = 10): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;

  // Ensure at least one of each type
  let password = "";
  password += upper[Math.floor(Math.random() * upper.length)];
  password += lower[Math.floor(Math.random() * lower.length)];
  password += digits[Math.floor(Math.random() * digits.length)];
  password += special[Math.floor(Math.random() * special.length)];

  for (let i = password.length; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  // Shuffle
  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

interface RequestPayload {
  pacienteId: string;
  contexto: "agendamento" | "fila" | "encaixe";
  // Context-specific info for email
  data?: string;
  hora?: string;
  unidade?: string;
  profissional?: string;
  tipo?: string;
  posicaoFila?: number;
  portalUrl?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: RequestPayload = await req.json();
    const { pacienteId, contexto, data, hora, unidade, profissional, tipo, posicaoFila, portalUrl } = payload;

    if (!pacienteId) {
      return new Response(
        JSON.stringify({ error: "pacienteId é obrigatório" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Load portal access config
    let portalConfig: any = null;
    try {
      const { data: cfgData } = await supabaseAdmin
        .from("system_config")
        .select("configuracoes")
        .eq("id", "default")
        .maybeSingle();
      portalConfig = cfgData?.configuracoes?.portalPaciente || null;
    } catch (_) { /* ignore */ }

    // Check global portal toggle
    if (portalConfig && portalConfig.permitirPortal === false) {
      return new Response(
        JSON.stringify({
          success: false,
          created: false,
          alreadyExists: false,
          message: "Portal do paciente está desativado nas configurações.",
        }),
        { headers: corsHeaders }
      );
    }

    // Check if auto-send password is disabled
    const autoSendPassword = portalConfig?.enviarSenhaAutomaticamente ?? true;
    const sendAccessLink = portalConfig?.enviarLinkAcesso ?? true;

    // Check if patient is individually blocked
    const blockedPatients: string[] = portalConfig?.pacientesBloqueados || [];
    if (blockedPatients.includes(pacienteId)) {
      return new Response(
        JSON.stringify({
          success: false,
          created: false,
          alreadyExists: false,
          message: "Acesso ao portal bloqueado para este paciente.",
        }),
        { headers: corsHeaders }
      );
    }

    // Load patient
    const { data: paciente, error: pacErr } = await supabaseAdmin
      .from("pacientes")
      .select("*")
      .eq("id", pacienteId)
      .single();

    if (pacErr || !paciente) {
      return new Response(
        JSON.stringify({ error: "Paciente não encontrado" }),
        { status: 404, headers: corsHeaders }
      );
    }

    const email = (paciente.email || "").trim().toLowerCase();
    
    if (!email) {
      return new Response(
        JSON.stringify({
          success: false,
          alreadyExists: false,
          noEmail: true,
          message: "Paciente sem e-mail cadastrado. Acesso ao portal não criado.",
        }),
        { headers: corsHeaders }
      );
    }

    // Check if patient already has auth
    if (paciente.auth_user_id) {
      return new Response(
        JSON.stringify({
          success: true,
          alreadyExists: true,
          created: false,
          message: "Paciente já possui acesso ao portal.",
        }),
        { headers: corsHeaders }
      );
    }

    // If auto-send is disabled, don't create account automatically
    if (!autoSendPassword) {
      return new Response(
        JSON.stringify({
          success: false,
          created: false,
          alreadyExists: false,
          message: "Envio automático de senha está desativado nas configurações.",
        }),
        { headers: corsHeaders }
      );
    }

    // Check if auth user with this email already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthUser = existingUsers?.users?.find(
      (u: any) => u.email === email
    );

    let authUserId: string;
    let senhaTemporaria: string;
    let wasCreated = false;

    if (existingAuthUser) {
      // Auth user exists but not linked — link it
      authUserId = existingAuthUser.id;
      senhaTemporaria = generateTempPassword();
      await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        password: senhaTemporaria,
        user_metadata: { tipo: "paciente", senha_temporaria: true },
      });
      wasCreated = false;
    } else {
      // Create new auth user
      senhaTemporaria = generateTempPassword();
      const { data: authUser, error: createErr } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password: senhaTemporaria,
          email_confirm: true,
          user_metadata: { tipo: "paciente", senha_temporaria: true },
        });

      if (createErr) {
        return new Response(
          JSON.stringify({ error: "Erro ao criar conta: " + createErr.message }),
          { status: 500, headers: corsHeaders }
        );
      }
      authUserId = authUser.user.id;
      wasCreated = true;
    }

    // Link auth user to paciente
    await supabaseAdmin
      .from("pacientes")
      .update({ auth_user_id: authUserId })
      .eq("id", pacienteId);

    // Send email with credentials
    const portalLink = sendAccessLink ? (portalUrl || "https://agendamento-saude-oriximina.lovable.app/portal") : "";

    // Build context-specific info
    let contextHtml = "";
    if (contexto === "agendamento" || contexto === "encaixe") {
      contextHtml = `
        <h3 style="color:#0284c7;margin-top:20px;">📋 Dados do Agendamento</h3>
        <table style="width:100%;border-collapse:collapse;margin:8px 0;">
          ${data ? `<tr><td style="padding:6px 8px;color:#64748b;">📅 Data:</td><td style="padding:6px 8px;font-weight:bold;">${data}</td></tr>` : ""}
          ${hora ? `<tr><td style="padding:6px 8px;color:#64748b;">🕐 Horário:</td><td style="padding:6px 8px;font-weight:bold;">${hora}</td></tr>` : ""}
          ${profissional ? `<tr><td style="padding:6px 8px;color:#64748b;">👨‍⚕️ Profissional:</td><td style="padding:6px 8px;font-weight:bold;">${profissional}</td></tr>` : ""}
          ${unidade ? `<tr><td style="padding:6px 8px;color:#64748b;">🏥 Unidade:</td><td style="padding:6px 8px;font-weight:bold;">${unidade}</td></tr>` : ""}
          ${tipo ? `<tr><td style="padding:6px 8px;color:#64748b;">📋 Tipo:</td><td style="padding:6px 8px;font-weight:bold;">${tipo}</td></tr>` : ""}
        </table>
      `;
    } else if (contexto === "fila") {
      contextHtml = `
        <h3 style="color:#6366f1;margin-top:20px;">🏥 Fila de Espera</h3>
        <p>Você foi adicionado(a) à fila de espera.</p>
        <table style="width:100%;border-collapse:collapse;margin:8px 0;">
          ${unidade ? `<tr><td style="padding:6px 8px;color:#64748b;">🏥 Unidade:</td><td style="padding:6px 8px;font-weight:bold;">${unidade}</td></tr>` : ""}
          ${profissional ? `<tr><td style="padding:6px 8px;color:#64748b;">👨‍⚕️ Profissional:</td><td style="padding:6px 8px;font-weight:bold;">${profissional}</td></tr>` : ""}
          ${posicaoFila ? `<tr><td style="padding:6px 8px;color:#64748b;">📍 Posição:</td><td style="padding:6px 8px;font-weight:bold;">${posicaoFila}º</td></tr>` : ""}
        </table>
        <p style="color:#64748b;font-size:13px;">Você será notificado(a) quando surgir uma vaga disponível.</p>
      `;
    }

    const emailHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;border-radius:12px;">
        <div style="background:#0284c7;color:#fff;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
          <h2 style="margin:0;">🔑 Acesso ao Portal do Paciente</h2>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
          <p>Olá <strong>${paciente.nome}</strong>,</p>
          <p>Seu acesso ao Portal do Paciente foi criado automaticamente. Use os dados abaixo para acessar:</p>
          
          <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin:16px 0;">
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:6px 8px;color:#0284c7;font-weight:bold;">👤 Usuário:</td><td style="padding:6px 8px;font-weight:bold;">${email}</td></tr>
              <tr><td style="padding:6px 8px;color:#0284c7;font-weight:bold;">🔒 Senha temporária:</td><td style="padding:6px 8px;font-weight:bold;font-family:monospace;font-size:16px;">${senhaTemporaria}</td></tr>
            </table>
          </div>
          
           ${portalLink ? `
           <p style="text-align:center;margin:20px 0;">
             <a href="${portalLink}" style="display:inline-block;background:#0284c7;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
               Acessar Portal do Paciente
             </a>
           </p>` : ""}
          
          <p style="color:#ef4444;font-size:13px;font-weight:bold;">⚠️ Recomendamos que você altere sua senha no primeiro acesso.</p>
          
          ${contextHtml}
          
          <p style="color:#64748b;font-size:13px;margin-top:16px;">Em caso de dúvidas, entre em contato com a unidade de saúde.</p>
          <p style="color:#94a3b8;font-size:11px;margin-top:20px;text-align:center;">SMS Oriximiná - Sistema de Gestão em Saúde</p>
        </div>
      </div>
    `;

    // Try sending via Gmail SMTP (using send-email function's infrastructure)
    // We'll call the send-email function internally or send directly
    const gmailConfig = await getGmailConfig(supabaseAdmin);
    
    let emailSent = false;
    let emailError = "";

    if (gmailConfig) {
      try {
        // Import nodemailer dynamically
        const nodemailer = (await import("npm:nodemailer@6.9.16")).default;
        
        const transporter = nodemailer.createTransport({
          host: gmailConfig.smtpHost || "smtp.gmail.com",
          port: gmailConfig.smtpPort || 587,
          secure: false,
          requireTLS: true,
          auth: {
            user: gmailConfig.email,
            pass: gmailConfig.senhaApp,
          },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
        });

        await transporter.sendMail({
          from: `"SMS Oriximiná" <${gmailConfig.email}>`,
          to: email,
          subject: "🔑 Acesso ao Portal do Paciente - SMS Oriximiná",
          html: emailHtml,
        });
        emailSent = true;
      } catch (err) {
        emailError = err instanceof Error ? err.message : String(err);
        console.error("[ensure-patient-portal] Email send error:", emailError);
      }
    } else {
      emailError = "Gmail SMTP não configurado";
    }

    // Log
    try {
      await supabaseAdmin.from("action_logs").insert({
        user_id: "",
        user_nome: "sistema",
        role: "sistema",
        unidade_id: "",
        acao: wasCreated ? "portal_acesso_criado" : "portal_acesso_vinculado",
        entidade: "paciente",
        entidade_id: pacienteId,
        detalhes: {
          pacienteNome: paciente.nome,
          email,
          contexto,
          emailEnviado: emailSent,
          emailErro: emailError || undefined,
        },
      });
    } catch (_) { /* ignore log error */ }

    // Log notification
    try {
      await supabaseAdmin.from("notification_logs").insert({
        evento: "portal_acesso",
        canal: "gmail",
        destinatario_email: email,
        payload: {
          pacienteNome: paciente.nome,
          contexto,
          created: wasCreated,
        },
        status: emailSent ? "enviado" : "erro_envio",
        erro: emailError || "",
      });
    } catch (_) { /* ignore */ }

    return new Response(
      JSON.stringify({
        success: true,
        created: wasCreated,
        alreadyExists: false,
        emailSent,
        emailError: emailError || undefined,
        message: wasCreated
          ? `Acesso ao portal criado para ${paciente.nome}. ${emailSent ? "E-mail enviado." : "E-mail não enviado: " + emailError}`
          : `Acesso ao portal vinculado para ${paciente.nome}. ${emailSent ? "E-mail enviado." : "E-mail não enviado: " + emailError}`,
      }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("[ensure-patient-portal] Error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Erro interno",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});

async function getGmailConfig(supabaseAdmin: any) {
  try {
    const { data } = await supabaseAdmin
      .from("system_config")
      .select("configuracoes")
      .eq("id", "default")
      .maybeSingle();
    if (data?.configuracoes?.gmail && data.configuracoes.gmail.ativo) {
      return data.configuracoes.gmail as {
        ativo: boolean;
        email: string;
        senhaApp: string;
        smtpHost: string;
        smtpPort: number;
      };
    }
  } catch (_) { /* ignore */ }
  return null;
}
