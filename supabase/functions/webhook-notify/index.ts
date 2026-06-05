import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

const DEFAULT_WEBHOOK_URL = "https://hook.us2.make.com/48rbpcb5o2vye4tmn7iur5gtv4hnmlk7";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function getWebhookUrl(supabaseAdmin: any): Promise<string> {
  try {
    const { data } = await supabaseAdmin
      .from("system_config")
      .select("configuracoes")
      .eq("id", "default")
      .maybeSingle();
    if (data?.configuracoes?.webhook?.url && data.configuracoes.webhook.ativo) {
      return data.configuracoes.webhook.url;
    }
  } catch (_) { /* ignore */ }
  return DEFAULT_WEBHOOK_URL;
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

async function sendWithRetry(url: string, payload: Record<string, unknown>, retries = MAX_RETRIES): Promise<{ ok: boolean; status: number; body: string }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.text();
      if (res.ok) {
        return { ok: true, status: res.status, body };
      }
      // Don't retry on 4xx — these are client/validation errors from the remote service
      if (res.status >= 400 && res.status < 500) {
        console.error(`Webhook rejected [${res.status}]: ${body}`);
        return { ok: false, status: res.status, body };
      }
      console.error(`Webhook attempt ${attempt}/${retries} failed [${res.status}]: ${body}`);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
      } else {
        return { ok: false, status: res.status, body };
      }
    } catch (err) {
      console.error(`Webhook attempt ${attempt}/${retries} error:`, err);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
      } else {
        return { ok: false, status: 0, body: err instanceof Error ? err.message : "Unknown error" };
      }
    }
  }
  return { ok: false, status: 0, body: "Max retries exceeded" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  try {
    const payload = await req.json();

    const {
      evento,
      paciente_nome,
      email,
      telefone,
      data_consulta,
      hora_consulta,
      unidade,
      profissional,
      tipo_atendimento,
      status_agendamento,
      id_agendamento,
      observacoes,
    } = payload;

    // ===== Permission change events =====
    // Triggered by DB triggers on `permissoes` and `permissoes_usuario`.
    // No `paciente_nome`/`telefone` required — forward as-is to external integrations.
    if (evento === "permissao_alterada") {
      const webhookUrl = await getWebhookUrl(supabaseAdmin);
      const permPayload = {
        ...payload,
        data_evento: new Date().toISOString(),
      };
      const result = await sendWithRetry(webhookUrl, permPayload);
      await logNotification(supabaseAdmin, {
        evento: "permissao_alterada",
        canal: "webhook",
        payload: permPayload,
        status: result.ok ? "enviado" : "erro",
        resposta: result.body,
        erro: result.ok ? "" : `HTTP ${result.status}`,
      });
      return new Response(
        JSON.stringify({ success: result.ok, status: result.status }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Validate required fields
    const missingFields: string[] = [];
    if (!paciente_nome) missingFields.push("paciente_nome");
    if (!telefone) missingFields.push("telefone");
    if (!evento) missingFields.push("evento");

    if (missingFields.length > 0) {
      const errorMsg = `Campos obrigatórios ausentes: ${missingFields.join(", ")}`;
      await logNotification(supabaseAdmin, {
        agendamento_id: id_agendamento,
        evento: evento || "desconhecido",
        canal: "webhook",
        destinatario_email: email,
        destinatario_telefone: telefone,
        payload,
        status: "erro_validacao",
        erro: errorMsg,
      });
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Build standardized payload
    const webhookPayload = {
      evento,
      paciente_nome,
      email: email || "",
      telefone,
      data_consulta: data_consulta || "",
      hora_consulta: hora_consulta || "",
      unidade: unidade || "",
      profissional: profissional || "",
      tipo_atendimento: tipo_atendimento || "",
      status_agendamento: status_agendamento || "",
      id_agendamento: id_agendamento || "",
      observacoes: observacoes || "",
      data_evento: new Date().toISOString(),
    };

    console.log("Sending webhook:", JSON.stringify(webhookPayload));

    // Try to send via WhatsApp Edge Function first if it's a patient event
    const whatsappEvents = [
      "novo_agendamento", "confirmacao", "lembrete_24h", "lembrete_1h", "lembrete_2h",
      "cancelamento", "reagendamento", "nao_compareceu", "vaga_liberada", "fila_chamada", "fila_entrada"
    ];

    if (whatsappEvents.includes(evento)) {
      try {
        const { data: clinicaCfg } = await supabaseAdmin.from("clinica_config").select("whatsapp_provider_active").limit(1).maybeSingle();
        const activeProvider = clinicaCfg?.whatsapp_provider_active || "uazapigo"; // Default to uazapigo as per user preference
        const functionName = activeProvider === "uazapigo" ? "send-whatsapp-uazapigo" : "send-whatsapp-evolution";
        
        console.log(`[webhook-notify] Attempting WhatsApp via ${functionName} for event ${evento}`);
        
        const typeMap: Record<string, string> = {
          "novo_agendamento": "confirmacao",
          "reagendamento": "remarcacao",
          "nao_compareceu": "falta",
          "lembrete_1h": "lembrete_1h",
          "vaga_liberada": "vaga_disponivel",
          "fila_chamada": "confirmacao"
        };

        const { data: wsResult, error: wsError } = await supabaseAdmin.functions.invoke(functionName, {
          body: {
            agendamento_id: id_agendamento,
            tipo: typeMap[evento] || evento,
            telefone: telefone,
            paciente_id: payload.paciente_id || "",
            mensagem_custom: payload.mensagem_whatsapp || ""
          }
        });

        if (wsError || !wsResult?.success) {
          const errorDetail = wsError?.message || wsResult?.error || "Erro desconhecido ao chamar function";
          console.warn(`[webhook-notify] WhatsApp failed:`, errorDetail);
          
          // Log specific WhatsApp failure to notification_logs if it wasn't already logged by the provider function
          // (The provider function usually logs its own success/failure, but if it fails to even run, we log here)
          if (wsError) {
            await logNotification(supabaseAdmin, {
              agendamento_id: id_agendamento,
              evento: typeMap[evento] || evento,
              canal: `whatsapp_${activeProvider}`,
              destinatario_telefone: telefone,
              payload: { ...payload, error_detail: errorDetail },
              status: "erro",
              erro: `Erro de invocação: ${errorDetail}`
            });
          }
        } else {
          console.log(`[webhook-notify] WhatsApp processed successfully via ${functionName}`);
        }
      } catch (wsCatch) {
        console.error(`[webhook-notify] Error invoking WhatsApp function:`, wsCatch);
      }
    }


    const webhookUrl = await getWebhookUrl(supabaseAdmin);
    const result = await sendWithRetry(webhookUrl, webhookPayload);

    console.log(`Webhook response [${result.status}]: ${result.body}`);

    await logNotification(supabaseAdmin, {
      agendamento_id: id_agendamento,
      evento,
      canal: "webhook",
      destinatario_email: email,
      destinatario_telefone: telefone,
      payload: webhookPayload,
      status: result.ok ? "enviado" : "erro",
      resposta: result.body,
      erro: result.ok ? "" : `HTTP ${result.status}`,
    });

    // Always return 200 to the caller — webhook delivery is best-effort
    // The notification_logs table already records success/failure for auditing
    return new Response(
      JSON.stringify({
        success: result.ok,
        status: result.status,
        ...(result.ok ? {} : { warning: `Webhook delivery failed: ${result.body}` }),
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("Webhook error:", err);
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    await logNotification(supabaseAdmin, {
      evento: "erro_sistema",
      canal: "webhook",
      payload: {},
      status: "erro",
      erro: errorMsg,
    });
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: corsHeaders }
    );
  }
});
