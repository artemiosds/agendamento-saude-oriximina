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
  const linhas = Math.max(8, Math.min(18, Number(meta?.oci?.linhas_secundarias || 14)));
  const secundarios = [...data.procedimentosSecundarios].slice(0, linhas);
  while (secundarios.length < linhas) secundarios.push({ codigo: "", nome: "", quantidade: 0 });

  const esquerda = config?.mostrarLogos !== false && config?.logosConfig?.esquerda?.ativo !== false
    ? logo(config?.logoEsquerda || "", "Logomarca institucional")
    : "";
  const centro = config?.mostrarLogos !== false && config?.mostrarLogoCentral && config?.logosConfig?.central?.ativo !== false
    ? logo(config?.logoCentral || "", "Logomarca central")
    : "";
  const direita = config?.mostrarLogos !== false && config?.logosConfig?.direita?.ativo !== false
    ? logo(config?.logoDireita || "", "Logomarca municipal")
    : "";

  const p = data.paciente;
  const prof = data.profissional;
  const a = data.autorizacao;

  const rowsSec = secundarios.map((item) => `
    <tr>
      <td>${esc(item.codigo)}</td>
      <td>${esc(item.nome)}</td>
      <td class="oci-center">${item.quantidade ? esc(item.quantidade) : ""}</td>
    </tr>`).join("");

  const titulo = meta?.oci?.titulo || "LAUDO PARA SOLICITAÇÃO/AUTORIZAÇÃO DE OFERTA DE CUIDADOS INTEGRADOS (OCI)";

  return `
<style>
.oci-page{font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;width:100%;box-sizing:border-box;font-size:10px;line-height:1.15}
.oci-page *{box-sizing:border-box}
.oci-border{border:2px solid #111;padding:4px}
.oci-top{display:grid;grid-template-columns:35% 65%;gap:4px;align-items:stretch}
.oci-logos{border:1.5px solid #111;display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;align-items:center;justify-items:center;padding:4px;min-height:58px}
.oci-title{border:1.5px solid #111;display:flex;align-items:center;justify-content:center;text-align:center;font-weight:800;font-style:italic;font-size:16px;padding:6px}
.oci-section{background:#050505;color:#fff;text-align:center;font-weight:700;font-size:11px;padding:4px 6px;margin-top:5px;border:1px solid #050505}
.oci-grid{display:grid;border-left:1px solid #111;border-top:1px solid #111}
.oci-cell{position:relative;min-height:32px;border-right:1px solid #111;border-bottom:1px solid #111;padding:10px 6px 4px}
.oci-label{position:absolute;top:1px;left:7px;font-size:7px;font-weight:700;background:#fff;padding:0 2px;text-transform:uppercase}
.oci-value{font-size:10px;font-weight:500;white-space:normal;overflow-wrap:anywhere}
.oci-value.strong{font-weight:700}
.oci-center{text-align:center}
.oci-small{font-size:8px}
.oci-table{width:100%;border-collapse:collapse;table-layout:fixed}
.oci-table th,.oci-table td{border:1px solid #111;padding:3px 5px;height:23px;vertical-align:middle;font-size:8.5px;overflow-wrap:anywhere}
.oci-table th{font-size:7px;text-transform:uppercase;font-weight:700}
.oci-checkbox{display:inline-block;width:11px;height:11px;border:1px solid #111;text-align:center;line-height:9px;margin-right:2px;font-size:9px}
.oci-sign{min-height:58px}
.oci-carimbo{font-size:8px;text-align:center;line-height:1.2}
.oci-carimbo img{max-height:52px;max-width:180px}
.oci-muted{color:#333}
@media print{
  .oci-page{font-size:9px}
  .oci-border{break-inside:avoid}
  .oci-table tr{break-inside:avoid}
}
</style>
<div class="oci-page">
  <div class="oci-border">
    <div class="oci-top">
      <div class="oci-logos">${esquerda}<div>${centro}</div>${direita}</div>
      <div class="oci-title">${esc(titulo)}</div>
    </div>

    <div class="oci-section">IDENTIFICAÇÃO DO ESTABELECIMENTO DE SAÚDE (SOLICITANTE)</div>
    <div class="oci-grid" style="grid-template-columns:1fr 165px">
      ${cell("Nome do estabelecimento de saúde solicitante", data.estabelecimentoNome)}
      ${cell("CNES", data.cnes)}
    </div>

    <div class="oci-section">IDENTIFICAÇÃO DO PACIENTE</div>
    <div class="oci-grid" style="grid-template-columns:2.2fr .65fr .85fr">
      ${cell("Nome do paciente", p.nome)}
      <div class="oci-cell"><span class="oci-label">Sexo</span><div class="oci-value">
        <span class="oci-checkbox">${/^m/i.test(p.sexo) ? "X" : ""}</span> Mas.
        &nbsp;<span class="oci-checkbox">${/^f/i.test(p.sexo) ? "X" : ""}</span> Fem.
      </div></div>
      ${cell("Nº do prontuário", p.prontuario)}
    </div>
    <div class="oci-grid" style="grid-template-columns:1.65fr .55fr .45fr .45fr">
      ${cell("Cartão Nacional de Saúde (CNS)", p.cns)}
      ${cell("Data de nascimento", fmtDate(p.dataNascimento))}
      ${cell("Raça/Cor", p.racaCor)}
      ${cell("Etnia", p.etnia)}
    </div>
    <div class="oci-grid" style="grid-template-columns:2.1fr .9fr">
      ${cell("Nome da mãe", p.nomeMae)}
      ${cell("Telefone de contato", p.telefone)}
    </div>
    <div class="oci-grid" style="grid-template-columns:2.1fr .9fr">
      ${cell("Nome do responsável", p.nomeResponsavel)}
      ${cell("Telefone de contato", p.telefoneResponsavel)}
    </div>
    <div class="oci-grid" style="grid-template-columns:1fr">
      ${cell("Endereço (Rua, Nº, Bairro)", p.enderecoCompleto)}
    </div>
    <div class="oci-grid" style="grid-template-columns:1.25fr .4fr .35fr .55fr">
      ${cell("Município de residência", p.municipio)}
      ${cell("Cód. IBGE Município", p.codigoIbge)}
      ${cell("UF", p.uf)}
      ${cell("CEP", p.cep)}
    </div>

    <div class="oci-section">JUSTIFICATIVA DO(S) PROCEDIMENTO(S) SOLICITADO(S)</div>
    <div class="oci-grid" style="grid-template-columns:1.8fr .38fr .38fr .45fr">
      ${cell("Descrição do diagnóstico", data.descricaoDiagnostico)}
      ${cell("CID10 principal", data.cidPrincipal)}
      ${cell("CID10 secundário", data.cidSecundario)}
      ${cell("CID10 causas associadas", data.cidCausasAssociadas)}
    </div>
    <div class="oci-grid" style="grid-template-columns:1fr">
      ${cell("Observações", data.observacoes)}
    </div>

    <div class="oci-section">PROCEDIMENTO SOLICITADO</div>
    <table class="oci-table">
      <colgroup><col style="width:27%"><col><col style="width:9%"></colgroup>
      <thead><tr><th>Código do procedimento principal</th><th>Nome do procedimento principal</th><th>Qtde</th></tr></thead>
      <tbody><tr><td>${esc(data.procedimentoPrincipal.codigo)}</td><td>${esc(data.procedimentoPrincipal.nome)}</td><td class="oci-center">${esc(data.procedimentoPrincipal.quantidade || 1)}</td></tr></tbody>
    </table>

    <div class="oci-section">PROCEDIMENTO(S) SECUNDÁRIO(S)</div>
    <table class="oci-table">
      <colgroup><col style="width:27%"><col><col style="width:9%"></colgroup>
      <thead><tr><th>Código do procedimento secundário</th><th>Nome do procedimento secundário</th><th>Qtde</th></tr></thead>
      <tbody>${rowsSec}</tbody>
    </table>

    <div class="oci-section">SOLICITAÇÃO</div>
    <div class="oci-grid" style="grid-template-columns:1.7fr .45fr .55fr">
      ${cell("Nome do profissional solicitante", prof.nome)}
      ${cell("Data da solicitação", fmtDate(data.dataSolicitacao))}
      <div class="oci-cell oci-sign"><span class="oci-label">Assinatura e carimbo / Nº de registro do conselho</span><div class="oci-carimbo">${prof.carimboHtml || esc([prof.conselho, prof.numeroConselho, prof.ufConselho].filter(Boolean).join(" "))}</div></div>
    </div>
    <div class="oci-grid" style="grid-template-columns:.48fr 1.52fr">
      <div class="oci-cell"><span class="oci-label">Documento</span><div class="oci-value">
        <span class="oci-checkbox">${prof.documentoTipo === "CNS" ? "X" : ""}</span> CNS
        &nbsp;<span class="oci-checkbox">${prof.documentoTipo === "CPF" ? "X" : ""}</span> CPF
      </div></div>
      ${cell("Nº do documento (CNS/CPF) do profissional solicitante", prof.documentoNumero)}
    </div>

    <div class="oci-section">AUTORIZAÇÃO</div>
    <div class="oci-grid" style="grid-template-columns:1.3fr .45fr .65fr">
      ${cell("Nome do profissional autorizador", a.nomeAutorizador)}
      ${cell("Cód. órgão emissor", a.codigoOrgaoEmissor)}
      ${cell("Nº da autorização/APAC", a.numeroAutorizacao)}
    </div>
    <div class="oci-grid" style="grid-template-columns:.48fr 1.52fr">
      <div class="oci-cell"><span class="oci-label">Documento</span><div class="oci-value">
        <span class="oci-checkbox">${a.documentoTipo === "CNS" ? "X" : ""}</span> CNS
        &nbsp;<span class="oci-checkbox">${a.documentoTipo === "CPF" ? "X" : ""}</span> CPF
      </div></div>
      ${cell("Nº do documento (CNS/CPF) do profissional autorizador", a.documentoNumero)}
    </div>
    <div class="oci-grid" style="grid-template-columns:.5fr 1.45fr .65fr">
      ${cell("Data da autorização", fmtDate(a.dataAutorizacao))}
      ${cell("Assinatura e carimbo (Nº registro do conselho)", a.assinaturaCarimbo)}
      ${cell("Período de validade da APAC", [fmtDate(a.validadeInicio), fmtDate(a.validadeFim)].filter(Boolean).join(" a "))}
    </div>
  </div>
</div>`;
};
