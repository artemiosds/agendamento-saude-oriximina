// Autentique webhook receiver (público, sem JWT)
// Documentação: https://docs.autentique.com.br/api/webhooks
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await req.json();
    console.log("[autentique-webhook] payload:", JSON.stringify(payload));

    // Autentique envia: { event, document: {id, ...}, signatures: [...] } (formato pode variar)
    const documentId =
      payload?.document?.id ||
      payload?.document_id ||
      payload?.data?.document?.id ||
      null;
    const event = payload?.event || payload?.type || "unknown";

    if (!documentId) {
      return new Response(JSON.stringify({ ok: true, ignored: "sem_document_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Log em notification_logs
    await sb.from("notification_logs").insert({
      canal: "webhook",
      evento: `autentique_${event}`,
      payload,
      status: "recebido",
    });

    // Localiza documento_gerado com este document_id em campos_formulario.autentique.document_id
    const { data: docs } = await sb
      .from("documentos_gerados")
      .select("id, campos_formulario")
      .filter("campos_formulario->autentique->>document_id", "eq", documentId)
      .limit(1);

    if (docs && docs.length > 0) {
      const target = docs[0];
      const prev = (target.campos_formulario as Record<string, unknown>) || {};
      const prevAut = ((prev as any).autentique) || {};

      // Consulta status atualizado
      const token = Deno.env.get("AUTENTIQUE_API_TOKEN");
      let newStatus = event.includes("signed") ? "signed"
        : event.includes("rejected") ? "rejected"
        : prevAut.status || "pending";
      let signedUrl: string | null = prevAut.signed_url || null;
      let signatures = prevAut.signers || [];

      if (token) {
        try {
          const query = `query($id: UUID!){ document(id:$id){ id files{signed pades} signatures{public_id name email signed{created_at ip} rejected{created_at reason} action{name}} } }`;
          const r = await fetch("https://api.autentique.com.br/v2/graphql", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ query, variables: { id: documentId } }),
          });
          const j = await r.json();
          const d = j?.data?.document;
          if (d) {
            signatures = d.signatures || [];
            signedUrl = d.files?.signed || d.files?.pades || null;
            const allSigned = signatures.every((s: any) => s.signed);
            const anyRejected = signatures.some((s: any) => s.rejected);
            newStatus = anyRejected ? "rejected" : allSigned ? "signed" : "pending";
          }
        } catch (e) { console.error("[autentique-webhook] fetch status", e); }
      }

      await sb.from("documentos_gerados")
        .update({
          campos_formulario: {
            ...prev,
            autentique: {
              ...prevAut,
              document_id: documentId,
              status: newStatus,
              signed_url: signedUrl,
              signers: signatures,
              last_event: event,
              updated_at: new Date().toISOString(),
            },
          },
        })
        .eq("id", target.id);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[autentique-webhook] erro:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
