// Janela de impressão do Laudo APAC.
// Usa exatamente o mesmo template e as mesmas coordenadas do preview.

import { normalizePaciente, type AnyPaciente } from "./apacLaudoData";
import {
  APAC_TEMPLATE_URL,
  APAC_CSS,
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  buildOverlays,
  overlaysToHTML,
} from "./apacLaudoOverlay";

function buildPrintHTML(paciente: AnyPaciente | null): string {
  const overlays = buildOverlays(normalizePaciente(paciente));
  const overlaysHTML = overlaysToHTML(overlays);
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Laudo APAC</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    html, body { width: ${A4_WIDTH_MM}mm; height: ${A4_HEIGHT_MM}mm; margin: 0; padding: 0; background: #fff; }
    ${APAC_CSS}
    .apac-page { margin: 0; page-break-after: avoid; page-break-inside: avoid; }
    @media print {
      html, body { background: #fff !important; }
    }
  </style>
</head>
<body>
  <div class="apac-page">
    <img class="apac-template" src="${APAC_TEMPLATE_URL}" alt="" />
    ${overlaysHTML}
  </div>
</body>
</html>`;
}

export function printApacLaudo(paciente: AnyPaciente | null): void {
  const html = buildPrintHTML(paciente);
  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) {
    console.error("[ApacLaudo] popup bloqueado");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();

  const triggerPrint = async () => {
    try {
      // aguarda fontes
      const fontsReady =
        (win.document as any).fonts && (win.document as any).fonts.ready
          ? (win.document as any).fonts.ready
          : Promise.resolve();
      await fontsReady;
      // aguarda imagem do template
      const img = win.document.querySelector("img.apac-template") as HTMLImageElement | null;
      if (img && !img.complete) {
        await new Promise<void>((resolve, reject) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => reject(new Error("template")), { once: true });
        });
      }
      if (img && (img.naturalWidth === 0 || img.naturalHeight === 0)) {
        throw new Error("template-empty");
      }
      win.focus();
      win.print();
    } catch (e) {
      console.error("[ApacLaudo] template falhou", e);
      win.document.body.innerHTML =
        '<div style="font-family:sans-serif;padding:24px;color:#900;">Falha ao carregar o template oficial do Laudo APAC. Tente novamente.</div>';
    }
  };

  if (win.document.readyState === "complete") {
    setTimeout(triggerPrint, 50);
  } else {
    win.addEventListener("load", () => setTimeout(triggerPrint, 50));
  }
}

// Mantido apenas para compatibilidade de importações antigas; não usado.
export function buildLaudoApacHTML(paciente: AnyPaciente | null): string {
  return buildPrintHTML(paciente);
}
