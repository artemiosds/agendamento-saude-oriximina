// ============================================================================
// Impressão e PDF do Laudo APAC.
//
// Fonte ÚNICA: o elemento <svg id="apac-laudo-svg"> ao vivo. Tanto a janela
// de impressão quanto o PDF serializam o mesmo SVG — não há reconstrução em
// HTML nem coordenadas duplicadas.
// ============================================================================

import jsPDF from "jspdf";
import {
  APAC_SVG_HEIGHT,
  APAC_SVG_WIDTH,
  APAC_TEMPLATE_URL,
} from "./apacLaudoCoordinates";
import { normalizePaciente, type AnyPaciente } from "./apacLaudoData";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

// --------------- Helpers ---------------

async function fetchTemplateAsDataUrl(): Promise<string> {
  const url = APAC_TEMPLATE_URL.startsWith("http")
    ? APAC_TEMPLATE_URL
    : `${window.location.origin}${APAC_TEMPLATE_URL}`;
  const res = await fetch(url, { mode: "cors" });
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

// Clona o SVG removendo elementos de debug e trocando o href da <image>
// pela versão data-URL (necessário para impressão em janela nova e para
// rasterização em canvas).
function cloneSvgForOutput(svg: SVGSVGElement, templateDataUrl: string): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-apac-debug="1"]').forEach((n) => n.remove());
  clone.querySelectorAll("image").forEach((img) => {
    img.setAttribute("href", templateDataUrl);
    img.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", templateDataUrl);
  });
  // Garante atributos absolutos no SVG raiz.
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("viewBox", `0 0 ${APAC_SVG_WIDTH} ${APAC_SVG_HEIGHT}`);
  clone.setAttribute("width", `${A4_WIDTH_MM}mm`);
  clone.setAttribute("height", `${A4_HEIGHT_MM}mm`);
  clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
  return clone;
}

function serialize(svg: SVGSVGElement): string {
  return new XMLSerializer().serializeToString(svg);
}

function sanitizeFilename(name: string): string {
  const safe = (name || "paciente")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || "paciente";
}

// --------------- Impressão ---------------

export async function printApacLaudo(
  paciente: AnyPaciente | null,
  svg: SVGSVGElement | null,
): Promise<void> {
  if (!svg) throw new Error("SVG do laudo não disponível.");
  void normalizePaciente(paciente); // mantém assinatura compatível
  const templateDataUrl = await fetchTemplateAsDataUrl();
  const clone = cloneSvgForOutput(svg, templateDataUrl);
  const svgMarkup = serialize(clone);

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Laudo APAC</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    html, body { width: ${A4_WIDTH_MM}mm; height: ${A4_HEIGHT_MM}mm; margin: 0; padding: 0; background: #fff; }
    svg { display: block; width: ${A4_WIDTH_MM}mm; height: ${A4_HEIGHT_MM}mm; }
    @media print { html, body { background: #fff !important; } }
  </style>
</head>
<body>${svgMarkup}</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) {
    alert("O navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();

  const triggerPrint = async () => {
    try {
      const fontsReady = (win.document as any).fonts?.ready || Promise.resolve();
      await fontsReady;
      // Pequena espera para o SVG decodificar a data URL embutida.
      await new Promise((r) => setTimeout(r, 120));
      win.focus();
      win.print();
    } catch (e) {
      console.error("[ApacLaudo] impressão falhou", e);
      win.document.body.innerHTML =
        '<div style="font-family:sans-serif;padding:24px;color:#900;">Não foi possível gerar a impressão.</div>';
    }
  };

  if (win.document.readyState === "complete") setTimeout(triggerPrint, 80);
  else win.addEventListener("load", () => setTimeout(triggerPrint, 80));
}

// --------------- PDF ---------------

export async function downloadApacLaudoPDF(
  svg: SVGSVGElement | null,
  paciente: AnyPaciente | null,
): Promise<void> {
  if (!svg) throw new Error("SVG do laudo não disponível.");

  const templateDataUrl = await fetchTemplateAsDataUrl();
  const clone = cloneSvgForOutput(svg, templateDataUrl);
  const svgMarkup = serialize(clone);

  // SVG → Blob → <img> → canvas em resolução nativa 2480×3509.
  const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Falha ao carregar SVG do laudo."));
      img.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = APAC_SVG_WIDTH;
    canvas.height = APAC_SVG_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    pdf.addImage(imgData, "JPEG", 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM, undefined, "FAST");

    const nome = sanitizeFilename(paciente?.nome || "paciente");
    pdf.save(`Laudo_APAC_${nome}.pdf`);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

// Compat — chamadores antigos.
export function buildLaudoApacHTML(_paciente: AnyPaciente | null): string {
  return "";
}
