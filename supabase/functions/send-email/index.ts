import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import nodemailer from "npm:nodemailer@6.9.16";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

interface GmailConfig {
  ativo: boolean;
  email: string;
  senhaApp: string;
  smtpHost: string;
  smtpPort: number;
}

interface EmailPayload {
  evento: string;
  paciente_nome: string;
  email: string;
  telefone: string;
  data_consulta: string;
  hora_consulta: string;
  unidade: string;
  profissional: string;
  tipo_atendimento: string;
  status_agendamento: string;
  id_agendamento: string;
  observacoes?: string;
}

const emailTemplates: Record<string, { subject: string; body: (p: EmailPayload) => string }> = {
  novo_agendamento: {
    subject: "✅ Confirmação de Agendamento - SMS Oriximiná",
    body: (p) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;border-radius:12px;">
        <div style="background:#0284c7;color:#fff;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
          <h2 style="margin:0;">✅ Consulta Confirmada</h2>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
          <p>Olá <strong>${p.paciente_nome}</strong>,</p>
          <p>Sua consulta foi agendada com sucesso!</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px;color:#64748b;">📅 Data:</td><td style="padding:8px;font-weight:bold;">${p.data_consulta}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">🕐 Horário:</td><td style="padding:8px;font-weight:bold;">${p.hora_consulta}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">👨‍⚕️ Profissional:</td><td style="padding:8px;font-weight:bold;">${p.profissional}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">🏥 Unidade:</td><td style="padding:8px;font-weight:bold;">${p.unidade}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">📋 Tipo:</td><td style="padding:8px;font-weight:bold;">${p.tipo_atendimento}</td></tr>
          </table>
          <p style="color:#64748b;font-size:13px;">Em caso de dúvidas, entre em contato com a unidade de saúde.</p>
          <p style="color:#94a3b8;font-size:11px;margin-top:20px;text-align:center;">SMS Oriximiná - Sistema de Gestão em Saúde</p>
        </div>
      </div>`,
  },
  reagendamento: {
    subject: "🔄 Consulta Reagendada - SMS Oriximiná",
    body: (p) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;border-radius:12px;">
        <div style="background:#f59e0b;color:#fff;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
          <h2 style="margin:0;">🔄 Consulta Reagendada</h2>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
          <p>Olá <strong>${p.paciente_nome}</strong>,</p>
          <p>Sua consulta foi reagendada. Confira os novos dados:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px;color:#64748b;">📅 Nova Data:</td><td style="padding:8px;font-weight:bold;">${p.data_consulta}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">🕐 Novo Horário:</td><td style="padding:8px;font-weight:bold;">${p.hora_consulta}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">👨‍⚕️ Profissional:</td><td style="padding:8px;font-weight:bold;">${p.profissional}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">🏥 Unidade:</td><td style="padding:8px;font-weight:bold;">${p.unidade}</td></tr>
          </table>
          <p style="color:#64748b;font-size:13px;">Se você não solicitou esse reagendamento, entre em contato conosco.</p>
          <p style="color:#94a3b8;font-size:11px;margin-top:20px;text-align:center;">SMS Oriximiná - Sistema de Gestão em Saúde</p>
        </div>
      </div>`,
  },
  cancelamento: {
    subject: "❌ Consulta Cancelada - SMS Oriximiná",
    body: (p) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;border-radius:12px;">
        <div style="background:#ef4444;color:#fff;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
          <h2 style="margin:0;">❌ Consulta Cancelada</h2>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
          <p>Olá <strong>${p.paciente_nome}</strong>,</p>
          <p>Sua consulta foi cancelada.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px;color:#64748b;">📅 Data:</td><td style="padding:8px;">${p.data_consulta}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">🕐 Horário:</td><td style="padding:8px;">${p.hora_consulta}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">👨‍⚕️ Profissional:</td><td style="padding:8px;">${p.profissional}</td></tr>
          </table>
          <p>Para remarcar, acesse o portal do paciente ou entre em contato com a unidade.</p>
          <p style="color:#94a3b8;font-size:11px;margin-top:20px;text-align:center;">SMS Oriximiná - Sistema de Gestão em Saúde</p>
        </div>
      </div>`,
  },
  nao_compareceu: {
    subject: "⚠️ Falta Registrada - SMS Oriximiná",
    body: (p) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;border-radius:12px;">
        <div style="background:#f97316;color:#fff;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
          <h2 style="margin:0;">⚠️ Ausência Registrada</h2>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
          <p>Olá <strong>${p.paciente_nome}</strong>,</p>
          <p>Registramos sua ausência na consulta:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px;color:#64748b;">📅 Data:</td><td style="padding:8px;">${p.data_consulta}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">🕐 Horário:</td><td style="padding:8px;">${p.hora_consulta}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">👨‍⚕️ Profissional:</td><td style="padding:8px;">${p.profissional}</td></tr>
          </table>
          <p>Para remarcar sua consulta, acesse o portal do paciente ou entre em contato com a unidade de saúde.</p>
          <p style="color:#94a3b8;font-size:11px;margin-top:20px;text-align:center;">SMS Oriximiná - Sistema de Gestão em Saúde</p>
        </div>
      </div>`,
  },
  confirmacao: {
    subject: "✅ Atendimento Confirmado - SMS Oriximiná",
    body: (p) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;border-radius:12px;">
        <div style="background:#22c55e;color:#fff;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
          <h2 style="margin:0;">✅ Atendimento Confirmado</h2>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
          <p>Olá <strong>${p.paciente_nome}</strong>,</p>
          <p>Seu atendimento foi confirmado para:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px;color:#64748b;">📅 Data:</td><td style="padding:8px;font-weight:bold;">${p.data_consulta}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">🕐 Horário:</td><td style="padding:8px;font-weight:bold;">${p.hora_consulta}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">👨‍⚕️ Profissional:</td><td style="padding:8px;font-weight:bold;">${p.profissional}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">🏥 Unidade:</td><td style="padding:8px;font-weight:bold;">${p.unidade}</td></tr>
          </table>
          <p style="color:#94a3b8;font-size:11px;margin-top:20px;text-align:center;">SMS Oriximiná - Sistema de Gestão em Saúde</p>
        </div>
      </div>`,
  },
  fila_entrada: {
    subject: "🏥 Entrada na Fila de Espera - SMS Oriximiná",
    body: (p) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;border-radius:12px;">
        <div style="background:#6366f1;color:#fff;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
          <h2 style="margin:0;">🏥 Fila de Espera</h2>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
          <p>Olá <strong>${p.paciente_nome}</strong>,</p>
          <p>Você foi adicionado à fila de espera.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px;color:#64748b;">🏥 Unidade:</td><td style="padding:8px;font-weight:bold;">${p.unidade}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">📋 Tipo:</td><td style="padding:8px;font-weight:bold;">${p.tipo_atendimento}</td></tr>
          </table>
          <p>Você será notificado quando uma vaga estiver disponível.</p>
          <p style="color:#94a3b8;font-size:11px;margin-top:20px;text-align:center;">SMS Oriximiná - Sistema de Gestão em Saúde</p>
        </div>
      </div>`,
  },
  fila_chamada: {
    subject: "🔔 Vaga Disponível - SMS Oriximiná",
    body: (p) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;border-radius:12px;">
        <div style="background:#22c55e;color:#fff;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
          <h2 style="margin:0;">🔔 Vaga Disponível!</h2>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
          <p>Olá <strong>${p.paciente_nome}</strong>,</p>
          <p><strong>Uma vaga foi liberada para você!</strong></p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px;color:#64748b;">🏥 Unidade:</td><td style="padding:8px;font-weight:bold;">${p.unidade}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">👨‍⚕️ Profissional:</td><td style="padding:8px;font-weight:bold;">${p.profissional}</td></tr>
          </table>
          <p>Entre em contato com a unidade para confirmar seu horário.</p>
          <p style="color:#94a3b8;font-size:11px;margin-top:20px;text-align:center;">SMS Oriximiná - Sistema de Gestão em Saúde</p>
        </div>
      </div>`,
  },
  atendimento_finalizado: {
    subject: "📋 Atendimento Finalizado - SMS Oriximiná",
    body: (p) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;border-radius:12px;">
        <div style="background:#0284c7;color:#fff;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
          <h2 style="margin:0;">📋 Atendimento Finalizado</h2>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
          <p>Olá <strong>${p.paciente_nome}</strong>,</p>
          <p>Seu atendimento foi finalizado com sucesso.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px;color:#64748b;">📅 Data:</td><td style="padding:8px;">${p.data_consulta}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">👨‍⚕️ Profissional:</td><td style="padding:8px;">${p.profissional}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">🏥 Unidade:</td><td style="padding:8px;">${p.unidade}</td></tr>
          </table>
          <p>Para acessar seu histórico, visite o portal do paciente.</p>
          <p style="color:#94a3b8;font-size:11px;margin-top:20px;text-align:center;">SMS Oriximiná - Sistema de Gestão em Saúde</p>
        </div>
      </div>`,
  },
  lembrete_24h: {
    subject: "⏰ Lembrete: Consulta Amanhã - SMS Oriximiná",
    body: (p) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;border-radius:12px;">
        <div style="background:#0284c7;color:#fff;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
          <h2 style="margin:0;">⏰ Lembrete de Consulta</h2>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
          <p>Olá <strong>${p.paciente_nome}</strong>,</p>
          <p>Lembrete: sua consulta é <strong>amanhã</strong>!</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px;color:#64748b;">📅 Data:</td><td style="padding:8px;font-weight:bold;">${p.data_consulta}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">🕐 Horário:</td><td style="padding:8px;font-weight:bold;">${p.hora_consulta}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">👨‍⚕️ Profissional:</td><td style="padding:8px;font-weight:bold;">${p.profissional}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">🏥 Unidade:</td><td style="padding:8px;font-weight:bold;">${p.unidade}</td></tr>
          </table>
          <p style="color:#94a3b8;font-size:11px;margin-top:20px;text-align:center;">SMS Oriximiná - Sistema de Gestão em Saúde</p>
        </div>
      </div>`,
  },
  lembrete_2h: {
    subject: "⏰ Lembrete: Consulta em 2 horas - SMS Oriximiná",
    body: (p) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;border-radius:12px;">
        <div style="background:#f59e0b;color:#fff;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
          <h2 style="margin:0;">⏰ Consulta em 2 Horas!</h2>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
          <p>Olá <strong>${p.paciente_nome}</strong>,</p>
          <p>Sua consulta é <strong>daqui a 2 horas</strong>!</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px;color:#64748b;">🕐 Horário:</td><td style="padding:8px;font-weight:bold;">${p.hora_consulta}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">👨‍⚕️ Profissional:</td><td style="padding:8px;font-weight:bold;">${p.profissional}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">🏥 Unidade:</td><td style="padding:8px;font-weight:bold;">${p.unidade}</td></tr>
          </table>
          <p style="color:#94a3b8;font-size:11px;margin-top:20px;text-align:center;">SMS Oriximiná - Sistema de Gestão em Saúde</p>
        </div>
      </div>`,
  },
  teste: {
    subject: "🧪 Teste de E-mail - SMS Oriximiná",
    body: (p) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;border-radius:12px;">
        <div style="background:#6366f1;color:#fff;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
          <h2 style="margin:0;">🧪 Teste de E-mail</h2>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
          <p>Este é um e-mail de teste do sistema SMS Oriximiná.</p>
          <p>Se você recebeu este e-mail, a integração Gmail SMTP está funcionando corretamente! ✅</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px;color:#64748b;">Paciente:</td><td style="padding:8px;">${p.paciente_nome}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">E-mail:</td><td style="padding:8px;">${p.email}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">Data/Hora:</td><td style="padding:8px;">${new Date().toLocaleString("pt-BR")}</td></tr>
          </table>
          <p style="color:#94a3b8;font-size:11px;margin-top:20px;text-align:center;">SMS Oriximiná - Sistema de Gestão em Saúde</p>
        </div>
      </div>`,
  },
};

async function getGmailConfig(supabaseAdmin: any): Promise<GmailConfig | null> {
  try {
    const { data } = await supabaseAdmin
      .from("system_config")
      .select("configuracoes")
      .eq("id", "default")
      .maybeSingle();
    if (data?.configuracoes?.gmail && data.configuracoes.gmail.ativo) {
      return data.configuracoes.gmail as GmailConfig;
    }
  } catch (_) { /* ignore */ }
  return null;
}

async function logNotification(supabaseAdmin: any, log: {
  agendamento_id?: string;
  evento: string;
  canal: string;
  destinatario_email?: string;
  destinatario_telefone?: string;
  payload: Record<string, unknown>;
  status: string;
  resposta?: string;
  erro?: string;
}) {
  try {
    await supabaseAdmin.from("notification_logs").insert({
      agendamento_id: log.agendamento_id || "",
      evento: log.evento,
      canal: log.canal,
      destinatario_email: log.destinatario_email || "",
      destinatario_telefone: log.destinatario_telefone || "",
      payload: log.payload,
      status: log.status,
      resposta: log.resposta || "",
      erro: log.erro || "",
    });
  } catch (err) {
    console.error("Failed to log notification:", err);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  try {
    const payload: EmailPayload & { test_only?: boolean } = await req.json();

    // Get Gmail config
    const gmailConfig = await getGmailConfig(supabaseAdmin);

    if (!gmailConfig) {
      return new Response(
        JSON.stringify({ error: "Gmail SMTP não configurado ou desativado", status: "nao_configurado" }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (!gmailConfig.email || !gmailConfig.senhaApp) {
      return new Response(
        JSON.stringify({ error: "Credenciais Gmail incompletas (e-mail ou senha de aplicativo ausente)", status: "nao_configurado" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate required fields for non-test emails
    if (!payload.test_only) {
      const missingFields: string[] = [];
      if (!payload.paciente_nome) missingFields.push("paciente_nome");
      if (!payload.email) missingFields.push("email");
      if (!payload.telefone) missingFields.push("telefone");
      if (!payload.evento) missingFields.push("evento");

      if (missingFields.length > 0) {
        const errorMsg = `Campos obrigatórios ausentes: ${missingFields.join(", ")}`;
        await logNotification(supabaseAdmin, {
          agendamento_id: payload.id_agendamento,
          evento: payload.evento || "desconhecido",
          canal: "gmail",
          destinatario_email: payload.email,
          destinatario_telefone: payload.telefone,
          payload: payload as unknown as Record<string, unknown>,
          status: "erro_validacao",
          erro: errorMsg,
        });
        return new Response(
          JSON.stringify({ error: errorMsg }),
          { status: 400, headers: corsHeaders }
        );
      }
    }

    const recipientEmail = payload.test_only ? gmailConfig.email : payload.email;
    if (!recipientEmail) {
      return new Response(
        JSON.stringify({ error: "E-mail destinatário não informado" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Get template
    const template = emailTemplates[payload.evento] || emailTemplates["teste"];

    // Create SMTP client and send
    const client = new SMTPClient({
      connection: {
        hostname: gmailConfig.smtpHost || "smtp.gmail.com",
        port: gmailConfig.smtpPort || 587,
        tls: false,
        auth: {
          username: gmailConfig.email,
          password: gmailConfig.senhaApp,
        },
      },
    });

    try {
      await client.send({
        from: gmailConfig.email,
        to: recipientEmail,
        subject: template.subject,
        content: "auto",
        html: template.body(payload),
      });

      await client.close();

      const successMsg = payload.test_only
        ? `E-mail de teste enviado com sucesso para ${recipientEmail}`
        : `E-mail enviado para ${recipientEmail}`;

      console.log(successMsg);

      await logNotification(supabaseAdmin, {
        agendamento_id: payload.id_agendamento || "",
        evento: payload.evento,
        canal: "gmail",
        destinatario_email: recipientEmail,
        destinatario_telefone: payload.telefone || "",
        payload: payload as unknown as Record<string, unknown>,
        status: "enviado",
        resposta: successMsg,
      });

      return new Response(
        JSON.stringify({ success: true, message: successMsg, status: "conectado" }),
        { status: 200, headers: corsHeaders }
      );
    } catch (smtpErr) {
      try { await client.close(); } catch (_) { /* ignore */ }

      const errorMsg = smtpErr instanceof Error ? smtpErr.message : "Erro SMTP desconhecido";
      console.error("SMTP Error:", errorMsg);

      // Classify error
      let errorStatus = "erro_envio";
      if (errorMsg.includes("535") || errorMsg.includes("Authentication") || errorMsg.includes("auth") || errorMsg.includes("Username and Password not accepted")) {
        errorStatus = "erro_autenticacao";
      } else if (errorMsg.includes("connect") || errorMsg.includes("ECONNREFUSED") || errorMsg.includes("timeout")) {
        errorStatus = "erro_conexao";
      }

      await logNotification(supabaseAdmin, {
        agendamento_id: payload.id_agendamento || "",
        evento: payload.evento,
        canal: "gmail",
        destinatario_email: recipientEmail,
        destinatario_telefone: payload.telefone || "",
        payload: payload as unknown as Record<string, unknown>,
        status: errorStatus,
        erro: errorMsg,
      });

      return new Response(
        JSON.stringify({ error: errorMsg, status: errorStatus }),
        { status: 502, headers: corsHeaders }
      );
    }
  } catch (err) {
    console.error("Send email error:", err);
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMsg, status: "erro" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
