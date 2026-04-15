import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const results = { lembrete_24h: 0, lembrete_2h: 0, errors: 0 };

  try {
    // Current time in Brasilia (UTC-3)
    const now = new Date();
    const brasiliaOffset = -3 * 60;
    const brasiliaTime = new Date(now.getTime() + (brasiliaOffset + now.getTimezoneOffset()) * 60000);

    const todayStr = brasiliaTime.toISOString().slice(0, 10);
    const tomorrowDate = new Date(brasiliaTime);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = tomorrowDate.toISOString().slice(0, 10);

    const currentHour = brasiliaTime.getHours();
    const currentMinute = brasiliaTime.getMinutes();
    const currentTotalMinutes = currentHour * 60 + currentMinute;

    // ── 24H REMINDERS: appointments tomorrow, not yet reminded ──
    const { data: tomorrow_ags } = await supabase
      .from("agendamentos")
      .select("id, paciente_id, paciente_nome, profissional_nome, data, hora, unidade_id, status")
      .eq("data", tomorrowStr)
      .in("status", ["confirmado", "pendente"])
      .is("lembrete_24h_enviado_em", null);

    if (tomorrow_ags && tomorrow_ags.length > 0) {
      for (const ag of tomorrow_ags) {
        try {
          const { error } = await supabase.functions.invoke("send-whatsapp-evolution", {
            body: { agendamento_id: ag.id, tipo: "lembrete_24h" },
          });
          if (!error) {
            await supabase.from("agendamentos")
              .update({ lembrete_24h_enviado_em: new Date().toISOString() })
              .eq("id", ag.id);
            results.lembrete_24h++;
          } else {
            results.errors++;
          }
        } catch {
          results.errors++;
        }
        // Small delay to avoid rate limiting
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    // ── 2H REMINDERS: appointments today within next 2h, not yet reminded ──
    const { data: today_ags } = await supabase
      .from("agendamentos")
      .select("id, paciente_id, paciente_nome, profissional_nome, data, hora, unidade_id, status")
      .eq("data", todayStr)
      .in("status", ["confirmado", "pendente"])
      .is("lembrete_proximo_enviado_em", null);

    if (today_ags && today_ags.length > 0) {
      for (const ag of today_ags) {
        // Parse appointment time
        const [h, m] = (ag.hora || "00:00").split(":").map(Number);
        const agMinutes = h * 60 + (m || 0);
        const diff = agMinutes - currentTotalMinutes;

        // Send if appointment is between 90min and 150min from now (around 2h window)
        if (diff >= 90 && diff <= 150) {
          try {
            const { error } = await supabase.functions.invoke("send-whatsapp-evolution", {
              body: { agendamento_id: ag.id, tipo: "lembrete_2h" },
            });
            if (!error) {
              await supabase.from("agendamentos")
                .update({ lembrete_proximo_enviado_em: new Date().toISOString() })
                .eq("id", ag.id);
              results.lembrete_2h++;
            } else {
              results.errors++;
            }
          } catch {
            results.errors++;
          }
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    console.log("[send-reminders-whatsapp] Results:", results);
    return new Response(JSON.stringify({ success: true, results }), { headers: corsHeaders });
  } catch (err) {
    console.error("[send-reminders-whatsapp] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Erro" }),
      { status: 500, headers: corsHeaders },
    );
  }
});
