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
  max_msgs_paciente_dia: 5,
  max_msgs_paciente_semana: 10,
  intervalo_minimo_minutos: 10,
  delay_aleatorio_min_seg: 5,
  delay_aleatorio_max_seg: 30,
  limite_global_por_minuto: 20,
  horario_inicio: "08:00",
  horario_fim: "18:00",
  dias_permitidos: [1, 2, 3, 4, 5],
  modo_estrito: true,
  respeitar_opt_out: true,
  bloquear_sem_interacao_previa: false,
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

function buildMessage(tipo: string, data: any): string {
  const footer = `\n_Secretaria Municipal de Saúde_`;
  const greeting = pick(GREETINGS);
  const emoji = pick(EMOJIS);

  switch (tipo) {
    case "confirmacao":
    case "agendamento_criado":
      return `${greeting}, *${data.paciente_nome}*! ${emoji}\n\nSeu atendimento foi agendado.\n\n📍 Unidade: ${data.unidade}\n👨‍⚕️ Profissional: *${data.profissional}*\n📅 Data: ${data.data_consulta}\n⏰ Horário: ${data.hora_consulta}\n${data.observacoes ? `📝 ${data.observacoes}\n` : ""}\nChegue com antecedência.${footer}`;
    case "lembrete_24h":
      return `${greeting}, *${data.paciente_nome}*! ${emoji}\n\nLembrete do seu atendimento amanhã:\n\n📍 ${data.unidade}\n👨‍⚕️ *${data.profissional}*\n📅 ${data.data_consulta}\n⏰ ${data.hora_consulta}\n\nContamos com sua presença.${footer}`;
    case "lembrete_2h":
      return `${greeting}, *${data.paciente_nome}*! ${emoji}\n\nSeu atendimento é hoje:\n\n📍 ${data.unidade}\n👨‍⚕️ *${data.profissional}*\n⏰ ${data.hora_consulta}${footer}`;
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
  const resp = await fetch(
    `${config.evolution_base_url}/message/sendText/${config.evolution_instance_name}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.evolution_api_key },
      body: JSON.stringify({ number: phone, text: message }),
    },
  );
  const body = await resp.text();
  return { ok: resp.ok, body };
}

// ============================================================
// VALIDAÇÕES ANTI-BAN
// ============================================================
function isAppointmentInPast(dataStr?: string, horaStr?: string): boolean {
  if (!dataStr) return false;
  let iso = dataStr;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataStr)) {
    const [d, m, y] = dataStr.split("/");
    iso = `${y}-${m}-${d}`;
  }
  const hh = (horaStr && /^\d{2}:\d{2}/.test(horaStr)) ? horaStr.slice(0, 5) : "23:59";
  const target = new Date(`${iso}T${hh}:00-03:00`);
  if (isNaN(target.getTime())) return false;
  return target.getTime() < Date.now();
}

async function validateSend(
  supabase: any,
  cfg: UnitConfig,
  pacienteId: string,
  telefone: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!cfg.whatsapp_ativo) return { ok: false, reason: "whatsapp_inativo_unidade" };

  // Janela de horário/dias
  const now = new Date();
  const brTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const dia = brTime.getDay();
  if (!cfg.dias_permitidos.includes(dia)) {
    return { ok: false, reason: "fora_dia_permitido" };
  }
  const hh = String(brTime.getHours()).padStart(2, "0") + ":" + String(brTime.getMinutes()).padStart(2, "0");
  if (hh < cfg.horario_inicio || hh > cfg.horario_fim) {
    return { ok: false, reason: "fora_horario_permitido" };
  }

  // Opt-out
  if (cfg.respeitar_opt_out && telefone) {
    const { data: optOut } = await supabase
      .from("whatsapp_consents")
      .select("id")
      .eq("telefone", telefone)
      .eq("tipo", "opt_out")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (optOut) return { ok: false, reason: "paciente_opt_out" };
  }

  // Interação prévia exigida
  if (cfg.bloquear_sem_interacao_previa && telefone) {
    const { data: hasInteraction } = await supabase
      .from("whatsapp_consents")
      .select("id")
      .eq("telefone", telefone)
      .in("tipo", ["interaction", "opt_in"])
      .limit(1)
      .maybeSingle();
    if (!hasInteraction) return { ok: false, reason: "sem_interacao_previa" };
  }

  if (telefone) {
    // Limite diário
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: countDia } = await supabase
      .from("notification_logs")
      .select("id", { count: "exact", head: true })
      .eq("destinatario_telefone", telefone)
      .eq("status", "enviado")
      .gte("criado_em", dayAgo);
    if ((countDia ?? 0) >= cfg.max_msgs_paciente_dia) {
      return { ok: false, reason: "limite_diario_excedido" };
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
      return { ok: false, reason: "limite_semanal_excedido" };
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
      return { ok: false, reason: "intervalo_minimo_nao_respeitado" };
    }
  }

  return { ok: true };
}

async function enqueue(supabase: any, payload: {
  paciente_id: string;
  paciente_nome: string;
  telefone: string;
  evento: string;
  mensagem: string;
  prioridade: "baixa" | "media" | "alta";
  unidade_id: string;
  agendamento_id?: string;
  metadados?: any;
}) {
  const { data, error } = await supabase
    .from("whatsapp_queue")
    .insert({
      ...payload,
      agendamento_id: payload.agendamento_id ?? "",
      metadados: payload.metadados ?? {},
      status: "pendente",
      agendado_para: new Date().toISOString(),
    })
    .select("id")
    .single();
  return { id: data?.id, error };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json();
    const { agendamento_id, tipo, telefone_teste, telefone_direto, paciente_nome_direto, dados_direto } = body;

    const config = await getClinicaConfig(supabase);
    if (!config?.evolution_instance_name) {
      return new Response(
        JSON.stringify({ success: false, error: "Evolution API não configurada." }),
        { status: 400, headers: corsHeaders },
      );
    }

    // ── TESTE: envia direto, sem fila/validação anti-ban ──
    if (tipo === "teste" && telefone_teste) {
      const normalized = normalizePhone(telefone_teste);
      if (!normalized || !isValidPhone(normalized)) {
        return new Response(
          JSON.stringify({ success: false, error: `Telefone inválido: ${telefone_teste}` }),
          { status: 400, headers: corsHeaders },
        );
      }
      const message = buildMessage("teste", { paciente_nome: "Teste" });
      const result = await sendEvolutionMessage(config, normalized, message);
      await supabase.from("notification_logs").insert({
        evento: "teste", canal: "whatsapp_evolution",
        destinatario_telefone: telefone_teste,
        status: result.ok ? "enviado" : "erro",
        erro: result.ok ? "" : result.body,
        payload: { tipo: "teste" },
        resposta: result.body.substring(0, 500),
      });
      return new Response(
        JSON.stringify({ success: result.ok, message: result.ok ? "Teste enviado!" : `Falha: ${result.body}` }),
        { status: result.ok ? 200 : 500, headers: corsHeaders },
      );
    }

    // ── DIRETO (sem agendamento) → enfileira ──
    if (telefone_direto && paciente_nome_direto) {
      const normalized = normalizePhone(telefone_direto);
      if (!normalized || !isValidPhone(normalized)) {
        return new Response(
          JSON.stringify({ success: false, error: `Telefone inválido: ${telefone_direto}` }),
          { status: 400, headers: corsHeaders },
        );
      }
      const unidadeId = dados_direto?.unidade_id || "";
      const cfg = await getUnitConfig(supabase, unidadeId);
      const validation = await validateSend(supabase, cfg, "", normalized);
      if (!validation.ok) {
        await supabase.from("notification_logs").insert({
          evento: tipo || "direto", canal: "whatsapp_evolution",
          destinatario_telefone: telefone_direto, status: "bloqueado",
          erro: validation.reason, payload: body,
        });
        return new Response(
          JSON.stringify({ success: false, blocked: true, reason: validation.reason }),
          { status: 200, headers: corsHeaders },
        );
      }
      const message = buildMessage(tipo || "confirmacao", {
        paciente_nome: paciente_nome_direto,
        data_consulta: dados_direto?.data_consulta || "",
        hora_consulta: dados_direto?.hora_consulta || "",
        profissional: dados_direto?.profissional || "",
        unidade: dados_direto?.unidade || "",
        observacoes: dados_direto?.observacoes || "",
      });
      const { id, error } = await enqueue(supabase, {
        paciente_id: "",
        paciente_nome: paciente_nome_direto,
        telefone: normalized,
        evento: tipo || "confirmacao",
        mensagem: message,
        prioridade: tipo === "vaga_disponivel" ? "alta" : "media",
        unidade_id: unidadeId,
        metadados: dados_direto,
      });
      return new Response(
        JSON.stringify({ success: !error, queued: true, id }),
        { status: error ? 500 : 200, headers: corsHeaders },
      );
    }

    // ── AGENDAMENTO → enfileira ──
    if (!agendamento_id) {
      return new Response(
        JSON.stringify({ success: false, error: "agendamento_id é obrigatório" }),
        { status: 400, headers: corsHeaders },
      );
    }

    const { data: ag } = await supabase
      .from("agendamentos").select("*").eq("id", agendamento_id).maybeSingle();
    if (!ag) {
      return new Response(
        JSON.stringify({ success: false, error: "Agendamento não encontrado" }),
        { status: 404, headers: corsHeaders },
      );
    }

    const { data: paciente } = await supabase
      .from("pacientes").select("id, nome, telefone, email").eq("id", ag.paciente_id).maybeSingle();
    if (!paciente?.telefone) {
      await supabase.from("notification_logs").insert({
        agendamento_id: ag.id, evento: tipo || "whatsapp", canal: "whatsapp_evolution",
        destinatario_telefone: "", status: "erro",
        erro: "Paciente sem telefone", payload: { tipo, agendamento_id },
      });
      return new Response(
        JSON.stringify({ success: false, error: "Paciente sem telefone" }),
        { status: 400, headers: corsHeaders },
      );
    }

    const phone = normalizePhone(paciente.telefone);
    if (!phone || !isValidPhone(phone)) {
      await supabase.from("notification_logs").insert({
        agendamento_id: ag.id, evento: tipo || "whatsapp", canal: "whatsapp_evolution",
        destinatario_telefone: paciente.telefone, status: "erro",
        erro: `Telefone inválido: ${paciente.telefone}`, payload: { tipo, agendamento_id },
      });
      return new Response(
        JSON.stringify({ success: false, error: "Telefone inválido" }),
        { status: 400, headers: corsHeaders },
      );
    }

    const cfg = await getUnitConfig(supabase, ag.unidade_id);
    const validation = await validateSend(supabase, cfg, paciente.id, phone);
    if (!validation.ok) {
      await supabase.from("notification_logs").insert({
        agendamento_id: ag.id, evento: tipo || "whatsapp", canal: "whatsapp_evolution",
        destinatario_telefone: paciente.telefone, status: "bloqueado",
        erro: validation.reason, payload: { tipo, agendamento_id },
      });
      return new Response(
        JSON.stringify({ success: false, blocked: true, reason: validation.reason }),
        { status: 200, headers: corsHeaders },
      );
    }

    let unidadeNome = "";
    if (ag.unidade_id) {
      const { data: u } = await supabase.from("unidades").select("nome").eq("id", ag.unidade_id).maybeSingle();
      unidadeNome = u?.nome || "";
    }

    const message = buildMessage(tipo || "confirmacao", {
      paciente_nome: paciente.nome || ag.paciente_nome,
      data_consulta: ag.data,
      hora_consulta: ag.hora,
      profissional: ag.profissional_nome,
      unidade: unidadeNome,
    });

    const prioridade = tipo === "lembrete_2h" ? "alta" : tipo === "lembrete_24h" ? "media" : "media";

    const { id, error } = await enqueue(supabase, {
      paciente_id: paciente.id,
      paciente_nome: paciente.nome || ag.paciente_nome,
      telefone: phone,
      evento: tipo || "confirmacao",
      mensagem: message,
      prioridade,
      unidade_id: ag.unidade_id,
      agendamento_id: ag.id,
    });

    return new Response(
      JSON.stringify({ success: !error, queued: true, id }),
      { status: error ? 500 : 200, headers: corsHeaders },
    );
  } catch (err) {
    console.error("[send-whatsapp-evolution]", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Erro" }),
      { status: 500, headers: corsHeaders },
    );
  }
});
