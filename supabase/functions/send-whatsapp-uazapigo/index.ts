// Edge Function: send-whatsapp-uazapigo
// UazapiGO API (v2.0):
//   GET  /instance/all        headers: admintoken: <admin_token>
//   GET  /instance/status     headers: token: <instance_token>
//   POST /send/text           headers: token: <instance_token>   body: { number, text }
//   POST /instance/init       headers: admintoken: <admin_token> body: { name }

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
    return { ok: false, status: 0, data: null, error: e?.name === 'AbortError' ? "Timeout" : (e?.message || "Network error") };
  }
}

/** 
 * Resolve o token da instância usando o Admin Token. 
 * Se o campo 'instance' já parecer um token (longo e com caracteres aleatórios), retorna ele mesmo.
 */
async function resolveInstanceToken(cfg: UazapiConfig): Promise<{ token: string | null; error?: string }> {
  const instanceField = cfg.uazapi_instance;
  if (instanceField.length > 20) return { token: instanceField };

  const base = normalizeUrl(cfg.uazapi_server_url);
  if (!base || !cfg.uazapi_admin_token) return { token: null, error: "Configuração incompleta" };

  // Tenta com cabeçalho 'apikey' (muito comum em clones de Evolution/Uazapi)
  let r = await uazFetch(`${base}/instance/all`, {
    headers: { apikey: cfg.uazapi_admin_token, Accept: "application/json" }
  });

  // Se falhar, tenta 'admintoken' (padrão documentado UazapiGO)
  if (!r.ok) {
    r = await uazFetch(`${base}/instance/all`, {
      headers: { admintoken: cfg.uazapi_admin_token, Accept: "application/json" }
    });
  }
  
  // Se falhar, tenta passar via Query Params (alguns servidores requerem isso)
  if (!r.ok) {
    r = await uazFetch(`${base}/instance/all?admintoken=${cfg.uazapi_admin_token}`, {
      headers: { Accept: "application/json" }
    });
  }

  // Se ainda falhar, tenta 'AdminToken' (Case sensitive)
  if (!r.ok) {
    r = await uazFetch(`${base}/instance/all`, {
      headers: { AdminToken: cfg.uazapi_admin_token, Accept: "application/json" }
    });
  }

  if (!r.ok) return { token: null, error: `Falha ao listar instâncias: HTTP ${r.status}. Verifique se o Admin Token está correto.` };
  return findTokenInList(r.data, instanceField);
}

function findTokenInList(data: any, instanceName: string): { token: string | null; error?: string } {
  const list = Array.isArray(data) ? data : (data?.instances || data?.data || []);
  if (!Array.isArray(list)) return { token: null, error: "Formato de lista de instâncias inválido" };

  const found = list.find((i: any) => 
    String(i.name || "").toLowerCase() === instanceName.toLowerCase() || 
    String(i.instanceName || "").toLowerCase() === instanceName.toLowerCase() ||
    String(i.id || "") === instanceName ||
    String(i.instanceId || "") === instanceName
  );

  if (!found) return { token: null, error: `Instância "${instanceName}" não encontrada` };
  
  const token = found.token || found.instanceToken || found.apiKey || found.tokenInstance;
  if (!token) return { token: null, error: "Token da instância não encontrado na resposta" };
  
  return { token };
}

async function checkStatus(cfg: UazapiConfig): Promise<{ status_detailed: string; raw?: any; error?: string }> {
  const base = normalizeUrl(cfg.uazapi_server_url);
  
  // Tenta resolver token
  const { token, error: tokenError } = await resolveInstanceToken(cfg);
  
  if (tokenError) {
    // Se falhar com 401 no /instance/all, talvez possamos tentar o status direto com a instância se ela for um token
    if (tokenError.includes("401")) {
      // Tenta usar o campo uazapi_instance como token diretamente (fallback desesperado)
      if (cfg.uazapi_instance.length > 20) {
        let rDirect = await uazFetch(`${base}/instance/status`, {
          headers: { token: cfg.uazapi_instance, Accept: "application/json" }
        });
        if (rDirect.ok) {
          return mapStatus(rDirect.data);
        }
      }
    }
    return { status_detailed: "error", error: tokenError };
  }

  // Tenta GET /instance/status primeiro (padrão UazapiGO)
  let r = await uazFetch(`${base}/instance/status`, {
    headers: { token: token!, Accept: "application/json" }
  });

  // Se der 404 ou 405, tenta o padrão Evolution (alguns clones de Uazapi usam isso)
  if (r.status === 404 || r.status === 405) {
    r = await uazFetch(`${base}/instance/connectionState/${encodeURIComponent(cfg.uazapi_instance)}`, {
      headers: { apikey: cfg.uazapi_admin_token, Accept: "application/json" }
    });
  }

  if (!r.ok) return { status_detailed: "error", error: `Erro status: HTTP ${r.status}`, raw: r.data };

  return mapStatus(r.data);
}

