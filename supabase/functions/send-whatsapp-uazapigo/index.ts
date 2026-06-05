// Edge Function: send-whatsapp-uazapigo
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, token, admintoken, admin-token, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
  respeitar_opt_out: boolean;
  bloquear_sem_interacao_previa: boolean;
}

const DEFAULT_UNIT_CONFIG: UnitConfig = {
  whatsapp_ativo: true,
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

async function uazFetch(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  try {
    console.log(`[UazapiGO] Fetching: ${url}`, { method: init.method, headers: init.headers });
    const resp = await fetch(url, init);
    const text = await resp.text();
    console.log(`[UazapiGO] Response (${resp.status}):`, text.slice(0, 500));
    
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { ok: resp.ok, status: resp.status, data };
  } catch (e: any) {
    console.error(`[UazapiGO] Fetch error:`, e.message);
    return { ok: false, status: 0, data: null, error: e.message };
  }
}

async function resolveInstanceToken(cfg: UazapiConfig): Promise<{ token: string | null; error?: string }> {
  const base = normalizeUrl(cfg.uazapi_server_url);
  
  // Try multiple header variants for admin token
  const headers = { 
    "admintoken": cfg.uazapi_admin_token,
    "admin-token": cfg.uazapi_admin_token,
    "Content-Type": "application/json"
  };

  const r = await uazFetch(`${base}/instance/all`, { headers });
  
  if (!r.ok) {
    // If it fails, maybe the instance field itself IS the token?
    // Let's check if the instance name looks like a token (long hash)
    if (cfg.uazapi_instance.length > 20) {
      console.log("[UazapiGO] Using instance name as token directly.");
      return { token: cfg.uazapi_instance };
    }
    return { token: null, error: `Falha ao listar instâncias: HTTP ${r.status}` };
  }

  const list = r.data?.instances || r.data || [];
  if (!Array.isArray(list)) {
     console.error("[UazapiGO] Invalid instances list format:", r.data);
     return { token: null, error: "Formato de lista de instâncias inválido" };
  }

  const found = list.find((i: any) => 
    i.name === cfg.uazapi_instance || 
    i.instanceName === cfg.uazapi_instance ||
    i.id === cfg.uazapi_instance
  );

  const token = found?.token || found?.instanceToken || null;
  if (!token && cfg.uazapi_instance.length > 20) {
      console.log("[UazapiGO] Instance not found in list, but name looks like a token. Using it.");
      return { token: cfg.uazapi_instance };
  }

  return { token };
}

async function sendText(cfg: UazapiConfig, phone: string, message: string) {
  const base = normalizeUrl(cfg.uazapi_server_url);
  const { token, error: resolveError } = await resolveInstanceToken(cfg);
  
  if (!token) {
    return { ok: false, status: 401, error: resolveError || "Token da instância não encontrado" };
  }

  // Try standard v2 endpoint first
  const body = JSON.stringify({ number: phone, text: message, instance: cfg.uazapi_instance });
  
  // Some versions use /message/text, others /send/text
  const endpoints = [`${base}/message/text`, `${base}/send/text`];
  let lastResult: any = null;

  for (const url of endpoints) {
    const r = await uazFetch(url, {
      method: "POST",
      headers: { token, "Content-Type": "application/json" },
      body,
    });
    if (r.ok) return r;
    lastResult = r;
  }
  
  return lastResult;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  
  try {
    const body = await req.json();
    console.log("[UazapiGO] Request body:", JSON.stringify(body));
    
    const cfg = await getConfig(supabase);
    if (!cfg) {
      console.error("[UazapiGO] Config not found in clinica_config");
      return new Response(JSON.stringify({ success: false, error: "Configuração clínica não encontrada" }), { headers: corsHeaders });
    }

    // --- Action: status ---
    if (body.action === "status") {
      const { token, error } = await resolveInstanceToken(cfg);
      if (!token) {
        return new Response(JSON.stringify({ 
          success: false, 
          connected: false, 
          status_detailed: error?.includes("401") ? "admin_token_invalido" : "instancia_inexistente",
          error: error || "Instância não encontrada"
        }), { headers: corsHeaders });
      }

      // Check instance state
      const base = normalizeUrl(cfg.uazapi_server_url);
      const r = await uazFetch(`${base}/instance/status`, { headers: { token } });
      
      const state = r.data?.status || r.data?.state || (r.ok ? "CONNECTED" : "DISCONNECTED");
      const connected = state === "CONNECTED" || state === "connected" || state === "open";
      
      return new Response(JSON.stringify({ 
        success: true, 
        connected, 
        state,
        status_detailed: connected ? "conectado" : "qrcode_necessario"
      }), { headers: corsHeaders });
    }

    // --- Action: create_instance ---
    if (body.action === "create_instance") {
      const base = normalizeUrl(cfg.uazapi_server_url);
      const name = body.name || cfg.uazapi_instance;
      
      const r = await uazFetch(`${base}/instance/create`, {
        method: "POST",
        headers: { 
          "admintoken": cfg.uazapi_admin_token,
          "admin-token": cfg.uazapi_admin_token,
          "Content-Type": "application/json" 
        },
        body: JSON.stringify({ name }),
      });
      
      return new Response(JSON.stringify({ 
        success: r.ok, 
        instance: r.data?.instance || r.data,
        error: r.error || (r.ok ? null : "Falha ao criar instância")
      }), { headers: corsHeaders });
    }

    // --- Action: Send Message ---
    const phone = normalizePhone(body.telefone || body.telefone_teste || body.telefone_direto || "");
    if (!phone) {
      return new Response(JSON.stringify({ success: false, error: "Telefone inválido" }), { headers: corsHeaders });
    }

    const msg = body.mensagem || "Olá!";
    const r = await sendText(cfg, phone, msg);
    
    return new Response(JSON.stringify({ 
      success: r.ok, 
      error: r.error || (r.ok ? null : `Erro ${r.status}: ${JSON.stringify(r.data)}`) 
    }), { headers: corsHeaders });

  } catch (err: any) {
    console.error("[UazapiGO] Global error:", err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }
});
