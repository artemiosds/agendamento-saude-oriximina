// Imprime o Laudo para Solicitação/Autorização de Procedimento Ambulatorial (APAC)
// Layout fiel ao formulário oficial SUS (fls. 1/2). Sem shell institucional.

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

  const unidadeNome = opts?.unidadeNome || "";
  const cnesUnidade = opts?.cnesUnidade || "";

  // SVG SUS — cruz/barras dentro do quadradinho (como no modelo)
  const susSymbol = `
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
      <g fill="#000">
        <path d="M5 11 q5 -5 12 0 q7 5 14 0 v3 q-7 5 -14 0 q-5 -5 -12 0 z"/>
        <path d="M5 20 q5 -5 12 0 q7 5 14 0 v3 q-7 5 -14 0 q-5 -5 -12 0 z"/>
        <path d="M5 29 q5 -5 12 0 q7 5 14 0 v3 q-7 5 -14 0 q-5 -5 -12 0 z"/>
      </g>
    </svg>`;

  const css = `
    @page { size: A4 portrait; margin: 4mm; }
    html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; }
    * { box-sizing: border-box; }

    .apac-page {
      width: 202mm; height: 289mm; margin: 0 auto;
      border: 1.5px solid #000; padding: 2mm;
      font-size: 6.5px; line-height: 1;
      page-break-inside: avoid; page-break-after: avoid;
      position: relative; overflow: hidden;
    }

    /* Header */
    .apac-header { display: grid; grid-template-columns: 70mm 1fr; gap: 1.5mm; margin-bottom: 1mm; }
    .apac-sus-box { border: 1px solid #000; height: 16mm; display: grid; grid-template-columns: 16mm 14mm 1fr 1fr; align-items: center; padding: 1mm; gap: 1mm; }
    .apac-sus-box .icon { border: 1px solid #000; height: 13mm; display: flex; align-items: center; justify-content: center; padding: 0.5mm; }
    .apac-sus-box .word { font-weight: 900; font-size: 16px; letter-spacing: 1px; text-align: center; font-family: "Arial Black", Arial, sans-serif; }
    .apac-sus-box .tx { font-weight: bold; font-size: 7.5px; line-height: 1.1; }
    .apac-title-box { border: 1px solid #000; height: 16mm; display: flex; align-items: center; justify-content: center; position: relative; text-align: center; font-size: 12px; font-style: italic; font-weight: 800; padding: 1mm 6mm; }
    .apac-fls { position: absolute; right: 2mm; top: 1mm; font-size: 11px; font-style: italic; font-weight: bold; }

    /* Section title */
    .apac-section-title { background: #000; color: #fff; text-align: center; font-size: 9px; font-weight: 800; height: 4mm; line-height: 4mm; margin: 1mm 0 0.6mm; }

    /* Field with floating label */
    .apac-row { display: grid; gap: 1mm; margin-bottom: 1mm; }
    .apac-field { border: 1px solid #000; min-height: 6.5mm; position: relative; padding: 2.2mm 1.2mm 0.6mm; }
    .apac-field.tall { min-height: 9mm; }
    .apac-field.obs { min-height: 26mm; }
    .apac-field.sig { min-height: 12mm; }
    .apac-label { position: absolute; top: -0.7mm; left: 1.5mm; background: #fff; padding: 0 0.8mm; font-size: 5.5px; text-transform: uppercase; font-weight: normal; line-height: 1; }
    .apac-value { font-size: 7.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .apac-value.multi { white-space: normal; }
    .apac-sex { font-size: 7px; }
    .apac-sex .cb { display: inline-block; width: 3mm; height: 3mm; border: 1px solid #000; vertical-align: middle; text-align: center; line-height: 3mm; font-weight: bold; }
    .apac-doc { font-size: 7px; }
    .apac-doc .cb { display: inline-block; width: 2.5mm; height: 2.5mm; border: 1px solid #000; vertical-align: middle; margin: 0 1mm 0 0; }

    .print-btn { position: fixed; top: 10px; right: 10px; padding: 8px 14px; background: #2A6F97; color: #fff; border: 0; border-radius: 6px; cursor: pointer; font-weight: 600; z-index: 9999; }
    @media print { .print-btn { display: none !important; } .apac-page { page-break-inside: avoid; page-break-after: avoid; } }
  `;

  const field = (label: string, value: string, cls = "") =>
    `<div class="apac-field ${cls}"><span class="apac-label">${label}</span><div class="apac-value">${esc(value)}</div></div>`;

  const emptyField = (label: string, cls = "") =>
    `<div class="apac-field ${cls}"><span class="apac-label">${label}</span><div class="apac-value">&nbsp;</div></div>`;

  // Procedimentos secundários (linhas 21..35)
  const procSec = [21, 24, 27, 30, 33]
    .map(
      (n) => `
    <div class="apac-row" style="grid-template-columns: 50mm 1fr 22mm;">
      ${emptyField(`${n} - CÓDIGO DO PROCEDIMENTO SECUNDÁRIO`)}
      ${emptyField(`${n + 1} - NOME DO PROCEDIMENTO SECUNDÁRIO`)}
      ${emptyField(`${n + 2} - QTDE.`)}
    </div>`
    )
    .join("");

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

    <!-- Header -->
    <div class="apac-header">
      <div class="apac-sus-box">
        <div class="icon">${susSymbol}</div>
        <div class="word">SUS</div>
        <div class="tx">Sistema<br/>Único de<br/>Saúde</div>
        <div class="tx">Ministério<br/>da<br/>Saúde</div>
      </div>
      <div class="apac-title-box">
        <div class="apac-fls">fls.1/2</div>
        LAUDO PARA SOLICITAÇÃO/AUTORIZAÇÃO DE<br/>PROCEDIMENTO AMBULATORIAL
      </div>
    </div>

    <div class="apac-section-title">IDENTIFICAÇÃO DO ESTABELECIMENTO DE SAÚDE (SOLICITANTE)</div>
    <div class="apac-row" style="grid-template-columns: 1fr 38mm;">
      ${field("1 - NOME DO ESTABELECIMENTO DE SAÚDE SOLICITANTE", unidadeNome)}
      ${field("2 - CNES", cnesUnidade)}
    </div>

    <div class="apac-section-title">IDENTIFICAÇÃO DO PACIENTE</div>
    <div class="apac-row" style="grid-template-columns: 1fr 38mm;">
      ${field("3 - NOME DO PACIENTE", nome)}
      ${field("4 - Nº DO PRONTUÁRIO", prontuario)}
    </div>
    <div class="apac-row" style="grid-template-columns: 1fr 32mm 32mm 32mm;">
      ${field("5 - CARTÃO NACIONAL DE SAÚDE (CNS)", cns)}
      ${field("6 - DATA DE NASCIMENTO", dataNasc)}
      `+`<div class="apac-field"><span class="apac-label">7 - SEXO</span><div class="apac-value apac-sex">Masc <span class="cb">${sexo === "M" ? "X" : ""}</span> &nbsp; Fem <span class="cb">${sexo === "F" ? "X" : ""}</span></div></div>`+`
      ${field("8 - RAÇA/COR", racaCor)}
    </div>
    <div class="apac-row" style="grid-template-columns: 1fr 14mm 36mm;">
      ${field("9 - NOME DA MÃE", nomeMae)}
      ${field("DDD", telSplit.ddd)}
      ${field("10 - TELEFONE DE CONTATO Nº DO TELEFONE", telSplit.numero)}
    </div>
    <div class="apac-row" style="grid-template-columns: 1fr 14mm 36mm;">
      ${field("11 - NOME DO RESPONSÁVEL", responsavel)}
      ${field("DDD", telRespSplit.ddd)}
      ${field("12 - TELEFONE DE CONTATO Nº DO TELEFONE", telRespSplit.numero)}
    </div>
    <div class="apac-row">
      ${field("13 - ENDEREÇO (RUA, Nº, BAIRRO)", endereco)}
    </div>
    <div class="apac-row" style="grid-template-columns: 1fr 32mm 14mm 28mm;">
      ${field("14 - MUNICÍPIO DE RESIDÊNCIA", municipio)}
      ${field("15 - CÓD. IBGE MUNICÍPIO", ibge)}
      ${field("16 - UF", uf)}
      ${field("17 - CEP", cep)}
    </div>

    <div class="apac-section-title">PROCEDIMENTO SOLICITADO</div>
    <div class="apac-row" style="grid-template-columns: 50mm 1fr 22mm;">
      ${emptyField("18 - CÓDIGO DO PROCEDIMENTO PRINCIPAL")}
      ${emptyField("19 - NOME DO PROCEDIMENTO PRINCIPAL")}
      ${emptyField("20 - QTDE.")}
    </div>

    <div class="apac-section-title">PROCEDIMENTO(S) SECUNDÁRIO(S)</div>
    ${procSec}

    <div class="apac-section-title">JUSTIFICATIVA DO(S) PROCEDIMENTO(S) SOLICITADO(S)</div>
    <div class="apac-row" style="grid-template-columns: 1fr 26mm 26mm 32mm;">
      ${emptyField("36 - DESCRIÇÃO DO DIAGNÓSTICO")}
      ${emptyField("37 - CID10 PRINCIPAL")}
      ${emptyField("38 - CID10 SECUNDÁRIO")}
      ${emptyField("39 - CID10 CAUSAS ASSOCIADAS")}
    </div>
    <div class="apac-row">
      ${emptyField("40 - OBSERVAÇÕES", "obs")}
    </div>

    <div class="apac-section-title">SOLICITAÇÃO</div>
    <div class="apac-row" style="grid-template-columns: 1fr 28mm 60mm;">
      ${emptyField("41 - NOME DO PROFISSIONAL SOLICITANTE")}
      ${emptyField("42 - DATA DA SOLICITAÇÃO")}
      ${emptyField("45 - ASSINATURA E CARIMBO (Nº REGISTRO DO CONSELHO)", "sig")}
    </div>
    <div class="apac-row" style="grid-template-columns: 40mm 1fr;">
      `+`<div class="apac-field"><span class="apac-label">43 - DOCUMENTO</span><div class="apac-value apac-doc"><span class="cb"></span>CNS &nbsp; <span class="cb"></span>CPF</div></div>`+`
      ${emptyField("44 - Nº DOCUMENTO (CNS/CPF) DO PROFISSIONAL SOLICITANTE")}
    </div>

    <div class="apac-section-title">AUTORIZAÇÃO</div>
    <div class="apac-row" style="grid-template-columns: 1fr 36mm 50mm;">
      ${emptyField("46 - NOME DO PROFISSIONAL AUTORIZADOR")}
      ${emptyField("47 - CÓD. ÓRGÃO EMISSOR")}
      ${emptyField("52 - Nº DA AUTORIZAÇÃO (APAC)")}
    </div>
    <div class="apac-row" style="grid-template-columns: 40mm 1fr;">
      `+`<div class="apac-field"><span class="apac-label">48 - DOCUMENTO</span><div class="apac-value apac-doc"><span class="cb"></span>CNS &nbsp; <span class="cb"></span>CPF</div></div>`+`
      ${emptyField("49 - Nº DOCUMENTO (CNS/CPF) DO PROFISSIONAL AUTORIZADOR")}
    </div>
    <div class="apac-row" style="grid-template-columns: 32mm 1fr 50mm;">
      ${emptyField("50 - DATA DA AUTORIZAÇÃO")}
      ${emptyField("51 - ASSINATURA E CARIMBO (Nº DO REGISTRO DO CONSELHO)", "sig")}
      `+`<div class="apac-field"><span class="apac-label">53 - PERÍODO DE VALIDADE DA APAC</span><div class="apac-value">____/____/____ a ____/____/____</div></div>`+`
    </div>

    <div class="apac-section-title">IDENTIFICAÇÃO DO ESTABELECIMENTO DE SAÚDE (EXECUTANTE)</div>
    <div class="apac-row" style="grid-template-columns: 1fr 38mm;">
      ${emptyField("54 - NOME FANTASIA DO ESTABELECIMENTO DE SAÚDE EXECUTANTE")}
      ${emptyField("55 - CNES")}
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
}
