import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

interface ApacLaudoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paciente: any | null;
  unidadeNome?: string;
  cnesUnidade?: string;
}

/**
 * ETAPA 0 — Estrutura visual vazia do Laudo APAC.
 * Todos os campos exibem "TESTE" como placeholder.
 * Nenhum dado real do paciente é utilizado nesta etapa.
 */
function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return "";
  const str = String(s);
  if (str === "undefined" || str === "null" || str === "NaN") return "";
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function buildSkeletonHTML(paciente: any | null): string {
  const T = "TESTE";
  // Caixa individual de 1 dígito
  const box = (ch = "") => `<span class="box">${ch}</span>`;
  const boxes = (n: number, ch = "T") => Array.from({ length: n }, () => box(ch)).join("");

  // ETAPA 1 — dados reais apenas para campos 3, 9 e 14
  const p = paciente || {};
  const cd = p.custom_data || {};
  const nomePaciente = escapeHtml(p.nome) || "";
  const nomeMae = escapeHtml(p.nome_mae) || "";
  const municipio = escapeHtml(p.municipio || cd.municipio) || "";

  const band = (text: string) => `<div class="band">${text}</div>`;
  const field = (num: string, label: string, value: string = T, opts: { w?: string; h?: number } = {}) => `
    <div class="field" style="${opts.w ? `width:${opts.w};` : ""}${opts.h ? `min-height:${opts.h}px;` : ""}">
      <div class="flabel">${num} - ${label}</div>
      <div class="fvalue">${value}</div>
    </div>`;

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Laudo APAC</title>
<style>
  @page { size: A4 portrait; margin: 6mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #ddd; font-family: Arial, Helvetica, sans-serif; color: #000; }
  body { padding: 8px; }
  .sheet {
    width: 198mm; min-height: 285mm; margin: 0 auto; background: #fff;
    padding: 4mm 5mm; font-size: 8px; line-height: 1.15;
  }
  @media print {
    html, body { background: #fff; }
    body { padding: 0; }
    .sheet { width: auto; min-height: auto; margin: 0; padding: 0; box-shadow: none; }
  }
  .header { display: flex; align-items: flex-start; gap: 6px; margin-bottom: 4px; }
  .logo { width: 38px; height: 38px; border: 1px solid #000; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; }
  .header-text { flex: 1; text-align: center; font-size: 9px; line-height: 1.2; }
  .header-text .t1 { font-weight: bold; font-size: 10px; }
  .header-text .t2 { font-size: 8px; }
  .header-text .title { font-weight: bold; font-size: 10px; margin-top: 3px; text-transform: uppercase; }
  .fls { font-size: 8px; min-width: 40px; text-align: right; }
  .band {
    background: #000; color: #fff; font-weight: bold; font-size: 8.5px;
    padding: 2px 4px; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.2px;
  }
  .row { display: flex; border-left: 1px solid #000; border-top: 1px solid #000; }
  .row > .field { border-right: 1px solid #000; border-bottom: 1px solid #000; }
  .field { padding: 1px 3px 2px; flex: 1; min-height: 24px; }
  .flabel { font-size: 6.8px; font-weight: bold; text-transform: uppercase; line-height: 1.1; }
  .fvalue { font-size: 8.5px; padding-top: 1px; min-height: 11px; }
  .boxes { display: inline-flex; gap: 1px; }
  .box {
    display: inline-flex; align-items: center; justify-content: center;
    width: 10px; height: 12px; border: 1px solid #000;
    font-size: 8px; font-family: Arial, sans-serif; background: #fff;
  }
  .sep { display: inline-block; width: 6px; text-align: center; font-weight: bold; }
  .check { display: inline-block; width: 9px; height: 9px; border: 1px solid #000; margin-right: 2px; vertical-align: middle; }
  .inline-group { display: flex; gap: 8px; align-items: center; }
  .multi { min-height: 36px; }
  .tall { min-height: 48px; }
</style>
</head>
<body>
<div class="sheet">

  <!-- CABEÇALHO -->
  <div class="header">
    <div class="logo">SUS</div>
    <div class="header-text">
      <div class="t1">Sistema Único de Saúde</div>
      <div class="t2">Ministério da Saúde</div>
      <div class="title">Laudo para Solicitação / Autorização de Procedimento Ambulatorial</div>
    </div>
    <div class="fls">fls.1/2</div>
  </div>

  <!-- 1. ESTABELECIMENTO SOLICITANTE -->
  ${band("Identificação do Estabelecimento de Saúde (Solicitante)")}
  <div class="row">
    ${field("1", "Nome do Estabelecimento Solicitante", T, { w: "70%" })}
    ${field("2", "CNES", `<span class="boxes">${boxes(7)}</span>`, { w: "30%" })}
  </div>

  <!-- 2. IDENTIFICAÇÃO DO PACIENTE -->
  ${band("Identificação do Paciente")}
  <div class="row">
    ${field("3", "Nome do Paciente", nomePaciente, { w: "75%" })}
    ${field("4", "Nº do Prontuário", T, { w: "25%" })}
  </div>
  <div class="row">
    ${field("5", "Cartão Nacional de Saúde (CNS)", `<span class="boxes">${boxes(15)}</span>`, { w: "55%" })}
    ${field("6", "Data de Nascimento", `<span class="boxes">${boxes(2)}</span><span class="sep">/</span><span class="boxes">${boxes(2)}</span><span class="sep">/</span><span class="boxes">${boxes(4)}</span>`, { w: "25%" })}
    ${field("7", "Sexo", `<span class="check"></span>Masc. &nbsp; <span class="check"></span>Fem.`, { w: "10%" })}
    ${field("8", "Raça / Cor", T, { w: "10%" })}
  </div>
  <div class="row">
    ${field("9", "Nome da Mãe", nomeMae, { w: "60%" })}
    ${field("10", "Telefone de Contato",
      `(<span class="boxes">${boxes(2)}</span>) <span class="boxes">${boxes(9)}</span>`,
      { w: "40%" })}
  </div>
  <div class="row">
    ${field("11", "Nome do Responsável", T, { w: "60%" })}
    ${field("12", "Telefone do Responsável",
      `(<span class="boxes">${boxes(2)}</span>) <span class="boxes">${boxes(9)}</span>`,
      { w: "40%" })}
  </div>
  <div class="row">
    ${field("13", "Endereço (Rua, Nº, Bairro)", T, { w: "100%" })}
  </div>
  <div class="row">
    ${field("14", "Município de Residência", municipio, { w: "50%" })}
    ${field("15", "Cód. IBGE Município", `<span class="boxes">${boxes(7)}</span>`, { w: "30%" })}
    ${field("16", "UF", T, { w: "8%" })}
    ${field("17", "CEP", `<span class="boxes">${boxes(8)}</span>`, { w: "12%" })}
  </div>

  <!-- 3. PROCEDIMENTO SOLICITADO -->
  ${band("Procedimento Solicitado")}
  <div class="row">
    ${field("18", "Código do Procedimento", `<span class="boxes">${boxes(10)}</span>`, { w: "30%" })}
    ${field("19", "Nome do Procedimento", T, { w: "55%" })}
    ${field("20", "Quantidade", T, { w: "15%" })}
  </div>

  <!-- 4. PROCEDIMENTOS SECUNDÁRIOS -->
  ${band("Procedimento(s) Secundário(s)")}
  <div class="row">
    ${field("21", "CID-10 Principal", T, { w: "20%" })}
    ${field("22", "CID-10 Secundário", T, { w: "20%" })}
    ${field("23", "CID-10 Causas Associadas", T, { w: "20%" })}
    ${field("24", "CID-10 Outras Causas", T, { w: "20%" })}
    ${field("25", "Indicação Clínica", T, { w: "20%" })}
  </div>
  <div class="row">
    ${field("26", "Procedimento Secundário 1", T, { w: "33.33%" })}
    ${field("27", "Quantidade", T, { w: "16.66%" })}
    ${field("28", "Procedimento Secundário 2", T, { w: "33.33%" })}
    ${field("29", "Quantidade", T, { w: "16.66%" })}
  </div>
  <div class="row">
    ${field("30", "Procedimento Secundário 3", T, { w: "33.33%" })}
    ${field("31", "Quantidade", T, { w: "16.66%" })}
    ${field("32", "Procedimento Secundário 4", T, { w: "33.33%" })}
    ${field("33", "Quantidade", T, { w: "16.66%" })}
  </div>
  <div class="row">
    ${field("34", "Procedimento Secundário 5", T, { w: "83.33%" })}
    ${field("35", "Quantidade", T, { w: "16.66%" })}
  </div>

  <!-- 5. JUSTIFICATIVA -->
  ${band("Justificativa do(s) Procedimento(s) Solicitado(s)")}
  <div class="row">
    ${field("36", "Sinais e Sintomas Clínicos", T, { w: "100%", h: 28 })}
  </div>
  <div class="row">
    ${field("37", "Condições que Justificam o Caráter de Urgência (se for o caso)", T, { w: "100%", h: 22 })}
  </div>
  <div class="row">
    ${field("38", "Resultados de Provas Diagnósticas", T, { w: "100%", h: 22 })}
  </div>
  <div class="row">
    ${field("39", "Diagnóstico Inicial", T, { w: "60%" })}
    ${field("40", "CID-10 Principal", T, { w: "40%" })}
  </div>

  <!-- 6. SOLICITAÇÃO -->
  ${band("Solicitação")}
  <div class="row">
    ${field("41", "Nome do Profissional Solicitante", T, { w: "50%" })}
    ${field("42", "Documento do Profissional Solicitante", T, { w: "20%" })}
    ${field("43", "Nº do Documento", T, { w: "15%" })}
    ${field("44", "Estado", T, { w: "8%" })}
    ${field("45", "Data da Solicitação",
      `<span class="boxes">${boxes(2)}</span><span class="sep">/</span><span class="boxes">${boxes(2)}</span><span class="sep">/</span><span class="boxes">${boxes(4)}</span>`,
      { w: "7%" })}
  </div>

  <!-- 7. AUTORIZAÇÃO -->
  ${band("Autorização")}
  <div class="row">
    ${field("46", "Nº da APAC Principal Autorizada", `<span class="boxes">${boxes(13)}</span>`, { w: "30%" })}
    ${field("47", "Período de Validade da APAC (Início)",
      `<span class="boxes">${boxes(2)}</span><span class="sep">/</span><span class="boxes">${boxes(2)}</span><span class="sep">/</span><span class="boxes">${boxes(4)}</span>`,
      { w: "20%" })}
    ${field("48", "Período de Validade da APAC (Fim)",
      `<span class="boxes">${boxes(2)}</span><span class="sep">/</span><span class="boxes">${boxes(2)}</span><span class="sep">/</span><span class="boxes">${boxes(4)}</span>`,
      { w: "20%" })}
    ${field("49", "Cód. do Órgão Emissor", T, { w: "15%" })}
    ${field("50", "Cód. do Órgão Autorizador", T, { w: "15%" })}
  </div>
  <div class="row">
    ${field("51", "Nome do Profissional Autorizador", T, { w: "60%" })}
    ${field("52", "Documento do Autorizador", T, { w: "25%" })}
    ${field("53", "Data da Autorização",
      `<span class="boxes">${boxes(2)}</span><span class="sep">/</span><span class="boxes">${boxes(2)}</span><span class="sep">/</span><span class="boxes">${boxes(4)}</span>`,
      { w: "15%" })}
  </div>

  <!-- 8. EXECUTANTE -->
  ${band("Identificação do Estabelecimento de Saúde (Executante)")}
  <div class="row">
    ${field("54", "Nome do Estabelecimento Executante", T, { w: "70%" })}
    ${field("55", "CNES", `<span class="boxes">${boxes(7)}</span>`, { w: "30%" })}
  </div>

</div>
</body></html>`;
}

export function ApacLaudoModal({ open, onOpenChange, paciente }: ApacLaudoModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!open) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(buildSkeletonHTML(paciente));
    doc.close();
  }, [open, paciente]);

  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try { win.focus(); win.print(); } catch (e) { console.error(e); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[92vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-4 py-3 border-b flex flex-row items-center justify-between space-y-0">
          <DialogTitle>Laudo APAC — {paciente?.nome || "(estrutura visual)"}</DialogTitle>
          <Button size="sm" onClick={handlePrint} className="mr-8">
            <Printer className="w-4 h-4 mr-2" />
            Imprimir
          </Button>
        </DialogHeader>
        <div className="flex-1 bg-muted overflow-hidden">
          <iframe
            ref={iframeRef}
            title="Pré-visualização Laudo APAC"
            className="w-full h-full bg-white border-0"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ApacLaudoModal;
