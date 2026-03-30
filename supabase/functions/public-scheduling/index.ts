import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
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
    
    // Support action in POST body as fallback
    if (!action && req.method === "POST") {
      try {
        const cloned = req.clone();
        const bodyJson = await cloned.json();
        if (bodyJson?.action) action = bodyJson.action;
      } catch { /* no body or invalid JSON */ }
    }
    
    // Default to "data" for GET requests without action
    if (!action && req.method === "GET") action = "data";

    if (req.method === "GET" && action === "data") {
      // Return public scheduling data with minimal fields
      const [unidadesRes, profRes, dispRes, bloqueiosRes, agendRes] = await Promise.all([
        supabase.from("unidades").select("id, nome, endereco, telefone, whatsapp, ativo").eq("ativo", true),
        supabase.from("funcionarios").select("id, nome, setor, unidade_id, sala_id, role, ativo, profissao, tempo_atendimento, pode_agendar_retorno").eq("role", "profissional").eq("ativo", true),
        supabase.from("disponibilidades").select("*"),
        supabase.from("bloqueios").select("*"),
        supabase.from("agendamentos").select("id, profissional_id, unidade_id, data, hora, status").not("status", "in", "(cancelado,falta)"),
      ]);

      return new Response(JSON.stringify({
        unidades: unidadesRes.data || [],
        profissionais: profRes.data || [],
        disponibilidades: dispRes.data || [],
        bloqueios: bloqueiosRes.data || [],
        agendamentos: agendRes.data || [],
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
