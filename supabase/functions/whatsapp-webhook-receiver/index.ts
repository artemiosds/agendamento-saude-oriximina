import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 13 && digits.startsWith("55")) return digits;
  if (digits.length === 12 && digits.startsWith("55")) return digits.slice(0, 4) + "9" + digits.slice(4);
  if (digits.length === 11) return "55" + digits;
  return null;
}

const OPT_OUT_KEYWORDS = ["sair", "parar", "remover", "descadastrar", "stop", "cancelar inscricao"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json();

    // Evolution API event format: { event, instance, data: { key: { remoteJid, fromMe }, message: {...} } }
    const evt = body?.event || body?.type;
    const fromMe = body?.data?.key?.fromMe ?? body?.fromMe ?? false;
    const remoteJid: string = body?.data?.key?.remoteJid || body?.remoteJid || "";
    const text: string = body?.data?.message?.conversation
      || body?.data?.message?.extendedTextMessage?.text
      || body?.message?.text
      || "";

    // Só processa mensagens RECEBIDAS (não as nossas)
    if (fromMe || !remoteJid) {
      return new Response(JSON.stringify({ ok: true, ignored: "not_incoming" }), { headers: corsHeaders });
    }

    const phone = normalizePhone(remoteJid.split("@")[0]);
    if (!phone) {
      return new Response(JSON.stringify({ ok: true, ignored: "invalid_phone" }), { headers: corsHeaders });
    }

    // Detecta paciente pelo telefone
    const { data: paciente } = await supabase
      .from("pacientes")
      .select("id, nome")
      .or(`telefone.eq.${phone},telefone.ilike.%${phone.slice(-9)}%`)
      .limit(1)
      .maybeSingle();

    const lowerText = text.trim().toLowerCase();
    const isOptOut = OPT_OUT_KEYWORDS.some((kw) => lowerText.includes(kw));

    await supabase.from("whatsapp_consents").insert({
      paciente_id: paciente?.id || "",
      telefone: phone,
      tipo: isOptOut ? "opt_out" : "interaction",
      origem: "webhook",
      detalhes: { event: evt, message_preview: text.substring(0, 200), paciente_nome: paciente?.nome || "" },
    });

    return new Response(
      JSON.stringify({ ok: true, registered: isOptOut ? "opt_out" : "interaction" }),
      { headers: corsHeaders },
    );
  } catch (err) {
    console.error("[whatsapp-webhook-receiver]", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Erro" }),
      { status: 500, headers: corsHeaders },
    );
  }
});
