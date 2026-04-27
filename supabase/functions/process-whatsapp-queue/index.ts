import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const PRIORITY_ORDER = { alta: 0, media: 1, baixa: 2 } as const;

// ============================================================
// LIMITES SOBERANOS DE SEGURANÇA (não podem ser violados)
// ============================================================
const HARD_DELAY_MIN_SEC = 10;   // mínimo absoluto entre mensagens
const HARD_DELAY_MAX_SEC = 80;   // máximo absoluto entre mensagens
const SMALL_BATCH = 8;           // lote padrão por execução (~ algumas mensagens / minuto)
const ESCALATION_THRESHOLD = 50; // se houver +50 pendentes → modo escalonado (lote pequeno)
const NORMAL_BATCH = 15;         // lote quando fila baixa (< 50)

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function effectiveDelays(cfg: any) {
  // Soberania: independentemente do que o usuário cadastrou, aplicamos o piso/teto.
  const min = clamp(Number(cfg?.delay_aleatorio_min_seg) || HARD_DELAY_MIN_SEC, HARD_DELAY_MIN_SEC, HARD_DELAY_MAX_SEC);
  const maxRaw = Number(cfg?.delay_aleatorio_max_seg) || HARD_DELAY_MAX_SEC;
  const max = clamp(Math.max(maxRaw, min), HARD_DELAY_MIN_SEC, HARD_DELAY_MAX_SEC);
  return { min, max };
}

function randomDelay(minSec: number, maxSec: number) {
  const span = Math.max(0, maxSec - minSec);
  return (minSec + Math.floor(Math.random() * (span + 1))) * 1000;
}

