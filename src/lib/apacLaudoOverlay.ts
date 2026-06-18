// Mapa central de coordenadas dos campos 3 a 17 do Laudo APAC.
// Todas as posições são pixels da imagem oficial (laudo-apac-oficial.jpg,
// natural 2480×3509). A conversão para mm é feita exclusivamente por
// imageBoxPxToMm — única fonte de coordenadas para preview, impressão e PDF.

import laudoApacTemplate from "@/assets/laudo-apac-oficial.jpg";
import {
  type ApacBox,
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  APAC_TEMPLATE_NATURAL_WIDTH,
  APAC_TEMPLATE_NATURAL_HEIGHT,
  boxFromMm,
  digitBoxesFromMm,
  imageBoxPxToMm,
  getTextOverlayStyle,
  getDigitOverlayStyle,
} from "./apacCoordinateSystem";

export const APAC_TEMPLATE_URL: string = laudoApacTemplate;
export { A4_WIDTH_MM, A4_HEIGHT_MM, APAC_TEMPLATE_NATURAL_WIDTH, APAC_TEMPLATE_NATURAL_HEIGHT };
export type { ApacBox };

// Modo calibração — quando true, desenha um retângulo em cada caixa.
export const APAC_DEBUG = false;

export interface ApacPatientFields {
  patientName: ApacBox;       // 3
  recordNumber: ApacBox;      // 4
  cns: ApacBox[];             // 5 (15)
  birthDate: { day: ApacBox; month: ApacBox; year: ApacBox }; // 6
  sex: { male: ApacBox; female: ApacBox };                    // 7
  raceColor: ApacBox;         // 8
  motherName: ApacBox;        // 9
  patientPhone: { ddd: ApacBox[]; number: ApacBox[] };        // 10
  responsibleName: ApacBox;   // 11
  responsiblePhone: { ddd: ApacBox[]; number: ApacBox[] };    // 12
  address: ApacBox;           // 13
  municipality: ApacBox;      // 14
  ibgeCode: ApacBox[];        // 15 (7)
  state: ApacBox;             // 16
  zipCode: ApacBox[];         // 17 (8)
}

