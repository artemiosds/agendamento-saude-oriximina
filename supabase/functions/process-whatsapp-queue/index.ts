import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const HARD_DELAY_MIN_SEC = 10;
const HARD_DELAY_MAX_SEC = 60;
const NORMAL_BATCH = 10;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Busca configurações globais
    const { data: config } = await supabase
      .from("clinica_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!config) {
      return new Response(JSON.stringify({ success: false, error: "Configuração não encontrada" }), { headers: corsHeaders });
    }

    const activeProvider = config.whatsapp_provider_active || 'evolution';
    const isUazapi = activeProvider === 'uazapigo';
    
    // Verifica se o provedor ativo está minimamente configurado
    if (isUazapi) {
      if (!config.uazapi_server_url || !config.uazapi_instance) {
        return new Response(JSON.stringify({ success: false, error: "UazapiGO não configurada adequadamente" }), { headers: corsHeaders });
      }
    } else {
      if (!config.evolution_base_url || !config.evolution_instance_name) {
        return new Response(JSON.stringify({ success: false, error: "Evolution API não configurada adequadamente" }), { headers: corsHeaders });
      }
    }

    // Busca lote de mensagens pendentes
    const nowIso = new Date().toISOString();
    const { data: pending, error: fetchError } = await supabase
      .from("whatsapp_queue")
      .select("*")
      .eq("status", "pendente")
      .lte("agendado_para", nowIso)
      .order("criado_em", { ascending: true })
      .limit(NORMAL_BATCH);

    if (fetchError) {
      console.error("[Queue] Error fetching pending messages:", fetchError);
      return new Response(JSON.stringify({ success: false, error: fetchError.message }), { headers: corsHeaders });
    }

    if (!pending || pending.length === 0) {
      console.log("[Queue] No pending messages to process.");
      return new Response(JSON.stringify({ success: true, processed: 0 }), { headers: corsHeaders });
    }

    let processed = 0;
    const functionName = isUazapi ? 'send-whatsapp-uazapigo' : 'send-whatsapp-evolution';

    for (const msg of pending) {
      // Delay anti-ban entre disparos
      const delay = Math.floor(Math.random() * (HARD_DELAY_MAX_SEC - HARD_DELAY_MIN_SEC + 1) + HARD_DELAY_MIN_SEC) * 1000;
      await new Promise(r => setTimeout(r, delay));

      // Dispara via respectiva function
      const { data: result, error } = await supabase.functions.invoke(functionName, {
        body: {
          telefone: msg.telefone,
          mensagem: msg.mensagem,
          tipo: msg.evento,
          agendamento_id: msg.agendamento_id
        }
      });

      if (error || !result?.success) {
        const tentativas = (msg.tentativas || 0) + 1;
        await supabase.from("whatsapp_queue").update({
          status: tentativas >= 3 ? "erro" : "pendente",
          tentativas,
          motivo_erro: error?.message || result?.error || "Erro desconhecido",
          processado_em: new Date().toISOString()
        }).eq("id", msg.id);
      } else {
        await supabase.from("whatsapp_queue").update({
          status: "enviado",
          processado_em: new Date().toISOString(),
          provider: activeProvider
        }).eq("id", msg.id);
        processed++;
      }
    }

    return new Response(JSON.stringify({ success: true, processed }), { headers: corsHeaders });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders });
  }
});
