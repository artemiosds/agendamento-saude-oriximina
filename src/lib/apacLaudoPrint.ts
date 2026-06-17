// Imprime o Laudo para Solicitação/Autorização de Procedimento Ambulatorial (APAC)
// Layout baseado no formulário oficial SUS (fls. 1/2).
// Helper isolado: não altera fluxo, cadastro ou outras impressões.

import { getCodigoIbge } from "@/lib/municipiosIbge";

type AnyPaciente = Record<string, any>;

const esc = (v: any): string => {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
};

const formatDataBR = (iso?: string): string => {
  if (!iso) return "";
  const s = String(iso);
  // yyyy-mm-dd
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
};

const onlyDigits = (v?: string) => (v || "").replace(/\D/g, "");

const formatTelefone = (v?: string): string => {
  const d = onlyDigits(v);
  if (!d) return "";
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v || "";
};

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
    paciente?.numeroProntuario ||
    paciente?.numero_prontuario ||
    cd.numeroProntuario ||
    cd.numero_prontuario ||
    (paciente?.id ? String(paciente.id).slice(0, 8).toUpperCase() : "");
  const cns = paciente?.cns || cd.cns || "";
  const dataNasc = formatDataBR(paciente?.dataNascimento || paciente?.data_nascimento || cd.data_nascimento);
  const sexo = labelSexo(paciente?.sexo || cd.sexo);
  const racaCor = paciente?.raca_cor || cd.racaCor || cd.raca_cor || "";
  const nomeMae = paciente?.nomeMae || paciente?.nome_mae || cd.nome_mae || "";
  const tel = formatTelefone(paciente?.telefone || cd.telefone);
  const telSplit = splitDDD(paciente?.telefone || cd.telefone);
  const responsavel = paciente?.nome_responsavel || cd.nome_responsavel || "";
  const telResp =
    paciente?.telefone_responsavel ||
    cd.telefone_responsavel ||
    cd.telefoneResponsavel ||
    "";
  const telRespSplit = splitDDD(telResp);
  const endereco = montaEndereco(cd);
  const municipio = paciente?.municipio || cd.municipio || "";
  const uf = cd.uf || paciente?.uf || cd.naturalidade_uf || "";
  const ibge =
    paciente?.codigo_ibge ||
    paciente?.cod_ibge ||
    cd.codigo_ibge ||
    cd.codigoIbge ||
    cd.cod_ibge ||
    cd.municipio_ibge ||
    cd.ibge ||
    getCodigoIbge(municipio, uf);
  const cep = cd.cep || "";

  const unidadeNome = opts?.unidadeNome || "";
  const cnesUnidade = opts?.cnesUnidade || "";

  // Modelo oficial APAC não usa logo institucional à direita; apenas o bloco SUS à esquerda.

  const css = `
    @page { size: A4 portrait; margin: 5mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 7pt; color: #000; line-height: 1.1; }
    .sheet { width: 200mm; min-height: 287mm; max-height: 287mm; margin: 0 auto; page-break-inside: avoid; page-break-after: avoid; position: relative; }
    .fls-top { position: absolute; top: 2px; right: 4px; font-size: 9pt; font-weight: bold; font-style: italic; }

    /* Header — matches official APAC: SUS logo cell, "SUS" word cell, two text cells, title cell */
    .header { display: flex; align-items: stretch; border: 1px solid #000; height: 46px; margin-top: 12px; }
    .header > div { display: flex; align-items: center; justify-content: center; }
    .header .sus-logo { width: 56px; border-right: 1px solid #000; padding: 3px; }
    .header .sus-logo .box { width: 100%; height: 100%; border: 1px solid #000; display: flex; align-items: center; justify-content: center; }
    .header .sus-logo svg { width: 70%; height: 70%; }
    .header .sus-word { width: 56px; border-right: 1px solid #000; font-weight: 900; font-size: 20pt; letter-spacing: 1px; font-family: Arial Black, Arial, sans-serif; }
    .header .sus-tx { width: 64px; border-right: 1px solid #000; text-align: left; font-size: 7pt; font-weight: bold; line-height: 1.1; padding: 2px 4px; justify-content: flex-start; align-items: center; }
    .header .sus-tx span { display: block; }
    .header .title { flex: 1; padding: 4px 8px; text-align: center; font-style: italic; font-weight: bold; font-size: 11pt; }

    /* Sections */
    .section-title { background: #000; color: #fff; text-align: center; font-weight: bold; padding: 0 2px; font-size: 8pt; line-height: 13px; height: 13px; border-left: 1px solid #000; border-right: 1px solid #000; }
    .row { display: flex; border-left: 1px solid #000; border-right: 1px solid #000; }
    .row:last-child { border-bottom: 1px solid #000; }
    .cell { border-top: 1px solid #000; border-right: 1px solid #000; padding: 0 3px 1px; min-height: 18px; position: relative; overflow: hidden; }
    .cell:last-child { border-right: none; }
    .lbl { font-size: 5.5pt; font-weight: bold; text-transform: uppercase; display: block; line-height: 1.05; }
    .val { font-size: 7.5pt; font-weight: bold; min-height: 10px; }
    .grow { flex: 1; }
    .w-cnes { width: 110px; }
    .w-pront { width: 110px; }
    .w-sexo { width: 80px; }
    .w-raca { width: 100px; }
    .w-data { width: 86px; }
    .w-ddd { width: 34px; }
    .w-tel { width: 108px; }
    .w-ibge { width: 100px; }
    .w-uf { width: 40px; }
    .w-cep { width: 82px; }
    .sex-box { display: inline-block; border: 1px solid #000; width: 12px; height: 10px; vertical-align: middle; text-align: center; line-height: 10px; font-weight: bold; font-size: 7pt; }
    .empty-block { min-height: 11px; }
    .obs-block { min-height: 60px; }
    .print-btn { position: fixed; top: 10px; right: 10px; padding: 8px 14px; background: #2A6F97; color: #fff; border: 0; border-radius: 6px; cursor: pointer; font-weight: 600; z-index: 9999; }
    @media print {
      .print-btn, .no-print { display: none !important; }
      body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .sheet { page-break-inside: avoid; page-break-after: avoid; }
    }
  `;

  // Símbolo SUS simplificado (cruz com barras onduladas) dentro de um quadradinho — igual ao modelo
  const susSymbol = `
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <g fill="#000">
        <path d="M6 10 q5 -5 12 0 q7 5 14 0 v4 q-7 5 -14 0 q-5 -5 -12 0 z"/>
        <path d="M6 20 q5 -5 12 0 q7 5 14 0 v3 q-7 5 -14 0 q-5 -5 -12 0 z"/>
        <path d="M6 29 q5 -5 12 0 q7 5 14 0 v3 q-7 5 -14 0 q-5 -5 -12 0 z"/>
      </g>
    </svg>`;

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Laudo APAC - ${esc(nome)}</title>
  <style>${css}</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Imprimir</button>
  <div class="sheet">
    <div class="fls-top">fls.1/2</div>
    <div class="header">
      <div class="sus-logo"><div class="box">${susSymbol}</div></div>
      <div class="sus-word">SUS</div>
      <div class="sus-tx"><div><span>Sistema</span><span>Único de</span><span>Saúde</span></div></div>
      <div class="sus-tx"><div><span>Ministério</span><span>da</span><span>Saúde</span></div></div>
      <div class="title">LAUDO PARA SOLICITAÇÃO/AUTORIZAÇÃO DE<br/>PROCEDIMENTO AMBULATORIAL</div>
    </div>




    <div class="section-title">IDENTIFICAÇÃO DO ESTABELECIMENTO DE SAÚDE (SOLICITANTE)</div>
    <div class="row">
      <div class="cell grow"><span class="lbl">1 - NOME DO ESTABELECIMENTO DE SAÚDE SOLICITANTE</span><div class="val">${esc(unidadeNome)}</div></div>
      <div class="cell w-cnes"><span class="lbl">2 - CNES</span><div class="val">${esc(cnesUnidade)}</div></div>
    </div>

    <div class="section-title">IDENTIFICAÇÃO DO PACIENTE</div>
    <div class="row">
      <div class="cell grow"><span class="lbl">3 - NOME DO PACIENTE</span><div class="val">${esc(nome)}</div></div>
      <div class="cell w-pront"><span class="lbl">4 - Nº DO PRONTUÁRIO</span><div class="val">${esc(prontuario)}</div></div>
    </div>
    <div class="row">
      <div class="cell grow"><span class="lbl">5 - CARTÃO NACIONAL DE SAÚDE (CNS)</span><div class="val">${esc(cns)}</div></div>
      <div class="cell w-data"><span class="lbl">6 - DATA DE NASCIMENTO</span><div class="val">${esc(dataNasc)}</div></div>
      <div class="cell w-sexo"><span class="lbl">7 - SEXO</span><div class="val">
        <span>Masc <span class="sex-box">${sexo === "M" ? "X" : ""}</span></span>
        &nbsp;&nbsp;
        <span>Fem <span class="sex-box">${sexo === "F" ? "X" : ""}</span></span>
      </div></div>
      <div class="cell w-raca"><span class="lbl">8 - RAÇA/COR</span><div class="val">${esc(racaCor)}</div></div>
    </div>
    <div class="row">
      <div class="cell grow"><span class="lbl">9 - NOME DA MÃE</span><div class="val">${esc(nomeMae)}</div></div>
      <div class="cell w-ddd"><span class="lbl">DDD</span><div class="val">${esc(telSplit.ddd)}</div></div>
      <div class="cell w-tel"><span class="lbl">10 - TELEFONE DE CONTATO</span><div class="val">${esc(telSplit.numero || tel)}</div></div>
    </div>
    <div class="row">
      <div class="cell grow"><span class="lbl">11 - NOME DO RESPONSÁVEL</span><div class="val">${esc(responsavel)}</div></div>
      <div class="cell w-ddd"><span class="lbl">DDD</span><div class="val">${esc(telRespSplit.ddd)}</div></div>
      <div class="cell w-tel"><span class="lbl">12 - TELEFONE DE CONTATO</span><div class="val">${esc(telRespSplit.numero)}</div></div>
    </div>
    <div class="row">
      <div class="cell grow"><span class="lbl">13 - ENDEREÇO (RUA, Nº, BAIRRO)</span><div class="val">${esc(endereco)}</div></div>
    </div>
    <div class="row">
      <div class="cell grow"><span class="lbl">14 - MUNICÍPIO DE RESIDÊNCIA</span><div class="val">${esc(municipio)}</div></div>
      <div class="cell w-ibge"><span class="lbl">15 - CÓD. IBGE MUNICÍPIO</span><div class="val">${esc(ibge)}</div></div>
      <div class="cell w-uf"><span class="lbl">16 - UF</span><div class="val">${esc(uf)}</div></div>
      <div class="cell w-cep"><span class="lbl">17 - CEP</span><div class="val">${esc(cep)}</div></div>
    </div>

    <div class="section-title">PROCEDIMENTO SOLICITADO</div>
    <div class="row">
      <div class="cell" style="width:160px"><span class="lbl">18 - CÓDIGO DO PROCEDIMENTO PRINCIPAL</span><div class="val empty-block"></div></div>
      <div class="cell grow"><span class="lbl">19 - NOME DO PROCEDIMENTO PRINCIPAL</span><div class="val empty-block"></div></div>
      <div class="cell" style="width:80px"><span class="lbl">20 - QTDE.</span><div class="val empty-block"></div></div>
    </div>

    <div class="section-title">PROCEDIMENTO(S) SECUNDÁRIO(S)</div>
    ${[21, 24, 27, 30, 33]
      .map(
        (n) => `
    <div class="row">
      <div class="cell" style="width:160px"><span class="lbl">${n} - CÓDIGO DO PROCEDIMENTO SECUNDÁRIO</span><div class="val empty-block"></div></div>
      <div class="cell grow"><span class="lbl">${n + 1} - NOME DO PROCEDIMENTO SECUNDÁRIO</span><div class="val empty-block"></div></div>
      <div class="cell" style="width:80px"><span class="lbl">${n + 2} - QTDE.</span><div class="val empty-block"></div></div>
    </div>`
      )
      .join("")}

    <div class="section-title">JUSTIFICATIVA DO(S) PROCEDIMENTO(S) SOLICITADO(S)</div>
    <div class="row">
      <div class="cell grow"><span class="lbl">36 - DESCRIÇÃO DO DIAGNÓSTICO</span><div class="val empty-block"></div></div>
      <div class="cell" style="width:110px"><span class="lbl">37 - CID10 PRINCIPAL</span><div class="val empty-block"></div></div>
      <div class="cell" style="width:110px"><span class="lbl">38 - CID10 SECUNDÁRIO</span><div class="val empty-block"></div></div>
      <div class="cell" style="width:130px"><span class="lbl">39 - CID10 CAUSAS ASSOCIADAS</span><div class="val empty-block"></div></div>
    </div>
    <div class="row">
      <div class="cell grow"><span class="lbl">40 - OBSERVAÇÕES</span><div class="val obs-block"></div></div>
    </div>

    <div class="section-title">SOLICITAÇÃO</div>
    <div class="row">
      <div class="cell grow"><span class="lbl">41 - NOME DO PROFISSIONAL SOLICITANTE</span><div class="val empty-block"></div></div>
      <div class="cell" style="width:120px"><span class="lbl">42 - DATA DA SOLICITAÇÃO</span><div class="val empty-block"></div></div>
      <div class="cell" style="width:240px"><span class="lbl">45 - ASSINATURA E CARIMBO (Nº REGISTRO DO CONSELHO)</span><div class="val empty-block"></div></div>
    </div>
    <div class="row">
      <div class="cell" style="width:160px"><span class="lbl">43 - DOCUMENTO</span><div class="val">( ) CNS &nbsp; ( ) CPF</div></div>
      <div class="cell grow"><span class="lbl">44 - Nº DOCUMENTO (CNS/CPF) DO PROFISSIONAL SOLICITANTE</span><div class="val empty-block"></div></div>
    </div>

    <div class="section-title">AUTORIZAÇÃO</div>
    <div class="row">
      <div class="cell grow"><span class="lbl">46 - NOME DO PROFISSIONAL AUTORIZADOR</span><div class="val empty-block"></div></div>
      <div class="cell" style="width:160px"><span class="lbl">47 - CÓD. ÓRGÃO EMISSOR</span><div class="val empty-block"></div></div>
      <div class="cell" style="width:200px"><span class="lbl">52 - Nº DA AUTORIZAÇÃO (APAC)</span><div class="val empty-block"></div></div>
    </div>
    <div class="row">
      <div class="cell" style="width:160px"><span class="lbl">48 - DOCUMENTO</span><div class="val">( ) CNS &nbsp; ( ) CPF</div></div>
      <div class="cell grow"><span class="lbl">49 - Nº DOCUMENTO (CNS/CPF) DO PROFISSIONAL AUTORIZADOR</span><div class="val empty-block"></div></div>
    </div>
    <div class="row">
      <div class="cell" style="width:140px"><span class="lbl">50 - DATA DA AUTORIZAÇÃO</span><div class="val empty-block"></div></div>
      <div class="cell grow"><span class="lbl">51 - ASSINATURA E CARIMBO (Nº DO REGISTRO DO CONSELHO)</span><div class="val empty-block"></div></div>
      <div class="cell" style="width:200px"><span class="lbl">53 - PERÍODO DE VALIDADE DA APAC</span><div class="val">____/____/____ a ____/____/____</div></div>
    </div>

    <div class="section-title">IDENTIFICAÇÃO DO ESTABELECIMENTO DE SAÚDE (EXECUTANTE)</div>
    <div class="row">
      <div class="cell grow"><span class="lbl">54 - NOME FANTASIA DO ESTABELECIMENTO DE SAÚDE EXECUTANTE</span><div class="val empty-block"></div></div>
      <div class="cell w-cnes"><span class="lbl">55 - CNES</span><div class="val empty-block"></div></div>
    </div>
  </div>
  <script>window.addEventListener('load', function(){ setTimeout(function(){ try{ window.focus(); }catch(e){} }, 100); });</script>
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
