import logoCerIi from "@/assets/logo-cer-ii.webp";
import type { DocumentConfig } from "@/lib/printLayout";

export interface OciProcedureItem {
  codigo: string;
  nome: string;
  quantidade: number;
}

export interface OciPatientData {
  nome: string;
  sexo: string;
  prontuario: string;
  cns: string;
  dataNascimento: string;
  racaCor: string;
  etnia: string;
  nomeMae: string;
  nomeResponsavel: string;
  telefone: string;
  telefoneResponsavel: string;
  enderecoCompleto: string;
  municipio: string;
  codigoIbge: string;
  uf: string;
  cep: string;
}

export interface OciProfessionalData {
  nome: string;
  documentoTipo: "CNS" | "CPF";
  documentoNumero: string;
  conselho: string;
  numeroConselho: string;
  ufConselho: string;
  carimboHtml?: string;
}

export interface OciAuthorizationData {
  nomeAutorizador: string;
  codigoOrgaoEmissor: string;
  numeroAutorizacao: string;
  documentoTipo: "CNS" | "CPF";
  documentoNumero: string;
  dataAutorizacao: string;
  validadeInicio: string;
  validadeFim: string;
  assinaturaCarimbo: string;
}

export interface OciStructuredData {
  paciente: OciPatientData;
  estabelecimentoNome: string;
  cnes: string;
  descricaoDiagnostico: string;
  cidPrincipal: string;
  cidSecundario: string;
  cidCausasAssociadas: string;
  observacoes: string;
  procedimentoPrincipal: OciProcedureItem;
  procedimentosSecundarios: OciProcedureItem[];
  profissional: OciProfessionalData;
  dataSolicitacao: string;
  autorizacao: OciAuthorizationData;
}

export interface OciTemplateMeta {
  structured_type?: "OCI";
  oci?: {
    titulo?: string;
    procedimento_principal?: Partial<OciProcedureItem>;
    linhas_secundarias?: number;
  };
}

const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const fmtDate = (value: string) => {
  if (!value) return "";
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
};

const logo = (url: string, alt: string, height = 44) =>
  url ? `<img src="${esc(url)}" alt="${esc(alt)}" style="max-height:${height}px;max-width:100%;object-fit:contain;" />` : "";

const cell = (label: string, value: unknown, extra = "") =>
  `<div class="oci-cell" ${extra}><span class="oci-label">${esc(label)}</span><div class="oci-value">${esc(value) || "&nbsp;"}</div></div>`;

export const buildOciAddress = (raw: any): string => {
  const pick = (...keys: string[]) => {
    const custom = raw?.custom_data || raw?.customData || {};
    for (const key of keys) {
      const values = [
        raw?.[key],
        custom?.[key],
        raw?.[key.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase())],
        custom?.[key.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase())],
      ];
      const value = values.find((v) => v !== null && v !== undefined && String(v).trim());
      if (value !== undefined) return String(value).trim();
    }
    return "";
  };

  const enderecoLivre = pick("endereco", "endereco_completo");
  const tipo = pick("tipo_logradouro", "tipoLogradouro");
  const logradouro = pick("logradouro");
  const numero = pick("numero");
  const complemento = pick("complemento");
  const bairro = pick("bairro");

  const partesEstruturadas = [
    [tipo, logradouro].filter(Boolean).join(" ").trim(),
    numero ? (["SN", "S/N"].includes(numero.toUpperCase()) ? numero.toUpperCase() : `Nº ${numero}`) : "",
    complemento,
    bairro ? `BAIRRO ${bairro}` : "",
  ].filter(Boolean);

  if (partesEstruturadas.length >= 2) return partesEstruturadas.join(", ");
  if (enderecoLivre) return enderecoLivre;
  return partesEstruturadas.join(", ");
};

