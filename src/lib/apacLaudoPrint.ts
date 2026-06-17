// Imprime o Laudo APAC construído em HTML/CSS, sem imagem/template de fundo.

import { getCodigoIbge } from "@/lib/municipiosIbge";


type AnyPaciente = Record<string, any>;

const esc = (v: any): string => {
  if (v === null || v === undefined) return "";
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
};

const formatDataBR = (iso?: string): string => {
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
};

const onlyDigits = (v?: string) => (v || "").replace(/\D/g, "");

const splitDDD = (v?: string): { ddd: string; numero: string } => {
  const d = onlyDigits(v);
  if (d.length >= 10) return { ddd: d.slice(0, 2), numero: d.slice(2) };
  return { ddd: "", numero: d };
};

const montaEndereco = (cd: AnyPaciente): string => {
  const tipo = cd.tipoLogradouro || cd.tipo_logradouro || "";
  const log = cd.logradouro || "";
  const num = cd.numero || "";
  const bairro = cd.bairro || "";
  const ruaParte = [tipo, log].filter(Boolean).join(" ").trim();
  const partes: string[] = [];
  if (ruaParte) partes.push(ruaParte);
  if (num) partes.push(`Nº ${num}`);
  if (bairro) partes.push(bairro);
  return partes.join(", ");
};

const labelSexo = (v?: string): "M" | "F" | "" => {
  if (!v) return "";
  const s = String(v).toLowerCase();
  if (s.startsWith("m")) return "M";
  if (s.startsWith("f")) return "F";
  return "";
};

