import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

const WEBHOOK_URL = "https://hook.us2.make.com/hxkbabk6af5xbc79rxf9klp9m7wzf3l2";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();

    // payload expected: { acao, nome, telefone, email, data, hora, unidade, profissional, tipo_atendimento, observacoes? }
    const {
      acao,
      nome,
      telefone,
      email,
      data,
      hora,
      unidade,
      profissional,
      tipo_atendimento,
      observacoes,
    } = payload;

    if (!acao || !nome || !telefone) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: acao, nome, telefone" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const webhookPayload = {
      acao,
      nome,
      telefone,
      email: email || "",
      data: data || "",
      hora: hora || "",
      unidade: unidade || "",
      profissional: profissional || "",
      tipo_atendimento: tipo_atendimento || "",
      observacoes: observacoes || "",
      timestamp: new Date().toISOString(),
    };

    console.log("Sending webhook to Make.com:", JSON.stringify(webhookPayload));

    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookPayload),
    });

    const responseText = await res.text();
    console.log(`Make.com response [${res.status}]: ${responseText}`);

    if (!res.ok) {
      throw new Error(`Webhook failed [${res.status}]: ${responseText}`);
    }

    return new Response(
      JSON.stringify({ success: true, status: res.status }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
