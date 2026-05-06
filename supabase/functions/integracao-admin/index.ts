import {
  corsHeaders, json, getServiceClient, sha256Hex,
  generateStrongToken, getBearer, getIp, logIntegracao,
} from "../_shared/integracoes.ts";

/**
 * Endpoints administrativos (autenticados via JWT do usuário Master):
 *  POST /integracao-admin?action=gerar-token   { sistema_id }
 *  POST /integracao-admin?action=testar        { sistema_id }
 *  POST /integracao-admin?action=ping          {}            (chamado pelo outro sistema no teste)
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";

  // Endpoint público "ping" - usado pelo TESTAR CONEXÃO do outro lado
  if (action === "ping") {
    const token = getBearer(req);
    const identificador = req.headers.get("x-sistema-origem") || "";
    if (!token || !identificador) {
      return json({ ok: false, error: "missing_credentials" }, 401);
    }
    const sb = getServiceClient();
    const { data } = await sb.from("sistemas_integrados")
      .select("*").eq("identificador", identificador).maybeSingle();
    if (!data) {
      await logIntegracao({ direcao: "entrada", endpoint: "ping", status: "negado",
        mensagem: "sistema nao cadastrado", identificadorOrigem: identificador, ip: getIp(req) });
      return json({ ok: false, error: "sistema_nao_cadastrado" }, 401);
    }
    if (!data.ativo) return json({ ok: false, error: "sistema_inativo" }, 403);
    if (!data.pode_receber) return json({ ok: false, error: "sem_permissao_receber" }, 403);
    const hash = await sha256Hex(token);
    if (hash !== data.token_entrada_hash) {
      await logIntegracao({ sistemaId: data.id, direcao: "entrada", endpoint: "ping",
        status: "negado", mensagem: "token invalido", identificadorOrigem: identificador, ip: getIp(req) });
      return json({ ok: false, error: "token_invalido" }, 401);
    }
    await logIntegracao({ sistemaId: data.id, direcao: "entrada", endpoint: "ping",
      status: "sucesso", mensagem: "ping ok", identificadorOrigem: identificador, ip: getIp(req) });
    return json({ ok: true, sistema: data.nome, identificador: data.identificador, version: "1.0" });
  }

  // Demais ações exigem JWT de usuário autenticado (Master)
  const userJwt = getBearer(req);
  if (!userJwt) return json({ error: "unauthorized" }, 401);

  const sbUser = (await import("https://esm.sh/@supabase/supabase-js@2.45.0"))
    .createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${userJwt}` } },
    });
  const { data: userData } = await sbUser.auth.getUser();
  if (!userData?.user) return json({ error: "unauthorized" }, 401);

  // Verifica role master
  const sb = getServiceClient();
  const { data: func } = await sb.from("funcionarios")
    .select("id, role, ativo").eq("auth_user_id", userData.user.id).maybeSingle();
  if (!func || !func.ativo || func.role !== "master") {
    return json({ error: "forbidden" }, 403);
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* */ }

  if (action === "gerar-token") {
    const sistemaId = body.sistema_id;
    if (!sistemaId) return json({ error: "missing_sistema_id" }, 400);
    const plain = generateStrongToken();
    const hash = await sha256Hex(plain);
    const prefix = plain.slice(0, 8);
    const { error } = await sb.from("sistemas_integrados")
      .update({ token_entrada_hash: hash, token_entrada_prefix: prefix })
      .eq("id", sistemaId);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, token: plain, prefix });
  }

  if (action === "testar") {
    const sistemaId = body.sistema_id;
    if (!sistemaId) return json({ error: "missing_sistema_id" }, 400);
    const { data: sistema } = await sb.from("sistemas_integrados")
      .select("*").eq("id", sistemaId).maybeSingle();
    if (!sistema) return json({ error: "not_found" }, 404);
    if (!sistema.url_base) return json({ ok: false, error: "missing_url_base" }, 400);
    if (!sistema.token_saida) return json({ ok: false, error: "missing_token_saida" }, 400);

    // Determina identificador deste sistema (próprio): pega de variável de ambiente OU usa fallback
    const meuIdentificador = Deno.env.get("INTEGRATION_SELF_IDENTIFIER") ||
      "sistema-" + (Deno.env.get("SUPABASE_URL") || "").replace(/\W/g, "").slice(-12);

    // Chama /integracao-admin?action=ping no outro sistema
    const targetUrl = sistema.url_base.replace(/\/$/, "") +
      "/functions/v1/integracao-admin?action=ping";
    let result: any;
    let status = 0;
    try {
      const resp = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sistema.token_saida}`,
          "X-Sistema-Origem": meuIdentificador,
        },
        body: JSON.stringify({}),
      });
      status = resp.status;
      try { result = await resp.json(); } catch { result = { raw: await resp.text() }; }
    } catch (e) {
      result = { error: "network_error", detail: String(e) };
    }

    const sucesso = status === 200 && result?.ok === true;
    await sb.from("sistemas_integrados").update({
      ultimo_teste_em: new Date().toISOString(),
      ultimo_teste_status: sucesso ? "ok" : (result?.error || `http_${status}`),
    }).eq("id", sistemaId);

    await logIntegracao({
      sistemaId, direcao: "saida", endpoint: "ping",
      status: sucesso ? "sucesso" : "erro",
      mensagem: sucesso ? "conectado" : (result?.error || `http_${status}`),
      payload: { status, result }, ip: getIp(req),
    });

    if (!sucesso) {
      let msg = "Falha ao conectar";
      if (result?.error === "sistema_nao_cadastrado") {
        msg = "O outro sistema ainda não reconhece este token. Gere o Token de Entrada no outro sistema e cole aqui como Token de Saída.";
      } else if (result?.error === "token_invalido") {
        msg = "Token de saída inválido. Gere um novo Token de Entrada no outro sistema e cole aqui.";
      } else if (result?.error === "sistema_inativo") {
        msg = "O outro sistema está inativo.";
      } else if (result?.error === "sem_permissao_receber") {
        msg = "O outro sistema não permite receber dados deste sistema.";
      } else if (result?.error === "network_error") {
        msg = "URL inacessível. Verifique a URL base do outro sistema.";
      }
      return json({ ok: false, status, error: result?.error, message: msg });
    }

    return json({ ok: true, message: `Conectado a ${result?.sistema || "sistema externo"}.` });
  }

  return json({ error: "unknown_action" }, 400);
});
