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
  const cnsDigits = onlyDigits(paciente?.cns || cd.cns || "").slice(0, 15);
  const rawDataNasc = paciente?.dataNascimento || paciente?.data_nascimento || cd.data_nascimento || "";
  const dataNascMatch = String(rawDataNasc).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const nascDia = dataNascMatch ? dataNascMatch[3] : "";
  const nascMes = dataNascMatch ? dataNascMatch[2] : "";
  const nascAno = dataNascMatch ? dataNascMatch[1] : "";
  
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

  const unidadeNome = opts?.unidadeNome || "";
  const cnesUnidade = onlyDigits(opts?.cnesUnidade || "");

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
      padding: 0;
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
      height: 16.5mm;
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
      grid-template-columns: 24mm 17mm 1fr;
      align-items: center;
      padding: .8mm 1.2mm;
      column-gap: 1.2mm;
      font-weight: 800;
      font-size: 9px;
      line-height: 1.12;
    }
    .sus-mark {
      width: 13mm;
      height: 12mm;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .sus-mark svg { width: 100%; height: 100%; display: block; }
    .sus-logo { display: flex; flex-direction: column; align-items: center; gap: 0; }
    .sus-word { font-family: Arial Black, Arial, sans-serif; font-size: 11px; letter-spacing: .3px; margin-top: -1mm; }
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
      border: 1px solid #000;
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
      border-left: 1px solid #000;
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
    .date-slot-field { padding: 2.6mm 1mm .8mm; }
    .date-slots { display: flex; align-items: flex-end; justify-content: center; gap: 1mm; height: 100%; padding-top: 1mm; }
    .date-slot { display: inline-block; border-bottom: 1px solid #000; min-width: 5mm; text-align: center; font-size: 8px; font-weight: 700; line-height: 1; padding: 0 .5mm; }
    .date-slot.yy { min-width: 9mm; }
    .date-sep { font-size: 9px; font-weight: 700; padding-bottom: 0; }
    .sex-field {
      border: 1px solid #000;
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
      border: 1px solid #000;
      align-items: center;
      justify-content: center;
      margin: 0 1mm .2mm .5mm;
      font-size: 8px;
      font-weight: 900;
      vertical-align: middle;
    }
    .phone-field { display: grid; grid-template-columns: 9mm 1fr; min-height: 8.6mm; }
    .phone-ddd, .phone-number { border: 1px solid #000; position: relative; min-height: 8.6mm; }
    .phone-number { border-left: 0; }
    .mini-label { text-align: center; font-size: 5.5px; padding-top: 1mm; }
    .mini-value { text-align: center; font-size: 7px; font-weight: 700; margin-top: .8mm; }
    .phone-boxes { height: 5.2mm; }
    .phone-number .apac-label { left: 10mm; right: 1mm; text-align: center; }
    .phone-number small { font-size: 5px; font-weight: 400; }
    .estab { height: 11.4mm; }
    .patient { height: 52.5mm; }
    .proc { height: 10.5mm; }
    .secondary { height: 47.5mm; }
    .just { height: 45.5mm; }
    .request { height: 18.5mm; }
    .auth { height: 37mm; }
    .exec { height: 8.1mm; }
    .h-8 { min-height: 8mm; }
    .h-9 { min-height: 9mm; }
    .h-12 { min-height: 12mm; }
    .h-17 { min-height: 17mm; }
    .h-31 { min-height: 31mm; }
    .no-margin { margin-bottom: 0; }
    .span-grid { display: grid; gap: .9mm; }
    .span-grid .apac-field, .span-grid .sex-field { min-height: 0; height: 100%; }
    .g-r1 { grid-row: 1; }
    .g-r2 { grid-row: 2; }
    .g-r3 { grid-row: 3; }
    .g-span2 { grid-row: 1 / span 2; grid-column: 3; }
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
          <div class="sus-logo">
            <div class="sus-mark">
              <svg viewBox="0 0 60 56" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#000" stroke-width="1.5">
                <path d="M14 4 H36 V20 H56 V36 H36 V52 H14 V36 H4 V20 H14 Z" />
                <path d="M20 28 Q30 14 44 22 Q50 30 38 36 Q28 42 22 36" stroke-width="1.2"/>
              </svg>
            </div>
            <div class="sus-word">SUS</div>
          </div>
          <div>Sistema<br>Único de<br>Saúde</div>
          <div>Ministério<br>da<br>Saúde</div>
        </div>
        <div class="apac-main-title">
          <div>LAUDO PARA SOLICITAÇÃO/AUTORIZAÇÃO DE<br>PROCEDIMENTO AMBULATORIAL</div>
          <div class="apac-fls">fls.1/2</div>
        </div>
      </div>

      ${section("IDENTIFICAÇÃO DO ESTABELECIMENTO DE SAÚDE (SOLICITANTE)")}
      <div class="section-body estab">
        <div class="apac-row no-margin" style="grid-template-columns: 1fr 50mm">
          ${field("1 - NOME DO ESTABELECIMENTO DE SAÚDE SOLICITANTE", unidadeNome, "h-9")}
          ${digitField("2 - CNES", cnesUnidade, 7, "h-9")}
        </div>
      </div>

      ${section("IDENTIFICAÇÃO DO PACIENTE")}
      <div class="section-body patient">
        <div class="apac-row" style="grid-template-columns: 1fr 33mm">
          ${field("3 - NOME DO PACIENTE", nome, "h-8")}
          ${field("4 - Nº DO PRONTUÁRIO", prontuario, "h-8")}
        </div>
        <div class="apac-row" style="grid-template-columns: 97mm 34mm 33mm 1fr">
          ${digitField("5 - CARTÃO NACIONAL DE SAÚDE (CNS)", cnsDigits, 15, "h-8")}
          <div class="apac-field date-slot-field h-8">
            <div class="apac-label">6 - DATA DE NASCIMENTO</div>
            <div class="date-slots">
              <span class="date-slot dd">${esc(nascDia)}</span>
              <span class="date-sep">/</span>
              <span class="date-slot mm">${esc(nascMes)}</span>
              <span class="date-sep">/</span>
              <span class="date-slot yy">${esc(nascAno)}</span>
            </div>
          </div>
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
            ${field(`${n + 2} - QTDE.`, "", "h-8")}
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
        <div class="span-grid" style="grid-template-columns: 1fr 28mm 64mm; grid-template-rows: 9mm 9mm;">
          ${field("41 - NOME DO PROFISSIONAL SOLICITANTE", "", "h-9 g-r1")}
          ${dateField("42-DATA DA SOLICITAÇÃO", "", "h-9 g-r1")}
          ${field("45-ASSINATURA E CARIMBO (Nº REGISTRO DO CONSELHO)", "", "g-span2")}
          ${field("43 - DOCUMENTO", "", "g-r2", `<div class="doc-line"><span class="doc-circle">( ) CNS</span><span class="doc-circle">( ) CPF</span></div>`)}
          ${digitField("44 - Nº DOCUMENTO (CNS/CPF) DO PROFISSIONAL SOLICITANTE", "", 15, "g-r2")}
        </div>
      </div>

      ${section("AUTORIZAÇÃO")}
      <div class="compact-body auth">
        <div class="span-grid" style="grid-template-columns: 1fr 34mm 64mm; grid-template-rows: 9mm 9mm 9mm;">
          ${field("46 - NOME DO PROFISSIONAL AUTORIZADOR", "", "g-r1")}
          ${field("47 - CÓD. ÓRGÃO EMISSOR", "", "g-r1")}
          ${field("52 - Nº DA AUTORIZAÇÃO (APAC)", "", "g-span2")}
          ${field("48 - DOCUMENTO", "", "g-r2", `<div class="doc-line"><span class="doc-circle">( ) CNS</span><span class="doc-circle">( ) CPF</span></div>`)}
          ${digitField("49 - Nº DOCUMENTO (CNS/CPF) DO PROFISSIONAL AUTORIZADOR", "", 15, "g-r2")}
          ${dateField("50-DATA DA AUTORIZAÇÃO", "", "g-r3")}
          ${field("51 - ASSINATURA E CARIMBO (Nº DO REGISTRO DO CONSELHO)", "", "g-r3")}
          ${field("53 - PERÍODO DE VALIDADE DA APAC", "", "g-r3", `<div class="validade">____/____/____ &nbsp; a &nbsp; ____/____/____</div>`)}
        </div>
      </div>

      ${section("IDENTIFICAÇÃO DO ESTABELECIMENTO DE SAÚDE (EXECUTANTE)")}
      <div class="compact-body exec">
        <div class="apac-row no-margin" style="grid-template-columns: 1fr 50mm">
          ${field("54 - NOME FANTASIA DO ESTABELECIMENTO DE SAÚDE EXECUTANTE", unidadeNome, "h-8")}
          ${digitField("55 - CNES", cnesUnidade, 7, "h-8")}
        </div>
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