export async function imprimirLaudoApac(paciente: AnyPaciente, opts?: { unidadeNome?: string; cnesUnidade?: string }) {
  const cd: AnyPaciente = paciente?.custom_data || {};

  const nome = paciente?.nome || paciente?.nome_completo || "";
  const prontuario =
    paciente?.numeroProntuario || paciente?.numero_prontuario || cd.numeroProntuario || cd.numero_prontuario ||
    (paciente?.id ? String(paciente.id).slice(0, 8).toUpperCase() : "");
  const cns = paciente?.cns || cd.cns || "";
  const dataNasc = formatDataBR(paciente?.dataNascimento || paciente?.data_nascimento || cd.data_nascimento);
  const sexo = labelSexo(paciente?.sexo || cd.sexo);
  const racaCor = paciente?.raca_cor || cd.racaCor || cd.raca_cor || "";
  const nomeMae = paciente?.nomeMae || paciente?.nome_mae || cd.nome_mae || "";
  const telSplit = splitDDD(paciente?.telefone || cd.telefone);
  const responsavel = paciente?.nome_responsavel || cd.nome_responsavel || "";
  const telRespSplit = splitDDD(paciente?.telefone_responsavel || cd.telefone_responsavel || cd.telefoneResponsavel || "");
  const endereco = montaEndereco(cd);
  const municipio = paciente?.municipio || cd.municipio || "";
  const uf = cd.uf || paciente?.uf || cd.naturalidade_uf || "";
  const ibge =
    paciente?.codigo_ibge || paciente?.cod_ibge || cd.codigo_ibge || cd.codigoIbge ||
    cd.cod_ibge || cd.municipio_ibge || cd.ibge || getCodigoIbge(municipio, uf);
  const cep = cd.cep || "";

  void opts;

  const chars = (value: string, total: number) => {
    const clean = onlyDigits(value).slice(0, total).padEnd(total, " ");
    return clean.split("").map((ch) => `<span>${esc(ch.trim())}</span>`).join("");
  };

  const field = (label: string, value = "", className = "", content = "") => `
    <div class="apac-field ${className}">
      <div class="apac-label">${esc(label)}</div>
      ${content || `<div class="apac-value">${esc(value)}</div>`}
    </div>`;

  const digitField = (label: string, value: string, boxes: number, className = "") => field(
    label,
    "",
    `digit-field ${className}`,
    `<div class="digit-boxes" style="grid-template-columns: repeat(${boxes}, 1fr)">${chars(value, boxes)}</div>`,
  );

  const dateField = (label: string, value: string, className = "") => field(
    label,
    "",
    `date-field ${className}`,
    `<div class="date-value">${esc(value)}</div>`,
  );

  const phoneField = (label: string, tel: { ddd: string; numero: string }) => `
    <div class="phone-field">
      <div class="phone-ddd">
        <div class="mini-label">DDD</div>
        <div class="mini-value">${esc(tel.ddd)}</div>
      </div>
      <div class="phone-number">
        <div class="apac-label">${esc(label)}<br><small>Nº DO TELEFONE</small></div>
        <div class="digit-boxes phone-boxes" style="grid-template-columns: repeat(9, 1fr)">${chars(tel.numero, 9)}</div>
      </div>
    </div>`;

  const checkbox = (active: boolean) => `<span class="check-box">${active ? "X" : ""}</span>`;

  const section = (title: string) => `<div class="apac-title-bar">${esc(title)}</div>`;

  const css = `
    @page { size: A4 portrait; margin: 5mm; }
    html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; }
    * { box-sizing: border-box; }
    .apac-page {
      width: 200mm;
      height: 287mm;
      border: 1px solid #000;
      background: #fff;
      overflow: hidden;
      padding: 2mm;
      page-break-after: avoid;
      page-break-inside: avoid;
    }
    .apac-sheet {
      width: 100%;
      height: 100%;
      border: 1px solid #000;
      border-radius: 0 0 2mm 2mm;
      overflow: hidden;
    }
    .apac-header {
      height: 18mm;
      display: grid;
      grid-template-columns: 58mm 1fr;
      gap: 2mm;
      padding: 1.2mm 1.5mm 1mm;
    }
    .sus-header, .apac-main-title {
      border: 1px solid #000;
      height: 100%;
      position: relative;
      background: #fff;
    }
    .sus-header {
      display: grid;
      grid-template-columns: 20mm 18mm 1fr;
      align-items: center;
      padding: 1mm 1.5mm;
      column-gap: 1.4mm;
      font-weight: 800;
      font-size: 9px;
      line-height: 1.12;
    }
    .sus-mark {
      width: 18mm;
      height: 12mm;
      position: relative;
      margin-left: .5mm;
    }
    .sus-mark span { position: absolute; border: .8px solid #000; background: #fff; }
    .sus-mark .a { width: 8mm; height: 8mm; left: 5mm; top: 0; }
    .sus-mark .b { width: 16mm; height: 5mm; left: 0; top: 4.2mm; transform: skew(28deg); }
    .sus-mark .c { width: 6mm; height: 11mm; left: 9mm; top: 3mm; transform: skew(-18deg); }
    .sus-word { font-family: Arial Black, Arial, sans-serif; font-size: 13px; letter-spacing: 0; }
    .apac-main-title {
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-size: 16px;
      line-height: 1.08;
      font-style: italic;
      font-weight: 900;
      padding: 0 18mm 0 8mm;
    }
    .apac-fls {
      position: absolute;
      top: .6mm;
      right: 1.2mm;
      font-size: 14px;
      font-style: italic;
      font-weight: 900;
    }
    .apac-title-bar {
      height: 5mm;
      line-height: 5mm;
      background: #000;
      color: #fff;
      text-align: center;
      font-size: 10px;
      font-weight: 900;
    }
    .section-body { padding: 1.2mm; }
    .compact-body { padding: .8mm 1.2mm; }
    .apac-row { display: grid; gap: .9mm; margin-bottom: .9mm; }
    .apac-row:last-child { margin-bottom: 0; }
    .apac-field {
      border: 1px solid #777;
      min-height: 7.2mm;
      position: relative;
      padding: 2.6mm 1mm .5mm;
      background: #fff;
      overflow: hidden;
    }
    .apac-label {
      position: absolute;
      top: -1px;
      left: 4mm;
      background: #fff;
      padding: 0 .8mm;
      font-size: 6px;
      line-height: 1.05;
      text-transform: uppercase;
      font-weight: 400;
      color: #000;
    }
    .apac-value {
      font-size: 7.6px;
      line-height: 1.05;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 700;
      text-transform: uppercase;
    }
    .digit-field { padding: 3.1mm 0 0; }
    .digit-boxes {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 5.7mm;
      display: grid;
    }
    .digit-boxes span {
      border-left: 1px solid #999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 7px;
      font-weight: 700;
      line-height: 1;
    }
    .digit-boxes span:first-child { border-left: 0; }
    .date-field { display: flex; align-items: flex-end; justify-content: center; }
    .date-value { font-size: 8px; font-weight: 700; letter-spacing: .4mm; padding-bottom: .5mm; }
    .date-value:empty::before { content: '      /      /'; font-weight: 400; }
    .sex-field {
      border: 1px solid #777;
      min-height: 7.2mm;
      position: relative;
      padding-top: 2.8mm;
      font-size: 6px;
      text-align: center;
      white-space: nowrap;
    }
    .sex-field .apac-label { left: 7mm; }
    .check-box {
      display: inline-flex;
      width: 4.2mm;
      height: 4.2mm;
      border: 1px solid #999;
      align-items: center;
      justify-content: center;
      margin: 0 1mm .2mm .5mm;
      font-size: 8px;
      font-weight: 900;
      vertical-align: middle;
    }
    .phone-field { display: grid; grid-template-columns: 9mm 1fr; min-height: 8.6mm; }
    .phone-ddd, .phone-number { border: 1px solid #777; position: relative; min-height: 8.6mm; }
    .phone-number { border-left: 0; }
    .mini-label { text-align: center; font-size: 5.5px; padding-top: 1mm; }
    .mini-value { text-align: center; font-size: 7px; font-weight: 700; margin-top: .8mm; }
    .phone-boxes { height: 5.2mm; }
    .phone-number .apac-label { left: 10mm; right: 1mm; text-align: center; }
    .phone-number small { font-size: 5px; font-weight: 400; }
    .estab { height: 16.3mm; }
    .patient { height: 46mm; }
    .proc { height: 14.4mm; }
    .secondary { height: 47mm; }
    .just { height: 49mm; }
    .request { height: 24.8mm; }
    .auth { height: 38.4mm; }
    .exec { height: 9.4mm; }
    .h-8 { min-height: 8mm; }
    .h-9 { min-height: 9mm; }
    .h-12 { min-height: 12mm; }
    .h-17 { min-height: 17mm; }
    .h-31 { min-height: 31mm; }
    .no-margin { margin-bottom: 0; }
    .doc-line { display: flex; align-items: center; gap: 4mm; justify-content: center; font-size: 6px; padding-top: 3.2mm; }
    .doc-circle { letter-spacing: .6mm; white-space: nowrap; }
    .validade { text-align: center; font-size: 7px; padding-top: 3.4mm; }
    .print-btn { position: fixed; top: 10px; right: 10px; padding: 8px 14px; background: #2A6F97; color: #fff; border: 0; border-radius: 6px; cursor: pointer; font-weight: 600; z-index: 9999; }
    @media print {
      body { margin: 0; }
      .print-btn { display: none !important; }
      .apac-page { page-break-after: avoid; }
    }
  `;


  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Laudo APAC - ${esc(nome)}</title>
  <style>${css}</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Imprimir</button>
  <div class="apac-page">
    <div class="apac-sheet">
      <div class="apac-header">
        <div class="sus-header">
          <div class="sus-mark"><span class="a"></span><span class="b"></span><span class="c"></span></div>
          <div class="sus-word">SUS</div>
          <div>Sistema<br>Único de<br>Saúde</div>
          <div style="grid-column:3;grid-row:1;justify-self:end">Ministério<br>da<br>Saúde</div>
        </div>
        <div class="apac-main-title">
          <div>LAUDO PARA SOLICITAÇÃO/AUTORIZAÇÃO DE<br>PROCEDIMENTO AMBULATORIAL</div>
          <div class="apac-fls">fls.1/2</div>
        </div>
      </div>

      ${section("IDENTIFICAÇÃO DO ESTABELECIMENTO DE SAÚDE (SOLICITANTE)")}
      <div class="section-body estab">
        <div class="apac-row no-margin" style="grid-template-columns: 1fr 40mm">
          ${field("1 - NOME DO ESTABELECIMENTO DE SAÚDE SOLICITANTE", "", "h-9")}
          ${digitField("2 - CNES", "", 7, "h-9")}
        </div>
      </div>

      ${section("IDENTIFICAÇÃO DO PACIENTE")}
      <div class="section-body patient">
        <div class="apac-row" style="grid-template-columns: 1fr 33mm">
          ${field("3 - NOME DO PACIENTE", nome, "h-8")}
          ${field("4 - Nº DO PRONTUÁRIO", prontuario, "h-8")}
        </div>
        <div class="apac-row" style="grid-template-columns: 97mm 34mm 33mm 1fr">
          ${digitField("5 - CARTÃO NACIONAL DE SAÚDE (CNS)", cns, 15, "h-8")}
          ${dateField("6 - DATA DE NASCIMENTO", dataNasc, "h-8")}
          <div class="sex-field"><div class="apac-label">7 - SEXO</div>Masc.${checkbox(sexo === "M")} Fem.${checkbox(sexo === "F")}</div>
          ${field("8 - RAÇA/COR", racaCor, "h-8")}
        </div>
        <div class="apac-row" style="grid-template-columns: 1fr 72mm">
          ${field("9 - NOME DA MÃE", nomeMae, "h-8")}
          ${phoneField("10 - TELEFONE DE CONTATO", telSplit)}
        </div>
        <div class="apac-row" style="grid-template-columns: 1fr 72mm">
          ${field("11 - NOME DO RESPONSÁVEL", responsavel, "h-8")}
          ${phoneField("12 - TELEFONE DE CONTATO", telRespSplit)}
        </div>
        <div class="apac-row">
          ${field("13 - ENDEREÇO (RUA, Nº, BAIRRO)", endereco, "h-8")}
        </div>
        <div class="apac-row no-margin" style="grid-template-columns: 1fr 36mm 14mm 42mm">
          ${field("14 - MUNICÍPIO DE RESIDÊNCIA", municipio, "h-8")}
          ${field("15 - CÓD. IBGE MUNICÍPIO", ibge, "h-8")}
          ${field("16 - UF", uf, "h-8")}
          ${digitField("17 - CEP", cep, 8, "h-8")}
        </div>
      </div>

      ${section("PROCEDIMENTO SOLICITADO")}
      <div class="compact-body proc">
        <div class="apac-row no-margin" style="grid-template-columns: 64mm 1fr 23mm">
          ${digitField("18 - CÓDIGO DO PROCEDIMENTO PRINCIPAL", "", 10, "h-8")}
          ${field("19 - NOME DO PROCEDIMENTO PRINCIPAL", "", "h-8")}
          ${field("20 - QTDE.", "", "h-8")}
        </div>
      </div>

      ${section("PROCEDIMENTO(S) SECUNDÁRIO(S)")}
      <div class="compact-body secondary">
        ${[21,24,27,30,33].map((n, i) => `
          <div class="apac-row" style="grid-template-columns: 64mm 1fr 18mm; margin-bottom:${i === 4 ? 0 : .75}mm">
            ${digitField(`${n} - CÓDIGO DO PROCEDIMENTO SECUNDÁRIO`, "", 10, "h-8")}
            ${field(`${n + 1} - NOME DO PROCEDIMENTO SECUNDÁRIO`, "", "h-8")}
            ${field(`${n + 2} - QTDE.", "", "h-8")}
          </div>`).join("")}
      </div>

      ${section("JUSTIFICATIVA DO(S) PROCEDIMENTO(S) SOLICITADO(S)")}
      <div class="compact-body just">
        <div class="apac-row" style="grid-template-columns: 1fr 22mm 22mm 32mm">
          ${field("36 - DESCRIÇÃO DO DIAGNÓSTICO", "", "h-9")}
          ${field("37-CID10 PRINCIPAL", "", "h-9")}
          ${field("38-CID10 SECUNDÁRIO", "", "h-9")}
          ${field("39-CID10 CAUSAS ASSOCIADAS", "", "h-9")}
        </div>
        ${field("40 - OBSERVAÇÕES", "", "h-31")}
      </div>

      ${section("SOLICITAÇÃO")}
      <div class="compact-body request">
        <div class="apac-row" style="grid-template-columns: 1fr 28mm 64mm">
          ${field("41 - NOME DO PROFISSIONAL SOLICITANTE", "", "h-9")}
          ${dateField("42-DATA DA SOLICITAÇÃO", "", "h-9")}
          ${field("45-ASSINATURA E CARIMBO (Nº REGISTRO DO CONSELHO)", "", "h-17")}
        </div>
        <div class="apac-row no-margin" style="grid-template-columns: 38mm 1fr 64mm; margin-top:-9mm">
          ${field("43 - DOCUMENTO", "", "h-9", `<div class="doc-line"><span class="doc-circle">( ) CNS</span><span class="doc-circle">( ) CPF</span></div>`)}
          ${digitField("44 - Nº DOCUMENTO (CNS/CPF) DO PROFISSIONAL SOLICITANTE", "", 15, "h-9")}
          <div></div>
        </div>
      </div>

      ${section("AUTORIZAÇÃO")}
      <div class="compact-body auth">
        <div class="apac-row" style="grid-template-columns: 1fr 34mm 64mm">
          ${field("46 - NOME DO PROFISSIONAL AUTORIZADOR", "", "h-9")}
          ${field("47 - CÓD. ÓRGÃO EMISSOR", "", "h-9")}
          ${field("52 - Nº DA AUTORIZAÇÃO (APAC)", "", "h-31")}
        </div>
        <div class="apac-row" style="grid-template-columns: 38mm 1fr 64mm; margin-top:-22mm">
          ${field("48 - DOCUMENTO", "", "h-9", `<div class="doc-line"><span class="doc-circle">( ) CNS</span><span class="doc-circle">( ) CPF</span></div>`)}
          ${digitField("49 - Nº DOCUMENTO (CNS/CPF) DO PROFISSIONAL AUTORIZADOR", "", 15, "h-9")}
          <div></div>
        </div>
        <div class="apac-row no-margin" style="grid-template-columns: 30mm 1fr 64mm">
          ${dateField("50-DATA DA AUTORIZAÇÃO", "", "h-9")}
          ${field("51 - ASSINATURA E CARIMBO (Nº DO REGISTRO DO CONSELHO)", "", "h-9")}
          ${field("53 - PERÍODO DE VALIDADE DA APAC", "", "h-9", `<div class="validade">____/____/____ &nbsp;&nbsp; a &nbsp;&nbsp; ____/____/____</div>`)}
        </div>
      </div>

      ${section("IDENTIFICAÇÃO DO ESTABELECIMENTO DE SAÚDE (EXECUTANTE)")}
      <div class="compact-body exec">
        <div class="apac-row no-margin" style="grid-template-columns: 1fr 42mm">
          ${field("54 - NOME FANTASIA DO ESTABELECIMENTO DE SAÚDE EXECUTANTE", "", "h-8")}
          ${digitField("55 - CNES", "", 7, "h-8")}
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=1200");
  if (!w) {
    alert("Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  const printNow = () => {
    try { w.focus(); w.print(); } catch (e) { console.error(e); }
  };
  window.setTimeout(printNow, 250);
}

