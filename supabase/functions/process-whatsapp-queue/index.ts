import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const PRIORITY_ORDER = { alta: 0, media: 1, baixa: 2 } as const;

function randomDelay(minSec: number, maxSec: number) {
  const min = Math.max(0, minSec);
  const max = Math.max(min, maxSec);
  return (Math.floor(Math.random() * (max - min + 1)) + min) * 1000;
}

async function getClinicaConfig(supabase: any) {
  const { data } = await supabase
    .from("clinica_config")
    .select("evolution_base_url, evolution_api_key, evolution_instance_name")
    .limit(1)
    .maybeSingle();
  return data;
}

async function sendEvolution(cfg: any, phone: string, message: string) {
  try {
    const resp = await fetch(
      `${cfg.evolution_base_url}/message/sendText/${cfg.evolution_instance_name}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.evolution_api_key },
        body: JSON.stringify({ number: phone, text: message }),
      },
    );
    const body = await resp.text();
    return { ok: resp.ok, body };
  } catch (e) {
    return { ok: false, body: e instanceof Error ? e.message : "fetch_error" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const evoCfg = await getClinicaConfig(supabase);
    if (!evoCfg?.evolution_instance_name) {
      return new Response(JSON.stringify({ success: false, error: "Evolution não configurada" }),
        { status: 400, headers: corsHeaders });
    }

    // Pega até 30 mensagens pendentes prontas para envio
    const nowIso = new Date().toISOString();
    const { data: pending } = await supabase
      .from("whatsapp_queue")
      .select("*")
      .eq("status", "pendente")
      .lte("agendado_para", nowIso)
      .limit(30);

    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0 }),
        { headers: corsHeaders });
    }

    // Ordena por prioridade depois data
    pending.sort((a: any, b: any) => {
      const pa = PRIORITY_ORDER[a.prioridade as keyof typeof PRIORITY_ORDER] ?? 1;
      const pb = PRIORITY_ORDER[b.prioridade as keyof typeof PRIORITY_ORDER] ?? 1;
      if (pa !== pb) return pa - pb;
      return new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime();
    });

    // Cache de configs por unidade
    const unitConfigs = new Map<string, any>();
    async function getUnitCfg(unidadeId: string) {
      if (unitConfigs.has(unidadeId)) return unitConfigs.get(unidadeId);
      const { data } = await supabase
        .from("whatsapp_config")
        .select("delay_aleatorio_min_seg, delay_aleatorio_max_seg, limite_global_por_minuto")
        .eq("unidade_id", unidadeId)
        .maybeSingle();
      const cfg = data || { delay_aleatorio_min_seg: 5, delay_aleatorio_max_seg: 30, limite_global_por_minuto: 20 };
      unitConfigs.set(unidadeId, cfg);
      return cfg;
    }

    let processed = 0;
    let errors = 0;
    let blocked = 0;

    // Limite global por minuto: conta envios da última janela de 60s
    const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
    const { count: sentLastMin } = await supabase
      .from("notification_logs")
      .select("id", { count: "exact", head: true })
      .eq("canal", "whatsapp_evolution")
      .eq("status", "enviado")
      .gte("criado_em", oneMinAgo);
    let remainingThisMinute = Math.max(0, 20 - (sentLastMin ?? 0));

    for (const msg of pending) {
      if (remainingThisMinute <= 0) break;

      // Marca como processando
      await supabase.from("whatsapp_queue")
        .update({ status: "processando" })
        .eq("id", msg.id);

      const cfg = await getUnitCfg(msg.unidade_id);

      // Delay aleatório anti-ban
      await new Promise((r) =>
        setTimeout(r, randomDelay(cfg.delay_aleatorio_min_seg, cfg.delay_aleatorio_max_seg)),
      );

      const result = await sendEvolution(evoCfg, msg.telefone, msg.mensagem);

      if (result.ok) {
        await supabase.from("whatsapp_queue").update({
          status: "enviado",
          processado_em: new Date().toISOString(),
        }).eq("id", msg.id);

        await supabase.from("notification_logs").insert({
          agendamento_id: msg.agendamento_id || "",
          evento: msg.evento,
          canal: "whatsapp_evolution",
          destinatario_telefone: msg.telefone,
          status: "enviado",
          payload: { queue_id: msg.id, evento: msg.evento, prioridade: msg.prioridade },
          resposta: result.body.substring(0, 500),
        });
        processed++;
        remainingThisMinute--;
      } else {
        const novasTentativas = (msg.tentativas ?? 0) + 1;
        const novoStatus = novasTentativas >= 2 ? "erro" : "pendente";
        await supabase.from("whatsapp_queue").update({
          status: novoStatus,
          tentativas: novasTentativas,
          motivo_erro: result.body.substring(0, 500),
          processado_em: novoStatus === "erro" ? new Date().toISOString() : null,
          agendado_para: novoStatus === "pendente"
            ? new Date(Date.now() + 60_000).toISOString()
            : msg.agendado_para,
        }).eq("id", msg.id);

        if (novoStatus === "erro") {
          await supabase.from("notification_logs").insert({
            agendamento_id: msg.agendamento_id || "",
            evento: msg.evento,
            canal: "whatsapp_evolution",
            destinatario_telefone: msg.telefone,
            status: "erro",
            erro: result.body.substring(0, 500),
            payload: { queue_id: msg.id, tentativas: novasTentativas },
          });
          errors++;
        } else {
          blocked++;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed, errors, retried: blocked, total: pending.length }),
      { headers: corsHeaders },
    );
  } catch (err) {
    console.error("[process-whatsapp-queue]", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Erro" }),
      { status: 500, headers: corsHeaders },
    );
  }
});
