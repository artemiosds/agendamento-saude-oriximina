// Edge Function: send-whatsapp-uazapigo
// Mirrors send-whatsapp-evolution behavior but talks to UazapiGO API.
// Endpoints (based on UazapiGO public docs https://docs.uazapi.com):
//   GET  {server}/instance/status        headers: token: <instance-token> | AdminToken: <admin>
//   POST {server}/send/text              headers: token: <instance-token>   body: { number, text }
//   POST {server}/instance/init          headers: AdminToken: <admin>       body: { name }
//   GET  {server}/instance/all           headers: AdminToken: <admin>
// We treat the configured `uazapi_admin_token` as the AdminToken and the
// instance token is fetched on demand from /instance/all (filtering by name).
// If the API returns the instance token directly we cache it on clinica_config.uazapi_instance_token.

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
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 && !digits.startsWith("55")) digits = digits.slice(0, 2) + "9" + digits.slice(2);
  if (digits.length === 11 && !digits.startsWith("55")) digits = "55" + digits;
  if (digits.length === 12 && digits.startsWith("55")) digits = digits.slice(0, 4) + "9" + digits.slice(4);
  if (digits.length === 13 && digits.startsWith("55")) return digits;
  return null;
}

async function getConfig(supabase: any): Promise<UazapiConfig | null> {
  const { data } = await supabase
    .from("clinica_config")
    .select("uazapi_server_url, uazapi_admin_token, uazapi_instance, nome_clinica")
    .limit(1)
    .maybeSingle();
  return (data as UazapiConfig) ?? null;
}

async function uazFetch(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  try {
    const resp = await fetch(url, init);
    const text = await resp.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { ok: resp.ok, status: resp.status, data };
  } catch (e: any) {
    return { ok: false, status: 0, data: null, error: e?.message || "network_error" };
  }
}

/** Tenta obter o token da instância usando AdminToken */
async function fetchInstanceToken(cfg: UazapiConfig): Promise<{ token: string | null; status_detailed: string; error?: string }> {
  const base = normalizeUrl(cfg.uazapi_server_url);
  if (!base) return { token: null, status_detailed: "server_url_invalida", error: "Server URL não configurado" };
  if (!cfg.uazapi_admin_token) return { token: null, status_detailed: "admin_token_ausente", error: "Admin Token não configurado" };
  if (!cfg.uazapi_instance) return { token: null, status_detailed: "instancia_inexistente", error: "Instância não configurada" };

  const r = await uazFetch(`${base}/instance/all`, {
    method: "GET",
    headers: { AdminToken: cfg.uazapi_admin_token, Accept: "application/json" },
  });
  if (r.error) return { token: null, status_detailed: "rede_indisponivel", error: r.error };
  if (r.status === 401 || r.status === 403) return { token: null, status_detailed: "admin_token_invalido", error: "Admin Token inválido" };
  if (!r.ok) return { token: null, status_detailed: "erro_api", error: `HTTP ${r.status}` };

  const list: any[] = Array.isArray(r.data) ? r.data : (r.data?.instances || r.data?.data || []);
  const found = list.find((i: any) =>
    (i?.name && String(i.name).toLowerCase() === cfg.uazapi_instance.toLowerCase()) ||
    (i?.id && String(i.id) === cfg.uazapi_instance)
  );
  if (!found) return { token: null, status_detailed: "instancia_inexistente", error: "Instância não encontrada no servidor" };
  const tok = found.token || found.instanceToken || found.apiKey || null;
  if (!tok) return { token: null, status_detailed: "instancia_sem_token", error: "Instância sem token disponível" };
  return { token: tok, status_detailed: "ok" };
}

async function checkStatus(cfg: UazapiConfig): Promise<{ status_detailed: string; raw?: any; error?: string }> {
  const base = normalizeUrl(cfg.uazapi_server_url);
  if (!base) return { status_detailed: "server_url_invalida", error: "Server URL não configurado" };
  if (!cfg.uazapi_admin_token) return { status_detailed: "admin_token_ausente", error: "Admin Token não configurado" };
  if (!cfg.uazapi_instance) return { status_detailed: "instancia_inexistente", error: "Instância não configurada" };

  // 1. Resolve instance token
  const tokRes = await fetchInstanceToken(cfg);
  if (!tokRes.token) return { status_detailed: tokRes.status_detailed, error: tokRes.error };

  // 2. Query instance status
  const r = await uazFetch(`${base}/instance/status`, {
    method: "GET",
    headers: { token: tokRes.token, Accept: "application/json" },
  });
  if (r.error) return { status_detailed: "rede_indisponivel", error: r.error };
  if (!r.ok) return { status_detailed: "erro_api", error: `HTTP ${r.status}`, raw: r.data };

  const state = String(
    r.data?.instance?.status || r.data?.status || r.data?.state || r.data?.connection || ""
  ).toLowerCase();

  let status_detailed = "desconhecido";
  if (["connected", "open", "online", "ready"].includes(state)) status_detailed = "conectado";
  else if (["connecting", "syncing"].includes(state)) status_detailed = "conectando";
  else if (["qrcode", "qr", "pairing"].includes(state)) status_detailed = "qrcode_necessario";
  else if (["disconnected", "close", "closed", "logged_out"].includes(state)) status_detailed = "desconectado";

  return { status_detailed, raw: r.data };
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
  if (status_detailed === "conectado") patch.last_connected_at = now;
  if (status_detailed === "desconectado") patch.last_disconnected_at = now;
  if (error) patch.last_error_at = now;

  await supabase.from("whatsapp_connection_status").upsert(patch, { onConflict: "instance_name" });
}