function mapStatus(data: any) {
  const state = String(
    data?.instance?.state || data?.state || data?.status || data?.connection || data?.state_connection || ""
  ).toLowerCase();

  let status_detailed = "disconnected";
  if (["open", "connected", "online", "ready", "conectado"].includes(state)) status_detailed = "connected";
  else if (["connecting", "syncing", "conectando"].includes(state)) status_detailed = "connecting";
  else if (["qrcode", "qr", "pairing"].includes(state)) status_detailed = "qrcode";

  return { status_detailed, raw: data, error: status_detailed === "connected" ? undefined : `Status: ${state || "desconhecido"}` };
}

async function sendText(cfg: UazapiConfig, phone: string, message: string) {
  const base = normalizeUrl(cfg.uazapi_server_url);
  const { token, error: tokenError } = await resolveInstanceToken(cfg);
  
  if (tokenError) return { ok: false, status: 400, data: { error: tokenError } };

  // UazapiGO v2 usa POST /send/text com header token
  let r = await uazFetch(`${base}/send/text`, {
    method: "POST",
    headers: { token: token!, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ number: phone, text: message }),
  });

  // Se der 404 ou 405, tenta o formato Evolution como fallback
  if (r.status === 404 || r.status === 405) {
    r = await uazFetch(`${base}/message/sendText/${encodeURIComponent(cfg.uazapi_instance)}`, {
      method: "POST",
      headers: { apikey: cfg.uazapi_admin_token, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ number: phone, text: message }),
    });
  }

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
  if (!cfg) return jsonResponse({ success: false, error: "Configuração não encontrada" }, 200);

  // ─── STATUS ───
  if (action === "status") {
    const res = await checkStatus(cfg);
    // Persiste status
    const now = new Date().toISOString();
    await supabase.from("whatsapp_connection_status").upsert({
      instance_name: `uazapi:${cfg.uazapi_instance}`,
      status: res.status_detailed,
      last_check_at: now,
      last_error: res.error || "",
      details: { provider: "uazapigo", raw: res.raw }
    }, { onConflict: "instance_name" });

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
    if (!name) return jsonResponse({ success: false, error: "Nome obrigatório" });
    const base = normalizeUrl(cfg.uazapi_server_url);
    const r = await uazFetch(`${base}/instance/init`, {
      method: "POST",
      headers: { admintoken: cfg.uazapi_admin_token, "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (r.ok) {
       await supabase.from("clinica_config").update({ uazapi_instance: name, updated_at: new Date().toISOString() }).neq("id", "00000000-0000-0000-0000-000000000000");
       return jsonResponse({ success: true, instance: { name } });
    }
    return jsonResponse({ success: false, error: r.data?.message || r.error || "Erro ao criar" });
  }

  // ─── SEND ───
  const phoneRaw = body.telefone_teste || body.telefone_direto || body.telefone || "";
  const phone = normalizePhone(phoneRaw);
  if (!phone) return jsonResponse({ success: false, error: "Telefone inválido" });

  const message: string = body.mensagem || `Teste UazapiGO.`;
  const r = await sendText(cfg, phone, message);
  const success = r.ok && (r.data?.status === "success" || r.data?.success === true || !!r.data?.id || !!r.data?.key?.id);

  // Log
  await supabase.from("notification_logs").insert({
    canal: "whatsapp_uazapigo",
    provider: "uazapigo",
    evento: body.tipo || "teste",
    destinatario_telefone: phone,
    payload: { instance: cfg.uazapi_instance, mensagem: message },
    status: success ? "enviado" : "erro",
    erro: success ? "" : (r.data?.message || r.data?.error || `HTTP ${r.status}`),
    resposta: JSON.stringify(r.data || {}).slice(0, 500),
    agendamento_id: body.agendamento_id || null,
  });

  return jsonResponse({
    success,
    error: success ? null : (r.data?.message || r.data?.error || `HTTP ${r.status}`),
    raw: r.data,
  });
});