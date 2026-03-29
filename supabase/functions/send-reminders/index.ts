import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import nodemailer from "nodemailer";

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

async function getConfig(supabase: any) {
  const { data } = await supabase
    .from("system_config")
    .select("configuracoes")
    .eq("id", "default")
    .maybeSingle();
  return data?.configuracoes || {};
}

async function sendNotification(supabase: any, config: any, payload: any) {
  const canal = config.canalNotificacao || "webhook";
  const gmailConfig: GmailConfig | null = config.gmail?.ativo ? config.gmail : null;
  const webhookUrl = config.webhook?.url;
  const webhookAtivo = config.webhook?.ativo;
  
  let sent = false;

  // Send via webhook
  if ((canal === "webhook" || canal === "ambos") && webhookAtivo && webhookUrl) {
    try {
      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, data_evento: new Date().toISOString() }),
      });
      if (resp.ok) {
        sent = true;
        console.log(`[reminders] Webhook sent for ${payload.evento} to ${payload.paciente_nome}`);
      }
    } catch (err) {
      console.error("[reminders] Webhook error:", err);
    }
  }

  // Send via Gmail
  if ((canal === "gmail" || canal === "ambos") && gmailConfig && payload.email) {
    try {
      const transporter = nodemailer.createTransport({
        host: gmailConfig.smtpHost || "smtp.gmail.com",
        port: gmailConfig.smtpPort || 587,
        secure: false,
        requireTLS: true,
        auth: { user: gmailConfig.email, pass: gmailConfig.senhaApp },
        connectionTimeout: 10000,
        socketTimeout: 15000,
      });

      const isLembrete24h = payload.evento === "lembrete_24h";
      const subject = isLembrete24h
        ? "⏰ Lembrete: Consulta Amanhã - SMS Oriximiná"
        : "⏰ Lembrete: Consulta em 1 hora - SMS Oriximiná";

      await transporter.sendMail({
        from: `"SMS Oriximiná" <${gmailConfig.email}>`,
        to: payload.email,
        subject,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;border-radius:12px;">
            <div style="background:${isLembrete24h ? '#0284c7' : '#f59e0b'};color:#fff;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
              <h2 style="margin:0;">⏰ ${isLembrete24h ? 'Lembrete de Consulta' : 'Consulta em 1 Hora!'}</h2>
            </div>
            <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
              <p>Olá <strong>${payload.paciente_nome}</strong>,</p>
              <p>${isLembrete24h ? 'Lembrete: sua consulta é <strong>amanhã</strong>!' : 'Sua consulta é <strong>daqui a 1 hora</strong>!'}</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <tr><td style="padding:8px;color:#64748b;">📅 Data:</td><td style="padding:8px;font-weight:bold;">${payload.data_consulta}</td></tr>
                <tr><td style="padding:8px;color:#64748b;">🕐 Horário:</td><td style="padding:8px;font-weight:bold;">${payload.hora_consulta}</td></tr>
                <tr><td style="padding:8px;color:#64748b;">👨‍⚕️ Profissional:</td><td style="padding:8px;font-weight:bold;">${payload.profissional}</td></tr>
                <tr><td style="padding:8px;color:#64748b;">🏥 Unidade:</td><td style="padding:8px;font-weight:bold;">${payload.unidade}</td></tr>
              </table>
              <p style="color:#94a3b8;font-size:11px;margin-top:20px;text-align:center;">SMS Oriximiná - Sistema de Gestão em Saúde</p>
            </div>
          </div>`,
      });
      sent = true;
      console.log(`[reminders] Email sent for ${payload.evento} to ${payload.email}`);
    } catch (err) {
      console.error("[reminders] Gmail error:", err);
    }
  }

  // Fallback: webhook-only failed, try Gmail
  if (canal === "webhook" && !sent && gmailConfig && payload.email) {
    try {
      const transporter = nodemailer.createTransport({
        host: gmailConfig.smtpHost || "smtp.gmail.com",
        port: gmailConfig.smtpPort || 587,
        secure: false,
        requireTLS: true,
        auth: { user: gmailConfig.email, pass: gmailConfig.senhaApp },
      });
      await transporter.sendMail({
        from: `"SMS Oriximiná" <${gmailConfig.email}>`,
        to: payload.email,
        subject: `⏰ Lembrete de Consulta - SMS Oriximiná`,
        html: `<p>Olá ${payload.paciente_nome}, lembrete da sua consulta em ${payload.data_consulta} às ${payload.hora_consulta}.</p>`,
      });
      sent = true;
    } catch { /* fallback failed */ }
  }

  // Log
  try {
    await supabase.from("notification_logs").insert({
      agendamento_id: payload.id_agendamento || "",
      evento: payload.evento,
      canal: sent ? (canal === "ambos" ? "gmail+webhook" : canal) : "falha",
      destinatario_email: payload.email || "",
      destinatario_telefone: payload.telefone || "",
      payload,
      status: sent ? "enviado" : "falha",
      erro: sent ? "" : "Nenhum canal conseguiu enviar",
    });
  } catch { /* ignore */ }

  return sent;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const config = await getConfig(supabase);
    const now = new Date();
    
    // Calculate tomorrow's date (for 24h reminder)
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];
    
    // Today's date (for 1h reminder)
    const todayStr = now.toISOString().split("T")[0];
    
    // Current time components for 1h window
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const oneHourFromNow = currentMinutes + 60;

    let sent24h = 0;
    let sent1h = 0;

    // 24h reminders: appointments tomorrow that haven't been reminded
    const { data: ag24h } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("data", tomorrowStr)
      .in("status", ["pendente", "confirmado"])
      .is("lembrete_24h_enviado_em", null);

    if (ag24h && ag24h.length > 0) {
      console.log(`[reminders] Found ${ag24h.length} appointments for 24h reminder`);
      for (const ag of ag24h) {
        // Get patient email
        const { data: paciente } = await supabase
          .from("pacientes")
          .select("email, telefone")
          .eq("id", ag.paciente_id)
          .maybeSingle();

        if (!paciente?.email) {
          console.warn(`[reminders] Paciente ${ag.paciente_id} sem e-mail, pulando 24h reminder`);
          continue;
        }

        const unidade = ag.unidade_id ? (await supabase.from("unidades").select("nome").eq("id", ag.unidade_id).maybeSingle())?.data?.nome : "";

        const success = await sendNotification(supabase, config, {
          evento: "lembrete_24h",
          paciente_nome: ag.paciente_nome,
          email: paciente.email,
          telefone: paciente.telefone || "",
          data_consulta: ag.data,
          hora_consulta: ag.hora,
          unidade: unidade || "",
          profissional: ag.profissional_nome,
          tipo_atendimento: ag.tipo,
          status_agendamento: ag.status,
          id_agendamento: ag.id,
        });

        if (success) {
          await supabase.from("agendamentos").update({ lembrete_24h_enviado_em: new Date().toISOString() }).eq("id", ag.id);
          sent24h++;
        }
      }
    }

    // 1h reminders: appointments today within the next hour window
    const { data: agToday } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("data", todayStr)
      .in("status", ["pendente", "confirmado", "confirmado_chegada"])
      .is("lembrete_proximo_enviado_em", null);

    if (agToday && agToday.length > 0) {
      for (const ag of agToday) {
        // Parse appointment time
        const [hStr, mStr] = (ag.hora || "00:00").split(":");
        const agMinutes = parseInt(hStr) * 60 + parseInt(mStr);
        
        // Check if appointment is within 50-70 minutes from now
        if (agMinutes >= currentMinutes + 50 && agMinutes <= currentMinutes + 70) {
          const { data: paciente } = await supabase
            .from("pacientes")
            .select("email, telefone")
            .eq("id", ag.paciente_id)
            .maybeSingle();

          if (!paciente?.email) continue;

          const unidade = ag.unidade_id ? (await supabase.from("unidades").select("nome").eq("id", ag.unidade_id).maybeSingle())?.data?.nome : "";

          const success = await sendNotification(supabase, config, {
            evento: "lembrete_1h",
            paciente_nome: ag.paciente_nome,
            email: paciente.email,
            telefone: paciente.telefone || "",
            data_consulta: ag.data,
            hora_consulta: ag.hora,
            unidade: unidade || "",
            profissional: ag.profissional_nome,
            tipo_atendimento: ag.tipo,
            status_agendamento: ag.status,
            id_agendamento: ag.id,
          });

          if (success) {
            await supabase.from("agendamentos").update({ lembrete_proximo_enviado_em: new Date().toISOString() }).eq("id", ag.id);
            sent1h++;
          }
        }
      }
    }

    const message = `Lembretes processados: ${sent24h} de 24h, ${sent1h} de 1h`;
    console.log(`[reminders] ${message}`);

    return new Response(
      JSON.stringify({ success: true, message, sent24h, sent1h }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("[reminders] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error", success: false }),
      { status: 500, headers: corsHeaders }
    );
  }
});
