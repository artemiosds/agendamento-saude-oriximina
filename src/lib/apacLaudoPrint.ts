// Helper do Laudo APAC: monta o HTML/CSS da ficha A4 (1 página) e expõe
// uma função utilitária para impressão direta (window.print).
// Layout em HTML/CSS puro — sem imagem de fundo, sem template sobreposto.
// Apenas LEITURA dos dados do paciente; não persiste nada.

type AnyPaciente = Record<string, any>;

const escapeHtml = (s: unknown): string => {
  if (s === null || s === undefined) return "";
  const str = String(s);
  if (str === "undefined" || str === "null" || str === "NaN") return "";
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
};

const digitBoxes = (raw: unknown, n: number): string => {
  const digits = String(raw ?? "").replace(/\D/g, "").slice(0, n);
  return Array.from({ length: n }, (_, i) => `<span class="box">${digits[i] ?? ""}</span>`).join("");
};

const splitTel = (raw: unknown): { ddd: string; num: string } => {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length >= 10) return { ddd: d.slice(0, 2), num: d.slice(2, 11) };
  return { ddd: "", num: d.slice(0, 9) };
};

const pickFrom = (p: AnyPaciente, cd: AnyPaciente) => (...keys: string[]) => {
  for (const k of keys) {
    const v = p?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  for (const k of keys) {
    const v = cd?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return "";
};

export function buildLaudoApacHTML(paciente: AnyPaciente | null): string {
  const p = paciente || {};
  const cd = (p.custom_data || {}) as AnyPaciente;
  const pick = pickFrom(p, cd);

  // ===== Identificação do Paciente =====
  const nomePaciente = escapeHtml(pick("nome"));
  const prontuario   = escapeHtml(pick("numeroProntuario", "numero_prontuario", "prontuario", "codigo"));

  // CNS — 15 caixas isoladas (container próprio)
  const cnsHTML = `<span class="boxes">${digitBoxes(pick("cns"), 15)}</span>`;

  // Data nascimento — DD / MM / AAAA — 3 containers separados
  const dn = String(pick("dataNascimento", "data_nascimento") ?? "");
  let dd = "", mm = "", aaaa = "";
  const iso = dn.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const br  = dn.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (iso) { aaaa = iso[1]; mm = iso[2]; dd = iso[3]; }
  else if (br) { dd = br[1]; mm = br[2]; aaaa = br[3]; }
  const dataNascHTML =
    `<span class="boxes">${digitBoxes(dd, 2)}</span>` +
    `<span class="sep">/</span>` +
    `<span class="boxes">${digitBoxes(mm, 2)}</span>` +
    `<span class="sep">/</span>` +
    `<span class="boxes">${digitBoxes(aaaa, 4)}</span>`;

  // Sexo
  const sexoRaw = String(pick("sexo") ?? "").trim().toLowerCase();
  const sexoHTML =
    `<span class="check">${sexoRaw.startsWith("m") ? "✕" : ""}</span>Masc. &nbsp; ` +
    `<span class="check">${sexoRaw.startsWith("f") ? "✕" : ""}</span>Fem.`;

  const racaCor = escapeHtml(pick("racaCor", "raca_cor"));
  const nomeMae = escapeHtml(pick("nomeMae", "nome_mae"));

  // Telefone paciente — DDD isolado do número
  const telP = splitTel(pick("telefone"));
  const tel10HTML =
    `(<span class="boxes">${digitBoxes(telP.ddd, 2)}</span>) ` +
    `<span class="boxes">${digitBoxes(telP.num, 9)}</span>`;

  const nomeResp = escapeHtml(pick("nomeResponsavel", "nome_responsavel"));
  const telR = splitTel(pick("telefoneResponsavel", "telefone_responsavel"));
  const tel12HTML =
    `(<span class="boxes">${digitBoxes(telR.ddd, 2)}</span>) ` +
    `<span class="boxes">${digitBoxes(telR.num, 9)}</span>`;

  // Endereço composto (4 cenários cobertos por filter(Boolean) + join)
  const tipo   = String(pick("tipoLogradouro", "tipo_logradouro") ?? "").trim();
  const logr   = String(pick("logradouro", "endereco") ?? "").trim();
  const numero = String(pick("numero") ?? "").trim();
  const bairro = String(pick("bairro") ?? "").trim();
  const rua = [tipo, logr].filter(Boolean).join(" ").trim();
  const partes: string[] = [];
  if (rua) partes.push(rua);
  if (numero) partes.push(`Nº ${numero}`);
  if (bairro) partes.push(bairro);
  const enderecoHTML = escapeHtml(partes.join(", "));

  const municipio = escapeHtml(pick("municipio"));
  const ibgeHTML  = `<span class="boxes">${digitBoxes(pick("ibgeMunicipio", "ibge_municipio", "codIbge", "cod_ibge"), 7)}</span>`;
  const uf        = escapeHtml(pick("uf"));
  // CEP — 8 caixas isoladas (container próprio)
  const cepHTML   = `<span class="boxes">${digitBoxes(pick("cep"), 8)}</span>`;

  // ===== Helpers de layout =====
  const band  = (text: string) => `<div class="band">${text}</div>`;
  const boxes = (n: number) => `<span class="boxes">${Array.from({ length: n }, () => `<span class="box"></span>`).join("")}</span>`;
  const dataBoxes = `<span class="boxes">${digitBoxes("", 2)}</span><span class="sep">/</span><span class="boxes">${digitBoxes("", 2)}</span><span class="sep">/</span><span class="boxes">${digitBoxes("", 4)}</span>`;
  const field = (num: string, label: string, value: string = "", opts: { w?: string; h?: number } = {}) => `
    <div class="field" style="${opts.w ? `width:${opts.w};` : ""}${opts.h ? `min-height:${opts.h}px;` : ""}">
      <div class="flabel">${num} - ${label}</div>
      <div class="fvalue">${value}</div>
    </div>`;

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Laudo APAC</title>
<style>
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #ddd; font-family: Arial, Helvetica, sans-serif; color: #000; }
  body { padding: 8px; }
  .sheet { width: 194mm; margin: 0 auto; background: #fff; padding: 4mm 4mm; font-size: 8.5px; line-height: 1.15; page-break-inside: avoid; }
  @media print {
    html, body { background: #fff; }
    body { padding: 0; }
    .sheet { width: auto; margin: 0; padding: 0; box-shadow: none; }
  }
  .header { display: flex; align-items: flex-start; gap: 6px; margin-bottom: 4px; }
  .logo { width: 40px; height: 40px; border: 1px solid #000; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; }
  .header-text { flex: 1; text-align: center; line-height: 1.2; }
  .header-text .t1 { font-weight: bold; font-size: 10px; }
  .header-text .t2 { font-size: 8.5px; }
  .header-text .title { font-weight: bold; font-size: 10.5px; margin-top: 3px; text-transform: uppercase; }
  .fls { font-size: 8px; min-width: 40px; text-align: right; }
  .band { background: #000; color: #fff; font-weight: bold; font-size: 8.5px; padding: 2px 4px; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.2px; }
  .row { display: flex; border-left: 1px solid #000; border-top: 1px solid #000; }
  .row > .field { border-right: 1px solid #000; border-bottom: 1px solid #000; }
  .field { padding: 1px 3px 2px; flex: 1; min-height: 22px; }
  .flabel { font-size: 6.8px; font-weight: bold; text-transform: uppercase; line-height: 1.1; }
  .fvalue { font-size: 8.5px; padding-top: 1px; min-height: 11px; }
  .boxes { display: inline-flex; gap: 1px; }
  .box { display: inline-flex; align-items: center; justify-content: center; width: 10px; height: 12px; border: 1px solid #000; font-size: 8px; background: #fff; }
  .sep { display: inline-block; width: 6px; text-align: center; font-weight: bold; }
  .check { display: inline-block; width: 9px; height: 9px; border: 1px solid #000; margin-right: 2px; vertical-align: middle; text-align: center; line-height: 8px; font-size: 8px; }
</style>
</head>
<body>
<div class="sheet" id="apac-laudo">

  <div class="header">
    <div class="logo">SUS</div>
    <div class="header-text">
      <div class="t1">Sistema Único de Saúde</div>
      <div class="t2">Ministério da Saúde</div>
      <div class="title">Laudo para Solicitação / Autorização de Procedimento Ambulatorial</div>
    </div>
    <div class="fls">fls.1/2</div>
  </div>

  ${band("Identificação do Estabelecimento de Saúde (Solicitante)")}
  <div class="row">
    ${field("1", "Nome do Estabelecimento Solicitante", "", { w: "70%" })}
    ${field("2", "CNES", boxes(7), { w: "30%" })}
  </div>

  ${band("Identificação do Paciente")}
  <div class="row">
    ${field("3", "Nome do Paciente", nomePaciente, { w: "75%" })}
    ${field("4", "Nº do Prontuário", prontuario, { w: "25%" })}
  </div>
  <div class="row">
    ${field("5", "Cartão Nacional de Saúde (CNS)", cnsHTML, { w: "55%" })}
    ${field("6", "Data de Nascimento", dataNascHTML, { w: "25%" })}
    ${field("7", "Sexo", sexoHTML, { w: "10%" })}
    ${field("8", "Raça / Cor", racaCor, { w: "10%" })}
  </div>
  <div class="row">
    ${field("9", "Nome da Mãe", nomeMae, { w: "60%" })}
    ${field("10", "Telefone de Contato", tel10HTML, { w: "40%" })}
  </div>
  <div class="row">
    ${field("11", "Nome do Responsável", nomeResp, { w: "60%" })}
    ${field("12", "Telefone do Responsável", tel12HTML, { w: "40%" })}
  </div>
  <div class="row">
    ${field("13", "Endereço (Rua, Nº, Bairro)", enderecoHTML, { w: "100%" })}
  </div>
  <div class="row">
    ${field("14", "Município de Residência", municipio, { w: "50%" })}
    ${field("15", "Cód. IBGE Município", ibgeHTML, { w: "30%" })}
    ${field("16", "UF", uf, { w: "8%" })}
    ${field("17", "CEP", cepHTML, { w: "12%" })}
  </div>

  ${band("Procedimento Solicitado")}
  <div class="row">
    ${field("18", "Código do Procedimento", boxes(10), { w: "30%" })}
    ${field("19", "Nome do Procedimento", "", { w: "55%" })}
    ${field("20", "Quantidade", "", { w: "15%" })}
  </div>

  ${band("Procedimento(s) Secundário(s)")}
  <div class="row">
    ${field("21", "CID-10 Principal", "", { w: "20%" })}
    ${field("22", "CID-10 Secundário", "", { w: "20%" })}
    ${field("23", "CID-10 Causas Associadas", "", { w: "20%" })}
    ${field("24", "CID-10 Outras Causas", "", { w: "20%" })}
    ${field("25", "Indicação Clínica", "", { w: "20%" })}
  </div>
  <div class="row">
    ${field("26", "Procedimento Secundário 1", "", { w: "33.33%" })}
    ${field("27", "Quantidade", "", { w: "16.66%" })}
    ${field("28", "Procedimento Secundário 2", "", { w: "33.33%" })}
    ${field("29", "Quantidade", "", { w: "16.66%" })}
  </div>
  <div class="row">
    ${field("30", "Procedimento Secundário 3", "", { w: "33.33%" })}
    ${field("31", "Quantidade", "", { w: "16.66%" })}
    ${field("32", "Procedimento Secundário 4", "", { w: "33.33%" })}
    ${field("33", "Quantidade", "", { w: "16.66%" })}
  </div>
  <div class="row">
    ${field("34", "Procedimento Secundário 5", "", { w: "83.33%" })}
    ${field("35", "Quantidade", "", { w: "16.66%" })}
  </div>

  ${band("Justificativa do(s) Procedimento(s) Solicitado(s)")}
  <div class="row">${field("36", "Sinais e Sintomas Clínicos", "", { w: "100%", h: 28 })}</div>
  <div class="row">${field("37", "Condições que Justificam o Caráter de Urgência (se for o caso)", "", { w: "100%", h: 22 })}</div>
  <div class="row">${field("38", "Resultados de Provas Diagnósticas", "", { w: "100%", h: 22 })}</div>
  <div class="row">
    ${field("39", "Diagnóstico Inicial", "", { w: "60%" })}
    ${field("40", "CID-10 Principal", "", { w: "40%" })}
  </div>

  ${band("Solicitação")}
  <div class="row">
    ${field("41", "Nome do Profissional Solicitante", "", { w: "50%" })}
    ${field("42", "Documento do Profissional Solicitante", "", { w: "20%" })}
    ${field("43", "Nº do Documento", "", { w: "15%" })}
    ${field("44", "Estado", "", { w: "8%" })}
    ${field("45", "Data da Solicitação", dataBoxes, { w: "7%" })}
  </div>

  ${band("Autorização")}
  <div class="row">
    ${field("46", "Nº da APAC Principal Autorizada", boxes(13), { w: "30%" })}
    ${field("47", "Validade da APAC (Início)", dataBoxes, { w: "20%" })}
    ${field("48", "Validade da APAC (Fim)", dataBoxes, { w: "20%" })}
    ${field("49", "Cód. do Órgão Emissor", "", { w: "15%" })}
    ${field("50", "Cód. do Órgão Autorizador", "", { w: "15%" })}
  </div>
  <div class="row">
    ${field("51", "Nome do Profissional Autorizador", "", { w: "60%" })}
    ${field("52", "Documento do Autorizador", "", { w: "25%" })}
    ${field("53", "Data da Autorização", dataBoxes, { w: "15%" })}
  </div>

  ${band("Identificação do Estabelecimento de Saúde (Executante)")}
  <div class="row">
    ${field("54", "Nome do Estabelecimento Executante", "", { w: "70%" })}
    ${field("55", "CNES", boxes(7), { w: "30%" })}
  </div>

</div>
</body></html>`;
}
