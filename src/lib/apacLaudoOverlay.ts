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

// Coordenadas calibradas: pixels da imagem oficial, derivadas das
// medições já validadas em mm. Para recalibrar um campo, substituir
// boxFromMm(...) por { x, y, width, height } medidos diretamente em px.
export const APAC_PATIENT_FIELDS: ApacPatientFields = {
  // 3 — Nome do paciente
  patientName: boxFromMm(13, 46.5, 144, 5),
  // 4 — Nº do prontuário
  recordNumber: boxFromMm(160, 46.5, 35, 5),
  // 5 — CNS (15 caixas)
  cns: digitBoxesFromMm({ firstCenterMm: 14.95, spacingMm: 6.175, topMm: 54.2, count: 15 }),
  // 6 — Data de nascimento (DD / MM / AAAA)
  birthDate: {
    day:   boxFromMm(111.8,  54.2, 8.6,  5),
    month: boxFromMm(122.9,  54.2, 8.3,  5),
    year:  boxFromMm(130.15, 54.2, 7.4,  5),
  },
  // 7 — Sexo
  sex: {
    male:   boxFromMm(148.7, 55.1, 3, 3),
    female: boxFromMm(166.4, 55.1, 3, 3),
  },
  // 8 — Raça/Cor
  raceColor: boxFromMm(175, 54.2, 20, 5),
  // 9 — Nome da mãe
  motherName: boxFromMm(13, 62.8, 125, 5),
  // 10 — Telefone do paciente
  patientPhone: {
    ddd:    digitBoxesFromMm({ firstCenterMm: 142.4, spacingMm: 5.5,  topMm: 62.8, count: 2 }),
    number: digitBoxesFromMm({ firstCenterMm: 153.5, spacingMm: 5.46, topMm: 62.8, count: 8 }),
  },
  // 11 — Nome do responsável
  responsibleName: boxFromMm(13, 71.3, 125, 5),
  // 12 — Telefone do responsável
  responsiblePhone: {
    ddd:    digitBoxesFromMm({ firstCenterMm: 142.4, spacingMm: 5.5,  topMm: 71.3, count: 2 }),
    number: digitBoxesFromMm({ firstCenterMm: 153.5, spacingMm: 5.46, topMm: 71.3, count: 8 }),
  },
  // 13 — Endereço
  address: boxFromMm(13, 78.8, 182, 5),
  // 14 — Município de residência
  municipality: boxFromMm(13, 87.3, 110, 5),
  // 15 — Código IBGE (7 caixas)
  ibgeCode: digitBoxesFromMm({ firstCenterMm: 126.08, spacingMm: 4.05, topMm: 87.3, count: 7 }),
  // 16 — UF
  state: boxFromMm(152.4, 87.3, 5.9, 5),
  // 17 — CEP (8 caixas)
  zipCode: digitBoxesFromMm({ firstCenterMm: 166.15, spacingMm: 4.012, topMm: 87.3, count: 8 }),
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
