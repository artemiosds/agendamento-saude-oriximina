import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { 
  validateSend, 
  buildMessage, 
  normalizePhone, 
  isValidPhone, 
  UnitConfig, 
  DEFAULT_UNIT_CONFIG 
} from "../_shared/whatsapp-compliance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

interface ClinicaConfig {
  evolution_base_url: string;
  evolution_api_key: string;
  evolution_instance_name: string;
  nome_clinica: string;
}

async function getClinicaConfig(supabase: any): Promise<ClinicaConfig | null> {
  const { data } = await supabase
    .from("clinica_config")
    .select("evolution_base_url, evolution_api_key, evolution_instance_name, nome_clinica")
    .limit(1)
    .maybeSingle();
  return (data as ClinicaConfig) ?? null;
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


async function sendEvolutionMessage(config: ClinicaConfig, phone: string, message: string) {
  try {
    const resp = await fetch(
      `${config.evolution_base_url}/message/sendText/${config.evolution_instance_name}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.evolution_api_key },
        body: JSON.stringify({ number: phone, text: message }),
      },
    );
    const body = await resp.text();
    return { ok: resp.ok, body, status: resp.status };
  } catch (error) {
    return {
      ok: false,
      body: error instanceof Error ? error.message : "fetch_error",
      status: 0,
    };
  }
}

async function fetchEvolutionJson(config: ClinicaConfig, path: string) {
  try {
    const resp = await fetch(`${config.evolution_base_url}${path}`, {
      headers: { apikey: config.evolution_api_key },
    });
    const text = await resp.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: resp.ok, status: resp.status, text, json };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      text: error instanceof Error ? error.message : "fetch_error",
      json: null,
    };
  }
}

// Compliance functions removed as they are now imported from ../_shared/whatsapp-compliance.ts


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json();
    const { agendamento_id, tipo, telefone_teste, telefone_direto, paciente_nome_direto, dados_direto, mensagem_custom } = body;

    const config = await getClinicaConfig(supabase);
    if (!config?.evolution_instance_name) {
      return new Response(
        JSON.stringify({ success: false, error: "Evolution API não configurada." }),
        { status: 400, headers: corsHeaders },
      );
    }

    // ─── STATUS, INSTANCES, etc ───
    if (body.action === "status") {
      const result = await fetchEvolutionJson(config, `/instance/connectionState/${config.evolution_instance_name}`);
      const state = result.json?.instance?.state || result.json?.state || "unknown";
      let statusDetailed = "desconectado";
      if (["open", "connected"].includes(state)) statusDetailed = "conectado";
      else if (state === "qrcode") statusDetailed = "qrcode";
      else if (state === "connecting") statusDetailed = "conectando";
      
      return new Response(JSON.stringify({ success: result.ok, connected: state === "open", state, status_detailed: statusDetailed }), { status: 200, headers: corsHeaders });
    }

    if (body.action === "instances") {
      const result = await fetchEvolutionJson(config, "/instance/fetchInstances");
      const instances = Array.isArray(result.json) ? result.json.map((i: any) => ({ instanceName: i.instance?.instanceName || i.instanceName || "", state: i.instance?.state || i.state || "unknown" })) : [];
      return new Response(JSON.stringify({ success: result.ok, instances }), { status: 200, headers: corsHeaders });
    }

    // ── TESTE: envia direto ──
    if (tipo === "teste" && telefone_teste) {
      const normalized = normalizePhone(telefone_teste);
      if (!normalized || !isValidPhone(normalized)) return new Response(JSON.stringify({ success: false, error: "Telefone inválido" }), { status: 400, headers: corsHeaders });
      const message = await buildMessage(supabase, "teste", { paciente_nome: "Teste" }, "");
      const result = await sendEvolutionMessage(config, normalized, message);
      return new Response(JSON.stringify({ success: result.ok, message: result.ok ? "Enviado" : result.body }), { status: 200, headers: corsHeaders });
    }

    // ── FLUXO PRINCIPAL DE ENVIO ──
    const phoneRaw = telefone_direto || telefone_teste || body.telefone || "";
    const phone = normalizePhone(phoneRaw);
    if (!phone) return new Response(JSON.stringify({ success: false, error: "Telefone inválido" }), { status: 400, headers: corsHeaders });

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
    const validation = await validateSend(supabase, unitCfg, pacienteId, phone, tipo, message, unidadeId);
    
    if (!validation.ok) {
       console.log(`[Evolution] Send blocked for ${phone}. Reason: ${validation.reason}`);
       await supabase.from("notification_logs").insert({
          evento: tipo,
          canal: "whatsapp_evolution",
          destinatario_telefone: phone,
          status: "bloqueado",
          erro: validation.reason,
          prior_interaction: validation.audit.prior_interaction,
          opt_in_status: validation.audit.opt_in_status,
          window_24h: validation.audit.window_24h,
          category: validation.audit.category,
          agendamento_id,
          unidade_id: unidadeId
       });
       return new Response(JSON.stringify({ success: false, error: validation.reason, blocked: true }), { status: 200, headers: corsHeaders });
    }

    // Delay anti-ban adicional
    if (unitCfg.delay_aleatorio_max_seg > 0) {
      const delay = Math.floor(Math.random() * (unitCfg.delay_aleatorio_max_seg - unitCfg.delay_aleatorio_min_seg + 1) + unitCfg.delay_aleatorio_min_seg) * 1000;
      console.log(`[Evolution] Delaying send by ${delay}ms (Anti-Ban)`);
      await new Promise(r => setTimeout(r, delay));
    }

    // ENVIO REAL
    const result = await sendEvolutionMessage(config, phone, message);
    
    await supabase.from("notification_logs").insert({
      evento: tipo,
      canal: "whatsapp_evolution",
      destinatario_telefone: phone,
      status: result.ok ? "enviado" : "erro",
      erro: result.ok ? "" : result.body,
      prior_interaction: validation.audit.prior_interaction,
      window_24h: validation.audit.window_24h,
      category: validation.audit.category,
      agendamento_id,
      provider: "evolution",
      resposta: result.body.substring(0, 1000),
      mensagem: message,
    });

    return new Response(JSON.stringify({ success: result.ok, error: result.ok ? null : result.body }), { status: 200, headers: corsHeaders });

  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders });
  }
});
