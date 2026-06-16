// ============================================================
// whatsapp-health-snapshot
// Snapshot diário consolidado de saúde do WhatsApp por provider.
// Roda via cron diário, mas também pode ser invocado on-demand
// pela UI (aba Saúde do número).
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  try {
    const today = new Date().toISOString().slice(0, 10);
    const startIso = `${today}T00:00:00Z`;
    const endIso = `${today}T23:59:59Z`;

    const providers = ["evolution", "uazapigo"];
    const results: any[] = [];

    for (const provider of providers) {
      const { data: rows } = await supabase
        .from("whatsapp_queue")
        .select("status, delivered_at, read_at, error_code")
        .eq("provider", provider)
        .gte("criado_em", startIso)
        .lte("criado_em", endIso);

      const total = rows?.length || 0;
      const enviadas = rows?.filter((r: any) => ["enviado","entregue","lido"].includes(r.status)).length || 0;
      const entregues = rows?.filter((r: any) => ["entregue","lido"].includes(r.status)).length || 0;
      const lidas = rows?.filter((r: any) => r.status === "lido").length || 0;
      const falhas = rows?.filter((r: any) => r.status === "erro").length || 0;
      const pendentes = rows?.filter((r: any) => ["pendente","processando"].includes(r.status)).length || 0;
      const pausadas = rows?.filter((r: any) => r.status === "bloqueado").length || 0;
      const rejeicoes = rows?.filter((r: any) => (r.error_code || "").includes("template")).length || 0;

      const { count: respostas } = await supabase
        .from("whatsapp_inbound_messages")
        .select("*", { count: "exact", head: true })
        .eq("provider", provider)
        .gte("recebido_em", startIso)
        .lte("recebido_em", endIso);

      const { count: confirmacoes } = await supabase
        .from("whatsapp_inbound_messages")
        .select("*", { count: "exact", head: true })
        .eq("provider", provider)
        .eq("intent", "confirmar")
        .gte("recebido_em", startIso)
        .lte("recebido_em", endIso);

      const taxa_erro = total > 0 ? Number(((falhas / total) * 100).toFixed(2)) : 0;
      const taxa_resposta = enviadas > 0 ? Number((((respostas || 0) / enviadas) * 100).toFixed(2)) : 0;
      const taxa_confirmacao = (respostas || 0) > 0 ? Number((((confirmacoes || 0) / (respostas || 1)) * 100).toFixed(2)) : 0;

      // Status conexão
      const { data: conn } = await supabase
        .from("whatsapp_connection_status")
        .select("status, fila_pausada_ate")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const status_conexao = conn?.fila_pausada_ate && new Date(conn.fila_pausada_ate).getTime() > Date.now()
        ? "pausada"
        : (conn?.status || "desconhecido");

      const snapshot = {
        snapshot_date: today,
        provider,
        unidade_id: "",
        enviadas, entregues, lidas, falhas,
        respostas: respostas || 0,
        rejeicoes_template: rejeicoes,
        pendentes, pausadas,
        taxa_erro, taxa_resposta, taxa_confirmacao,
        status_conexao,
        details: { total },
      };

      await supabase.from("whatsapp_health_snapshots").upsert(snapshot, { onConflict: "snapshot_date,provider,unidade_id" });
      results.push(snapshot);
    }

    return new Response(JSON.stringify({ ok: true, snapshots: results }), { headers: corsHeaders });
  } catch (err: any) {
    console.error("[whatsapp-health-snapshot] erro:", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), { status: 500, headers: corsHeaders });
  }
});
