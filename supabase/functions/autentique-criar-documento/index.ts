// Autentique - criar documento e enviar para assinatura
// GraphQL v2 - https://docs.autentique.com.br/api/
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AUTENTIQUE_URL = "https://api.autentique.com.br/v2/graphql";

interface Signer {
  email: string;
  name: string;
  action?: "SIGN" | "APPROVE" | "ACKNOWLEDGE";
}

interface Body {
  documento_gerado_id?: string;
  nome: string;
  file_base64: string; // conteúdo do PDF em base64 (sem prefixo data:)
  filename?: string;   // ex.: "termo.pdf"
  message?: string;
  signers: Signer[];
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^,]+,/, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = Deno.env.get("AUTENTIQUE_API_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "AUTENTIQUE_API_TOKEN não configurado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;
    if (!body?.nome || !body?.file_base64 || !Array.isArray(body?.signers) || body.signers.length === 0) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios: nome, file_base64, signers[]" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const filename = body.filename || `${body.nome.replace(/[^\w.-]+/g, "_")}.pdf`;
    const signers = body.signers.map((s) => ({
      email: s.email,
      name: s.name,
      action: s.action || "SIGN",
    }));

    // Monta multipart GraphQL (Upload)
    const query = `
      mutation CreateDocument($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
        createDocument(document: $document, signers: $signers, file: $file) {
          id
          name
          created_at
          signatures { public_id name email action { name } created_at }
        }
      }`.replace(/\s+/g, " ").trim();

    const operations = {
      query,
      variables: {
        document: { name: body.nome, message: body.message || null },
        signers,
        file: null,
      },
    };
    const map = { "0": ["variables.file"] };

    const fd = new FormData();
    fd.append("operations", JSON.stringify(operations));
    fd.append("map", JSON.stringify(map));
    const bytes = base64ToBytes(body.file_base64);
    fd.append("0", new Blob([bytes], { type: "application/pdf" }), filename);

    const resp = await fetch(AUTENTIQUE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const json = await resp.json();

    if (!resp.ok || json.errors) {
      return new Response(JSON.stringify({ error: "autentique_error", details: json.errors || json }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const doc = json.data?.createDocument;
    if (!doc?.id) {
      return new Response(JSON.stringify({ error: "resposta_invalida", raw: json }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Persiste referência em documentos_gerados.campos_formulario.autentique
    if (body.documento_gerado_id) {
      try {
        const sb = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const { data: prev } = await sb
          .from("documentos_gerados")
          .select("campos_formulario")
          .eq("id", body.documento_gerado_id)
          .maybeSingle();
        const prevCampos = (prev?.campos_formulario as Record<string, unknown>) || {};
        await sb.from("documentos_gerados")
          .update({
            campos_formulario: {
              ...prevCampos,
              autentique: {
                document_id: doc.id,
                status: "pending",
                signers: doc.signatures,
                created_at: doc.created_at,
                updated_at: new Date().toISOString(),
              },
            },
          })
          .eq("id", body.documento_gerado_id);
      } catch (e) {
        console.error("[autentique] falha ao gravar documento_gerado_id", e);
      }
    }

    return new Response(JSON.stringify({ success: true, document: doc }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[autentique-criar-documento] erro:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
