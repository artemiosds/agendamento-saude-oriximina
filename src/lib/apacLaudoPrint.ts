// Imprime o Laudo para Solicitação/Autorização de Procedimento Ambulatorial (APAC)
// Layout baseado no formulário oficial SUS (fls. 1/2).
// Helper isolado: não altera fluxo, cadastro ou outras impressões.

import { loadDocumentConfig } from "@/lib/printLayout";
import { getCodigoIbge } from "@/lib/municipiosIbge";
import logoSmsFallback from "@/assets/logo-sms-oriximina.jpeg";

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

  // Carrega logos configuradas em "Impressão e Documentos" com fallback institucional
  let logoLeft = "";
  let logoRight = "";
  try {
    const cfg = await loadDocumentConfig();
    const pick = (u: string) => (u && (u.startsWith("http") || u.startsWith("/")) ? u : "");
    logoLeft = pick(cfg.logoEsquerda) || logoSmsFallback;
    logoRight = pick(cfg.logoDireita) || "";
  } catch {
    logoLeft = logoSmsFallback;
  }

  const css = `
    @page { size: A4 portrait; margin: 8mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #000; margin: 0; }
    .sheet { width: 100%; }
    .header { display: flex; align-items: stretch; border: 1px solid #000; }
    .header .logo { width: 18%; padding: 4px; border-right: 1px solid #000; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 10pt; }
    .header .sus { width: 22%; padding: 4px; border-right: 1px solid #000; font-size: 7.5pt; line-height: 1.15; }
    .header .title { flex: 1; padding: 6px; text-align: center; font-style: italic; font-weight: bold; font-size: 11pt; display: flex; align-items: center; justify-content: center; }
    .header .fls { width: 60px; padding: 4px; border-left: 1px solid #000; text-align: right; font-size: 8pt; font-weight: bold; }
    .section-title { background: #000; color: #fff; text-align: center; font-weight: bold; padding: 3px; font-size: 9pt; border-left: 1px solid #000; border-right: 1px solid #000; }
    .row { display: flex; border-left: 1px solid #000; border-right: 1px solid #000; }
    .row:last-child { border-bottom: 1px solid #000; }
    .cell { border-top: 1px solid #000; border-right: 1px solid #000; padding: 2px 4px; min-height: 28px; position: relative; }
    .cell:last-child { border-right: none; }
    .lbl { font-size: 6.5pt; font-weight: normal; display: block; }
    .val { font-size: 9.5pt; font-weight: bold; min-height: 14px; padding-top: 1px; }
    .grow { flex: 1; }
    .w-cnes { width: 130px; }
    .w-pront { width: 130px; }
    .w-sexo { width: 90px; }
    .w-raca { width: 130px; }
    .w-data { width: 110px; }
    .w-ddd { width: 50px; }
    .w-tel { width: 130px; }
    .w-ibge { width: 110px; }
    .w-uf { width: 60px; }
    .w-cep { width: 110px; }
    .sex-box { display: inline-block; border: 1px solid #000; width: 14px; height: 12px; vertical-align: middle; text-align: center; line-height: 12px; font-weight: bold; }
    .obs { min-height: 110px; }
    .empty-block { min-height: 24px; }
    .obs-block { min-height: 90px; }
    .print-btn { position: fixed; top: 10px; right: 10px; padding: 8px 14px; background: #2A6F97; color: #fff; border: 0; border-radius: 6px; cursor: pointer; font-weight: 600; }
    @media print { .print-btn { display: none; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
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
  <div class="sheet">
    <div class="header">
      <div class="logo">SUS</div>
      <div class="sus"><b>Sistema Único de Saúde</b><br/>Ministério da Saúde</div>
      <div class="title">LAUDO PARA SOLICITAÇÃO/AUTORIZAÇÃO DE<br/>PROCEDIMENTO AMBULATORIAL</div>
      <div class="fls">fls.1/2</div>
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
