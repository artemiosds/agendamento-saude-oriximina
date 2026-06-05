// Edge Function: send-whatsapp-uazapigo
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { 
  validateSend, 
  buildMessage, 
  normalizePhone as complianceNormalizePhone, 
  isValidPhone, 
  UnitConfig, 
  DEFAULT_UNIT_CONFIG 
} from "../_shared/whatsapp-compliance.ts";

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

function normalizeUrl(raw: string): string {
  return (raw || "").trim().replace(/\/+$/, "");
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
  
  const headers = { 
    "admintoken": cfg.uazapi_admin_token,
    "admin-token": cfg.uazapi_admin_token,
    "Content-Type": "application/json"
  };

  const r = await uazFetch(`${base}/instance/all`, { headers });
  
  if (!r.ok) {
    if (cfg.uazapi_instance.length > 20) {
      return { token: cfg.uazapi_instance };
    }
    return { token: null, error: `Falha ao listar instâncias: HTTP ${r.status}` };
  }

  const list = r.data?.instances || r.data || [];
  if (!Array.isArray(list)) {
     if (cfg.uazapi_instance.length > 20) return { token: cfg.uazapi_instance };
     return { token: null, error: "Formato de lista de instâncias inválido" };
  }

  const found = list.find((i: any) => 
    String(i.name) === cfg.uazapi_instance || 
    String(i.instanceName) === cfg.uazapi_instance ||
    String(i.id) === cfg.uazapi_instance
  );

  const token = found?.token || found?.instanceToken || null;
  if (!token && cfg.uazapi_instance.length > 20) {
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

  const body = JSON.stringify({ number: phone, text: message, instance: cfg.uazapi_instance });
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
    const { agendamento_id, tipo, telefone_teste, telefone_direto, paciente_nome_direto, dados_direto, mensagem_custom } = body;
    
    const cfg = await getConfig(supabase);
    if (!cfg) {
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

      const base = normalizeUrl(cfg.uazapi_server_url);
      const r = await uazFetch(`${base}/instance/status`, { headers: { token } });
      
      const stateObj = r.data?.status || r.data?.state || r.data || {};
      let connected = false;
      let stateStr = "DISCONNECTED";

      if (typeof stateObj === 'string') {
        stateStr = stateObj;
        connected = stateStr.toUpperCase() === "CONNECTED" || stateStr.toLowerCase() === "open";
      } else {
        connected = !!(stateObj.connected || stateObj.loggedIn || stateObj.open);
        stateStr = connected ? "CONNECTED" : (stateObj.status || "DISCONNECTED");
      }
      
      return new Response(JSON.stringify({ 
        success: true, 
        connected, 
        state: stateStr,
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

    // --- FLUXO PRINCIPAL DE ENVIO ---
    const phoneRaw = telefone_direto || telefone_teste || body.telefone || "";
    const phone = complianceNormalizePhone(phoneRaw);
    if (!phone) {
      return new Response(JSON.stringify({ success: false, error: "Telefone inválido" }), { headers: corsHeaders });
    }

    // ── TESTE: envia direto ──
    if (tipo === "teste" && telefone_teste) {
      if (!isValidPhone(phone)) return new Response(JSON.stringify({ success: false, error: "Telefone inválido" }), { status: 400, headers: corsHeaders });
      const message = await buildMessage(supabase, "teste", { paciente_nome: "Teste" }, "");
      const r = await sendText(cfg, phone, message);
      return new Response(JSON.stringify({ success: r.ok, error: r.error || (r.ok ? null : `Erro ${r.status}`) }), { headers: corsHeaders });
    }

    // Resolvendo dados
    let unidadeId = body.unidade_id || "";
    let pacienteId = body.paciente_id || "";
    let pacienteNome = paciente_nome_direto || "Paciente";
    let dados = dados_direto || {};

    if (agendamento_id) {
       const { data: ag } = await supabase.from("agendamentos").select("unidade_id, paciente_id, paciente_nome, data, hora, profissional_nome").eq("id", agendamento_id).maybeSingle();
       if (ag) {
         unidadeId = ag.unidade_id;
         pacienteId = ag.paciente_id;
         pacienteNome = ag.paciente_nome;
         dados = { ...dados, data_consulta: ag.data, hora_consulta: ag.hora, profissional: ag.profissional_nome, paciente_nome: ag.paciente_nome };
       }
    }

    const unitCfg = await getUnitConfig(supabase, unidadeId);
    const message = mensagem_custom || await buildMessage(supabase, tipo, dados, unidadeId);
    
    // VALIDAÇÃO ANTI-BAN & COMPLIANCE
    const validation = await validateSend(supabase, unitCfg, pacienteId, phone, tipo, message);
    
    if (!validation.ok) {
       await supabase.from("notification_logs").insert({
          evento: tipo,
          canal: "whatsapp_uazapigo",
          destinatario_telefone: phone,
          status: "bloqueado",
          erro: validation.reason,
          prior_interaction: validation.audit.prior_interaction,
          opt_in_status: validation.audit.opt_in_status,
          window_24h: validation.audit.window_24h,
          category: validation.audit.category,
          agendamento_id
       });

       return new Response(JSON.stringify({ 
         success: false, 
         error: `Bloqueado por Compliance: ${validation.reason}`,
         audit: validation.audit
       }), { headers: corsHeaders });
    }

    // Envio real
    const r = await sendText(cfg, phone, message);
    
    // Log final
    await supabase.from("notification_logs").insert({
      evento: tipo,
      canal: "whatsapp_uazapigo",
      destinatario_telefone: phone,
      status: r.ok ? "enviado" : "erro",
      mensagem: message,
      erro: r.ok ? null : (r.error || JSON.stringify(r.data)),
      prior_interaction: validation.audit.prior_interaction,
      opt_in_status: validation.audit.opt_in_status,
      window_24h: validation.audit.window_24h,
      category: validation.audit.category,
      agendamento_id
    });

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