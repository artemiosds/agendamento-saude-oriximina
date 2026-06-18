// Janela de impressão do Laudo APAC.
// Reaproveita o mesmo elemento DOM renderizado no preview para evitar
// divergências de coordenadas entre preview, impressão e PDF.

import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  APAC_TEMPLATE_URL,
  APAC_CSS,
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  buildOverlays,
  overlaysToHTML,
} from "./apacLaudoOverlay";
import { normalizePaciente, type AnyPaciente, type ApacLaudoData } from "./apacLaudoData";
import { lookupIbgeCode } from "./ibgeLookup";

async function resolveData(paciente: AnyPaciente | null): Promise<ApacLaudoData> {
  const base = normalizePaciente(paciente);
  if (base.ibge || !base.municipio || !base.uf) return base;
  try {
    const code = await Promise.race<string>([
      lookupIbgeCode(base.municipio, base.uf),
      new Promise<string>((r) => setTimeout(() => r(""), 5000)),
    ]);
    return code ? { ...base, ibge: code } : base;
  } catch {
    return base;
  }
}

function buildPrintHTML(data: ApacLaudoData): string {
  const overlaysHTML = overlaysToHTML(buildOverlays(data));
  // URL absoluta — janela aberta com window.open("") tem baseURI=about:blank,
  // caminhos relativos como "/__l5e/..." não resolveriam.
  const absTemplate = APAC_TEMPLATE_URL.startsWith("http")
    ? APAC_TEMPLATE_URL
    : `${window.location.origin}${APAC_TEMPLATE_URL}`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Laudo APAC</title>
  <base href="${window.location.origin}/" />
  <style>
    @page { size: A4 portrait; margin: 0; }
    html, body { width: ${A4_WIDTH_MM}mm; height: ${A4_HEIGHT_MM}mm; margin: 0; padding: 0; background: #fff; }
    ${APAC_CSS}
    .apac-page { margin: 0; page-break-after: avoid; page-break-inside: avoid; }
    @media print { html, body { background: #fff !important; } }
  </style>
</head>
<body>
  <div class="apac-page">
    <img class="apac-template" src="${absTemplate}" alt="" />
    ${overlaysHTML}
  </div>
</body>
</html>`;
}

export async function printApacLaudo(paciente: AnyPaciente | null): Promise<void> {
  const data = await resolveData(paciente);
  const html = buildPrintHTML(data);
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
      const fontsReady =
        (win.document as any).fonts?.ready || Promise.resolve();
      await fontsReady;
      const img = win.document.querySelector("img.apac-template") as HTMLImageElement | null;
      if (img && !img.complete) {
        await new Promise<void>((resolve, reject) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => reject(new Error("template")), { once: true });
        });
      }
      win.focus();
      win.print();
    } catch (e) {
      console.error("[ApacLaudo] template falhou", e);
      win.document.body.innerHTML =
        '<div style="font-family:sans-serif;padding:24px;color:#900;">Não foi possível gerar a impressão. Tente novamente.</div>';
    }
  };

  if (win.document.readyState === "complete") {
    setTimeout(triggerPrint, 80);
  } else {
    win.addEventListener("load", () => setTimeout(triggerPrint, 80));
  }
}

function sanitizeFilename(name: string): string {
  const safe = (name || "paciente")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || "paciente";
}

// Gera o PDF a partir do elemento real renderizado no preview.
export async function downloadApacLaudoPDF(
  element: HTMLElement | null,
  paciente: AnyPaciente | null,
): Promise<void> {
  if (!element) throw new Error("Elemento do laudo não disponível.");
  // Garante que IBGE foi resolvido — útil quando download é chamado muito rápido.
  await resolveData(paciente);

  // Render em escala alta para nitidez.
  const scale = 2;
  const canvas = await html2canvas(element, {
    scale,
    backgroundColor: "#ffffff",
    useCORS: true,
    allowTaint: false,
    logging: false,
    windowWidth: element.offsetWidth,
    windowHeight: element.offsetHeight,
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  pdf.addImage(imgData, "JPEG", 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM, undefined, "FAST");

  const nome = sanitizeFilename(paciente?.nome || "paciente");
  pdf.save(`Laudo_APAC_${nome}.pdf`);
}

// Compatibilidade com importações antigas.
export function buildLaudoApacHTML(paciente: AnyPaciente | null): string {
  return buildPrintHTML(normalizePaciente(paciente));
}
