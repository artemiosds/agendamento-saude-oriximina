// Edge Function: send-whatsapp-uazapigo
// UazapiGO API (https://docs.uazapi.com):
//   GET  {server}/instance/connectionState/{instance}   headers: apikey: <token>
//   POST {server}/message/sendText/{instance}           headers: apikey: <token>   body: { number, text }
//   POST {server}/instance/init                         headers: apikey: <admin>   body: { name }
// O token e o admin token podem ser o mesmo valor configurado em `uazapi_admin_token`.

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
  if (!data) return null;
  // Normaliza removendo espaços
  return {
    uazapi_server_url: (data.uazapi_server_url || "").trim(),
    uazapi_admin_token: (data.uazapi_admin_token || "").trim(),
    uazapi_instance: (data.uazapi_instance || "").trim(),
    nome_clinica: data.nome_clinica || "",
  };
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

  if (r.error) return { status_detailed: "rede_indisponivel", error: r.error };
  if (r.status === 401 || r.status === 403) return { status_detailed: "token_invalido", error: r.data?.message || r.data?.error || "Token inválido", raw: r.data };
  if (r.status === 404) return { status_detailed: "instancia_inexistente", error: r.data?.message || r.data?.error || "Instância não encontrada", raw: r.data };
  if (!r.ok) return { status_detailed: "erro_api", error: r.data?.message || r.data?.error || `HTTP ${r.status}`, raw: r.data };

  const state = String(
    r.data?.instance?.state || r.data?.state || r.data?.status || r.data?.connection || ""
  ).toLowerCase();

  let status_detailed = "desconhecido";
  if (["open", "connected", "online", "ready"].includes(state)) status_detailed = "conectado";
  else if (["connecting", "syncing"].includes(state)) status_detailed = "conectando";
  else if (["qrcode", "qr", "pairing"].includes(state)) status_detailed = "qrcode_necessario";
  else if (["disconnected", "close", "closed", "logged_out"].includes(state)) status_detailed = "desconectado";

  return { status_detailed, raw: r.data, error: status_detailed === "conectado" ? undefined : `Estado: ${state || "desconhecido"}` };
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

async function createInstance(cfg: UazapiConfig, name: string) {
  const base = normalizeUrl(cfg.uazapi_server_url);
  if (!base) return { success: false, error: "Server URL não configurado" };
  if (!cfg.uazapi_admin_token) return { success: false, error: "Token não configurado" };
  if (!name) return { success: false, error: "Nome da instância obrigatório" };

  const r = await uazFetch(`${base}/instance/init`, {
    method: "POST",
    headers: { apikey: cfg.uazapi_admin_token, "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (r.error) return { success: false, error: r.error };
  if (r.status === 401 || r.status === 403) return { success: false, error: r.data?.message || "Token inválido" };
  if (!r.ok) return { success: false, error: r.data?.message || r.data?.error || `HTTP ${r.status}`, raw: r.data };

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

  const r = await sendText(cfg, phone, message);
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
