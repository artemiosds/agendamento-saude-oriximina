import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

async function getConfig(supabase: any) {
  const { data } = await supabase
    .from("system_config")
    .select("configuracoes")
    .eq("id", "default")
    .maybeSingle();
  return data?.configuracoes || {};
}

async function sendNotification(
  supabase: any,
  config: any,
  payload: any
) {
  try {
    const { data: wsResult, error: wsError } = await supabase.functions.invoke("webhook-notify", {
      body: payload
    });
    
    if (!wsError && wsResult?.success) {
      console.log(`[reminders] Notification triggered successfully via webhook-notify for ${payload.paciente_nome}`);
      return true;
    } else {
      console.warn(`[reminders] webhook-notify reported issue:`, wsError || wsResult?.error);
      return false;
    }
  } catch (err) {
    console.error("[reminders] Error calling webhook-notify:", err);
    return false;
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
    const config = await getConfig(supabase);
    const now = new Date();

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const todayStr = now.toISOString().split("T")[0];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let sent24h = 0;
    let sent1h = 0;

    const { data: ag24h } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("data", tomorrowStr)
      .in("status", ["pendente", "confirmado"])
      .is("lembrete_24h_enviado_em", null);

    if (ag24h && ag24h.length > 0) {
      for (const ag of ag24h) {
        const { data: paciente } = await supabase
          .from("pacientes")
          .select("id, email, telefone")
          .eq("id", ag.paciente_id)
          .maybeSingle();

        if (!paciente?.email && !paciente?.telefone) continue;

        const unidade = ag.unidade_id
          ? (await supabase.from("unidades").select("nome").eq("id", ag.unidade_id).maybeSingle())?.data?.nome
          : "";

        const success = await sendNotification(supabase, config, {
          evento: "lembrete_24h",
          paciente_nome: ag.paciente_nome,
          paciente_id: ag.paciente_id,
          email: paciente.email || "",
          telefone: paciente.telefone || "",
          data_consulta: ag.data,
          hora_consulta: ag.hora,
          unidade: unidade || "",
          profissional: ag.profissional_nome,
          tipo_atendimento: ag.tipo,
          status_agendamento: ag.status,
          id_agendamento: ag.id,
        });

        if (success) {
          await supabase.from("agendamentos").update({ lembrete_24h_enviado_em: new Date().toISOString() }).eq("id", ag.id);
          sent24h++;
        }
      }
    }

    const { data: agToday } = await supabase
      .from("agendamentos")
      .select("*")
      .eq("data", todayStr)
      .in("status", ["pendente", "confirmado", "confirmado_chegada"])
      .is("lembrete_proximo_enviado_em", null);

    if (agToday && agToday.length > 0) {
      for (const ag of agToday) {
        const [hStr, mStr] = (ag.hora || "00:00").split(":");
        const agMinutes = parseInt(hStr) * 60 + parseInt(mStr);

        if (agMinutes >= currentMinutes + 50 && agMinutes <= currentMinutes + 70) {
          const { data: paciente } = await supabase
            .from("pacientes")
            .select("id, email, telefone")
            .eq("id", ag.paciente_id)
            .maybeSingle();

          if (!paciente?.email && !paciente?.telefone) continue;

          const unidade = ag.unidade_id
            ? (await supabase.from("unidades").select("nome").eq("id", ag.unidade_id).maybeSingle())?.data?.nome
            : "";

          const success = await sendNotification(supabase, config, {
            evento: "lembrete_1h",
            paciente_nome: ag.paciente_nome,
            paciente_id: ag.paciente_id,
            email: paciente.email || "",
            telefone: paciente.telefone || "",
            data_consulta: ag.data,
            hora_consulta: ag.hora,
            unidade: unidade || "",
            profissional: ag.profissional_nome,
            tipo_atendimento: ag.tipo,
            status_agendamento: ag.status,
            id_agendamento: ag.id,
          });

          if (success) {
            await supabase.from("agendamentos").update({ lembrete_proximo_enviado_em: new Date().toISOString() }).eq("id", ag.id);
            sent1h++;
          }
        }
      }
    }

    const message = `Lembretes processados: ${sent24h} de 24h, ${sent1h} de 1h`;
    return new Response(JSON.stringify({ success: true, message, sent24h, sent1h }), { status: 200, headers: corsHeaders });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMsg, success: false }), { status: 500, headers: corsHeaders });
  }
});