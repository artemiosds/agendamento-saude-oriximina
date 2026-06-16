// ============================================================
// process-whatsapp-queue (Fase 2 — hardening WhatsApp)
//
// Comportamento por mensagem (em sequência, OBRIGATÓRIO):
//   1. entryDelay: 3000 + hash(patient_id+data) % 9000 ms
//   2. presence "composing"
//   3. typingDelay: clamp(msg.length * 35, 2000, 8000) ms
//   4. presence "paused"
//   5. envio real
//   6. postDelay: 5000 + hash(...)+1 % 25000 ms
//
// NÃO é rate-limit por volume. É simulação humana determinística.
// Hash é estável por (patient_id + data do dia) — mesmo paciente no
// mesmo dia recebe sempre o mesmo padrão, evitando footprint de bot.
//
// Circuit breaker: se taxa de erro nas últimas 50 mensagens > 30%,
// pausa a fila do provider por 15 min em whatsapp_connection_status.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import {
  buildProviderFromConfig,
  entryDelayMs,
  typingDelayMs,
  postSendDelayMs,
  sleep,
  type ProviderName,
  type WhatsAppProvider,
} from "../_shared/whatsapp-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const BATCH_SIZE = 5; // pequeno por execução; cron roda a cada 1min
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MIN = [1, 5, 15]; // minutos
const CIRCUIT_WINDOW = 50;
const CIRCUIT_ERROR_THRESHOLD = 0.30;
const CIRCUIT_PAUSE_MIN = 15;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function pickProviderName(provider: string | undefined): ProviderName {
  if (provider === "uazapigo" || provider === "evolution" || provider === "cloud") return provider;
  return "evolution";
}

async function isProviderPaused(supabase: any, providerInstance: string): Promise<boolean> {
  const { data } = await supabase
    .from("whatsapp_connection_status")
    .select("fila_pausada_ate")
    .eq("instance_name", providerInstance)
    .maybeSingle();
  if (!data?.fila_pausada_ate) return false;
  return new Date(data.fila_pausada_ate).getTime() > Date.now();
}

async function pauseProvider(supabase: any, providerInstance: string, motivo: string) {
  const ate = new Date(Date.now() + CIRCUIT_PAUSE_MIN * 60_000).toISOString();
  await supabase.from("whatsapp_connection_status").upsert({
    instance_name: providerInstance,
    fila_pausada_ate: ate,
    fila_pausada_motivo: motivo,
    last_error: motivo,
    last_error_at: new Date().toISOString(),
  }, { onConflict: "instance_name" });
  console.warn(`[QueueProcessor] Provider ${providerInstance} pausado até ${ate}: ${motivo}`);
}

async function evaluateCircuitBreaker(supabase: any, providerName: string, providerInstance: string) {
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data } = await supabase
    .from("whatsapp_queue")
    .select("status")
    .eq("provider", providerName)
    .gte("processado_em", since)
    .order("processado_em", { ascending: false })
    .limit(CIRCUIT_WINDOW);
  if (!data || data.length < 10) return;
  const errors = data.filter((r: any) => r.status === "erro").length;
  const rate = errors / data.length;
  if (rate >= CIRCUIT_ERROR_THRESHOLD) {
    await pauseProvider(supabase, providerInstance, `taxa_erro_${(rate * 100).toFixed(1)}pct`);
  }
}

interface QueueRow {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  telefone: string;
  evento: string;
  mensagem: string;
  status: string;
  tentativas: number;
  agendamento_id: string;
  unidade_id: string;
  provider: string;
  template_id: string | null;
  priority: number;
}

