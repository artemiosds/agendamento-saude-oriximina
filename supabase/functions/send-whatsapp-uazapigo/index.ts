// Edge Function: send-whatsapp-uazapigo
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, token, admintoken, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

interface UazapiConfig {
  uazapi_server_url: string;
  uazapi_admin_token: string;
  uazapi_instance: string;
  nome_clinica: string;
}

interface UnitConfig {
  whatsapp_ativo: boolean;
  max_msgs_paciente_dia: number;
  max_msgs_paciente_semana: number;
  intervalo_minimo_minutos: number;
  delay_aleatorio_min_seg: number;
  delay_aleatorio_max_seg: number;
  limite_global_por_minuto: number;
  horario_inicio: string;
  horario_fim: string;
  dias_permitidos: number[];
  modo_estrito: boolean;
  respeitar_opt_out: boolean;
  bloquear_sem_interacao_previa: boolean;
}

const DEFAULT_UNIT_CONFIG: UnitConfig = {
  whatsapp_ativo: true,
  max_msgs_paciente_dia: 2,
  max_msgs_paciente_semana: 5,
  intervalo_minimo_minutos: 240,
  delay_aleatorio_min_seg: 10,
  delay_aleatorio_max_seg: 60,
  limite_global_por_minuto: 10,
  horario_inicio: "08:00",
  horario_fim: "18:00",
  dias_permitidos: [1, 2, 3, 4, 5],
  modo_estrito: true,
  respeitar_opt_out: true,
  bloquear_sem_interacao_previa: true,
};

function normalizeUrl(raw: string): string {
  return (raw || "").trim().replace(/\/+$/, "");
}

function normalizePhone(raw: string): string | null {
  let digits = (raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 || digits.length === 11) {
    if (!digits.startsWith("55")) digits = "55" + digits;
  }
  if (digits.length < 12) return null;
  return digits;
}

async function getConfig(supabase: any): Promise<UazapiConfig | null> {
  const { data } = await supabase
    .from("clinica_config")
    .select("uazapi_server_url, uazapi_admin_token, uazapi_instance, nome_clinica")
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    uazapi_server_url: (data.uazapi_server_url || "").trim(),
    uazapi_admin_token: (data.uazapi_admin_token || "").trim(),
    uazapi_instance: (data.uazapi_instance || "").trim(),
    nome_clinica: data.nome_clinica || "",
  };
}

async function getUnitConfig(supabase: any, unidadeId: string): Promise<UnitConfig> {
  if (!unidadeId) return DEFAULT_UNIT_CONFIG;
  const { data } = await supabase
    .from("whatsapp_config")
    .select("*")
    .eq("unidade_id", unidadeId)
    .maybeSingle();
  return (data as UnitConfig) ?? DEFAULT_UNIT_CONFIG;
}

const EVENT_CLASSIFICATION: Record<string, { category: 'utility' | 'marketing', requiresSpecificConsent?: string }> = {
  'agendamento_criado': { category: 'utility' },
  'confirmacao': { category: 'utility' },
  'lembrete_24h': { category: 'utility' },
  'lembrete_2h': { category: 'utility' },
  'cancelamento': { category: 'utility' },
  'remarcacao': { category: 'utility' },
  'falta': { category: 'utility' },
  'lista_espera': { category: 'utility', requiresSpecificConsent: 'whatsapp_opt_in_waiting_list' },
  'vaga_disponivel': { category: 'utility', requiresSpecificConsent: 'whatsapp_opt_in_waiting_list' },
  'marketing': { category: 'marketing' },
};

