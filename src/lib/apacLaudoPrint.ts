// Laudo APAC — HTML/CSS A4 fiel ao PDF oficial (Ministério da Saúde).
// Reproduz cabeçalho SUS, faixas pretas e os 55 campos.
// Apenas os campos 3 a 17 são preenchidos automaticamente.
// Sem persistência, sem consulta extra ao banco.

import { ApacLaudoData, normalizePaciente, safeText, AnyPaciente } from "./apacLaudoData";

const esc = (s: string): string =>
  safeText(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const boxes = (raw: string, n: number): string => {
  const v = (raw || "").slice(0, n);
  return `<span class="boxes">${Array.from({ length: n }, (_, i) => `<span class="box">${esc(v[i] ?? "")}</span>`).join("")}</span>`;
};
const emptyBoxes = (n: number) => boxes("", n);

const dateBoxes = (dd: string, mm: string, aaaa: string) =>
  `${boxes(dd, 2)}<span class="dsep">/</span>${boxes(mm, 2)}<span class="dsep">/</span>${boxes(aaaa, 4)}`;

const telBlock = (ddd: string, num: string) =>
  `<div class="tel"><div class="tel-col"><div class="tel-lbl">DDD</div>${boxes(ddd, 2)}</div>` +
  `<div class="tel-col"><div class="tel-lbl">Nº DO TELEFONE</div>${boxes(num, 9)}</div></div>`;

interface FieldOpts {
  num: string;
  label: string;
  value?: string;
  flex?: number; // grid fraction
  h?: number; // min-height px
  noPadTop?: boolean;
}

const field = (o: FieldOpts) => `
  <div class="field" style="flex:${o.flex ?? 1};min-height:${o.h ?? 30}px;">
    <span class="flabel">${o.num} - ${o.label}</span>
    <div class="fvalue" style="${o.noPadTop ? "padding-top:1px;" : ""}">${o.value ?? ""}</div>
  </div>`;

const band = (t: string) => `<div class="band">${t}</div>`;

const secRow = (a: string, b: string, c: string) => `
  <div class="row">
    ${field({ num: a, label: "CÓDIGO DO PROCEDIMENTO SECUNDÁRIO", value: emptyBoxes(10), flex: 30, h: 34 })}
    ${field({ num: b, label: "NOME DO PROCEDIMENTO SECUNDÁRIO", flex: 58, h: 34 })}
    ${field({ num: c, label: "QTDE.", value: emptyBoxes(4), flex: 12, h: 34 })}
  </div>`;

export function buildApacLaudoData(paciente: AnyPaciente | null): ApacLaudoData {
  return normalizePaciente(paciente);
}

export function buildLaudoApacHTML(paciente: AnyPaciente | null): string {
  const d = normalizePaciente(paciente);

  const sexoHTML =
    `<span class="sex-item"><span class="check">${d.sexoMasc ? "✕" : ""}</span>Masc.</span>` +
    `<span class="sex-item"><span class="check">${d.sexoFem ? "✕" : ""}</span>Fem.</span>`;

  const docChecks =
    `<span class="doc"><span class="paren">(</span>&nbsp;<span class="paren">)</span> CNS &nbsp;&nbsp; ` +
    `<span class="paren">(</span>&nbsp;<span class="paren">)</span> CPF</span>`;

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Laudo APAC</title>
<style>
  @page { size: A4 portrait; margin: 5mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #ffffff; font-family: Arial, Helvetica, sans-serif; color: #000; }
  .sheet { width: 200mm; margin: 0 auto; padding: 0; background: #fff; font-size: 8px; line-height: 1.1; }
  @media screen {
    html, body { background: #e5e5e5; }
    .sheet { box-shadow: 0 0 6px rgba(0,0,0,0.15); margin: 6px auto; }
  }
  @media print {
    html, body { background: #fff !important; }
    .sheet { width: auto; box-shadow: none; margin: 0; }
  }

  /* Cabeçalho */
  .header { display: flex; align-items: stretch; border: 1px solid #000; }
  .h-logo { width: 36mm; display: flex; align-items: center; padding: 2mm; border-right: 1px solid #000; gap: 2mm; }
  .sus-svg { width: 11mm; height: 11mm; flex-shrink: 0; }
  .h-logo .h-texts { font-size: 8px; font-weight: bold; line-height: 1.15; display: flex; gap: 3mm; }
  .h-logo .h-texts div { display: flex; flex-direction: column; }
  .h-title { flex: 1; display: flex; align-items: center; justify-content: center; padding: 2mm 3mm; text-align: center; font-weight: bold; font-style: italic; font-size: 12px; text-transform: uppercase; line-height: 1.2; }
  .h-fls { width: 18mm; display: flex; align-items: flex-start; justify-content: flex-end; padding: 1mm 2mm; font-weight: bold; font-style: italic; font-size: 10px; border-left: 1px solid #000; }

  /* Faixas pretas de seção */
  .band { background: #000; color: #fff; font-weight: bold; font-size: 10px; padding: 1px 4px; text-align: center; text-transform: uppercase; letter-spacing: 0.3px; }

  /* Linhas e campos com label "encaixado" na borda superior */
  .row { display: flex; gap: 0; }
  .field { position: relative; border: 1px solid #000; border-top: 1px solid #000; border-left: 1px solid #000; padding: 7px 4px 2px 4px; background: #fff; margin: 0; }
  .row > .field + .field { border-left: 0; }
  .row + .row > .field { border-top: 0; }
  .row + .band { margin-top: 0; }
  .flabel { position: absolute; top: -5px; left: 6px; background: #fff; padding: 0 3px; font-size: 6.5px; font-weight: normal; white-space: nowrap; text-transform: uppercase; line-height: 1; }
  .fvalue { font-size: 9px; padding-top: 2px; min-height: 12px; word-break: break-word; }

  /* Caixas de dígito */
  .boxes { display: inline-flex; gap: 1px; }
  .box { display: inline-flex; align-items: center; justify-content: center; width: 11px; height: 13px; border: 1px solid #000; font-size: 9px; background: #fff; font-family: Arial, Helvetica, sans-serif; }
  .dsep { display: inline-block; width: 6px; text-align: center; font-weight: bold; font-size: 10px; }

  /* Sexo */
  .sex-item { margin-right: 10px; display: inline-flex; align-items: center; gap: 2px; }
  .check { display: inline-block; width: 11px; height: 11px; border: 1px solid #000; text-align: center; line-height: 9px; font-size: 9px; }

  /* Telefone */
  .tel { display: flex; gap: 4px; }
  .tel-col { display: flex; flex-direction: column; align-items: flex-start; }
  .tel-lbl { font-size: 6px; font-weight: normal; text-transform: uppercase; margin-bottom: 1px; }

  /* Documento (CNS/CPF) */
  .doc { font-size: 9px; }
  .paren { font-weight: bold; }
</style>
</head>
<body>
<div class="sheet" id="apac-laudo">

  <div class="header">
    <div class="h-logo">
      <svg class="sus-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="100" height="100" fill="#fff"/>
        <path d="M40 10 H60 V40 H90 V60 H60 V90 H40 V60 H10 V40 H40 Z" fill="#000"/>
        <text x="50" y="58" text-anchor="middle" font-family="Arial" font-size="22" font-weight="bold" fill="#fff">SUS</text>
      </svg>
      <div class="h-texts">
        <div><span>Sistema</span><span>Único de</span><span>Saúde</span></div>
        <div><span>Ministério</span><span>da</span><span>Saúde</span></div>
      </div>
    </div>
    <div class="h-title">Laudo para Solicitação/Autorização de<br/>Procedimento Ambulatorial</div>
    <div class="h-fls">fls.1/2</div>
  </div>

  ${band("IDENTIFICAÇÃO DO ESTABELECIMENTO DE SAÚDE (SOLICITANTE)")}
  <div class="row">
    ${field({ num: "1", label: "NOME DO ESTABELECIMENTO DE SAÚDE SOLICITANTE", flex: 75, h: 32 })}
    ${field({ num: "2", label: "CNES", value: emptyBoxes(7), flex: 25, h: 32 })}
  </div>

  ${band("IDENTIFICAÇÃO DO PACIENTE")}
  <div class="row">
    ${field({ num: "3", label: "NOME DO PACIENTE", value: esc(d.nome), flex: 75, h: 30 })}
    ${field({ num: "4", label: "Nº DO PRONTUÁRIO", value: esc(d.prontuario), flex: 25, h: 30 })}
  </div>
  <div class="row">
    ${field({ num: "5", label: "CARTÃO NACIONAL DE SAÚDE (CNS)", value: boxes(d.cns, 15), flex: 50, h: 30 })}
    ${field({ num: "6", label: "DATA DE NASCIMENTO", value: dateBoxes(d.dataNascDD, d.dataNascMM, d.dataNascAAAA), flex: 22, h: 30 })}
    ${field({ num: "7", label: "SEXO", value: sexoHTML, flex: 16, h: 30 })}
    ${field({ num: "8", label: "RAÇA/COR", value: esc(d.racaCor), flex: 12, h: 30 })}
  </div>
  <div class="row">
    ${field({ num: "9", label: "NOME DA MÃE", value: esc(d.nomeMae), flex: 60, h: 30 })}
    ${field({ num: "10", label: "TELEFONE DE CONTATO", value: telBlock(d.telDDD, d.telNum), flex: 40, h: 30 })}
  </div>
  <div class="row">
    ${field({ num: "11", label: "NOME DO RESPONSÁVEL", value: esc(d.nomeResponsavel), flex: 60, h: 30 })}
    ${field({ num: "12", label: "TELEFONE DE CONTATO", value: telBlock(d.telRespDDD, d.telRespNum), flex: 40, h: 30 })}
  </div>
  <div class="row">
    ${field({ num: "13", label: "ENDEREÇO (RUA, Nº, BAIRRO)", value: esc(d.endereco), flex: 100, h: 30 })}
  </div>
  <div class="row">
    ${field({ num: "14", label: "MUNICÍPIO DE RESIDÊNCIA", value: esc(d.municipio), flex: 50, h: 30 })}
    ${field({ num: "15", label: "CÓD. IBGE MUNICÍPIO", value: boxes(d.ibge, 7), flex: 22, h: 30 })}
    ${field({ num: "16", label: "UF", value: esc(d.uf), flex: 8, h: 30 })}
    ${field({ num: "17", label: "CEP", value: boxes(d.cep, 8), flex: 20, h: 30 })}
  </div>

  ${band("PROCEDIMENTO SOLICITADO")}
  <div class="row">
    ${field({ num: "18", label: "CÓDIGO DO PROCEDIMENTO PRINCIPAL", value: emptyBoxes(10), flex: 30, h: 34 })}
    ${field({ num: "19", label: "NOME DO PROCEDIMENTO PRINCIPAL", flex: 58, h: 34 })}
    ${field({ num: "20", label: "QTDE.", value: emptyBoxes(4), flex: 12, h: 34 })}
  </div>

  ${band("PROCEDIMENTO(S) SECUNDÁRIO(S)")}
  ${secRow("21", "22", "23")}
  ${secRow("24", "25", "26")}
  ${secRow("27", "28", "29")}
  ${secRow("30", "31", "32")}
  ${secRow("33", "34", "35")}

  ${band("JUSTIFICATIVA DO(S) PROCEDIMENTO(S) SOLICITADO(S)")}
  <div class="row">
    ${field({ num: "36", label: "DESCRIÇÃO DO DIAGNÓSTICO", flex: 55, h: 46 })}
    ${field({ num: "37", label: "CID10 PRINCIPAL", flex: 15, h: 46 })}
    ${field({ num: "38", label: "CID10 SECUNDÁRIO", flex: 15, h: 46 })}
    ${field({ num: "39", label: "CID10 CAUSAS ASSOCIADAS", flex: 15, h: 46 })}
  </div>
  <div class="row">
    ${field({ num: "40", label: "OBSERVAÇÕES", flex: 100, h: 110 })}
  </div>

  ${band("SOLICITAÇÃO")}
  <div class="row">
    ${field({ num: "41", label: "NOME DO PROFISSIONAL SOLICITANTE", flex: 50, h: 32 })}
    ${field({ num: "42", label: "DATA DA SOLICITAÇÃO", value: dateBoxes("", "", ""), flex: 20, h: 32 })}
    ${field({ num: "45", label: "ASSINATURA E CARIMBO (Nº REGISTRO DO CONSELHO)", flex: 30, h: 32 })}
  </div>
  <div class="row">
    ${field({ num: "43", label: "DOCUMENTO", value: docChecks, flex: 20, h: 26 })}
    ${field({ num: "44", label: "Nº DOCUMENTO (CNS/CPF) DO PROFISSIONAL SOLICITANTE", value: emptyBoxes(15), flex: 80, h: 26 })}
  </div>

  ${band("AUTORIZAÇÃO")}
  <div class="row">
    ${field({ num: "46", label: "NOME DO PROFISSIONAL AUTORIZADOR", flex: 50, h: 30 })}
    ${field({ num: "47", label: "CÓD. ÓRGÃO EMISSOR", flex: 20, h: 30 })}
    ${field({ num: "52", label: "Nº DA AUTORIZAÇÃO (APAC)", flex: 30, h: 30 })}
  </div>
  <div class="row">
    ${field({ num: "48", label: "DOCUMENTO", value: docChecks, flex: 20, h: 26 })}
    ${field({ num: "49", label: "Nº DOCUMENTO (CNS/CPF) DO PROFISSIONAL AUTORIZADOR", value: emptyBoxes(15), flex: 80, h: 26 })}
  </div>
  <div class="row">
    ${field({ num: "50", label: "DATA DA AUTORIZAÇÃO", value: dateBoxes("", "", ""), flex: 22, h: 30 })}
    ${field({ num: "51", label: "ASSINATURA E CARIMBO (Nº DO REGISTRO DO CONSELHO)", flex: 48, h: 30 })}
    ${field({ num: "53", label: "PERÍODO DE VALIDADE DA APAC", value: `${dateBoxes("", "", "")}<span class="dsep">a</span>${dateBoxes("", "", "")}`, flex: 30, h: 30 })}
  </div>

  ${band("IDENTIFICAÇÃO DO ESTABELECIMENTO DE SAÚDE (EXECUTANTE)")}
  <div class="row">
    ${field({ num: "54", label: "NOME FANTASIA DO ESTABELECIMENTO DE SAÚDE EXECUTANTE", flex: 75, h: 30 })}
    ${field({ num: "55", label: "CNES", value: emptyBoxes(7), flex: 25, h: 30 })}
  </div>

</div>
</body></html>`;
}

/**
 * Abre uma janela exclusiva para imprimir o Laudo APAC.
 * Não toca em nenhum outro DOM da aplicação.
 */
export function printApacLaudo(paciente: AnyPaciente | null): void {
  const html = buildLaudoApacHTML(paciente);
  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) {
    console.error("[ApacLaudo] popup bloqueado");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  const triggerPrint = () => {
    try {
      win.focus();
      win.print();
    } catch (e) {
      console.error("[ApacLaudo] print falhou", e);
    }
  };
  if (win.document.readyState === "complete") {
    setTimeout(triggerPrint, 150);
  } else {
    win.addEventListener("load", () => setTimeout(triggerPrint, 150));
  }
}
