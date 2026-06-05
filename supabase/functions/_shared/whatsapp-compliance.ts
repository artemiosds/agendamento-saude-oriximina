export interface UnitConfig {
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

export const DEFAULT_UNIT_CONFIG: UnitConfig = {
  whatsapp_ativo: true,
  max_msgs_paciente_dia: 200,
  max_msgs_paciente_semana: 600,
  intervalo_minimo_minutos: 6, // 6 minutos
  delay_aleatorio_min_seg: 5,
  delay_aleatorio_max_seg: 15,
  limite_global_por_minuto: 20,
  horario_inicio: "08:00",
  horario_fim: "18:00",
  dias_permitidos: [0, 1, 2, 3, 4, 5, 6], // Todos os dias
  modo_estrito: true,
  respeitar_opt_out: true,
  bloquear_sem_interacao_previa: false, // Permitir envio sem interação prévia se tiver opt-in
};

export const EVENT_CLASSIFICATION: Record<
  string,
  { category: "utility" | "marketing"; requiresSpecificConsent?: string }
> = {
  agendamento_criado: { category: "utility" },
  confirmacao: { category: "utility" },
  lembrete_24h: { category: "utility" },
  lembrete_2h: { category: "utility" },
  lembrete_1h: { category: "utility" },
  cancelamento: { category: "utility" },
  remarcacao: { category: "utility" },
  falta: { category: "utility" },
  lista_espera: { category: "utility", requiresSpecificConsent: "whatsapp_opt_in_waiting_list" },
  vaga_disponivel: { category: "utility", requiresSpecificConsent: "whatsapp_opt_in_waiting_list" },
  marketing: { category: "marketing" },
  promocao: { category: "marketing" },
};

export function normalizePhone(raw: string): string | null {
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

export function isValidPhone(phone: string): boolean {
  return phone.length === 13 && phone.startsWith("55") && /^\d+$/.test(phone);
}

export async function validateSend(
  supabase: any,
  cfg: UnitConfig,
  pacienteId: string,
  telefone: string,
  tipo: string,
  mensagem: string,
): Promise<{ ok: boolean; reason?: string; audit: any }> {
  const audit: any = {
    opt_in_status: "unknown",
    prior_interaction: false,
    window_24h: false,
    category: EVENT_CLASSIFICATION[tipo]?.category || "utility",
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
  let pacienteData = null;
  if (pacienteId) {
    const { data: paciente } = await supabase
      .from("pacientes")
      .select(
        "whatsapp_opt_in_operational, whatsapp_opt_in_marketing, whatsapp_opt_in_waiting_list, whatsapp_has_prior_interaction",
      )
      .eq("id", pacienteId)
      .maybeSingle();
    pacienteData = paciente;
  }

  if (pacienteData) {
    audit.prior_interaction = pacienteData.whatsapp_has_prior_interaction;
  }

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
  const classification = EVENT_CLASSIFICATION[tipo] || { category: "utility" };

  // No pacienteData, opt-ins para utility (operacional) são true por padrão (null = true)
  // Marketing continua exigindo opt-in específico
  const isMarketing = classification.category === "marketing";
  const hasMarketingOptIn = pacienteData?.whatsapp_opt_in_marketing === true;
  const hasOperationalOptIn = pacienteData ? pacienteData.whatsapp_opt_in_operational !== false : true;
  const hasSpecificConsent = classification.requiresSpecificConsent
    ? pacienteData?.[classification.requiresSpecificConsent] === true
    : true;

  if (isMarketing && !hasMarketingOptIn) {
    return { ok: false, reason: "sem_opt_in_marketing", audit };
  }

  if (!isMarketing && !hasOperationalOptIn) {
    return { ok: false, reason: "sem_opt_in_operacional", audit };
  }

  if (classification.requiresSpecificConsent && !hasSpecificConsent) {
    return { ok: false, reason: `requer_consentimento_especifico_${classification.requiresSpecificConsent}`, audit };
  }

  // Define o status do opt-in no log
  if (pacienteData) {
    if (pacienteData.whatsapp_opt_in_operational === null || pacienteData.whatsapp_opt_in_operational === undefined) {
      audit.opt_in_status = "regra_padrao_unidade";
      audit.authorized_by_default_rule = true;
    } else {
      audit.opt_in_status = "manual_opt_in";
    }
  } else {
    audit.opt_in_status = "paciente_nao_encontrado_regra_padrao";
    audit.authorized_by_default_rule = true;
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
  if (!audit.window_24h && !audit.prior_interaction && cfg.bloquear_sem_interacao_previa) {
    return { ok: false, reason: "bloqueio_sem_interacao_previa", audit };
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

export const GREETINGS = ["Olá", "Oi", "Bom dia", "Boa tarde"];
export const EMOJIS = ["👋", "😊", "🙂", "✨"];
export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function buildMessage(supabase: any, tipo: string, data: any, unidadeId: string): Promise<string> {
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
    case "lembrete_1h":
      return `${greeting}, *${data.paciente_nome}*! ${emoji}\n\nSeu atendimento é em aproximadamente 1 hora:\n\n📍 ${data.unidade}\n👨‍⚕️ *${data.profissional}*\n⏰ Horário: ${data.hora_consulta}${footer}`;
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
