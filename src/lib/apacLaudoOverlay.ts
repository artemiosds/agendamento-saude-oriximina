// Coordenadas (em mm) e valores sobrepostos ao template oficial APAC.
// Única fonte de verdade — usada tanto no preview quanto na impressão.

import type { ApacLaudoData } from "./apacLaudoData";

export const APAC_TEMPLATE_URL =
  "/__l5e/assets-v1/6f209566-9936-4e86-8185-20acc972fb2a/laudo-apac-oficial.jpg";

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

export interface TextOverlay {
  kind: "text";
  value: string;
  left: number; // mm
  top: number; // mm
  width: number; // mm (clip)
  fontSize: number; // pt
  align?: "left" | "center";
}

export interface DigitsOverlay {
  kind: "digits";
  value: string;
  startLeft: number; // mm (centro do primeiro dígito)
  top: number; // mm
  spacing: number; // mm entre centros
  count: number;
  fontSize: number;
}

export interface CheckOverlay {
  kind: "check";
  show: boolean;
  left: number;
  top: number;
  fontSize: number;
}

export type Overlay = TextOverlay | DigitsOverlay | CheckOverlay;

// Coordenadas calibradas sobre a página oficial (210×297 mm).
export function buildOverlays(d: ApacLaudoData): Overlay[] {
  const out: Overlay[] = [];
  const F = 9;
  const D = 9;

  // 3 - Nome do paciente
  out.push({ kind: "text", value: d.nome, left: 12, top: 46.5, width: 144, fontSize: F });
  // 4 - Nº prontuário
  out.push({ kind: "text", value: d.prontuario, left: 159, top: 46.5, width: 43, fontSize: F });

  // 5 - CNS (15 dígitos)
  out.push({
    kind: "digits",
    value: d.cns,
    startLeft: 14.7,
    top: 55.5,
    spacing: 5.66,
    count: 15,
    fontSize: D,
  });

  // 6 - Data de nascimento DD / MM / AAAA  (slashes a ~108 e ~119 mm)
  out.push({ kind: "digits", value: d.dataDD, startLeft: 102, top: 55.5, spacing: 3.5, count: 2, fontSize: D });
  out.push({ kind: "digits", value: d.dataMM, startLeft: 112.5, top: 55.5, spacing: 3.5, count: 2, fontSize: D });
  out.push({ kind: "digits", value: d.dataAAAA, startLeft: 122, top: 55.5, spacing: 3.0, count: 4, fontSize: D });

  // 7 - Sexo (X dentro do quadradinho)
  out.push({ kind: "check", show: d.sexoMasc, left: 146.5, top: 57, fontSize: 11 });
  out.push({ kind: "check", show: d.sexoFem, left: 163.5, top: 57, fontSize: 11 });

  // 8 - Raça/Cor
  out.push({ kind: "text", value: d.racaCor, left: 168, top: 55.5, width: 34, fontSize: F });

  // 9 - Nome da mãe
  out.push({ kind: "text", value: d.nomeMae, left: 12, top: 64.5, width: 125, fontSize: F });
  // 10 - DDD + Nº telefone
  out.push({ kind: "digits", value: d.telDDD, startLeft: 141.5, top: 64.5, spacing: 4.2, count: 2, fontSize: D });
  out.push({ kind: "digits", value: d.telNum, startLeft: 152, top: 64.5, spacing: 5.5, count: 9, fontSize: D });

  // 11 - Nome responsável
  out.push({ kind: "text", value: d.nomeResponsavel, left: 12, top: 73.5, width: 125, fontSize: F });
  // 12 - DDD + Nº telefone responsável
  out.push({ kind: "digits", value: d.telRespDDD, startLeft: 141.5, top: 73.5, spacing: 4.2, count: 2, fontSize: D });
  out.push({ kind: "digits", value: d.telRespNum, startLeft: 152, top: 73.5, spacing: 5.5, count: 9, fontSize: D });

  // 13 - Endereço
  out.push({ kind: "text", value: d.endereco, left: 12, top: 82, width: 190, fontSize: F });

  // 14 - Município
  out.push({ kind: "text", value: d.municipio, left: 12, top: 89, width: 117, fontSize: F });
  // 15 - Cód. IBGE (7 dígitos)
  out.push({
    kind: "digits",
    value: d.ibge,
    startLeft: 136.8,
    top: 89,
    spacing: 4.23,
    count: 7,
    fontSize: D,
  });
  // 16 - UF
  out.push({ kind: "text", value: d.uf, left: 168, top: 89, width: 8, fontSize: F, align: "center" });
  // 17 - CEP (8 dígitos)
  out.push({
    kind: "digits",
    value: d.cep,
    startLeft: 179.7,
    top: 89,
    spacing: 2.96,
    count: 8,
    fontSize: D,
  });

  return out;
}


const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function overlaysToHTML(overlays: Overlay[]): string {
  return overlays
    .map((o) => {
      if (o.kind === "text") {
        if (!o.value) return "";
        const align = o.align === "center" ? "text-align:center;" : "";
        return `<div class="apac-value" style="left:${o.left}mm;top:${o.top}mm;width:${o.width}mm;font-size:${o.fontSize}pt;${align}">${esc(o.value)}</div>`;
      }
      if (o.kind === "digits") {
        const v = (o.value || "").slice(0, o.count);
        let html = "";
        for (let i = 0; i < v.length; i++) {
          const ch = v[i];
          const cx = o.startLeft + i * o.spacing;
          html += `<div class="apac-value apac-digit" style="left:${cx}mm;top:${o.top}mm;font-size:${o.fontSize}pt;">${esc(ch)}</div>`;
        }
        return html;
      }
      if (o.kind === "check") {
        if (!o.show) return "";
        return `<div class="apac-value apac-check" style="left:${o.left}mm;top:${o.top}mm;font-size:${o.fontSize}pt;">✕</div>`;
      }
      return "";
    })
    .join("");
}

export const APAC_CSS = `
  html, body { margin: 0; padding: 0; background: #fff; }
  .apac-page {
    position: relative;
    width: ${A4_WIDTH_MM}mm;
    height: ${A4_HEIGHT_MM}mm;
    background: #fff;
    overflow: hidden;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
  }
  .apac-template {
    position: absolute;
    inset: 0;
    width: ${A4_WIDTH_MM}mm;
    height: ${A4_HEIGHT_MM}mm;
    object-fit: fill;
    z-index: 1;
    pointer-events: none;
    user-select: none;
  }
  .apac-value {
    position: absolute;
    z-index: 2;
    color: #000;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
  }
  .apac-digit {
    transform: translateX(-50%);
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .apac-check {
    transform: translate(-50%, -50%);
    font-weight: bold;
    line-height: 1;
  }
`;
