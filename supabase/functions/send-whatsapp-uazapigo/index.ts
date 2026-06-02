// Edge Function: send-whatsapp-uazapigo
// UazapiGO API (https://docs.uazapi.com):
//   GET  {server}/instance/connectionState/{instance}   headers: apikey: <token>
//   POST {server}/message/sendText/{instance}           headers: apikey: <token>   body: { number, text }
//   POST {server}/instance/init                         headers: apikey: <admin>   body: { name }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

interface UazapiConfig {
  uazapi_server_url: string;
  uazapi_admin_token: string;
  uazapi_instance: string;
  nome_clinica: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function normalizeUrl(raw: string): string {
  return (raw || "").trim().replace(/\/+$/, "");
}

function normalizePhone(raw: string): string | null {
  let digits = (raw || "").replace(/\D/g, "");
  if (!digits) return null;
  
  // Remove zero à esquerda
  if (digits.startsWith("0")) digits = digits.slice(1);
  
  // Formata para padrão internacional (55 + DDD + Numero)
  if (digits.length === 10 || digits.length === 11) {
    if (!digits.startsWith("55")) digits = "55" + digits;
  }
  
  // Validação básica de tamanho (Brasil = 13 dígitos com 55 + DDD + 9 dígitos)
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

async function uazFetch(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    const resp = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timeout);
    
    const text = await resp.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { ok: resp.ok, status: resp.status, data };
  } catch (e: any) {
    return { ok: false, status: 0, data: null, error: e?.name === 'AbortError' ? "Tempo de resposta excedido" : (e?.message || "Erro de rede") };
  }
}

async function checkStatus(cfg: UazapiConfig): Promise<{ status_detailed: string; raw?: any; error?: string }> {
  const base = normalizeUrl(cfg.uazapi_server_url);
  if (!base) return { status_detailed: "server_url_invalida", error: "Server URL não configurado" };
  if (!cfg.uazapi_admin_token) return { status_detailed: "admin_token_ausente", error: "Token não configurado" };
  if (!cfg.uazapi_instance) return { status_detailed: "instancia_inexistente", error: "Instância não configurada" };

  const url = `${base}/instance/connectionState/${encodeURIComponent(cfg.uazapi_instance)}`;
  const r = await uazFetch(url, {
    method: "GET",
    headers: { apikey: cfg.uazapi_admin_token, Accept: "application/json" },
  });

  if (r.error) return { status_detailed: "erro", error: r.error };
  if (r.status === 401 || r.status === 403) return { status_detailed: "error", error: "Token inválido (401/403)", raw: r.data };
  if (r.status === 404) return { status_detailed: "disconnected", error: "Instância não encontrada (404)", raw: r.data };
  if (!r.ok) return { status_detailed: "error", error: `Erro na API: HTTP ${r.status}`, raw: r.data };

  const state = String(
    r.data?.instance?.state || r.data?.state || r.data?.status || r.data?.connection || ""
  ).toLowerCase();

  let status_detailed = "disconnected";
  if (["open", "connected", "online", "ready"].includes(state)) status_detailed = "connected";
  else if (["connecting", "syncing"].includes(state)) status_detailed = "connecting";
  else if (["qrcode", "qr", "pairing"].includes(state)) status_detailed = "qrcode";
  else if (["disconnected", "close", "closed", "logged_out"].includes(state)) status_detailed = "disconnected";

  return { status_detailed, raw: r.data, error: status_detailed === "connected" ? undefined : `Status: ${state || "desconhecido"}` };
}

async function persistStatus(supabase: any, instance: string, status_detailed: string, error?: string, raw?: any) {
  const now = new Date().toISOString();
  const patch: any = {
    instance_name: `uazapi:${instance}`,
    status: status_detailed,
    last_check_at: now,
    last_error: error || "",
    details: { provider: "uazapigo", raw: raw ?? null },
  };
  if (status_detailed === "connected") patch.last_connected_at = now;
  if (status_detailed === "disconnected") patch.last_disconnected_at = now;
  if (error) patch.last_error_at = now;

  await supabase.from("whatsapp_connection_status").upsert(patch, { onConflict: "instance_name" });
}

async function sendText(cfg: UazapiConfig, phone: string, message: string) {
  const base = normalizeUrl(cfg.uazapi_server_url);
  const url = `${base}/message/sendText/${encodeURIComponent(cfg.uazapi_instance)}`;
  const r = await uazFetch(url, {
    method: "POST",
    headers: { apikey: cfg.uazapi_admin_token, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ number: phone, text: message }),
  });
  return r;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = body.action || "send";

  const cfg = await getConfig(supabase);
  if (!cfg) return jsonResponse({ success: false, error: "Configuração de clínica não encontrada" }, 200);

  // ─── STATUS ───
  if (action === "status") {
    const res = await checkStatus(cfg);
    await persistStatus(supabase, cfg.uazapi_instance || "sem_instancia", res.status_detailed, res.error, res.raw);
    return jsonResponse({
      success: res.status_detailed === "connected",
      connected: res.status_detailed === "connected",
      state: res.status_detailed,
      status_detailed: res.status_detailed,
      error: res.error || null,
    });
  }

  // ─── CREATE INSTANCE ───
  if (action === "create_instance") {
    const name = String(body.name || "").trim();
    if (!name) return jsonResponse({ success: false, error: "Nome da instância é obrigatório" });
    
    const base = normalizeUrl(cfg.uazapi_server_url);
    const r = await uazFetch(`${base}/instance/init`, {
      method: "POST",
      headers: { apikey: cfg.uazapi_admin_token, "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    
    if (r.ok) {
       await supabase.from("clinica_config").update({ uazapi_instance: name, updated_at: new Date().toISOString() }).neq("id", "00000000-0000-0000-0000-000000000000");
       return jsonResponse({ success: true, instance: { name } });
    }
    return jsonResponse({ success: false, error: r.error || r.data?.message || "Erro ao criar instância" });
  }

  // ─── SEND ───
  const phoneRaw = body.telefone_teste || body.telefone_direto || body.telefone || "";
  const phone = normalizePhone(phoneRaw);
  if (!phone) return jsonResponse({ success: false, error: "Telefone inválido ou incompleto" });

  const message: string = body.mensagem || `Teste de conexão WhatsApp (UazapiGO).`;

  const r = await sendText(cfg, phone, message);
  const success = r.ok && (r.data?.status === "success" || r.data?.success === true || !!r.data?.id || !!r.data?.key?.id);

  if (success) {
    await supabase.from("whatsapp_connection_status").update({
      last_success_send_at: new Date().toISOString(),
    }).eq("instance_name", `uazapi:${cfg.uazapi_instance}`);
  }

  // Log
  await supabase.from("notification_logs").insert({
    canal: "whatsapp_uazapigo",
    provider: "uazapigo",
    evento: body.tipo || "teste",
    destinatario_telefone: phone,
    payload: { instance: cfg.uazapi_instance, mensagem: message },
    status: success ? "enviado" : "erro",
    erro: success ? "" : (r.data?.message || r.data?.error || `HTTP ${r.status}`),
    resposta: success ? "ok" : JSON.stringify(r.data || {}).slice(0, 500),
    agendamento_id: body.agendamento_id || null,
  });

  return jsonResponse({
    success,
    error: success ? null : (r.data?.message || r.data?.error || `HTTP ${r.status}`),
    raw: r.data,
  });
});
