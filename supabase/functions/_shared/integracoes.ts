// Helpers compartilhados pelas edge functions de integração
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sistema-origem",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateStrongToken(): string {
  const bytes = new Uint8Array(36);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getBearer(req: Request): string {
  const h = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return "";
}

export async function logIntegracao(opts: {
  sistemaId?: string | null;
  identificadorOrigem?: string;
  direcao: "entrada" | "saida";
  endpoint: string;
  status: "sucesso" | "erro" | "negado";
  mensagem: string;
  payload?: Record<string, unknown>;
  ip?: string;
}) {
  try {
    const sb = getServiceClient();
    await sb.from("integracoes_log").insert({
      sistema_id: opts.sistemaId ?? null,
      identificador_origem: opts.identificadorOrigem ?? "",
      direcao: opts.direcao,
      endpoint: opts.endpoint,
      status: opts.status,
      mensagem: opts.mensagem,
      payload: opts.payload ?? {},
      ip: opts.ip ?? "",
    });
  } catch (_e) { /* nunca deve quebrar */ }
}

export function getIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for") ||
    req.headers.get("cf-connecting-ip") ||
    ""
  ).split(",")[0].trim();
}

/**
 * Valida o sistema de origem que está chamando este endpoint:
 * - Bearer token presente
 * - Header X-Sistema-Origem com identificador
 * - Sistema ativo, pode_receber=true, hash do token confere
 */
export async function autenticarSistemaOrigem(req: Request) {
  const token = getBearer(req);
  const identificador =
    req.headers.get("x-sistema-origem") ||
    req.headers.get("X-Sistema-Origem") || "";

  if (!token) return { ok: false as const, status: 401, msg: "missing_token" };
  if (!identificador) return { ok: false as const, status: 401, msg: "missing_identificador" };

  const sb = getServiceClient();
  const { data, error } = await sb
    .from("sistemas_integrados")
    .select("*")
    .eq("identificador", identificador)
    .maybeSingle();

  if (error || !data) return { ok: false as const, status: 401, msg: "sistema_nao_cadastrado" };
  if (!data.ativo) return { ok: false as const, status: 403, msg: "sistema_inativo", sistema: data };
  if (!data.pode_receber)
    return { ok: false as const, status: 403, msg: "sem_permissao_receber", sistema: data };

  const hash = await sha256Hex(token);
  if (hash !== data.token_entrada_hash)
    return { ok: false as const, status: 401, msg: "token_invalido", sistema: data };

  return { ok: true as const, sistema: data };
}
