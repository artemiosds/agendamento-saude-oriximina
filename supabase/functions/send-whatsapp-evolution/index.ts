import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

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
  intervalo_minimo_minutos: 240, // 4 horas
  delay_aleatorio_min_seg: 10,
  delay_aleatorio_max_seg: 30,
  limite_global_por_minuto: 10,
  horario_inicio: "08:00",
  horario_fim: "18:00",
  dias_permitidos: [1, 2, 3, 4, 5],
  modo_estrito: true,
  respeitar_opt_out: true,
  bloquear_sem_interacao_previa: true,
};

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

function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 && !digits.startsWith("55")) {
    digits = digits.slice(0, 2) + "9" + digits.slice(2);
  }
  if (digits.length === 11 && !digits.startsWith("55")) {
    digits = "55" + digits;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    digits = digits.slice(0, 4) + "9" + digits.slice(4);
  }
  if (digits.length === 13 && digits.startsWith("55")) return digits;
  return null;
}

function isValidPhone(phone: string): boolean {
  return phone.length === 13 && phone.startsWith("55") && /^\d+$/.test(phone);
}

// Variação automática de saudação para evitar mensagens 100% idênticas
const GREETINGS = ["Olá", "Oi", "Bom dia", "Boa tarde"];
const EMOJIS = ["👋", "😊", "🙂", "✨"];
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function buildMessage(supabase: any, tipo: string, data: any, unidadeId: string): Promise<string> {
  const footer = `\n_Secretaria Municipal de Saúde_`;
  const greeting = pick(GREETINGS);
  const emoji = pick(EMOJIS);

  // Busca template customizado se existir
  const { data: template } = await supabase
    .from("whatsapp_templates")
    .select("mensagem, ativo")
    .eq("unidade_id", unidadeId || "")
    .eq("tipo", tipo === "agendamento_criado" ? "confirmacao" : tipo)
    .maybeSingle();

  if (template?.ativo && template.mensagem) {
    let msg = template.mensagem;
    // Substitui variáveis
    msg = msg.replace(/\{\{nome\}\}/g, data.paciente_nome || "");
    msg = msg.replace(/\{\{unidade\}\}/g, data.unidade || "");
    msg = msg.replace(/\{\{profissional\}\}/g, data.profissional || "");
    msg = msg.replace(/\{\{data\}\}/g, data.data_consulta || "");
    msg = msg.replace(/\{\{hora\}\}/g, data.hora_consulta || "");
    return msg;
  }

  // Fallback para mensagens hardcoded
  switch (tipo) {
    case "confirmacao":
    case "agendamento_criado":
      return `${greeting}, *${data.paciente_nome}*! ${emoji}\n\nSeu atendimento foi agendado.\n\n📍 Unidade: ${data.unidade}\n👨‍⚕️ Profissional: *${data.profissional}*\n📅 Data: ${data.data_consulta}\n⏰ Horário: ${data.hora_consulta}\n${data.observacoes ? `📝 ${data.observacoes}\n` : ""}\nChegue com antecedência.${footer}`;
    case "lembrete_24h":
      return `${greeting}, *${data.paciente_nome}*! ${emoji}\n\nLembrete do seu atendimento:\n\n📍 ${data.unidade}\n👨‍⚕️ *${data.profissional}*\n📅 Data: ${data.data_consulta}\n⏰ Horário: ${data.hora_consulta}\n\nContamos com sua presença.${footer}`;
    case "lembrete_2h":
      return `${greeting}, *${data.paciente_nome}*! ${emoji}\n\nSeu atendimento está próximo:\n\n📍 ${data.unidade}\n👨‍⚕️ *${data.profissional}*\n📅 Data: ${data.data_consulta}\n⏰ Horário: ${data.hora_consulta}${footer}`;
    case "cancelamento":
      return `${greeting}, *${data.paciente_nome}*.\n\nSeu atendimento foi cancelado.\n\n📍 ${data.unidade}\n👨‍⚕️ *${data.profissional}*\n📅 ${data.data_consulta}${data.observacoes ? `\n📝 ${data.observacoes}` : ""}${footer}`;
    case "remarcacao":
      return `${greeting}, *${data.paciente_nome}*! ${emoji}\n\nSeu atendimento foi remarcado:\n\n📍 ${data.unidade}\n👨‍⚕️ *${data.profissional}*\n📅 ${data.data_consulta}\n⏰ ${data.hora_consulta}${footer}`;
    case "falta":
      return `${greeting}, *${data.paciente_nome}*.\n\nRegistramos sua ausência em ${data.data_consulta}. Procure a unidade para reagendar.${footer}`;
    case "lista_espera":
      return `${greeting}, *${data.paciente_nome}*! ${emoji}\n\nVocê está na lista de espera para *${data.profissional}* (${data.unidade}). Entraremos em contato.${footer}`;
    case "vaga_disponivel":
      return `${greeting}, *${data.paciente_nome}*! ${emoji}\n\nTemos vaga disponível com *${data.profissional}* (${data.unidade}). Procure a unidade para confirmar.${footer}`;
    case "teste":
      return `🧪 *Teste de Conexão WhatsApp*\n\nIntegração funcionando! ✅\n${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}${footer}`;
    default:
      return `${greeting}, *${data.paciente_nome}*.${footer}`;
  }
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

// ============================================================
// VALIDAÇÕES ANTI-BAN E COMPLIANCE
// ============================================================

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
  'promocao': { category: 'marketing' },
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

  // Janela de horário/dias
  const now = new Date();
  const brTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const dia = brTime.getDay();
  if (!cfg.dias_permitidos.includes(dia)) {
    return { ok: false, reason: "fora_dia_permitido", audit };
  }
  const hh = String(brTime.getHours()).padStart(2, "0") + ":" + String(brTime.getMinutes()).padStart(2, "0");
  if (hh < cfg.horario_inicio || hh > cfg.horario_fim) {
    return { ok: false, reason: "fora_horario_permitido", audit };
  }

  // Dados do paciente
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("whatsapp_opt_in_operational, whatsapp_opt_in_marketing, whatsapp_opt_in_waiting_list, whatsapp_has_prior_interaction")
    .eq("id", pacienteId)
    .maybeSingle();

  if (!paciente) return { ok: false, reason: "paciente_nao_encontrado", audit };

  audit.prior_interaction = paciente.whatsapp_has_prior_interaction;
  
  // Opt-out check via consents table
  const { data: optOut } = await supabase
    .from("whatsapp_consents")
    .select("id")
    .eq("telefone", telefone)
    .eq("tipo", "opt_out")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (optOut) return { ok: false, reason: "paciente_opt_out", audit };

  // Validação por Categoria
  const classification = EVENT_CLASSIFICATION[tipo] || { category: 'utility' };
  
  if (classification.category === 'marketing') {
    if (!paciente.whatsapp_opt_in_marketing) return { ok: false, reason: "sem_opt_in_marketing", audit };
  } else {
    // Utility
    if (!paciente.whatsapp_opt_in_operational) return { ok: false, reason: "sem_opt_in_operacional", audit };
    
    // Consentimento específico
    if (classification.requiresSpecificConsent && !paciente[classification.requiresSpecificConsent]) {
      return { ok: false, reason: `requer_consentimento_especifico_${classification.requiresSpecificConsent}`, audit };
    }
  }

  // Regra 24 horas
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: lastPatientMsg } = await supabase
    .from("whatsapp_consents")
    .select("criado_em")
    .eq("telefone", telefone)
    .eq("tipo", "interaction")
    .gte("criado_em", dayAgo)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  
  audit.window_24h = !!lastPatientMsg;

  // Se fora da janela de 24h e sem interação prévia, APENAS templates aprovados são permitidos.
  if (!audit.window_24h && !audit.prior_interaction) {
     // Trava anti-marketing em fluxo operacional
     const lowerMsg = mensagem.toLowerCase();
     const marketingKeywords = ["promoção", "oferta", "desconto", "aproveite", "imperdível", "compre", "venda"];
     if (marketingKeywords.some(k => lowerMsg.includes(k))) {
       return { ok: false, reason: "suspeita_marketing_fora_janela", audit };
     }
  }

  if (telefone) {
    // Limite diário
    const { count: countDia } = await supabase
      .from("notification_logs")
      .select("id", { count: "exact", head: true })
      .eq("destinatario_telefone", telefone)
      .eq("status", "enviado")
      .gte("criado_em", dayAgo);
    if ((countDia ?? 0) >= cfg.max_msgs_paciente_dia) {
      return { ok: false, reason: "limite_diario_excedido", audit };
    }

    // Limite semanal
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: countSem } = await supabase
      .from("notification_logs")
      .select("id", { count: "exact", head: true })
      .eq("destinatario_telefone", telefone)
      .eq("status", "enviado")
      .gte("criado_em", weekAgo);
    if ((countSem ?? 0) >= cfg.max_msgs_paciente_semana) {
      return { ok: false, reason: "limite_semanal_excedido", audit };
    }

    // Intervalo mínimo
    const intervalAgo = new Date(Date.now() - cfg.intervalo_minimo_minutos * 60 * 1000).toISOString();
    const { count: countInt } = await supabase
      .from("notification_logs")
      .select("id", { count: "exact", head: true })
      .eq("destinatario_telefone", telefone)
      .eq("status", "enviado")
      .gte("criado_em", intervalAgo);
    if ((countInt ?? 0) > 0) {
      return { ok: false, reason: "intervalo_minimo_nao_respeitado", audit };
    }
  }

  return { ok: true, audit };
}

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
    const validation = await validateSend(supabase, unitCfg, pacienteId, phone, tipo, message);
    
    if (!validation.ok) {
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
          agendamento_id
       });
       return new Response(JSON.stringify({ success: false, error: validation.reason, blocked: true }), { status: 200, headers: corsHeaders });
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
      resposta: result.body.substring(0, 500),
    });

    return new Response(JSON.stringify({ success: result.ok, error: result.ok ? null : result.body }), { status: 200, headers: corsHeaders });

  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders });
  }
});
