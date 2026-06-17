// Helper do Laudo APAC: monta o HTML/CSS da ficha A4 oficial (Ministério da Saúde)
// SEGUINDO FIELMENTE a numeração e seções do formulário oficial (campos 1 a 55).
// Layout em HTML/CSS puro — sem imagem de fundo. Apenas LEITURA dos dados do paciente.

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

  const cnsHTML = `<span class="boxes">${digitBoxes(pick("cns"), 15)}</span>`;

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

  const sexoRaw = String(pick("sexo") ?? "").trim().toLowerCase();
  const sexoHTML =
    `<span class="check">${sexoRaw.startsWith("m") ? "✕" : ""}</span>Masc. &nbsp; ` +
    `<span class="check">${sexoRaw.startsWith("f") ? "✕" : ""}</span>Fem.`;

  const racaCor = escapeHtml(pick("racaCor", "raca_cor"));
  const nomeMae = escapeHtml(pick("nomeMae", "nome_mae"));

  const telP = splitTel(pick("telefone"));
  const tel10HTML =
    `<span class="tel-lbl">DDD</span> <span class="boxes">${digitBoxes(telP.ddd, 2)}</span> ` +
    `&nbsp;<span class="tel-lbl">Nº</span> <span class="boxes">${digitBoxes(telP.num, 9)}</span>`;

  const nomeResp = escapeHtml(pick("nomeResponsavel", "nome_responsavel"));
  const telR = splitTel(pick("telefoneResponsavel", "telefone_responsavel"));
  const tel12HTML =
    `<span class="tel-lbl">DDD</span> <span class="boxes">${digitBoxes(telR.ddd, 2)}</span> ` +
    `&nbsp;<span class="tel-lbl">Nº</span> <span class="boxes">${digitBoxes(telR.num, 9)}</span>`;

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

  // Linha padrão de procedimento secundário: cod + nome + qtde
  const secRow = (nCod: string, nNome: string, nQtd: string) => `
  <div class="row">
    ${field(nCod, "CÓDIGO DO PROCEDIMENTO SECUNDÁRIO", boxes(10), { w: "30%", h: 24 })}
    ${field(nNome, "NOME DO PROCEDIMENTO SECUNDÁRIO", "", { w: "58%", h: 24 })}
    ${field(nQtd, "QTDE.", boxes(4), { w: "12%", h: 24 })}
  </div>`;

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Laudo APAC</title>
<style>
  @page { size: A4 portrait; margin: 6mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #ddd; font-family: Arial, Helvetica, sans-serif; color: #000; }
  body { padding: 8px; }
  .sheet { width: 198mm; margin: 0 auto; background: #fff; padding: 3mm; font-size: 8px; line-height: 1.15; }
  @media print {
    html, body { background: #fff; }
    body { padding: 0; }
    .sheet { width: auto; margin: 0; padding: 0; box-shadow: none; }
  }
  .header { display: flex; align-items: stretch; gap: 4px; margin-bottom: 3px; border: 1px solid #000; }
  .logo { width: 70px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-weight: bold; font-size: 7px; border-right: 1px solid #000; padding: 2px; text-align: center; line-height: 1.1; }
  .logo .sus-mark { font-size: 14px; }
  .header-text { flex: 1; text-align: center; display: flex; flex-direction: column; justify-content: center; padding: 3px; }
  .header-text .title { font-weight: bold; font-size: 11px; text-transform: uppercase; }
  .header-text .sub { font-weight: bold; font-size: 10px; text-transform: uppercase; }
  .fls { width: 50px; font-size: 8px; display: flex; align-items: flex-start; justify-content: center; padding-top: 2px; border-left: 1px solid #000; }
  .band { background: #000; color: #fff; font-weight: bold; font-size: 8.5px; padding: 2px 4px; margin-top: 2px; text-align: center; text-transform: uppercase; letter-spacing: 0.3px; }
  .row { display: flex; border-left: 1px solid #000; border-top: 1px solid #000; }
  .row > .field { border-right: 1px solid #000; border-bottom: 1px solid #000; }
  .field { padding: 1px 3px 2px; flex: 1; min-height: 22px; }
  .flabel { font-size: 6.5px; font-weight: bold; text-transform: uppercase; line-height: 1.1; }
  .fvalue { font-size: 8.5px; padding-top: 1px; min-height: 11px; }
  .boxes { display: inline-flex; gap: 1px; }
  .box { display: inline-flex; align-items: center; justify-content: center; width: 10px; height: 12px; border: 1px solid #000; font-size: 8px; background: #fff; }
  .sep { display: inline-block; width: 5px; text-align: center; font-weight: bold; }
  .check { display: inline-block; width: 9px; height: 9px; border: 1px solid #000; margin-right: 2px; vertical-align: middle; text-align: center; line-height: 8px; font-size: 8px; }
  .tel-lbl { font-size: 6.5px; font-weight: bold; }
  .doc-checks { font-size: 8px; padding-top: 3px; }
</style>
</head>
<body>
<div class="sheet" id="apac-laudo">

  <div class="header">
    <div class="logo">
      <div class="sus-mark">SUS</div>
      <div>Sistema Único de Saúde</div>
      <div>Ministério da Saúde</div>
    </div>
    <div class="header-text">
      <div class="title">Laudo para Solicitação / Autorização</div>
      <div class="sub">de Procedimento Ambulatorial</div>
    </div>
    <div class="fls">fls.1/2</div>
  </div>

  ${band("Identificação do Estabelecimento de Saúde (Solicitante)")}
  <div class="row">
    ${field("1", "Nome do Estabelecimento de Saúde Solicitante", "", { w: "75%", h: 24 })}
    ${field("2", "CNES", boxes(7), { w: "25%", h: 24 })}
  </div>

  ${band("Identificação do Paciente")}
  <div class="row">
    ${field("3", "Nome do Paciente", nomePaciente, { w: "75%" })}
    ${field("4", "Nº do Prontuário", prontuario, { w: "25%" })}
  </div>
  <div class="row">
    ${field("5", "Cartão Nacional de Saúde (CNS)", cnsHTML, { w: "50%" })}
    ${field("6", "Data de Nascimento", dataNascHTML, { w: "22%" })}
    ${field("7", "Sexo", sexoHTML, { w: "16%" })}
    ${field("8", "Raça / Cor", racaCor, { w: "12%" })}
  </div>
  <div class="row">
    ${field("9", "Nome da Mãe", nomeMae, { w: "60%" })}
    ${field("10", "Telefone de Contato", tel10HTML, { w: "40%" })}
  </div>
  <div class="row">
    ${field("11", "Nome do Responsável", nomeResp, { w: "60%" })}
    ${field("12", "Telefone de Contato", tel12HTML, { w: "40%" })}
  </div>
  <div class="row">
    ${field("13", "Endereço (Rua, Nº, Bairro)", enderecoHTML, { w: "100%", h: 26 })}
  </div>
  <div class="row">
    ${field("14", "Município de Residência", municipio, { w: "50%" })}
    ${field("15", "Cód. IBGE Município", ibgeHTML, { w: "25%" })}
    ${field("16", "UF", uf, { w: "10%" })}
    ${field("17", "CEP", cepHTML, { w: "15%" })}
  </div>

  ${band("Procedimento Solicitado")}
  <div class="row">
    ${field("18", "Código do Procedimento Principal", boxes(10), { w: "30%", h: 26 })}
    ${field("19", "Nome do Procedimento Principal", "", { w: "58%", h: 26 })}
    ${field("20", "Qtde.", boxes(4), { w: "12%", h: 26 })}
  </div>

  ${band("Procedimento(s) Secundário(s)")}
  ${secRow("21", "22", "23")}
  ${secRow("24", "25", "26")}
  ${secRow("27", "28", "29")}
  ${secRow("30", "31", "32")}
  ${secRow("33", "34", "35")}

  ${band("Justificativa do(s) Procedimento(s) Solicitado(s)")}
  <div class="row">
    ${field("36", "Descrição do Diagnóstico", "", { w: "55%", h: 56 })}
    ${field("37", "CID-10 Principal", "", { w: "15%", h: 56 })}
    ${field("38", "CID-10 Secundário", "", { w: "15%", h: 56 })}
    ${field("39", "CID-10 Causas Associadas", "", { w: "15%", h: 56 })}
  </div>
  <div class="row">
    ${field("40", "Observações", "", { w: "100%", h: 40 })}
  </div>

  ${band("Solicitação")}
  <div class="row">
    ${field("41", "Nome do Profissional Solicitante", "", { w: "55%", h: 24 })}
    ${field("42", "Data da Solicitação", dataBoxes, { w: "20%", h: 24 })}
    ${field("45", "Assinatura e Carimbo (Nº Registro do Conselho)", "", { w: "25%", h: 24 })}
  </div>
  <div class="row">
    ${field("43", "Documento", `<span class="doc-checks"><span class="check"></span>CNS &nbsp; <span class="check"></span>CPF</span>`, { w: "20%", h: 24 })}
    ${field("44", "Nº Documento (CNS/CPF) do Profissional Solicitante", "", { w: "80%", h: 24 })}
  </div>

  ${band("Autorização")}
  <div class="row">
    ${field("46", "Nome do Profissional Autorizador", "", { w: "50%", h: 24 })}
    ${field("47", "Cód. Órgão Emissor", "", { w: "20%", h: 24 })}
    ${field("52", "Nº da Autorização (APAC)", boxes(13), { w: "30%", h: 24 })}
  </div>
  <div class="row">
    ${field("48", "Documento", `<span class="doc-checks"><span class="check"></span>CNS &nbsp; <span class="check"></span>CPF</span>`, { w: "20%", h: 24 })}
    ${field("49", "Nº Documento (CNS/CPF) do Profissional Autorizador", "", { w: "80%", h: 24 })}
  </div>
  <div class="row">
    ${field("50", "Data da Autorização", dataBoxes, { w: "25%", h: 24 })}
    ${field("51", "Assinatura e Carimbo (Nº do Registro do Conselho)", "", { w: "45%", h: 24 })}
    ${field("53", "Período de Validade da APAC", `${dataBoxes} <span class="sep">a</span> ${dataBoxes}`, { w: "30%", h: 24 })}
  </div>

  ${band("Identificação do Estabelecimento de Saúde (Executante)")}
  <div class="row">
    ${field("54", "Nome Fantasia do Estabelecimento de Saúde Executante", "", { w: "75%", h: 24 })}
    ${field("55", "CNES", boxes(7), { w: "25%", h: 24 })}
  </div>

</div>
</body></html>`;
}
