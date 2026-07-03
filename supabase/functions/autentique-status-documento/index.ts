// Autentique - consulta status/URL do PDF assinado
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AUTENTIQUE_URL = "https://api.autentique.com.br/v2/graphql";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = Deno.env.get("AUTENTIQUE_API_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "AUTENTIQUE_API_TOKEN não configurado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { document_id, documento_gerado_id } = await req.json();
    if (!document_id) {
      return new Response(JSON.stringify({ error: "document_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const query = `
      query GetDocument($id: UUID!) {
        document(id: $id) {
          id name created_at
          files { original signed pades }
          signatures {
            public_id name email created_at
            signed { created_at ip }
            rejected { created_at reason }
            action { name }
          }
        }
      }`.replace(/\s+/g, " ").trim();

    const resp = await fetch(AUTENTIQUE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { id: document_id } }),
    });
    const json = await resp.json();
    if (!resp.ok || json.errors) {
      return new Response(JSON.stringify({ error: "autentique_error", details: json.errors || json }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const doc = json.data?.document;
    const allSigned = doc?.signatures?.every((s: any) => s.signed) ?? false;
    const anyRejected = doc?.signatures?.some((s: any) => s.rejected) ?? false;
    const status = anyRejected ? "rejected" : allSigned ? "signed" : "pending";

    // Atualiza registro se pedido
    if (documento_gerado_id) {
      try {
        const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data: prev } = await sb.from("documentos_gerados")
          .select("campos_formulario").eq("id", documento_gerado_id).maybeSingle();
        const prevCampos = (prev?.campos_formulario as Record<string, unknown>) || {};
        await sb.from("documentos_gerados").update({
          campos_formulario: {
            ...prevCampos,
            autentique: {
              ...(prevCampos as any).autentique,
              document_id: doc.id,
              status,
              signed_url: doc.files?.signed || doc.files?.pades || null,
              signers: doc.signatures,
              updated_at: new Date().toISOString(),
            },
          },
        }).eq("id", documento_gerado_id);
      } catch (e) { console.error(e); }
    }

    return new Response(JSON.stringify({ success: true, status, document: doc }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