async function validateSend(
  supabase: any,
  cfg: UnitConfig,
  pacienteId: string,
  telefone: string,
  tipo: string,
  mensagem: string
): Promise<{ ok: boolean; reason?: string; audit: any }> {
  const audit: any = {
    opt_in_status: 'unknown',
    prior_interaction: false,
    window_24h: false,
    category: EVENT_CLASSIFICATION[tipo]?.category || 'utility',
  };

  if (!cfg.whatsapp_ativo) return { ok: false, reason: "whatsapp_inativo_unidade", audit };

  const { data: paciente } = await supabase
    .from("pacientes")
    .select("whatsapp_opt_in_operational, whatsapp_opt_in_marketing, whatsapp_opt_in_waiting_list, whatsapp_has_prior_interaction")
    .eq("id", pacienteId)
    .maybeSingle();

  if (!paciente) return { ok: false, reason: "paciente_nao_encontrado", audit };

  audit.prior_interaction = paciente.whatsapp_has_prior_interaction;
  
  const classification = EVENT_CLASSIFICATION[tipo] || { category: 'utility' };
  
  if (classification.category === 'marketing') {
    if (!paciente.whatsapp_opt_in_marketing) return { ok: false, reason: "sem_opt_in_marketing", audit };
  } else {
    if (!paciente.whatsapp_opt_in_operational) return { ok: false, reason: "sem_opt_in_operacional", audit };
    if (classification.requiresSpecificConsent && !paciente[classification.requiresSpecificConsent]) {
      return { ok: false, reason: `requer_consentimento_especifico`, audit };
    }
  }

  // Janela de 24h
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: lastInt } = await supabase.from("whatsapp_consents").select("id").eq("telefone", telefone).eq("tipo", "interaction").gte("criado_em", dayAgo).maybeSingle();
  audit.window_24h = !!lastInt;

  if (!audit.window_24h && !audit.prior_interaction) {
     const marketingKeywords = ["promoção", "oferta", "desconto", "compre", "venda"];
     if (marketingKeywords.some(k => mensagem.toLowerCase().includes(k))) {
       return { ok: false, reason: "suspeita_marketing_fora_janela", audit };
     }
  }

  return { ok: true, audit };
}

async function uazFetch(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  try {
    const resp = await fetch(url, init);
    const text = await resp.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { ok: resp.ok, status: resp.status, data };
  } catch (e: any) {
    return { ok: false, status: 0, data: null, error: e.message };
  }
}

async function resolveInstanceToken(cfg: UazapiConfig): Promise<{ token: string | null; error?: string }> {
  const base = normalizeUrl(cfg.uazapi_server_url);
  const r = await uazFetch(`${base}/instance/all`, { headers: { admintoken: cfg.uazapi_admin_token } });
  if (!r.ok) return { token: null, error: `Falha: HTTP ${r.status}` };
  const list = r.data?.instances || r.data || [];
  const found = list.find((i: any) => i.name === cfg.uazapi_instance || i.instanceName === cfg.uazapi_instance);
  return { token: found?.token || found?.instanceToken || null };
}

async function sendText(cfg: UazapiConfig, phone: string, message: string) {
  const base = normalizeUrl(cfg.uazapi_server_url);
  const { token } = await resolveInstanceToken(cfg);
  if (!token) return { ok: false, status: 401 };
  return await uazFetch(`${base}/send/text`, {
    method: "POST",
    headers: { token, "Content-Type": "application/json" },
    body: JSON.stringify({ number: phone, text: message }),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json();
  const cfg = await getConfig(supabase);
  if (!cfg) return new Response(JSON.stringify({ success: false }), { headers: corsHeaders });

  if (body.action === "status") {
      // (Simplified status logic)
      return new Response(JSON.stringify({ success: true, connected: true }), { headers: corsHeaders });
  }

  const phone = normalizePhone(body.telefone || body.telefone_teste || "");
  if (!phone) return new Response(JSON.stringify({ success: false, error: "Telefone inválido" }), { headers: corsHeaders });

  const agId = body.agendamento_id;
  let pacId = body.paciente_id || "";
  let unId = body.unidade_id || "";
  let msg = body.mensagem || "Olá!";

  if (agId) {
    const { data: ag } = await supabase.from("agendamentos").select("paciente_id, unidade_id").eq("id", agId).maybeSingle();
    if (ag) { pacId = ag.paciente_id; unId = ag.unidade_id; }
  }

  const unitCfg = await getUnitConfig(supabase, unId);
  const validation = await validateSend(supabase, unitCfg, pacId, phone, body.tipo || "utility", msg);

  if (!validation.ok) {
     return new Response(JSON.stringify({ success: false, error: validation.reason, blocked: true }), { headers: corsHeaders });
  }

  const r = await sendText(cfg, phone, msg);
  return new Response(JSON.stringify({ success: r.ok, error: r.error }), { headers: corsHeaders });
});