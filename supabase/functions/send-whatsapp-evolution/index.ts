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

async function getClinicaConfig(supabase: ReturnType<typeof createClient>): Promise<ClinicaConfig | null> {
  const { data, error } = await supabase
    .from("clinica_config")
    .select("evolution_base_url, evolution_api_key, evolution_instance_name, nome_clinica")
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as ClinicaConfig;
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

function buildMessage(tipo: string, data: {
  paciente_nome: string;
  data_consulta: string;
  hora_consulta: string;
  profissional: string;
  unidade: string;
  especialidade?: string;
  observacoes?: string;
  nome_clinica: string;
}): string {
  const footer = `\n_Secretaria Municipal de Saúde_`;

  switch (tipo) {
    case "confirmacao":
      return `Olá, *${data.paciente_nome}*! 👋\n\nSeu atendimento foi agendado com sucesso.\n\n📍 Unidade: ${data.unidade}\n👨‍⚕️ Profissional: *${data.profissional}*\n📅 Data: ${data.data_consulta}\n⏰ Horário: ${data.hora_consulta}\n${data.especialidade ? `📋 Especialidade: ${data.especialidade}\n` : ""}${data.observacoes ? `📝 Obs: ${data.observacoes}\n` : ""}\nChegue com antecedência.${footer}`;

    case "lembrete_24h":
      return `Olá, *${data.paciente_nome}*! 👋\n\nLembrete do seu atendimento amanhã:\n\n📍 Unidade: ${data.unidade}\n👨‍⚕️ Profissional: *${data.profissional}*\n📅 ${data.data_consulta}\n⏰ ${data.hora_consulta}\n\nContamos com sua presença.${footer}`;

    case "lembrete_2h":
      return `Olá, *${data.paciente_nome}*! 👋\n\nSeu atendimento é hoje:\n\n📍 Unidade: ${data.unidade}\n👨‍⚕️ Profissional: *${data.profissional}*\n⏰ ${data.hora_consulta}\n\nAguardamos você.${footer}`;

    case "cancelamento":
      return `Olá, *${data.paciente_nome}*.\n\nSeu atendimento foi cancelado.\n\n📍 Unidade: ${data.unidade}\n👨‍⚕️ Profissional: *${data.profissional}*\n📅 ${data.data_consulta}\n⏰ ${data.hora_consulta}${data.observacoes ? `\n📝 ${data.observacoes}` : ""}${footer}`;

    case "remarcacao":
      return `Olá, *${data.paciente_nome}*! 👋\n\nSeu atendimento foi remarcado:\n\n📍 Unidade: ${data.unidade}\n👨‍⚕️ Profissional: *${data.profissional}*\n📅 ${data.data_consulta}\n⏰ ${data.hora_consulta}${footer}`;

    case "falta":
      return `Olá, *${data.paciente_nome}*.\n\nRegistramos sua ausência:\n\n📍 Unidade: ${data.unidade}\n👨‍⚕️ Profissional: *${data.profissional}*\n📅 ${data.data_consulta}\n⏰ ${data.hora_consulta}\n\nProcure a unidade para reagendar.${footer}`;

    case "lista_espera":
      return `Olá, *${data.paciente_nome}*! 👋\n\nVocê está na lista de espera para:\n\n👨‍⚕️ *${data.profissional}*\n📍 ${data.unidade}\n\nAguardando disponibilidade.${footer}`;

    case "vaga_disponivel":
      return `Olá, *${data.paciente_nome}*! 👋\n\nTemos vaga disponível:\n\n👨‍⚕️ *${data.profissional}*\n📍 ${data.unidade}\n\nProcure a unidade para confirmação.${footer}`;

    case "teste":
      return `🧪 *Teste de Conexão WhatsApp*\n\nEsta é uma mensagem de teste do sistema de notificações.\nSe você recebeu esta mensagem, a integração está funcionando corretamente! ✅\n\nData/hora: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}${footer}`;

    default:
      return `Olá, *${data.paciente_nome}*.\n\n📍 Unidade: ${data.unidade}\n👨‍⚕️ Profissional: *${data.profissional}*\n📅 ${data.data_consulta}\n⏰ ${data.hora_consulta}${footer}`;
  }
}

async function sendEvolutionMessage(
  config: ClinicaConfig,
  phone: string,
  message: string,
): Promise<{ ok: boolean; body: string }> {
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

async function sendWithRetry(
  config: ClinicaConfig,
  phone: string,
  message: string,
): Promise<{ ok: boolean; body: string }> {
  let result = await sendEvolutionMessage(config, phone, message);
  if (!result.ok) {
    // Retry once
    await new Promise((r) => setTimeout(r, 2000));
    result = await sendEvolutionMessage(config, phone, message);
  }
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const { agendamento_id, tipo, telefone_teste, telefone_direto, paciente_nome_direto, dados_direto } = body;

    const config = await getClinicaConfig(supabase);
    if (!config || !config.evolution_instance_name) {
      return new Response(
        JSON.stringify({ success: false, error: "Evolution API não configurada." }),
        { status: 400, headers: corsHeaders },
      );
    }

    // ── TEST MODE ──
    if (tipo === "teste" && telefone_teste) {
      const normalized = normalizePhone(telefone_teste);
      if (!normalized || !isValidPhone(normalized)) {
        await supabase.from("notification_logs").insert({
          evento: "teste", canal: "whatsapp_evolution",
          destinatario_telefone: telefone_teste, status: "erro",
          erro: `Telefone inválido: ${telefone_teste}`,
          payload: { tipo: "teste", telefone_teste },
        });
        return new Response(
          JSON.stringify({ success: false, error: `Telefone inválido: ${telefone_teste}` }),
          { status: 400, headers: corsHeaders },
        );
      }
      const message = buildMessage("teste", {
        paciente_nome: "Teste", data_consulta: "", hora_consulta: "",
        profissional: "Sistema", unidade: "Teste", nome_clinica: config.nome_clinica,
      });
      const result = await sendWithRetry(config, normalized, message);
      await supabase.from("notification_logs").insert({
        evento: "teste", canal: "whatsapp_evolution",
        destinatario_telefone: telefone_teste,
        status: result.ok ? "enviado" : "erro",
        erro: result.ok ? "" : result.body,
        payload: { tipo: "teste" },
        resposta: result.body.substring(0, 500),
      });
      return new Response(
        JSON.stringify({ success: result.ok, message: result.ok ? "Mensagem de teste enviada!" : `Falha: ${result.body}` }),
        { status: result.ok ? 200 : 500, headers: corsHeaders },
      );
    }

    // ── DIRECT MODE (lista_espera, vaga_disponivel, etc.) ──
    if (telefone_direto && paciente_nome_direto) {
      const normalized = normalizePhone(telefone_direto);
      if (!normalized || !isValidPhone(normalized)) {
        await supabase.from("notification_logs").insert({
          evento: tipo || "direto", canal: "whatsapp_evolution",
          destinatario_telefone: telefone_direto, status: "erro",
          erro: `Telefone inválido: ${telefone_direto}`,
          payload: body,
        });
        return new Response(
          JSON.stringify({ success: false, error: `Telefone inválido: ${telefone_direto}` }),
          { status: 400, headers: corsHeaders },
        );
      }
      const message = buildMessage(tipo || "confirmacao", {
        paciente_nome: paciente_nome_direto,
        data_consulta: dados_direto?.data_consulta || "",
        hora_consulta: dados_direto?.hora_consulta || "",
        profissional: dados_direto?.profissional || "",
        unidade: dados_direto?.unidade || "",
        especialidade: dados_direto?.especialidade || "",
        observacoes: dados_direto?.observacoes || "",
        nome_clinica: config.nome_clinica,
      });
      const result = await sendWithRetry(config, normalized, message);
      await supabase.from("notification_logs").insert({
        evento: tipo || "direto", canal: "whatsapp_evolution",
        destinatario_telefone: telefone_direto,
        status: result.ok ? "enviado" : "erro",
        erro: result.ok ? "" : result.body,
        payload: body,
        resposta: result.body.substring(0, 500),
      });
      return new Response(
        JSON.stringify({ success: result.ok, message: result.ok ? "Mensagem enviada!" : `Erro: ${result.body}` }),
        { status: result.ok ? 200 : 500, headers: corsHeaders },
      );
    }

    // ── APPOINTMENT MODE ──
    if (!agendamento_id) {
      return new Response(
        JSON.stringify({ success: false, error: "agendamento_id é obrigatório" }),
        { status: 400, headers: corsHeaders },
      );
    }

    const { data: ag, error: agErr } = await supabase
      .from("agendamentos").select("*").eq("id", agendamento_id).maybeSingle();
    if (agErr || !ag) {
      return new Response(
        JSON.stringify({ success: false, error: "Agendamento não encontrado" }),
        { status: 404, headers: corsHeaders },
      );
    }

    const { data: paciente } = await supabase
      .from("pacientes").select("nome, telefone, email").eq("id", ag.paciente_id).maybeSingle();
    if (!paciente?.telefone) {
      await supabase.from("notification_logs").insert({
        agendamento_id: ag.id, evento: tipo || "whatsapp", canal: "whatsapp_evolution",
        destinatario_telefone: "", status: "erro",
        erro: "Paciente sem telefone cadastrado", payload: { tipo, agendamento_id },
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
        JSON.stringify({ success: false, error: `Número inválido: ${paciente.telefone}` }),
        { status: 400, headers: corsHeaders },
      );
    }

    // Get unit name
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
      nome_clinica: config.nome_clinica,
    });

    const result = await sendWithRetry(config, phone, message);

    await supabase.from("notification_logs").insert({
      agendamento_id: ag.id, evento: tipo || "whatsapp", canal: "whatsapp_evolution",
      destinatario_telefone: paciente.telefone,
      destinatario_email: paciente.email || "",
      payload: { tipo, agendamento_id, phone, message_preview: message.substring(0, 200) },
      status: result.ok ? "enviado" : "erro",
      erro: result.ok ? "" : result.body,
      resposta: result.body.substring(0, 500),
    });

    return new Response(
      JSON.stringify({ success: result.ok, message: result.ok ? "Notificação WhatsApp enviada!" : `Erro: ${result.body}` }),
      { status: result.ok ? 200 : 500, headers: corsHeaders },
    );
  } catch (err) {
    console.error("[send-whatsapp-evolution] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: corsHeaders },
    );
  }
});
