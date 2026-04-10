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

interface EvolutionConfig {
  evolution_base_url: string;
  evolution_api_key: string;
  evolution_instance_name: string;
  nome_clinica: string;
}

async function getConfig(supabase: any) {
  const { data } = await supabase
    .from("system_config")
    .select("configuracoes")
    .eq("id", "default")
    .maybeSingle();
  return data?.configuracoes || {};
}

async function getEvolutionConfig(supabase: any): Promise<EvolutionConfig | null> {
  const { data } = await supabase
    .from("clinica_config")
    .select("evolution_base_url, evolution_api_key, evolution_instance_name, nome_clinica")
    .limit(1)
    .maybeSingle();
  if (!data || !data.evolution_instance_name) return null;
  return data as EvolutionConfig;
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55")) return digits;
  return "55" + digits;
}

function buildWhatsAppMessage(tipo: string, data: {
  paciente_nome: string;
  data_consulta: string;
  hora_consulta: string;
  profissional: string;
  unidade: string;
  nome_clinica: string;
}): string {
  const header = `🏥 *${data.nome_clinica || "SMS Oriximiná"}*\n`;
  if (tipo === "lembrete_24h") {
    return `${header}\n⏰ *Lembrete - Consulta Amanhã*\n\nOlá, *${data.paciente_nome}*!\n\n📅 *Data:* ${data.data_consulta}\n🕐 *Horário:* ${data.hora_consulta}\n👨‍⚕️ *Profissional:* ${data.profissional}\n🏥 *Unidade:* ${data.unidade}\n\nChegue com 15 min de antecedência.\n\n_Mensagem automática._`;
  }
  return `${header}\n⏰ *Consulta em 1 hora!*\n\nOlá, *${data.paciente_nome}*!\n\n📅 *Data:* ${data.data_consulta}\n🕐 *Horário:* ${data.hora_consulta}\n👨‍⚕️ *Profissional:* ${data.profissional}\n🏥 *Unidade:* ${data.unidade}\n\nEstamos aguardando você!\n\n_Mensagem automática._`;
}

async function sendEvolutionWhatsApp(
  config: EvolutionConfig,
  telefone: string,
  message: string
): Promise<boolean> {
  try {
    const phone = formatPhone(telefone);
    const resp = await fetch(
      `${config.evolution_base_url}/message/sendText/${config.evolution_instance_name}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.evolution_api_key },
        body: JSON.stringify({ number: phone, text: message }),
      }
    );
    return resp.ok;
  } catch (err) {
    console.error("[reminders] Evolution API error:", err);
    return false;
  }
}

async function sendNotification(
  supabase: any,
  config: any,
  evolutionConfig: EvolutionConfig | null,
  payload: any
) {
  const canal = config.canalNotificacao || "webhook";
  const gmailConfig: GmailConfig | null = config.gmail?.ativo ? config.gmail : null;
  const webhookUrl = config.webhook?.url;
  const webhookAtivo = config.webhook?.ativo;

  let sent = false;
  let whatsappSent = false;

  // === WhatsApp via Evolution API ===
  if (evolutionConfig && payload.telefone) {
    const msg = buildWhatsAppMessage(payload.evento, {
      paciente_nome: payload.paciente_nome,
      data_consulta: payload.data_consulta,
      hora_consulta: payload.hora_consulta,
      profissional: payload.profissional,
      unidade: payload.unidade || "",
      nome_clinica: evolutionConfig.nome_clinica,
    });
    whatsappSent = await sendEvolutionWhatsApp(evolutionConfig, payload.telefone, msg);
    if (whatsappSent) {
      sent = true;
      console.log(`[reminders] WhatsApp sent for ${payload.evento} to ${payload.telefone}`);
    }
  }

  // === Webhook ===
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

  // === Gmail ===
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

  // Determine canal used
  const canaisUsados: string[] = [];
  if (whatsappSent) canaisUsados.push("whatsapp_evolution");
  if (sent && !whatsappSent) canaisUsados.push(canal);
  else if (sent && whatsappSent) {
    if (canal !== "webhook" || webhookAtivo) canaisUsados.push(canal);
  }

  // Log
  try {
    await supabase.from("notification_logs").insert({
      agendamento_id: payload.id_agendamento || "",
      evento: payload.evento,
      canal: canaisUsados.length > 0 ? canaisUsados.join("+") : "falha",
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
    const evolutionConfig = await getEvolutionConfig(supabase);
    const now = new Date();

    // Calculate tomorrow's date (for 24h reminder)
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // Today's date (for 1h reminder)
    const todayStr = now.toISOString().split("T")[0];

    // Current time components for 1h window
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let sent24h = 0;
    let sent1h = 0;
    let sentWhatsApp = 0;

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
        const { data: paciente } = await supabase
          .from("pacientes")
          .select("email, telefone")
          .eq("id", ag.paciente_id)
          .maybeSingle();

        if (!paciente?.email && !paciente?.telefone) {
          console.warn(`[reminders] Paciente ${ag.paciente_id} sem contato, pulando`);
          continue;
        }

        const unidade = ag.unidade_id
          ? (await supabase.from("unidades").select("nome").eq("id", ag.unidade_id).maybeSingle())?.data?.nome
          : "";

        const success = await sendNotification(supabase, config, evolutionConfig, {
          evento: "lembrete_24h",
          paciente_nome: ag.paciente_nome,
          email: paciente.email || "",
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
        const [hStr, mStr] = (ag.hora || "00:00").split(":");
        const agMinutes = parseInt(hStr) * 60 + parseInt(mStr);

        if (agMinutes >= currentMinutes + 50 && agMinutes <= currentMinutes + 70) {
          const { data: paciente } = await supabase
            .from("pacientes")
            .select("email, telefone")
            .eq("id", ag.paciente_id)
            .maybeSingle();

          if (!paciente?.email && !paciente?.telefone) continue;

          const unidade = ag.unidade_id
            ? (await supabase.from("unidades").select("nome").eq("id", ag.unidade_id).maybeSingle())?.data?.nome
            : "";

          const success = await sendNotification(supabase, config, evolutionConfig, {
            evento: "lembrete_1h",
            paciente_nome: ag.paciente_nome,
            email: paciente.email || "",
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

    const message = `Lembretes processados: ${sent24h} de 24h, ${sent1h} de 1h${evolutionConfig ? " (WhatsApp Evolution ativo)" : ""}`;
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
