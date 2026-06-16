// ============================================================
// whatsapp-webhook-receiver (Fase 2 — refatorado)
//
// Aceita formatos:
//   - Evolution: { event, data: { key: { remoteJid, fromMe, id }, message, status } }
//   - UazapiGO: { event, message: { sender, text, fromMe, id }, status }
//
// Faz duas coisas:
//   1) Mensagens RECEBIDAS → chama RPC register_whatsapp_inbound
//      (que atualiza janela 24h, detecta intent, marca opt-out)
//      e dispara ação automática (confirmar agendamento, etc).
//
//   2) Status de mensagens ENVIADAS (delivered/read/failed) →
//      atualiza whatsapp_queue por provider_message_id.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function normalizePhone(raw: string): string | null {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 13 && digits.startsWith("55")) return digits;
  if (digits.length === 12 && digits.startsWith("55")) return digits.slice(0, 4) + "9" + digits.slice(4);
  if (digits.length === 11) return "55" + digits;
  if (digits.length === 10) return "55" + digits.slice(0, 2) + "9" + digits.slice(2);
  return digits;
}

function parseEvent(body: any): {
  kind: "inbound" | "status" | "unknown";
  phone?: string;
  text?: string;
  fromMe?: boolean;
  providerMessageId?: string;
  deliveryStatus?: string;
  provider: string;
} {
  // Detecta provider
  const provider = body?.instance && body?.data ? "evolution" : (body?.uazapigo || body?.instanceId ? "uazapigo" : "evolution");

  // Evolution
  const evoRemote = body?.data?.key?.remoteJid;
  const evoText = body?.data?.message?.conversation
    || body?.data?.message?.extendedTextMessage?.text
    || body?.data?.message?.text;
  const evoFromMe = body?.data?.key?.fromMe;
  const evoMsgId = body?.data?.key?.id;
  const evoStatus = body?.data?.status || body?.data?.update?.status;

  // UazapiGO
  const uzPhone = body?.message?.sender || body?.sender || body?.number;
  const uzText = body?.message?.text || body?.text || body?.message?.body;
  const uzFromMe = body?.message?.fromMe ?? body?.fromMe;
  const uzMsgId = body?.message?.id || body?.messageId || body?.id;
  const uzStatus = body?.status || body?.ack;

  const phone = normalizePhone(String((evoRemote || "").split("@")[0] || uzPhone || ""));
  const text = String(evoText || uzText || "");
  const fromMe = Boolean(evoFromMe ?? uzFromMe);
  const providerMessageId = String(evoMsgId || uzMsgId || "");
  const deliveryStatus = String(evoStatus || uzStatus || "");

  // Classificação
  if (deliveryStatus && providerMessageId && (fromMe || !text)) {
    return { kind: "status", providerMessageId, deliveryStatus, provider, phone };
  }
  if (text && !fromMe && phone) {
    return { kind: "inbound", phone, text, providerMessageId, provider };
  }
  return { kind: "unknown", provider, phone, fromMe, providerMessageId };
}

function mapDeliveryStatus(raw: string): { status?: string; field?: string } {
  const s = raw.toLowerCase();
  if (["read", "4", "lido"].includes(s)) return { status: "lido", field: "read_at" };
  if (["delivered", "delivery_ack", "3", "entregue"].includes(s)) return { status: "entregue", field: "delivered_at" };
  if (["sent", "2", "server_ack", "enviado"].includes(s)) return { status: "enviado", field: undefined };
  if (["error", "failed", "erro"].includes(s)) return { status: "erro", field: undefined };
  return {};
}

async function handleInbound(supabase: any, phone: string, text: string, providerMessageId: string, provider: string, raw: any) {
  const { data, error } = await supabase.rpc("register_whatsapp_inbound", {
    p_phone: phone,
    p_body: text,
    p_provider: provider,
    p_provider_message_id: providerMessageId,
    p_raw: raw,
  });
  if (error) {
    console.error("[Webhook] register_whatsapp_inbound erro:", error.message);
    return { ok: false, error: error.message };
  }
  const intent = (data as any)?.intent || "livre";

  // Ações automáticas conforme intent
  if (intent === "confirmar") {
    // Confirma o agendamento mais recente para o telefone do paciente nas próximas 48h
    const { data: pac } = await supabase
      .from("pacientes")
      .select("id")
      .filter("telefone", "ilike", `%${phone.slice(-9)}%`)
      .limit(1)
      .maybeSingle();
    if (pac?.id) {
      const now = new Date();
      const in48h = new Date(now.getTime() + 48 * 3600_000);
      await supabase
        .from("agendamentos")
        .update({ status: "confirmado", atualizado_em: now.toISOString() })
        .eq("paciente_id", pac.id)
        .gte("data", now.toISOString().slice(0, 10))
        .lte("data", in48h.toISOString().slice(0, 10))
        .in("status", ["agendado", "reagendado"]);
    }
  }

  // remarcar / atendente / sair / livre → já registrados em whatsapp_conversations
  // (handoff humano e opt-out são tratados na RPC)

  return { ok: true, intent };
}

async function handleStatus(supabase: any, providerMessageId: string, deliveryStatus: string) {
  const map = mapDeliveryStatus(deliveryStatus);
  if (!map.status) return { ok: true, ignored: "unknown_status" };
  const patch: Record<string, any> = { status: map.status };
  if (map.field) patch[map.field] = new Date().toISOString();
  const { error } = await supabase
    .from("whatsapp_queue")
    .update(patch)
    .eq("provider_message_id", providerMessageId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, status: map.status };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = parseEvent(body);

    if (parsed.kind === "inbound" && parsed.phone && parsed.text) {
      const r = await handleInbound(supabase, parsed.phone, parsed.text, parsed.providerMessageId || "", parsed.provider, body);
      return new Response(JSON.stringify({ ok: true, kind: "inbound", ...r }), { headers: corsHeaders });
    }

    if (parsed.kind === "status" && parsed.providerMessageId) {
      const r = await handleStatus(supabase, parsed.providerMessageId, parsed.deliveryStatus || "");
      return new Response(JSON.stringify({ ok: true, kind: "status", ...r }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true, ignored: "unhandled", parsed }), { headers: corsHeaders });
  } catch (err: any) {
    console.error("[whatsapp-webhook-receiver] erro:", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message || "erro" }), { status: 500, headers: corsHeaders });
  }
});