async function sendText(cfg: UazapiConfig, instanceToken: string, phone: string, message: string) {
  const base = normalizeUrl(cfg.uazapi_server_url);
  // UazapiGO: POST /send/text { number, text }
  const r = await uazFetch(`${base}/send/text`, {
    method: "POST",
    headers: { token: instanceToken, "Content-Type": "application/json" },
    body: JSON.stringify({ number: phone, text: message }),
  });
  return r;
}

async function createInstance(cfg: UazapiConfig, name: string) {
  const base = normalizeUrl(cfg.uazapi_server_url);
  if (!base) return { success: false, error: "Server URL não configurado" };
  if (!cfg.uazapi_admin_token) return { success: false, error: "Admin Token não configurado" };
  if (!name) return { success: false, error: "Nome da instância obrigatório" };

  const r = await uazFetch(`${base}/instance/init`, {
    method: "POST",
    headers: { AdminToken: cfg.uazapi_admin_token, "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (r.error) return { success: false, error: r.error };
  if (r.status === 401 || r.status === 403) return { success: false, error: "Admin Token inválido" };
  if (!r.ok) return { success: false, error: `HTTP ${r.status}`, raw: r.data };

  const created = r.data?.instance || r.data;
  return {
    success: true,
    instance: {
      name: created?.name || name,
      id: created?.id || null,
      token: created?.token || created?.instanceToken || null,
      qrcode: created?.qrcode || created?.qr || null,
      status: created?.status || created?.state || null,
    },
    raw: r.data,
  };
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
  if (!cfg) return jsonResponse({ success: false, error: "Configuração ausente", status_detailed: "config_ausente" }, 200);

  // ─── STATUS ───
  if (action === "status") {
    const res = await checkStatus(cfg);
    await persistStatus(supabase, cfg.uazapi_instance || "(sem instância)", res.status_detailed, res.error, res.raw);
    return jsonResponse({
      success: res.status_detailed === "conectado",
      connected: res.status_detailed === "conectado",
      state: res.status_detailed,
      status_detailed: res.status_detailed,
      error: res.error || null,
    });
  }

  // ─── CREATE INSTANCE ───
  if (action === "create_instance") {
    const name = String(body.name || "").trim();
    const res = await createInstance(cfg, name);
    if (res.success && res.instance) {
      // Persist returned instance name on clinica_config
      await supabase
        .from("clinica_config")
        .update({ uazapi_instance: res.instance.name, updated_at: new Date().toISOString() })
        .neq("id", "00000000-0000-0000-0000-000000000000");
    }
    return jsonResponse(res);
  }

  // ─── SEND ───
  // Body: { telefone_teste?, telefone_direto?, paciente_nome_direto?, mensagem?, tipo? }
  const phoneRaw = body.telefone_teste || body.telefone_direto || body.telefone || "";
  const phone = normalizePhone(phoneRaw);
  if (!phone) return jsonResponse({ success: false, error: "Telefone inválido" });

  const message: string = body.mensagem || `Olá! Mensagem de teste do sistema (${cfg.nome_clinica || "clínica"}).`;

  const tokRes = await fetchInstanceToken(cfg);
  if (!tokRes.token) {
    await persistStatus(supabase, cfg.uazapi_instance || "(sem instância)", tokRes.status_detailed, tokRes.error);
    return jsonResponse({ success: false, error: tokRes.error || "Falha ao resolver instância", status_detailed: tokRes.status_detailed });
  }

  const r = await sendText(cfg, tokRes.token, phone, message);
  const success = r.ok && (r.data?.status === "success" || r.data?.success === true || !!r.data?.id || !!r.data?.message);

  if (success) {
    await supabase.from("whatsapp_connection_status").update({
      last_success_send_at: new Date().toISOString(),
    }).eq("instance_name", `uazapi:${cfg.uazapi_instance}`);
  }

  // Log (sem token)
  await supabase.from("notification_logs").insert({
    canal: "whatsapp_uazapigo",
    provider: "uazapigo",
    evento: body.tipo || "envio_direto",
    destinatario_telefone: phone,
    payload: { instance: cfg.uazapi_instance, mensagem: message },
    status: success ? "enviado" : "erro",
    erro: success ? "" : (r.data?.error || r.data?.message || `HTTP ${r.status}`),
    resposta: success ? "ok" : JSON.stringify(r.data || {}).slice(0, 500),
    agendamento_id: body.agendamento_id || "",
  });

  return jsonResponse({
    success,
    error: success ? null : (r.data?.error || r.data?.message || `HTTP ${r.status}`),
    raw: r.data,
  });
});
