// Coordenadas (em mm) e valores sobrepostos ao template oficial APAC.
// Única fonte de verdade — usada tanto no preview quanto na impressão.

import type { ApacLaudoData } from "./apacLaudoData";

// Import via Vite: a imagem é incluída no bundle e funciona em dev,
// preview e produção. Sem dependência de caminhos /__l5e/ temporários.
import laudoApacTemplate from "@/assets/laudo-apac-oficial.jpg";
export const APAC_TEMPLATE_URL: string = laudoApacTemplate;

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

export interface FieldOverlay {
  kind: "field";
  value: string;
  left: number; // mm — canto superior esquerdo do campo
  top: number; // mm
  width: number; // mm — largura interna do campo
  height: number; // mm — altura interna do campo
  fontSize: number;
}

export type Overlay = TextOverlay | DigitsOverlay | CheckOverlay | FieldOverlay;


// Coordenadas calibradas sobre a página oficial (210×297 mm).
// Calibração feita por detecção de bordas no JPG oficial (2480×3509 px).
export function buildOverlays(d: ApacLaudoData): Overlay[] {
  const out: Overlay[] = [];
  const F = 9;
  const D = 9;

  // ---- Linha 3/4 (y interno 45.3–51.5 mm) ----
  // 3 - Nome do paciente: box x ≈ 11.85–158.8 mm
  out.push({ kind: "text", value: d.nome, left: 13, top: 47.5, width: 144, fontSize: F });
  // 4 - Nº do prontuário: box x ≈ 158.8–196.4 mm
  out.push({ kind: "text", value: d.prontuario, left: 160, top: 47.5, width: 35, fontSize: F });

  // ---- Linha 5/6/7/8 (y interno 51.5–59.8 mm) ----
  // 5 - CNS: 15 caixas em x ≈ 11.85–104.5 mm  (spacing ≈ 6.18 mm)
  out.push({
    kind: "digits",
    value: d.cns,
    startLeft: 14.95,
    top: 55.2,
    spacing: 6.175,
    count: 15,
    fontSize: D,
  });

  // 6 - Data de nascimento (DD / MM / AAAA) box x ≈ 107.0–137.6 mm
  // Barras já desenhadas no template ≈ 120.6 e 131.2 mm.
  // Três grupos isolados, sem reimprimir as barras.
  // DD: espaço 107.0–120.6  → centros ~ 113.3 / 116.3
  out.push({ kind: "digits", value: d.dataDD,   startLeft: 113.3, top: 55.2, spacing: 3.0, count: 2, fontSize: D });
  // MM: espaço 120.6–131.2  → centros ~ 124.4 / 127.4
  out.push({ kind: "digits", value: d.dataMM,   startLeft: 124.4, top: 55.2, spacing: 3.0, count: 2, fontSize: D });
  // AAAA: espaço 131.2–137.6 → 4 dígitos compactos
  out.push({ kind: "digits", value: d.dataAAAA, startLeft: 132.0, top: 55.2, spacing: 1.85, count: 4, fontSize: D });

  // 7 - Sexo: caixinhas em ≈ Masc(150.2) Fem(167.9) mm, centro y ≈ 56.3 mm
  out.push({ kind: "check", show: d.sexoMasc, left: 150.2, top: 56.6, fontSize: 11 });
  out.push({ kind: "check", show: d.sexoFem,  left: 167.9, top: 56.6, fontSize: 11 });

  // 8 - Raça/Cor: box x ≈ 174.0–196.4 mm
  out.push({ kind: "text", value: d.racaCor, left: 175, top: 55.2, width: 20, fontSize: F });

  // ---- Linha 9/10 (y interno 61.7–67.97 mm) ----
  // 9 - Nome da mãe: box x ≈ 11.85–139.7 mm
  out.push({ kind: "text", value: d.nomeMae, left: 13, top: 63.8, width: 125, fontSize: F });
  // 10 - DDD (2 caixas, ≈ 139.7–150.7 mm) + Nº telefone (8 caixas, ≈ 150.7–196.4 mm)
  out.push({ kind: "digits", value: d.telDDD, startLeft: 142.4, top: 63.8, spacing: 5.5,   count: 2, fontSize: D });
  out.push({ kind: "digits", value: d.telNum, startLeft: 153.5, top: 63.8, spacing: 5.46,  count: 8, fontSize: D });

  // ---- Linha 11/12 (y interno 70.25–76.51 mm) ----
  out.push({ kind: "text", value: d.nomeResponsavel, left: 13, top: 72.3, width: 125, fontSize: F });
  out.push({ kind: "digits", value: d.telRespDDD, startLeft: 142.4, top: 72.3, spacing: 5.5,   count: 2, fontSize: D });
  out.push({ kind: "digits", value: d.telRespNum, startLeft: 153.5, top: 72.3, spacing: 5.46,  count: 8, fontSize: D });

  // ---- Linha 13 (y interno 77.6–83.9 mm) ----
  // 13 - Endereço: ocupa toda a largura interna ≈ 11.85–196.4 mm
  out.push({ kind: "text", value: d.endereco, left: 13, top: 79.8, width: 182, fontSize: F });

  // ---- Linha 14/15/16/17 (y interno 86.1–92.3 mm) ----
  // 14 - Município de residência: box x ≈ 11.85–124.05 mm
  out.push({ kind: "text", value: d.municipio, left: 13, top: 88.3, width: 110, fontSize: F });
  // 15 - Cód. IBGE: 7 caixas em x ≈ 124.05–152.4 mm  (spacing ≈ 4.05 mm)
  out.push({
    kind: "digits",
    value: d.ibge,
    startLeft: 126.08,
    top: 88.5,
    spacing: 4.05,
    count: 7,
    fontSize: D,
  });
  // 16 - UF: box x ≈ 152.4–158.3 mm — campo centralizado (somente sigla)
  out.push({
    kind: "field",
    value: d.uf,
    left: 152.4,
    top: 86.4,
    width: 5.9,
    height: 4.6,
    fontSize: 9,
  });
  // 17 - CEP: 8 caixas em x ≈ 164.1–196.4 mm  (spacing ≈ 4.01 mm)
  out.push({
    kind: "digits",
    value: d.cep,
    startLeft: 166.15,
    top: 88.3,
    spacing: 4.012,
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
      if (o.kind === "field") {
        if (!o.value) return "";
        return `<div class="apac-value apac-field" style="left:${o.left}mm;top:${o.top}mm;width:${o.width}mm;height:${o.height}mm;font-size:${o.fontSize}pt;">${esc(o.value)}</div>`;
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
  .apac-field {
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: Arial, Helvetica, sans-serif;
    font-weight: normal;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
  }
`;