// Coordenadas calibradas por medição direta sobre a imagem oficial
// (2480×3509 px). Cada caixa é um objeto literal em pixels — qualquer
// recalibração futura deve substituir esses valores por novas medições
// na mesma imagem. NÃO usar boxFromMm aqui para os campos 3 a 17.
export const APAC_PATIENT_FIELDS: ApacPatientFields = {
  // 3 — Nome do paciente (cell 140..1947, y 535..609)
  patientName: { x: 148, y: 542, width: 1795, height: 60 },
  // 4 — Nº do prontuário (cell 1965..2317)
  recordNumber: { x: 1973, y: 542, width: 340, height: 60 },
  // 5 — CNS (15 caixas, linhas verticais detectadas: 140,212,284,358,431,503,576,649,722,795,868,941,1014,1086,1159,1234; y 609..706)
  cns: [
    { x: 140,  y: 612, width: 72, height: 90 },
    { x: 212,  y: 612, width: 72, height: 90 },
    { x: 284,  y: 612, width: 74, height: 90 },
    { x: 358,  y: 612, width: 73, height: 90 },
    { x: 431,  y: 612, width: 72, height: 90 },
    { x: 503,  y: 612, width: 73, height: 90 },
    { x: 576,  y: 612, width: 73, height: 90 },
    { x: 649,  y: 612, width: 73, height: 90 },
    { x: 722,  y: 612, width: 73, height: 90 },
    { x: 795,  y: 612, width: 73, height: 90 },
    { x: 868,  y: 612, width: 73, height: 90 },
    { x: 941,  y: 612, width: 73, height: 90 },
    { x: 1014, y: 612, width: 72, height: 90 },
    { x: 1086, y: 612, width: 73, height: 90 },
    { x: 1159, y: 612, width: 75, height: 90 },
  ],
  // 6 — Data (cell 1264..1625; barras detectadas em x≈1368 e 1463)
  birthDate: {
    day:   { x: 1264, y: 612, width: 97,  height: 90 },
    month: { x: 1375, y: 612, width: 81,  height: 90 },
    year:  { x: 1470, y: 612, width: 155, height: 90 },
  },
  // 7 — Sexo (Masc box 1731..1781; Fem box 1970..2014; altura visível ~ y 638..685)
  sex: {
    male:   { x: 1731, y: 638, width: 50, height: 48 },
    female: { x: 1970, y: 638, width: 44, height: 48 },
  },
  // 8 — Raça/Cor (cell 2061..2319)
  raceColor: { x: 2069, y: 612, width: 246, height: 90 },
  // 9 — Nome da mãe (cell 140..1650, y 729..803)
  motherName: { x: 148, y: 736, width: 1495, height: 60 },
  // 10 — Telefone paciente
  // DDD: única caixa no template (1669..1734) dividida em 2 metades lógicas
  // Número: 9 caixas (1734,1798,1864,1928,1993,2058,2123,2187,2252,2317)
  patientPhone: {
    ddd: [
      { x: 1669, y: 732, width: 33, height: 68 },
      { x: 1702, y: 732, width: 32, height: 68 },
    ],
    number: [
      { x: 1734, y: 732, width: 64, height: 68 },
      { x: 1798, y: 732, width: 66, height: 68 },
      { x: 1864, y: 732, width: 64, height: 68 },
      { x: 1928, y: 732, width: 65, height: 68 },
      { x: 1993, y: 732, width: 65, height: 68 },
      { x: 2058, y: 732, width: 65, height: 68 },
      { x: 2123, y: 732, width: 64, height: 68 },
      { x: 2187, y: 732, width: 65, height: 68 },
      { x: 2252, y: 732, width: 65, height: 68 },
    ],
  },
  // 11 — Nome do responsável (cell 140..1649, y 830..904)
  responsibleName: { x: 148, y: 837, width: 1494, height: 60 },
  // 12 — Telefone do responsável
  // DDD: única caixa (1668..1733); Número: 9 caixas (1733..2315)
  responsiblePhone: {
    ddd: [
      { x: 1668, y: 833, width: 33, height: 68 },
      { x: 1701, y: 833, width: 32, height: 68 },
    ],
    number: [
      { x: 1733, y: 833, width: 65, height: 68 },
      { x: 1798, y: 833, width: 64, height: 68 },
      { x: 1862, y: 833, width: 65, height: 68 },
      { x: 1927, y: 833, width: 65, height: 68 },
      { x: 1992, y: 833, width: 64, height: 68 },
      { x: 2056, y: 833, width: 65, height: 68 },
      { x: 2121, y: 833, width: 65, height: 68 },
      { x: 2186, y: 833, width: 65, height: 68 },
      { x: 2251, y: 833, width: 64, height: 68 },
    ],
  },
  // 13 — Endereço (cell 140..2317, y 917..991)
  address: { x: 148, y: 924, width: 2165, height: 60 },
  // 14 — Município (cell 140..1465, y 1017..1091)
  municipality: { x: 148, y: 1024, width: 1313, height: 60 },
  // 15 — Código IBGE (cell 1465..1800 sem divisores internos detectados;
  // dividido em 7 cells uniformes de ~47.857 px)
  ibgeCode: [
    { x: 1465.0, y: 1020, width: 47.86, height: 68 },
    { x: 1512.9, y: 1020, width: 47.86, height: 68 },
    { x: 1560.7, y: 1020, width: 47.86, height: 68 },
    { x: 1608.6, y: 1020, width: 47.86, height: 68 },
    { x: 1656.4, y: 1020, width: 47.86, height: 68 },
    { x: 1704.3, y: 1020, width: 47.86, height: 68 },
    { x: 1752.1, y: 1020, width: 47.86, height: 68 },
  ],
  // 16 — UF (cell 1800..1938, com tick central em 1869)
  state: { x: 1808, y: 1024, width: 122, height: 60 },
  // 17 — CEP (cell 1938..2317 com 7 divisores internos detectados:
  // 1988, 2034, 2080, 2126, 2172, 2221, 2267 → 8 caixas)
  zipCode: [
    { x: 1938, y: 1020, width: 50, height: 68 },
    { x: 1988, y: 1020, width: 46, height: 68 },
    { x: 2034, y: 1020, width: 46, height: 68 },
    { x: 2080, y: 1020, width: 46, height: 68 },
    { x: 2126, y: 1020, width: 46, height: 68 },
    { x: 2172, y: 1020, width: 49, height: 68 },
    { x: 2221, y: 1020, width: 46, height: 68 },
    { x: 2267, y: 1020, width: 50, height: 68 },
  ],
};

// ---------- Render plan ----------
// Estrutura usada pelo componente React e pelo HTML de impressão.

export type ApacRender =
  | { kind: "text"; id: string; box: ApacBox; value: string; align?: "left" | "center"; fontSizePx?: number }
  | { kind: "digit"; id: string; box: ApacBox; value: string; fontSizePx?: number }
  | { kind: "check"; id: string; box: ApacBox; show: boolean; fontSizePx?: number };

export interface ApacRenderData {
  nome: string;
  prontuario: string;
  cns: string;
  dataDD: string;
  dataMM: string;
  dataAAAA: string;
  sexoMasc: boolean;
  sexoFem: boolean;
  racaCor: string;
  nomeMae: string;
  telDDD: string;
  telNum: string;
  nomeResponsavel: string;
  telRespDDD: string;
  telRespNum: string;
  endereco: string;
  municipio: string;
  ibge: string;
  uf: string;
  cep: string;
}

