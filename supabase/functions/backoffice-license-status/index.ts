import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  verifyBackofficeLicenseStatus,
  type BackofficeLicenseEnvelope,
} from "../_shared/backoffice-license.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const DENIED_MODULES = {
  faturamento_sus: false,
  reabilitacao: false,
  triagem: false,
  regulacao: false,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function hasBearer(req: Request) {
  const header = req.headers.get("Authorization") || "";
  return header.toLowerCase().startsWith("bearer ") && header.slice(7).trim().length > 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  // verify_jwt=true também valida a sessão na borda do Supabase.
  if (!hasBearer(req)) return json({ error: "unauthorized" }, 401);

  const backofficeUrl = Deno.env.get("BACKOFFICE_SUPABASE_URL")?.replace(/\/+$/, "") || "";
  const publishableKey = Deno.env.get("BACKOFFICE_SUPABASE_PUBLISHABLE_KEY") || "";
  const licenseCode = Deno.env.get("BACKOFFICE_LICENSE_CODE") || "";
  const trustedKeysRaw = Deno.env.get("BACKOFFICE_LICENSE_TRUSTED_KEYS_JSON") || "";
  const configured = [backofficeUrl, publishableKey, licenseCode, trustedKeysRaw].some(Boolean);

  // Antes da ativação explícita, o sistema mantém a configuração local atual.
  if (!configured) return json({ mode: "legacy" });
  if (!backofficeUrl || !publishableKey || publishableKey.startsWith("sb_secret_") ||
      !/^LIC-[A-F0-9]{32}$/.test(licenseCode) || !trustedKeysRaw) {
    return json({ mode: "backoffice", status: "configuration_error", modules: DENIED_MODULES });
  }

  let trustedKeys: Record<string, string>;
  try {
    const parsed = JSON.parse(trustedKeysRaw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_keyring");
    trustedKeys = parsed as Record<string, string>;
    if (!Object.keys(trustedKeys).length || Object.values(trustedKeys).some(value => typeof value !== "string")) {
      throw new Error("empty_keyring");
    }
  } catch {
    return json({ mode: "backoffice", status: "configuration_error", modules: DENIED_MODULES });
  }

  try {
    const headers = new Headers({
      apikey: publishableKey,
      "Content-Type": "application/json",
    });
    // Chaves publicáveis novas são opacas; a chave anon legada é JWT e também aceita Bearer.
    if (!publishableKey.startsWith("sb_publishable_")) {
      headers.set("Authorization", "Bearer " + publishableKey);
    }
    const response = await fetch(backofficeUrl + "/rest/v1/rpc/check_license_status", {
      method: "POST",
      headers,
      body: JSON.stringify({ _license_code: licenseCode }),
      cache: "no-store",
    });
    if (!response.ok) {
      return json({ mode: "backoffice", status: "unavailable", modules: DENIED_MODULES });
    }
    const envelope = await response.json() as BackofficeLicenseEnvelope;
    const verified = await verifyBackofficeLicenseStatus(envelope, trustedKeys);
    // Somente escopo mínimo é devolvido ao navegador; snapshot e assinatura ficam no servidor.
    return json({
      mode: "backoffice",
      status: verified.status,
      reason: verified.reason,
      modules: verified.modules,
      validUntil: verified.validUntil,
      checkedAt: new Date().toISOString(),
    });
  } catch {
    // Sem fallback para uma licença ativa não verificada.
    return json({ mode: "backoffice", status: "unavailable", modules: DENIED_MODULES });
  }
});
