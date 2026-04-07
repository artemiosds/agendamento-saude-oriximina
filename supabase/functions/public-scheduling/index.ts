import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

const BRAZIL_TIMEZONE = "America/Sao_Paulo";
const todayBrazilStr = () => new Intl.DateTimeFormat("sv-SE", { timeZone: BRAZIL_TIMEZONE }).format(new Date());

const addDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const url = new URL(req.url);
    let action = url.searchParams.get("action");

    if (!action && req.method === "POST") {
      try {
        const cloned = req.clone();
        const bodyJson = await cloned.json();
        if (bodyJson?.action) action = bodyJson.action;
      } catch {}
    }

    if (!action && req.method === "GET") action = "data";

    // Load online scheduling config
    const loadOnlineConfig = async () => {
      const { data } = await supabase
        .from("system_config")
        .select("configuracoes")
        .eq("id", "config_agendamento_online")
        .maybeSingle();
      return data?.configuracoes as {
        habilitado?: boolean;
        antecedencia_minima_dias?: number;
        antecedencia_maxima_dias?: number;
        limite_por_dia_profissional?: number;
        mensagem_confirmacao?: string;
        exigir_confirmacao_sms?: boolean;
        profissionais_bloqueados?: string[];
      } | null;
    };

    if (req.method === "GET" && action === "data") {
      const [unidadesRes, profRes, dispRes, bloqueiosRes, agendRes, configRes] = await Promise.all([
        supabase.from("unidades").select("id, nome, endereco, telefone, whatsapp, ativo").eq("ativo", true),
        supabase.from("funcionarios").select("id, nome, setor, unidade_id, sala_id, role, ativo, profissao, tempo_atendimento, pode_agendar_retorno").eq("role", "profissional").eq("ativo", true),
        supabase.from("disponibilidades").select("id, profissional_id, unidade_id, data_inicio, data_fim, dias_semana, hora_inicio, hora_fim, vagas_por_hora, vagas_por_dia, duracao_consulta"),
        supabase.from("bloqueios").select("id, data_inicio, data_fim, dia_inteiro, hora_inicio, hora_fim, profissional_id, unidade_id, tipo, titulo"),
        supabase.from("agendamentos").select("id, profissional_id, unidade_id, data, hora, status, origem").not("status", "in", "(cancelado,falta)"),
        loadOnlineConfig(),
      ]);

      const config = configRes || {};

      // Filter out blocked professionals
      let profs = profRes.data || [];
      if (config.profissionais_bloqueados?.length) {
        profs = profs.filter((p: any) => !config.profissionais_bloqueados!.includes(p.id));
      }

      return new Response(JSON.stringify({
        unidades: unidadesRes.data || [],
        profissionais: profs,
        disponibilidades: dispRes.data || [],
        bloqueios: bloqueiosRes.data || [],
        agendamentos: agendRes.data || [],
        config_agendamento_online: {
          habilitado: config.habilitado ?? true,
          antecedencia_minima_dias: config.antecedencia_minima_dias ?? 1,
          antecedencia_maxima_dias: config.antecedencia_maxima_dias ?? 30,
          limite_por_dia_profissional: config.limite_por_dia_profissional ?? 99,
          mensagem_confirmacao: config.mensagem_confirmacao ?? "",
          exigir_confirmacao_sms: config.exigir_confirmacao_sms ?? false,
        },
      }), { headers: corsHeaders });
    }

    if (req.method === "POST" && action === "check-patient") {
      const { cpf, telefone, email } = await req.json();
      const orFilters: string[] = [];
      if (cpf) orFilters.push(`cpf.eq.${cpf}`);
      if (telefone) orFilters.push(`telefone.eq.${telefone}`);
      if (email) orFilters.push(`email.ilike.${email}`);

      if (orFilters.length === 0) {
        return new Response(JSON.stringify({ found: false }), { headers: corsHeaders });
      }

      const { data } = await supabase.from("pacientes").select("id").or(orFilters.join(",")).limit(1);
      if (data && data.length > 0) {
        return new Response(JSON.stringify({ found: true, id: data[0].id }), { headers: corsHeaders });
      }
      return new Response(JSON.stringify({ found: false }), { headers: corsHeaders });
    }

    if (req.method === "POST" && action === "create-patient") {
      const patient = await req.json();
      if (!patient.id || !patient.nome) {
        return new Response(JSON.stringify({ error: "id and nome are required" }), { status: 400, headers: corsHeaders });
      }
      const { error } = await supabase.from("pacientes").insert({
        id: patient.id,
        nome: patient.nome,
        cpf: patient.cpf || "",
        cns: patient.cns || "",
        telefone: patient.telefone || "",
        data_nascimento: patient.data_nascimento || "",
        email: patient.email || "",
        observacoes: patient.observacoes || "",
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (req.method === "POST" && action === "create-appointment") {
      const ag = await req.json();
      if (!ag.id || !ag.paciente_id || !ag.profissional_id || !ag.data || !ag.hora) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: corsHeaders });
      }

      const todayStr = todayBrazilStr();

      // Enforce online scheduling config
      const config = await loadOnlineConfig();
      if (config) {
        if (config.habilitado === false) {
          return new Response(JSON.stringify({ error: "Agendamento online está desabilitado no momento." }), { status: 403, headers: corsHeaders });
        }

        if (config.profissionais_bloqueados?.includes(ag.profissional_id)) {
          return new Response(JSON.stringify({ error: "Este profissional não aceita agendamentos online." }), { status: 403, headers: corsHeaders });
        }

        const minDias = config.antecedencia_minima_dias ?? 1;
        const maxDias = config.antecedencia_maxima_dias ?? 30;
        const minDate = addDays(todayStr, minDias);
        const maxDate = addDays(todayStr, maxDias);

        if (ag.data < minDate) {
          return new Response(JSON.stringify({ error: `Agendamento deve ter pelo menos ${minDias} dia(s) de antecedência.` }), { status: 400, headers: corsHeaders });
        }
        if (ag.data > maxDate) {
          return new Response(JSON.stringify({ error: `Agendamento máximo de ${maxDias} dias à frente.` }), { status: 400, headers: corsHeaders });
        }

        // Check daily online limit per professional
        const limiteDia = config.limite_por_dia_profissional ?? 99;
        const { count } = await supabase
          .from("agendamentos")
          .select("*", { count: "exact", head: true })
          .eq("profissional_id", ag.profissional_id)
          .eq("data", ag.data)
          .eq("origem", "online")
          .not("status", "in", "(cancelado,falta)");
        if ((count || 0) >= limiteDia) {
          return new Response(JSON.stringify({ error: `Limite de agendamentos online atingido para este profissional nesta data.` }), { status: 400, headers: corsHeaders });
        }
      }

      if (ag.data <= todayStr) {
        return new Response(JSON.stringify({ error: "Online scheduling only allows future dates" }), { status: 400, headers: corsHeaders });
      }

      const { error } = await supabase.from("agendamentos").insert({
        id: ag.id,
        paciente_id: ag.paciente_id,
        paciente_nome: ag.paciente_nome || "",
        unidade_id: ag.unidade_id || "",
        sala_id: ag.sala_id || "",
        setor_id: ag.setor_id || "",
        profissional_id: ag.profissional_id,
        profissional_nome: ag.profissional_nome || "",
        data: ag.data,
        hora: ag.hora,
        status: "pendente",
        tipo: ag.tipo || "Consulta",
        observacoes: ag.observacoes || "",
        origem: "online",
        criado_por: "online",
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (req.method === "POST" && action === "update-patient-cns") {
      const { id, cns } = await req.json();
      if (!id || !cns) {
        return new Response(JSON.stringify({ error: "id and cns required" }), { status: 400, headers: corsHeaders });
      }
      await supabase.from("pacientes").update({ cns }).eq("id", id);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: corsHeaders });
  } catch (err) {
    console.error("public-scheduling error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