const pushDigits = (
  out: ApacRender[],
  prefix: string,
  boxes: ApacBox[],
  value: string,
) => {
  const v = (value || "").slice(0, boxes.length);
  for (let i = 0; i < v.length; i++) {
    out.push({ kind: "digit", id: `${prefix}.${i + 1}`, box: boxes[i], value: v[i] });
  }
};

export function buildApacRenders(d: ApacRenderData): ApacRender[] {
  const F = APAC_PATIENT_FIELDS;
  const out: ApacRender[] = [];

  out.push({ kind: "text", id: "3", box: F.patientName, value: d.nome });
  out.push({ kind: "text", id: "4", box: F.recordNumber, value: d.prontuario });

  pushDigits(out, "5", F.cns, d.cns);

  out.push({ kind: "text", id: "6.DD",   box: F.birthDate.day,   value: d.dataDD,   align: "center" });
  out.push({ kind: "text", id: "6.MM",   box: F.birthDate.month, value: d.dataMM,   align: "center" });
  out.push({ kind: "text", id: "6.AAAA", box: F.birthDate.year,  value: d.dataAAAA, align: "center" });

  out.push({ kind: "check", id: "7.M", box: F.sex.male,   show: d.sexoMasc, fontSizePx: 14 });
  out.push({ kind: "check", id: "7.F", box: F.sex.female, show: d.sexoFem,  fontSizePx: 14 });

  out.push({ kind: "text", id: "8", box: F.raceColor, value: d.racaCor });
  out.push({ kind: "text", id: "9", box: F.motherName, value: d.nomeMae });

  pushDigits(out, "10.DDD", F.patientPhone.ddd, d.telDDD);
  pushDigits(out, "10.N",   F.patientPhone.number, d.telNum);

  out.push({ kind: "text", id: "11", box: F.responsibleName, value: d.nomeResponsavel });

  pushDigits(out, "12.DDD", F.responsiblePhone.ddd, d.telRespDDD);
  pushDigits(out, "12.N",   F.responsiblePhone.number, d.telRespNum);

  out.push({ kind: "text", id: "13", box: F.address, value: d.endereco });
  out.push({ kind: "text", id: "14", box: F.municipality, value: d.municipio });

  pushDigits(out, "15", F.ibgeCode, d.ibge);

  out.push({ kind: "text", id: "16", box: F.state, value: d.uf, align: "center" });

  pushDigits(out, "17", F.zipCode, d.cep);

  return out;
}

// ---------- HTML serializer (impressão / PDF) ----------

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const styleToCss = (s: React.CSSProperties): string =>
  Object.entries(s)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}:${v}`)
    .join(";");

export function rendersToHTML(
  renders: ApacRender[],
  imageWidthPx: number = APAC_TEMPLATE_NATURAL_WIDTH,
  imageHeightPx: number = APAC_TEMPLATE_NATURAL_HEIGHT,
): string {
  return renders
    .map((r) => {
      if (r.kind === "text") {
        if (!r.value) return "";
        const style = getTextOverlayStyle(r.box, imageWidthPx, imageHeightPx, {
          align: r.align,
          fontSizePx: r.fontSizePx ?? 11,
        });
        return `<div data-apac-id="${r.id}" style="${styleToCss(style)}">${esc(r.value)}</div>`;
      }
      if (r.kind === "digit") {
        if (!r.value) return "";
        const style = getDigitOverlayStyle(r.box, imageWidthPx, imageHeightPx, r.fontSizePx ?? 11);
        return `<div data-apac-id="${r.id}" style="${styleToCss(style)}">${esc(r.value)}</div>`;
      }
      if (r.kind === "check") {
        if (!r.show) return "";
        const style = getTextOverlayStyle(r.box, imageWidthPx, imageHeightPx, {
          align: "center",
          fontSizePx: r.fontSizePx ?? 14,
        });
        return `<div data-apac-id="${r.id}" style="${styleToCss(style)};font-weight:bold;">✕</div>`;
      }
      return "";
    })
    .join("");
}

// CSS compartilhado pela impressão / PDF.
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
`;

// ---------- Compat shim ----------
// Mantém a assinatura usada por chamadores externos (ex.: rotina de impressão)
// produzindo agora overlays via o novo sistema unificado.
export function buildOverlaysHTML(d: ApacRenderData): string {
  return rendersToHTML(buildApacRenders(d));
}

// Re-export utilitários.
export { imageBoxPxToMm } from "./apacCoordinateSystem";