export const createEmptyOciData = (
  paciente: OciPatientData,
  profissional: OciProfessionalData,
  estabelecimentoNome: string,
  cnes: string,
  principal?: Partial<OciProcedureItem>,
): OciStructuredData => ({
  paciente,
  estabelecimentoNome,
  cnes,
  descricaoDiagnostico: "",
  cidPrincipal: "",
  cidSecundario: "",
  cidCausasAssociadas: "",
  observacoes: "",
  procedimentoPrincipal: {
    codigo: principal?.codigo || "",
    nome: principal?.nome || "",
    quantidade: Number(principal?.quantidade || 1),
  },
  procedimentosSecundarios: [],
  profissional,
  dataSolicitacao: new Date().toISOString().slice(0, 10),
  autorizacao: {
    nomeAutorizador: "",
    codigoOrgaoEmissor: "",
    numeroAutorizacao: "",
    documentoTipo: "CNS",
    documentoNumero: "",
    dataAutorizacao: "",
    validadeInicio: "",
    validadeFim: "",
    assinaturaCarimbo: "",
  },
});

export const renderOciDocument = (
  data: OciStructuredData,
  config?: DocumentConfig | null,
  meta?: OciTemplateMeta | null,
): string => {
  // O formulário oficial usa aproximadamente 20 linhas de procedimentos
  // secundários. Mantemos isso configurável para futuras versões sem alterar
  // os modelos já criados.
  const linhas = Math.max(8, Math.min(24, Number(meta?.oci?.linhas_secundarias || 20)));
  const secundarios = [...data.procedimentosSecundarios].slice(0, linhas);
  while (secundarios.length < linhas) secundarios.push({ codigo: "", nome: "", quantidade: 0 });

  const logosHtml = config?.mostrarLogos === false
    ? '<span class="oci-logo-placeholder">&nbsp;</span>'
    : `<div class="oci-official-logos" aria-label="Secretaria Municipal de Saúde e Prefeitura de Oriximiná">
         <img src="${logoCerIi}" alt="Secretaria Municipal de Saúde e Prefeitura de Oriximiná" />
       </div>`;

  const p = data.paciente;
  const prof = data.profissional;
  const a = data.autorizacao;

  const valueStyle = (value: unknown, normal = 7.1, compact = 6.1, threshold = 58) =>
    `font-size:${String(value ?? "").length > threshold ? compact : normal}pt`;

  const field = (label: string, value: unknown, className = "", style = "") =>
    `<div class="oci-field ${className}" style="${style}">
      <span class="oci-field-label">${esc(label)}</span>
      <div class="oci-field-value" style="${valueStyle(value)}">${esc(value) || "&nbsp;"}</div>
    </div>`;

  const procedureRow = (item: OciProcedureItem, main = false) => `
    <div class="oci-proc-row ${main ? "oci-proc-main" : ""}">
      ${field(main ? "Código do procedimento principal" : "Código do procedimento secundário", item.codigo, "oci-proc-code")}
      ${field(main ? "Nome do procedimento principal" : "Nome do procedimento secundário", item.nome, "oci-proc-name", "text-align:center")}
      ${field("Qtde", item.quantidade ? item.quantidade : "", "oci-proc-qty", "text-align:center")}
    </div>`;

  const rowsSec = secundarios.map((item) => procedureRow(item)).join("");

  const titulo = meta?.oci?.titulo || "LAUDO PARA SOLICITAÇÃO/AUTORIZAÇÃO DE OFERTA DE CUIDADOS INTEGRADOS (OCI)";
  const periodoValidade = [fmtDate(a.validadeInicio), fmtDate(a.validadeFim)].filter(Boolean).join(" a ");

  return `
<style>
.oci-page{
  font-family:Arial,Helvetica,sans-serif;
  color:#000;
  background:#fff;
  width:100%;
  max-width:202mm;
  margin:0 auto;
  box-sizing:border-box;
  font-size:7pt;
  line-height:1.02;
}
.oci-page *{box-sizing:border-box}
.oci-frame{border:1.6px solid #111;padding:2.2mm}
.oci-top{
  display:grid;
  grid-template-columns:36% 64%;
  gap:2.5mm;
  height:11mm;
  margin-bottom:1.5mm;
}
.oci-logos{
  border:1.2px solid #111;
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:2mm;
  align-items:center;
  justify-items:center;
  padding:1.1mm 2mm;
  overflow:hidden;
}
.oci-official-logos{
  position:relative;
  width:100%;
  height:8.2mm;
  overflow:hidden;
}
.oci-official-logos img{
  position:absolute;
  width:160mm;
  height:auto;
  max-width:none;
  max-height:none;
  left:-34.5mm;
  top:-73.2mm;
}
.oci-logo-placeholder{display:block;width:100%}
.oci-title{
  border:1.2px solid #111;
  display:flex;
  align-items:center;
  justify-content:center;
  text-align:center;
  font-weight:800;
  font-style:italic;
  font-size:10pt;
  line-height:1.03;
  padding:1mm 2mm;
}
.oci-section{
  background:#050505;
  color:#fff;
  text-align:center;
  font-weight:700;
  font-size:7.5pt;
  line-height:1;
  height:5.3mm;
  display:flex;
  align-items:center;
  justify-content:center;
  margin-top:1.5mm;
  border:1px solid #050505;
}
.oci-grid{
  display:grid;
  border-left:1px solid #111;
  border-top:1px solid #111;
}
.oci-field{
  position:relative;
  min-height:6.4mm;
  border-right:1px solid #111;
  border-bottom:1px solid #111;
  padding:2.2mm 1.4mm .55mm;
  overflow:hidden;
  min-width:0;
}
.oci-field-label{
  position:absolute;
  top:.25mm;
  left:1.6mm;
  max-width:calc(100% - 3mm);
  font-size:4.8pt;
  line-height:1;
  font-weight:700;
  background:#fff;
  padding:0 .45mm;
  text-transform:uppercase;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.oci-field-value{
  font-weight:500;
  line-height:1.05;
  overflow-wrap:anywhere;
}
.oci-sex-value{display:flex;align-items:center;justify-content:center;gap:1.4mm;font-size:6.3pt;padding-top:.2mm}
.oci-checkbox{
  display:inline-flex;
  width:3.4mm;
  height:3.4mm;
  border:1px solid #111;
  align-items:center;
  justify-content:center;
  font-size:6pt;
  line-height:1;
}
.oci-address .oci-field-value{font-size:6.3pt!important;text-align:center}
.oci-observacoes{min-height:13.5mm}
.oci-observacoes .oci-field-value{font-size:6.5pt!important}
.oci-proc-row{
  display:grid;
  grid-template-columns:27% 64% 9%;
  gap:2.1mm;
  margin-top:1.05mm;
}
.oci-proc-row .oci-field{
  border:1px solid #111;
  min-height:4.65mm;
  padding-top:1.6mm;
  padding-bottom:.25mm;
}
.oci-proc-row .oci-field-label{
  top:.12mm;
  font-size:3.9pt;
  left:1.2mm;
}
.oci-proc-row .oci-field-value{
  font-size:5.75pt!important;
  line-height:1;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.oci-proc-main{margin-top:1.1mm}
.oci-proc-main .oci-field{min-height:5.4mm;padding-top:1.85mm}
.oci-proc-main .oci-field-value{font-size:6.8pt!important}
.oci-proc-main .oci-proc-name .oci-field-value{font-size:6.55pt!important;font-weight:500}
.oci-request-grid{
  display:grid;
  grid-template-columns:20% 44% 16% 20%;
  grid-template-rows:6.2mm 5.2mm;
  border-left:1px solid #111;
  border-top:1px solid #111;
}
.oci-request-grid .oci-field{min-height:0;height:100%}
.oci-request-name{grid-column:1/3}
.oci-request-date{grid-column:3}
.oci-request-sign{grid-column:4;grid-row:1/3}
.oci-request-doc-type{grid-column:1;grid-row:2}
.oci-request-doc-number{grid-column:2/4;grid-row:2}
.oci-sign-box{overflow:hidden}
.oci-sign-box .oci-field-value{
  font-size:5.1pt!important;
  text-align:center;
  line-height:1.02;
  overflow:hidden;
  max-height:10.2mm;
}
.oci-sign-box .carimbo-digital{
  display:block!important;
  border:0!important;
  border-radius:0!important;
  padding:0!important;
  margin:-.4mm auto 0!important;
  font-size:4.8pt!important;
  line-height:1.02!important;
  width:100%!important;
  max-width:100%!important;
  max-height:8.8mm!important;
  overflow:hidden!important;
}
.oci-sign-box .carimbo-digital *{
  max-width:100%!important;
  margin-left:auto!important;
  margin-right:auto!important;
}
.oci-sign-box img{display:block!important;max-height:6.6mm!important;max-width:34mm!important;width:auto!important;height:auto!important;object-fit:contain!important;margin:0 auto!important}
.oci-auth-grid{
  display:grid;
  grid-template-columns:16% 48% 16% 20%;
  grid-template-rows:6.0mm 5.2mm 6.2mm;
  border-left:1px solid #111;
  border-top:1px solid #111;
}
.oci-auth-grid .oci-field{min-height:0;height:100%}
.oci-auth-name{grid-column:1/3;grid-row:1}
.oci-auth-orgao{grid-column:3;grid-row:1}
.oci-auth-apac{grid-column:4;grid-row:1/3}
.oci-auth-doc-type{grid-column:1;grid-row:2}
.oci-auth-doc-number{grid-column:2/4;grid-row:2}
.oci-auth-date{grid-column:1;grid-row:3}
.oci-auth-sign{grid-column:2/4;grid-row:3}
.oci-auth-validity{grid-column:4;grid-row:3}
.oci-doc-options{display:flex;align-items:center;justify-content:center;gap:1mm;font-size:5.2pt;padding-top:.2mm}
.oci-center{text-align:center}
@media print{
  .oci-page{width:100%;max-width:none;margin:0;font-size:7pt}
  .oci-frame{break-inside:avoid}
  .oci-proc-row{break-inside:avoid}
}
</style>
<div class="oci-page">
  <div class="oci-frame">
    <div class="oci-top">
      <div class="oci-logos">${logosHtml}</div>
      <div class="oci-title">${esc(titulo)}</div>
    </div>

    <div class="oci-section">IDENTIFICAÇÃO DO ESTABELECIMENTO DE SAÚDE (SOLICITANTE)</div>
    <div class="oci-grid" style="grid-template-columns:83% 17%">
      ${field("Nome do estabelecimento de saúde solicitante", data.estabelecimentoNome)}
      ${field("CNES", data.cnes, "", "text-align:center")}
    </div>

    <div class="oci-section">IDENTIFICAÇÃO DO PACIENTE</div>
    <div class="oci-grid" style="grid-template-columns:70% 14% 16%">
      ${field("Nome do paciente", p.nome)}
      <div class="oci-field">
        <span class="oci-field-label">Sexo</span>
        <div class="oci-sex-value">
          <span>Mas.</span><span class="oci-checkbox">${/^m/i.test(p.sexo) ? "X" : ""}</span>
          <span>Fem.</span><span class="oci-checkbox">${/^f/i.test(p.sexo) ? "X" : ""}</span>
        </div>
      </div>
      ${field("Nº do prontuário", p.prontuario, "", "text-align:center")}
    </div>
    <div class="oci-grid" style="grid-template-columns:61% 16% 14% 9%">
      ${field("Cartão Nacional de Saúde (CNS)", p.cns)}
      ${field("Data de nascimento", fmtDate(p.dataNascimento), "", "text-align:center")}
      ${field("Raça/Cor", p.racaCor, "", "text-align:center")}
      ${field("Etnia", p.etnia, "", "text-align:center")}
    </div>
    <div class="oci-grid" style="grid-template-columns:72% 28%">
      ${field("Nome da mãe", p.nomeMae)}
      ${field("Telefone de contato", p.telefone, "", "text-align:center")}
    </div>
    <div class="oci-grid" style="grid-template-columns:72% 28%">
      ${field("Nome do responsável", p.nomeResponsavel)}
      ${field("Telefone de contato", p.telefoneResponsavel, "", "text-align:center")}
    </div>
    <div class="oci-grid" style="grid-template-columns:1fr">
      ${field("Endereço (Rua, Nº, Bairro)", p.enderecoCompleto, "oci-address")}
    </div>
    <div class="oci-grid" style="grid-template-columns:48% 16% 13% 23%">
      ${field("Município de residência", p.municipio, "", "text-align:center")}
      ${field("Cód. IBGE Município", p.codigoIbge, "", "text-align:center")}
      ${field("UF", p.uf, "", "text-align:center")}
      ${field("CEP", p.cep, "", "text-align:center")}
    </div>

    <div class="oci-section">JUSTIFICATIVA DO(S) PROCEDIMENTO(S) SOLICITADO(S)</div>
    <div class="oci-grid" style="grid-template-columns:62% 14% 12% 12%">
      ${field("Descrição do diagnóstico", data.descricaoDiagnostico)}
      ${field("CID10 principal", data.cidPrincipal, "", "text-align:center")}
      ${field("CID10 secundário", data.cidSecundario, "", "text-align:center")}
      ${field("CID10 causas associadas", data.cidCausasAssociadas, "", "text-align:center")}
    </div>
    <div class="oci-grid" style="grid-template-columns:1fr">
      ${field("Observações", data.observacoes, "oci-observacoes")}
    </div>

    <div class="oci-section">PROCEDIMENTO SOLICITADO</div>
    ${procedureRow(data.procedimentoPrincipal, true)}

    <div class="oci-section">PROCEDIMENTO(S) SECUNDÁRIO(S)</div>
    <div class="oci-secondary-list">${rowsSec}</div>

    <div class="oci-section">SOLICITAÇÃO</div>
    <div class="oci-request-grid">
      ${field("Nome do profissional solicitante", prof.nome, "oci-request-name")}
      ${field("Data da solicitação", fmtDate(data.dataSolicitacao), "oci-request-date", "text-align:center")}
      <div class="oci-field oci-request-sign oci-sign-box">
        <span class="oci-field-label">Assinatura e carimbo / Nº de registro do conselho</span>
        <div class="oci-field-value">${prof.carimboHtml || esc([prof.conselho, prof.numeroConselho, prof.ufConselho].filter(Boolean).join(" ")) || "&nbsp;"}</div>
      </div>
      <div class="oci-field oci-request-doc-type">
        <span class="oci-field-label">Documento</span>
        <div class="oci-doc-options">
          <span class="oci-checkbox">${prof.documentoTipo === "CNS" ? "X" : ""}</span><span>CNS</span>
          <span class="oci-checkbox">${prof.documentoTipo === "CPF" ? "X" : ""}</span><span>CPF</span>
        </div>
      </div>
      ${field("Nº documento (CNS/CPF) do profissional solicitante", prof.documentoNumero, "oci-request-doc-number", "text-align:center")}
    </div>

    <div class="oci-section">AUTORIZAÇÃO</div>
    <div class="oci-auth-grid">
      ${field("Nome do profissional autorizador", a.nomeAutorizador, "oci-auth-name")}
      ${field("Cód. órgão emissor", a.codigoOrgaoEmissor, "oci-auth-orgao", "text-align:center")}
      ${field("Nº da autorização (APAC)", a.numeroAutorizacao, "oci-auth-apac", "text-align:center")}
      <div class="oci-field oci-auth-doc-type">
        <span class="oci-field-label">Documento</span>
        <div class="oci-doc-options">
          <span class="oci-checkbox">${a.documentoTipo === "CNS" ? "X" : ""}</span><span>CNS</span>
          <span class="oci-checkbox">${a.documentoTipo === "CPF" ? "X" : ""}</span><span>CPF</span>
        </div>
      </div>
      ${field("Nº documento (CNS/CPF) do profissional autorizador", a.documentoNumero, "oci-auth-doc-number", "text-align:center")}
      ${field("Data da autorização", fmtDate(a.dataAutorizacao), "oci-auth-date", "text-align:center")}
      ${field("Assinatura e carimbo (Nº de registro do conselho)", a.assinaturaCarimbo, "oci-auth-sign", "text-align:center")}
      ${field("Período de validade da APAC", periodoValidade, "oci-auth-validity", "text-align:center")}
    </div>
  </div>
</div>`;
};
