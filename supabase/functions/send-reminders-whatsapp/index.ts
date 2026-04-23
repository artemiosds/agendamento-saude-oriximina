import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const TZ = "America/Sao_Paulo";

/**
 * Returns the current wall-clock time in America/Sao_Paulo as a Date object
 * whose UTC components match Brasilia local time. Use ONLY for extracting
 * date/hour parts (toISOString().slice(0,10), getUTCHours, etc).
 */
function nowInBrasilia(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")));
}

/** Builds a Date representing the appointment's wall-clock instant in Brasilia. */
function appointmentInstant(dataStr: string, horaStr: string): Date | null {
  if (!dataStr) return null;
  const [y, m, d] = dataStr.split("-").map(Number);
  const [hh = 0, mm = 0] = (horaStr || "00:00").split(":").map(Number);
  if (!y || !m || !d) return null;
  // Same trick: store Brasilia wall-clock in UTC fields for direct subtraction with nowInBrasilia()
  return new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const results = {
    lembrete_24h: 0,
    lembrete_2h: 0,
    skipped_out_of_window: 0,
    errors: 0,
    checked: 0,
  };

  try {
    const now = nowInBrasilia();
    const todayStr = now.toISOString().slice(0, 10);
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    // Fetch candidates for both windows: today and tomorrow only.
    const { data: candidates } = await supabase
      .from("agendamentos")
      .select("id, paciente_id, paciente_nome, profissional_nome, data, hora, unidade_id, status, lembrete_24h_enviado_em, lembrete_proximo_enviado_em")
      .in("data", [todayStr, tomorrowStr])
      .in("status", ["confirmado", "pendente"]);

    if (!candidates || candidates.length === 0) {
      console.log("[send-reminders-whatsapp]", JSON.stringify({ now: now.toISOString(), todayStr, tomorrowStr, results }));
      return new Response(JSON.stringify({ success: true, results }), { headers: corsHeaders });
    }

    results.checked = candidates.length;

    for (const ag of candidates) {
      const apptInstant = appointmentInstant(ag.data, ag.hora);
      if (!apptInstant) continue;

      const diffMs = apptInstant.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      // Skip past appointments
      if (diffHours <= 0) continue;

      // ── 24H WINDOW: send when remaining time is between 23h and 24.5h ──
      if (!ag.lembrete_24h_enviado_em && diffHours >= 23 && diffHours <= 24.5) {
        try {
          const { error } = await supabase.functions.invoke("send-whatsapp-evolution", {
            body: { agendamento_id: ag.id, tipo: "lembrete_24h" },
          });
          console.log("[reminder][24h]", JSON.stringify({
            agendamento_id: ag.id,
            consulta: `${ag.data} ${ag.hora}`,
            enviado_em: now.toISOString(),
            diff_horas: diffHours.toFixed(2),
            ok: !error,
          }));
          if (!error) {
            await supabase.from("agendamentos")
              .update({ lembrete_24h_enviado_em: new Date().toISOString() })
              .eq("id", ag.id);
            results.lembrete_24h++;
          } else {
            results.errors++;
          }
        } catch (e) {
          console.error("[reminder][24h][error]", e);
          results.errors++;
        }
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      // ── 2H WINDOW: send when remaining time is between 1.5h and 2.5h ──
      if (!ag.lembrete_proximo_enviado_em && diffHours >= 1.5 && diffHours <= 2.5) {
        try {
          const { error } = await supabase.functions.invoke("send-whatsapp-evolution", {
            body: { agendamento_id: ag.id, tipo: "lembrete_2h" },
          });
          console.log("[reminder][2h]", JSON.stringify({
            agendamento_id: ag.id,
            consulta: `${ag.data} ${ag.hora}`,
            enviado_em: now.toISOString(),
            diff_horas: diffHours.toFixed(2),
            ok: !error,
          }));
          if (!error) {
            await supabase.from("agendamentos")
              .update({ lembrete_proximo_enviado_em: new Date().toISOString() })
              .eq("id", ag.id);
            results.lembrete_2h++;
          } else {
            results.errors++;
          }
        } catch (e) {
          console.error("[reminder][2h][error]", e);
          results.errors++;
        }
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      results.skipped_out_of_window++;
    }

    console.log("[send-reminders-whatsapp][summary]", JSON.stringify({ now: now.toISOString(), results }));
    return new Response(JSON.stringify({ success: true, results }), { headers: corsHeaders });
  } catch (err) {
    console.error("[send-reminders-whatsapp] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Erro" }),
      { status: 500, headers: corsHeaders },
    );
  }
});
