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

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55")) return digits;
  return "55" + digits;
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
  const header = `🏥 *${data.nome_clinica || "SMS Oriximiná"}*\n`;

  switch (tipo) {
    case "lembrete_24h":
      return `${header}\n⏰ *Lembrete de Consulta - Amanhã*\n\nOlá, *${data.paciente_nome}*!\n\nLembramos que você tem uma consulta agendada para *amanhã*.\n\n📅 *Data:* ${data.data_consulta}\n🕐 *Horário:* ${data.hora_consulta}\n👨‍⚕️ *Profissional:* ${data.profissional}\n🏥 *Unidade:* ${data.unidade}\n${data.especialidade ? `📋 *Especialidade:* ${data.especialidade}\n` : ""}\nPor favor, chegue com 15 minutos de antecedência.\nEm caso de impossibilidade, entre em contato para remarcar.\n\n_Mensagem automática - não responda._`;

    case "lembrete_1h":
      return `${header}\n⏰ *Sua consulta é em 1 hora!*\n\nOlá, *${data.paciente_nome}*!\n\nSua consulta é *daqui a 1 hora*.\n\n📅 *Data:* ${data.data_consulta}\n🕐 *Horário:* ${data.hora_consulta}\n👨‍⚕️ *Profissional:* ${data.profissional}\n🏥 *Unidade:* ${data.unidade}\n\nEstamos aguardando você!\n\n_Mensagem automática - não responda._`;

    case "confirmacao":
      return `${header}\n✅ *Agendamento Confirmado*\n\nOlá, *${data.paciente_nome}*!\n\nSeu agendamento foi confirmado com sucesso.\n\n📅 *Data:* ${data.data_consulta}\n🕐 *Horário:* ${data.hora_consulta}\n👨‍⚕️ *Profissional:* ${data.profissional}\n🏥 *Unidade:* ${data.unidade}\n${data.especialidade ? `📋 *Especialidade:* ${data.especialidade}\n` : ""}${data.observacoes ? `📝 *Obs:* ${data.observacoes}\n` : ""}\n_Mensagem automática - não responda._`;

    case "cancelamento":
      return `${header}\n❌ *Agendamento Cancelado*\n\nOlá, *${data.paciente_nome}*.\n\nInformamos que seu agendamento para o dia *${data.data_consulta}* às *${data.hora_consulta}* com *${data.profissional}* foi cancelado.\n\nPara reagendar, entre em contato com a recepção.\n\n_Mensagem automática - não responda._`;

    case "remarcacao":
      return `${header}\n🔄 *Agendamento Remarcado*\n\nOlá, *${data.paciente_nome}*!\n\nSeu agendamento foi remarcado.\n\n📅 *Nova Data:* ${data.data_consulta}\n🕐 *Novo Horário:* ${data.hora_consulta}\n👨‍⚕️ *Profissional:* ${data.profissional}\n🏥 *Unidade:* ${data.unidade}\n\n_Mensagem automática - não responda._`;

    case "teste":
      return `${header}\n🧪 *Teste de Conexão WhatsApp*\n\nEsta é uma mensagem de teste do sistema de notificações.\nSe você recebeu esta mensagem, a integração está funcionando corretamente! ✅\n\nData/hora: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;

    default:
      return `${header}\n📢 *Notificação*\n\nOlá, *${data.paciente_nome}*.\n\n📅 *Data:* ${data.data_consulta}\n🕐 *Horário:* ${data.hora_consulta}\n👨‍⚕️ *Profissional:* ${data.profissional}\n🏥 *Unidade:* ${data.unidade}\n\n_Mensagem automática - não responda._`;
  }
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
    const { agendamento_id, tipo, telefone_teste } = body;

    // Get Evolution API config
    const config = await getClinicaConfig(supabase);
    if (!config || !config.evolution_instance_name) {
      return new Response(
        JSON.stringify({ success: false, error: "Evolution API não configurada. Configure o nome da instância em Configurações." }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Test mode
    if (tipo === "teste" && telefone_teste) {
      const phone = formatPhone(telefone_teste);
      const message = buildMessage("teste", {
        paciente_nome: "Teste",
        data_consulta: new Date().toLocaleDateString("pt-BR"),
        hora_consulta: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        profissional: "Sistema",
        unidade: "Teste",
        nome_clinica: config.nome_clinica,
      });

      const resp = await fetch(
        `${config.evolution_base_url}/message/sendText/${config.evolution_instance_name}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: config.evolution_api_key },
          body: JSON.stringify({ number: phone, text: message }),
        }
      );

      const respBody = await resp.text();
      if (resp.ok) {
        return new Response(JSON.stringify({ success: true, message: "Mensagem de teste enviada!" }), { headers: corsHeaders });
      }
      return new Response(
        JSON.stringify({ success: false, error: `Falha ao enviar: ${respBody}` }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Normal notification mode
    if (!agendamento_id) {
      return new Response(
        JSON.stringify({ success: false, error: "agendamento_id é obrigatório" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Fetch appointment + patient
    const { data: ag, error: agErr } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("id", agendamento_id)
      .maybeSingle();

    if (agErr || !ag) {
      return new Response(
        JSON.stringify({ success: false, error: "Agendamento não encontrado" }),
        { status: 404, headers: corsHeaders }
      );
    }

    const { data: paciente } = await supabase
      .from("pacientes")
      .select("nome, telefone, email")
      .eq("id", ag.paciente_id)
      .maybeSingle();

    if (!paciente?.telefone) {
      // Log and return
      await supabase.from("notification_logs").insert({
        agendamento_id: ag.id,
        evento: tipo || "whatsapp",
        canal: "whatsapp_evolution",
        destinatario_telefone: "",
        status: "falha",
        erro: "Paciente sem telefone cadastrado",
        payload: { tipo, agendamento_id },
      });
      return new Response(
        JSON.stringify({ success: false, error: "Paciente sem telefone" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Get unit name
    let unidadeNome = "";
    if (ag.unidade_id) {
      const { data: u } = await supabase.from("unidades").select("nome").eq("id", ag.unidade_id).maybeSingle();
      unidadeNome = u?.nome || "";
    }

    const phone = formatPhone(paciente.telefone);
    const message = buildMessage(tipo || "confirmacao", {
      paciente_nome: paciente.nome || ag.paciente_nome,
      data_consulta: ag.data,
      hora_consulta: ag.hora,
      profissional: ag.profissional_nome,
      unidade: unidadeNome,
      nome_clinica: config.nome_clinica,
    });

    // Send via Evolution API
    const resp = await fetch(
      `${config.evolution_base_url}/message/sendText/${config.evolution_instance_name}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.evolution_api_key },
        body: JSON.stringify({ number: phone, text: message }),
      }
    );

    const respBody = await resp.text();
    const success = resp.ok;

    // Log to notification_logs
    await supabase.from("notification_logs").insert({
      agendamento_id: ag.id,
      evento: tipo || "whatsapp",
      canal: "whatsapp_evolution",
      destinatario_telefone: paciente.telefone,
      destinatario_email: paciente.email || "",
      payload: { tipo, agendamento_id, phone, message_preview: message.substring(0, 200) },
      status: success ? "enviado" : "erro",
      erro: success ? "" : respBody,
      resposta: respBody.substring(0, 500),
    });

    return new Response(
      JSON.stringify({ success, message: success ? "Notificação WhatsApp enviada!" : `Erro: ${respBody}` }),
      { status: success ? 200 : 500, headers: corsHeaders }
    );
  } catch (err) {
    console.error("[send-whatsapp-evolution] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
