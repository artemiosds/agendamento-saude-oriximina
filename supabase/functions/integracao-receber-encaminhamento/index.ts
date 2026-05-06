import {
  corsHeaders, json, getServiceClient, autenticarSistemaOrigem,
  getBearer, getIp, logIntegracao,
} from "../_shared/integracoes.ts";

/**
 * Recebe encaminhamentos vindos de outro sistema integrado.
 * Headers obrigatórios:
 *   Authorization: Bearer <token de entrada gerado neste sistema>
 *   X-Sistema-Origem: <identificador do sistema que envia>
 *
 * Body:
 * {
 *   paciente: { nome, cpf?, cns?, data_nascimento?, telefone?, ... },
 *   encaminhamento: {
 *     especialidade_destino, cid?, diagnostico_resumido?,
 *     justificativa?, profissional_solicitante?, data_encaminhamento?,
 *     conteudo_html?, anexos?: [{ nome, url? }]
 *   }
 * }
 *
 * Cria/atualiza o documento em `documentos_gerados` com tipo
 * "encaminhamento_recebido_externo" — assim já aparece em /painel/encaminhamentos.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const ip = getIp(req);

  // Modo 1: chamado por OUTRO sistema (Bearer = token entrada hash + identificador)
  // Modo 2: chamado pela tela "Enviar agora" (JWT de usuário Master) — usado para *enviar* a partir daqui
  const identificadorHeader = req.headers.get("x-sistema-origem") || "";

  if (identificadorHeader) {
    // ENTRADA: outro sistema enviando para nós
    const auth = await autenticarSistemaOrigem(req);
    if (!auth.ok) {
      await logIntegracao({
        direcao: "entrada", endpoint: "receber-encaminhamento",
        status: "negado", mensagem: auth.msg,
        identificadorOrigem: identificadorHeader, ip,
      });
      return json({ ok: false, error: auth.msg }, auth.status);
    }

    let body: any;
    try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
    const paciente = body?.paciente || {};
    const encaminhamento = body?.encaminhamento || {};
    if (!paciente.nome || !encaminhamento.especialidade_destino) {
      await logIntegracao({
        sistemaId: auth.sistema.id, identificadorOrigem: identificadorHeader,
        direcao: "entrada", endpoint: "receber-encaminhamento",
        status: "erro", mensagem: "campos obrigatorios ausentes", payload: body, ip,
      });
      return json({ ok: false, error: "missing_required_fields" }, 400);
    }

    const sb = getServiceClient();

    // Cria documento_gerado tipo encaminhamento_recebido_externo
    const conteudoHtml = encaminhamento.conteudo_html || `
      <h2>Encaminhamento recebido</h2>
      <p><strong>Origem:</strong> ${auth.sistema.nome}</p>
      <p><strong>Paciente:</strong> ${paciente.nome}${paciente.cpf ? " — CPF " + paciente.cpf : ""}</p>
      <p><strong>Especialidade destino:</strong> ${encaminhamento.especialidade_destino}</p>
      ${encaminhamento.cid ? `<p><strong>CID:</strong> ${encaminhamento.cid}</p>` : ""}
      ${encaminhamento.diagnostico_resumido ? `<p><strong>Diagnóstico:</strong> ${encaminhamento.diagnostico_resumido}</p>` : ""}
      ${encaminhamento.justificativa ? `<p><strong>Justificativa:</strong> ${encaminhamento.justificativa}</p>` : ""}
      ${encaminhamento.profissional_solicitante ? `<p><strong>Profissional solicitante:</strong> ${encaminhamento.profissional_solicitante}</p>` : ""}
    `;

    const { data: doc, error: docErr } = await sb.from("documentos_gerados").insert({
      modelo_id: "",
      unidade_id: auth.sistema.unidade_id || "",
      paciente_id: paciente.id || "",
      paciente_nome: paciente.nome,
      profissional_id: "",
      profissional_nome: encaminhamento.profissional_solicitante || auth.sistema.nome,
      tipo_documento: "encaminhamento_recebido_externo",
      conteudo_html: conteudoHtml,
      conteudo_original: conteudoHtml,
      status: "assinado",
      campos_formulario: {
        origem_externa: {
          sistema_id: auth.sistema.id,
          sistema_nome: auth.sistema.nome,
          identificador: auth.sistema.identificador,
          recebido_em: new Date().toISOString(),
        },
        paciente,
        encaminhamento,
      },
    }).select().single();

    if (docErr) {
      await logIntegracao({
        sistemaId: auth.sistema.id, identificadorOrigem: identificadorHeader,
        direcao: "entrada", endpoint: "receber-encaminhamento",
        status: "erro", mensagem: docErr.message, payload: body, ip,
      });
      return json({ ok: false, error: "db_error", detail: docErr.message }, 500);
    }

    await logIntegracao({
      sistemaId: auth.sistema.id, identificadorOrigem: identificadorHeader,
      direcao: "entrada", endpoint: "receber-encaminhamento",
      status: "sucesso", mensagem: "encaminhamento recebido",
      payload: { documento_id: doc.id, paciente: paciente.nome }, ip,
    });

    return json({ ok: true, documento_id: doc.id });
  }

  // SAÍDA: usuário Master clicando em "Enviar para sistema externo"
  const userJwt = getBearer(req);
  if (!userJwt) return json({ error: "unauthorized" }, 401);
  const sbUser = (await import("https://esm.sh/@supabase/supabase-js@2.45.0"))
    .createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${userJwt}` } },
    });
  const { data: userData } = await sbUser.auth.getUser();
  if (!userData?.user) return json({ error: "unauthorized" }, 401);

  const sb = getServiceClient();
  const { data: func } = await sb.from("funcionarios")
    .select("id, role, ativo").eq("auth_user_id", userData.user.id).maybeSingle();
  if (!func || !func.ativo) return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const { sistema_id, paciente, encaminhamento } = body || {};
  if (!sistema_id || !paciente?.nome || !encaminhamento?.especialidade_destino) {
    return json({ error: "missing_required_fields" }, 400);
  }

  const { data: sistema } = await sb.from("sistemas_integrados")
    .select("*").eq("id", sistema_id).maybeSingle();
  if (!sistema) return json({ error: "sistema_not_found" }, 404);
  if (!sistema.ativo) return json({ error: "sistema_inativo" }, 400);
  if (!sistema.pode_enviar) return json({ error: "sem_permissao_enviar" }, 400);

  const meuIdentificador = Deno.env.get("INTEGRATION_SELF_IDENTIFIER") ||
    "sistema-" + (Deno.env.get("SUPABASE_URL") || "").replace(/\W/g, "").slice(-12);

  const targetUrl = sistema.url_base.replace(/\/$/, "") +
    "/functions/v1/integracao-receber-encaminhamento";

  let resp: Response;
  try {
    resp = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sistema.token_saida}`,
        "X-Sistema-Origem": meuIdentificador,
      },
      body: JSON.stringify({ paciente, encaminhamento }),
    });
  } catch (e) {
    await logIntegracao({
      sistemaId: sistema.id, direcao: "saida", endpoint: "enviar-encaminhamento",
      status: "erro", mensagem: "network_error: " + String(e), ip,
    });
    return json({ ok: false, error: "network_error" }, 502);
  }

  let result: any;
  try { result = await resp.json(); } catch { result = { raw: await resp.text() }; }
  const sucesso = resp.status === 200 && result?.ok === true;

  await logIntegracao({
    sistemaId: sistema.id, direcao: "saida", endpoint: "enviar-encaminhamento",
    status: sucesso ? "sucesso" : "erro",
    mensagem: sucesso ? "enviado" : (result?.error || `http_${resp.status}`),
    payload: { status: resp.status, result, paciente_nome: paciente.nome }, ip,
  });

  if (!sucesso) return json({ ok: false, status: resp.status, error: result?.error || "erro" }, 502);
  return json({ ok: true, documento_id: result.documento_id });
});