async function processOne(
  supabase: any,
  provider: WhatsAppProvider,
  providerInstance: string,
  msg: QueueRow,
): Promise<{ ok: boolean; reason?: string }> {
  // marca como processando
  await supabase.from("whatsapp_queue").update({
    status: "processando",
    tentativas: (msg.tentativas || 0) + 1,
  }).eq("id", msg.id).eq("status", "pendente");

  const dateKey = todayKey();
  const pid = msg.paciente_id || msg.telefone || msg.id;

  // 1. Delay de entrada (jitter humano determinístico)
  const dIn = entryDelayMs(pid, dateKey);
  console.log(`[QueueProcessor] ${msg.id} entry delay ${dIn}ms`);
  await sleep(dIn);

  // 2. Presence "composing"
  await provider.sendPresence(msg.telefone, "composing");

  // 3. Typing delay proporcional ao tamanho
  const dType = typingDelayMs(msg.mensagem || "");
  console.log(`[QueueProcessor] ${msg.id} typing ${dType}ms (len=${(msg.mensagem||"").length})`);
  await sleep(dType);

  // 4. Presence "paused"
  await provider.sendPresence(msg.telefone, "paused");

  // 5. Envio real
  const result = await provider.sendTextMessage(msg.telefone, msg.mensagem || "");

  if (result.ok) {
    await supabase.from("whatsapp_queue").update({
      status: "enviado",
      processado_em: new Date().toISOString(),
      provider_message_id: result.providerMessageId || "",
      error_code: "",
      motivo_erro: "",
    }).eq("id", msg.id);

    await supabase.from("whatsapp_connection_status").upsert({
      instance_name: providerInstance,
      last_success_send_at: new Date().toISOString(),
    }, { onConflict: "instance_name" });
  } else {
    const attempts = (msg.tentativas || 0) + 1;
    const giveUp = attempts >= MAX_RETRIES;
    const backoff = RETRY_BACKOFF_MIN[Math.min(attempts - 1, RETRY_BACKOFF_MIN.length - 1)];
    await supabase.from("whatsapp_queue").update({
      status: giveUp ? "erro" : "pendente",
      processado_em: new Date().toISOString(),
      next_retry_at: giveUp ? null : new Date(Date.now() + backoff * 60_000).toISOString(),
      agendado_para: giveUp ? msg.agendamento_id : new Date(Date.now() + backoff * 60_000).toISOString(),
      error_code: result.errorCode || "send_failed",
      motivo_erro: (result.errorMessage || "").slice(0, 500),
    }).eq("id", msg.id);
  }

  // 6. Delay pós-envio (sempre, mesmo em erro — protege o número)
  const dOut = postSendDelayMs(pid, dateKey);
  console.log(`[QueueProcessor] ${msg.id} post delay ${dOut}ms`);
  await sleep(dOut);

  return { ok: result.ok, reason: result.errorMessage };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: cfg } = await supabase.from("clinica_config").select("*").limit(1).maybeSingle();
    if (!cfg) {
      return new Response(JSON.stringify({ success: false, error: "config_not_found" }), { headers: corsHeaders });
    }

    // Busca mensagens pendentes (ordenadas por prioridade numérica + agendamento)
    const nowIso = new Date().toISOString();
    const { data: pending, error: fetchErr } = await supabase
      .from("whatsapp_queue")
      .select("*")
      .eq("status", "pendente")
      .lte("agendado_para", nowIso)
      .order("priority", { ascending: false })
      .order("agendado_para", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) {
      return new Response(JSON.stringify({ success: false, error: fetchErr.message }), { headers: corsHeaders });
    }
    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0 }), { headers: corsHeaders });
    }

    // Agrupa por provider para construir provider 1x por grupo
    const providerCache: Record<string, { provider: WhatsAppProvider | null; instance: string }> = {};

    let processed = 0;
    let failed = 0;

    for (const raw of pending as QueueRow[]) {
      const providerName = pickProviderName(raw.provider);
      const providerInstance = providerName === "uazapigo"
        ? (cfg.uazapi_instance || "uazapigo")
        : (cfg.evolution_instance_name || "evolution");

      if (await isProviderPaused(supabase, providerInstance)) {
        console.log(`[QueueProcessor] Provider ${providerInstance} pausado — pulando ${raw.id}`);
        continue;
      }

      if (!providerCache[providerName]) {
        providerCache[providerName] = {
          provider: await buildProviderFromConfig(supabase, providerName),
          instance: providerInstance,
        };
      }
      const pInfo = providerCache[providerName];
      if (!pInfo.provider) {
        await supabase.from("whatsapp_queue").update({
          status: "erro",
          error_code: "provider_unavailable",
          motivo_erro: `Provider ${providerName} não configurado`,
          processado_em: new Date().toISOString(),
        }).eq("id", raw.id);
        failed++;
        continue;
      }

      try {
        const r = await processOne(supabase, pInfo.provider, pInfo.instance, raw);
        if (r.ok) processed++; else failed++;
      } catch (e: any) {
        console.error(`[QueueProcessor] Exception em ${raw.id}:`, e?.message);
        failed++;
      }

      // Avalia circuit breaker a cada iteração
      await evaluateCircuitBreaker(supabase, providerName, providerInstance);
    }

    return new Response(JSON.stringify({ success: true, processed, failed, total: pending.length }), { headers: corsHeaders });
  } catch (err: any) {
    console.error("[QueueProcessor] global error:", err?.message);
    return new Response(JSON.stringify({ success: false, error: err?.message || "erro" }), { status: 500, headers: corsHeaders });
  }
});