async function getClinicaConfig(supabase: any) {
  const { data } = await supabase
    .from("clinica_config")
    .select("evolution_base_url, evolution_api_key, evolution_instance_name, uazapi_server_url, uazapi_admin_token, uazapi_instance, uazapi_ativo, whatsapp_provider_active")
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

// ─── UazapiGO ─────────────────────────────────────────
let _uazapiTokenCache: { name: string; token: string } | null = null;
async function getUazapiInstanceToken(cfg: any): Promise<{ token: string | null; error?: string }> {
  if (_uazapiTokenCache && _uazapiTokenCache.name === cfg.uazapi_instance) {
    return { token: _uazapiTokenCache.token };
  }
  const base = (cfg.uazapi_server_url || "").replace(/\/+$/, "");
  if (!base || !cfg.uazapi_admin_token || !cfg.uazapi_instance) {
    return { token: null, error: "uazapi_config_incompleta" };
  }
  try {
    const resp = await fetch(`${base}/instance/all`, {
      headers: { AdminToken: cfg.uazapi_admin_token, Accept: "application/json" },
    });
    if (!resp.ok) return { token: null, error: `uazapi_admin_http_${resp.status}` };
    const data = await resp.json();
    const list: any[] = Array.isArray(data) ? data : (data?.instances || data?.data || []);
    const found = list.find((i: any) =>
      (i?.name && String(i.name).toLowerCase() === cfg.uazapi_instance.toLowerCase()) ||
      (i?.id && String(i.id) === cfg.uazapi_instance),
    );
    const tok = found?.token || found?.instanceToken || found?.apiKey || null;
    if (!tok) return { token: null, error: "uazapi_instancia_sem_token" };
    _uazapiTokenCache = { name: cfg.uazapi_instance, token: tok };
    return { token: tok };
  } catch (e: any) {
    return { token: null, error: e?.message || "uazapi_network_error" };
  }
}

async function sendUazapi(cfg: any, phone: string, message: string) {
  const tokRes = await getUazapiInstanceToken(cfg);
  if (!tokRes.token) return { ok: false, body: tokRes.error || "uazapi_token_nao_resolvido" };
  const base = (cfg.uazapi_server_url || "").replace(/\/+$/, "");
  try {
    const resp = await fetch(`${base}/send/text`, {
      method: "POST",
      headers: { token: tokRes.token, "Content-Type": "application/json" },
      body: JSON.stringify({ number: phone, text: message }),
    });
    const body = await resp.text();
    return { ok: resp.ok, body };
  } catch (e) {
    return { ok: false, body: e instanceof Error ? e.message : "fetch_error" };
  }
}


// Telefone BR válido = 13 dígitos começando em 55
function isValidPhone(phone: string): boolean {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.length === 13 && digits.startsWith("55");
}

// Verifica se o agendamento associado já passou (não enviar lembretes retroativos)
function appointmentInPast(meta: any): boolean {
  // meta pode vir tanto de whatsapp_queue.metadados (ex.: { data_consulta, hora_consulta })
  // quanto carregado do agendamento ligado.
  const dataStr: string | undefined = meta?.data_consulta || meta?.data;
  const horaStr: string | undefined = meta?.hora_consulta || meta?.hora;
  if (!dataStr) return false;
  // dataStr aceito em ISO (YYYY-MM-DD) ou pt-BR (DD/MM/YYYY)
  let iso = dataStr;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataStr)) {
    const [d, m, y] = dataStr.split("/");
    iso = `${y}-${m}-${d}`;
  }
  const hh = (horaStr && /^\d{2}:\d{2}/.test(horaStr)) ? horaStr.slice(0, 5) : "23:59";
  const target = new Date(`${iso}T${hh}:00-03:00`); // BRT
  if (isNaN(target.getTime())) return false;
  return target.getTime() < Date.now();
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

    // 1️⃣  Conta total de pendentes para decidir o tamanho do lote (escalonamento).
    const nowIso = new Date().toISOString();
    const { count: totalPending } = await supabase
      .from("whatsapp_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendente")
      .lte("agendado_para", nowIso);

    const batchSize = (totalPending ?? 0) > ESCALATION_THRESHOLD ? SMALL_BATCH : NORMAL_BATCH;

    // 2️⃣  Pega o lote (já ordenado por prioridade + criação para FIFO real)
    const { data: pending } = await supabase
      .from("whatsapp_queue")
      .select("*")
      .eq("status", "pendente")
      .lte("agendado_para", nowIso)
      .order("criado_em", { ascending: true })
      .limit(batchSize);

    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, total_pending: totalPending ?? 0 }),
        { headers: corsHeaders });
    }

    // Reordena por prioridade dentro do lote
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
        .select("whatsapp_ativo, delay_aleatorio_min_seg, delay_aleatorio_max_seg, limite_global_por_minuto")
        .eq("unidade_id", unidadeId)
        .maybeSingle();
      const cfg = data || { whatsapp_ativo: true, delay_aleatorio_min_seg: HARD_DELAY_MIN_SEC, delay_aleatorio_max_seg: HARD_DELAY_MAX_SEC, limite_global_por_minuto: 20 };
      unitConfigs.set(unidadeId, cfg);
      return cfg;
    }

    let processed = 0;
    let errors = 0;
    let blocked = 0;
    let skippedPast = 0;
    let skippedInvalidPhone = 0;

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

      const cfg = await getUnitCfg(msg.unidade_id);

      // 🔕  Modo silencioso da unidade
      if (cfg.whatsapp_ativo === false) {
        await supabase.from("whatsapp_queue").update({
          status: "bloqueado",
          motivo_erro: "whatsapp_inativo_unidade",
        }).eq("id", msg.id);
        blocked++;
        continue;
      }

      // 🚫  Telefone inválido → falha definitiva, não tenta de novo
      if (!isValidPhone(msg.telefone)) {
        await supabase.from("whatsapp_queue").update({
          status: "erro",
          motivo_erro: "Falha: Sem Telefone (ou inválido)",
          processado_em: new Date().toISOString(),
        }).eq("id", msg.id);
        await supabase.from("notification_logs").insert({
          agendamento_id: msg.agendamento_id || "",
          evento: msg.evento,
          canal: "whatsapp_evolution",
          destinatario_telefone: msg.telefone || "",
          status: "erro",
          erro: "Falha: Sem Telefone",
          payload: { queue_id: msg.id, motivo: "telefone_invalido" },
        });
        skippedInvalidPhone++;
        continue;
      }

      // ⏰  Agendamento retroativo → não envia lembrete de consulta passada
      let metaParaConferir = msg.metadados || {};
      if (msg.agendamento_id) {
        const { data: ag } = await supabase
          .from("agendamentos")
          .select("data, hora")
          .eq("id", msg.agendamento_id)
          .maybeSingle();
        if (ag) metaParaConferir = { ...metaParaConferir, data: ag.data, hora: ag.hora };
      }
      const eventoEhLembrete = ["lembrete_24h", "lembrete_2h", "lembrete_1h", "lembrete_manual", "confirmacao", "agendamento_criado", "remarcacao"].includes(msg.evento);
      if (eventoEhLembrete && appointmentInPast(metaParaConferir)) {
        await supabase.from("whatsapp_queue").update({
          status: "bloqueado",
          motivo_erro: "agendamento_passado",
          processado_em: new Date().toISOString(),
        }).eq("id", msg.id);
        skippedPast++;
        continue;
      }

      // Marca como processando
      await supabase.from("whatsapp_queue")
        .update({ status: "processando" })
        .eq("id", msg.id);

      // Delay aleatório anti-ban (clamp soberano 10–80s)
      const { min, max } = effectiveDelays(cfg);
      await new Promise((r) => setTimeout(r, randomDelay(min, max)));

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

        // Atualiza last_success_send_at no monitor da conexão
        try {
          await supabase
            .from("whatsapp_connection_status")
            .update({ last_success_send_at: new Date().toISOString() })
            .eq("instance_name", evoCfg.evolution_instance_name);
        } catch {}

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
      JSON.stringify({
        success: true,
        processed,
        errors,
        retried: blocked,
        skipped_past: skippedPast,
        skipped_invalid_phone: skippedInvalidPhone,
        batch_size: batchSize,
        total_pending: totalPending ?? 0,
        escalated: (totalPending ?? 0) > ESCALATION_THRESHOLD,
      }),
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
