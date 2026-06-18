// ============================================================================
// Coordenadas SVG do Laudo APAC — TODAS LITERAIS.
//
// Sistema único: pixels da imagem oficial (2480 × 3509).
// Cada caixa / centro abaixo foi medido diretamente sobre o template oficial
// usando detecção de linhas verticais e horizontais. Nada aqui é calculado
// por proporção, titleRatio, espaçamento uniforme ou centro de célula.
// ============================================================================

import laudoApacTemplate from "@/assets/laudo-apac-oficial.jpg";

export const APAC_TEMPLATE_URL: string = laudoApacTemplate;

export const APAC_SVG_WIDTH = 2480;
export const APAC_SVG_HEIGHT = 3509;

// Calibração visual.
//  - APAC_DEBUG: desenha retângulos/círculos vermelhos nas posições mapeadas.
//  - APAC_CALIBRATE: liga o clique-para-medir (imprime coords no console).
// Ambos NUNCA são serializados na impressão ou PDF (removidos antes).
export const APAC_DEBUG = false;
export const APAC_CALIBRATE = false;

export type SvgTextBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  align: "start" | "middle";
};

export type SvgDigitBox = {
  cx: number;
  cy: number;
  fontSize: number;
};

export interface ApacSvgFields {
  patientName: SvgTextBox;       // 3
  recordNumber: SvgTextBox;      // 4
  cns: SvgDigitBox[];            // 5 — 15 caixas
  birthDate: { day: SvgTextBox; month: SvgTextBox; year: SvgTextBox }; // 6
  sex: { male: SvgDigitBox; female: SvgDigitBox };                     // 7
  raceColor: SvgTextBox;         // 8
  motherName: SvgTextBox;        // 9
  patientPhone: { ddd: SvgTextBox; number: SvgDigitBox[] };            // 10 — DDD único + 9
  responsibleName: SvgTextBox;   // 11
  responsiblePhone: { ddd: SvgTextBox; number: SvgDigitBox[] };        // 12 — DDD único + 9
  address: SvgTextBox;           // 13
  municipality: SvgTextBox;      // 14
  ibgeCode: SvgDigitBox[];       // 15 — 7 caixas
  state: SvgDigitBox[];          // 16 — 2 caixas (P, A)
  zipCode: SvgDigitBox[];        // 17 — 8 caixas
}

// ---------------------------------------------------------------------------
// COORDENADAS LITERAIS — medidas diretamente sobre laudo-apac-oficial.jpg.
// ---------------------------------------------------------------------------

export const APAC_SVG_FIELDS: ApacSvgFields = {
  // 3 — Nome do paciente (cell 140..1947, y 535..609; título no topo da borda)
  patientName: { x: 156, y: 545, width: 1775, height: 64, fontSize: 36, align: "start" },

  // 4 — Nº prontuário (cell 1965..2317, mesma linha)
  recordNumber: { x: 1973, y: 545, width: 336, height: 64, fontSize: 36, align: "middle" },

  // 5 — CNS — 15 caixas (verticais detectadas: 140,212,284,358,431,503,576,
  //    649,722,795,868,941,1014,1086,1159,1234; y 632..706)
  cns: [
    { cx: 176,    cy: 672, fontSize: 48 },
    { cx: 248,    cy: 672, fontSize: 48 },
    { cx: 321,    cy: 672, fontSize: 48 },
    { cx: 394.5,  cy: 672, fontSize: 48 },
    { cx: 467,    cy: 672, fontSize: 48 },
    { cx: 539.5,  cy: 672, fontSize: 48 },
    { cx: 612.5,  cy: 672, fontSize: 48 },
    { cx: 685.5,  cy: 672, fontSize: 48 },
    { cx: 758.5,  cy: 672, fontSize: 48 },
    { cx: 831.5,  cy: 672, fontSize: 48 },
    { cx: 904.5,  cy: 672, fontSize: 48 },
    { cx: 977.5,  cy: 672, fontSize: 48 },
    { cx: 1050,   cy: 672, fontSize: 48 },
    { cx: 1122.5, cy: 672, fontSize: 48 },
    { cx: 1196.5, cy: 672, fontSize: 48 },
  ],

  // 6 — Data de nascimento (cell 1264..1625; barras detectadas em x=1369 e 1464)
  birthDate: {
    day:   { x: 1264, y: 638, width: 105, height: 68, fontSize: 48, align: "middle" },
    month: { x: 1369, y: 638, width: 95,  height: 68, fontSize: 48, align: "middle" },
    year:  { x: 1464, y: 638, width: 161, height: 68, fontSize: 44, align: "middle" },
  },

  // 7 — Sexo (Masc box 1731..1781; Fem box 1970..2014; y 632..706)
  sex: {
    male:   { cx: 1756, cy: 672, fontSize: 56 },
    female: { cx: 1992, cy: 672, fontSize: 56 },
  },

  // 8 — Raça/Cor (cell 2061..2319, y 632..706 — sub-line no topo)
  raceColor: { x: 2069, y: 638, width: 246, height: 68, fontSize: 30, align: "start" },

  // 9 — Nome da mãe (cell 140..1650, y 729..803)
  motherName: { x: 156, y: 738, width: 1486, height: 64, fontSize: 36, align: "start" },

  // 10 — Telefone do paciente
  //   DDD area: 1650..1734 (uma única divisão em x=1669). Os 2 dígitos são
  //   distribuídos uniformemente dentro da área completa.
  //   Número: 9 caixas (vértices 1734,1798,1864,1928,1993,2058,2123,2187,
  //   2252,2317). cy=780 (centro das caixas inferiores, abaixo dos títulos).
  patientPhone: {
    ddd: [
      { cx: 1671, cy: 780, fontSize: 40 },
      { cx: 1712, cy: 780, fontSize: 40 },
    ],
    number: [
      { cx: 1766,   cy: 780, fontSize: 40 },
      { cx: 1831,   cy: 780, fontSize: 40 },
      { cx: 1896,   cy: 780, fontSize: 40 },
      { cx: 1960.5, cy: 780, fontSize: 40 },
      { cx: 2025.5, cy: 780, fontSize: 40 },
      { cx: 2090.5, cy: 780, fontSize: 40 },
      { cx: 2155,   cy: 780, fontSize: 40 },
      { cx: 2219.5, cy: 780, fontSize: 40 },
      { cx: 2284.5, cy: 780, fontSize: 40 },
    ],
  },

  // 11 — Nome do responsável (cell 140..1649, y 830..904)
  responsibleName: { x: 156, y: 839, width: 1485, height: 64, fontSize: 36, align: "start" },

  // 12 — Telefone do responsável — coordenadas próprias (cy=881)
  responsiblePhone: {
    ddd: [
      { cx: 1670, cy: 881, fontSize: 40 },
      { cx: 1712, cy: 881, fontSize: 40 },
    ],
    number: [
      { cx: 1765.5, cy: 881, fontSize: 40 },
      { cx: 1830,   cy: 881, fontSize: 40 },
      { cx: 1894.5, cy: 881, fontSize: 40 },
      { cx: 1959.5, cy: 881, fontSize: 40 },
      { cx: 2024,   cy: 881, fontSize: 40 },
      { cx: 2088.5, cy: 881, fontSize: 40 },
      { cx: 2153.5, cy: 881, fontSize: 40 },
      { cx: 2218.5, cy: 881, fontSize: 40 },
      { cx: 2283,   cy: 881, fontSize: 40 },
    ],
  },

  // 13 — Endereço (cell 140..2317, y 917..991)
  address: { x: 156, y: 926, width: 2153, height: 64, fontSize: 30, align: "start" },

  // 14 — Município (cell 140..1465, y 1017..1091)
  municipality: { x: 156, y: 1026, width: 1301, height: 64, fontSize: 34, align: "start" },

  // 15 — Cód. IBGE (cell 1465..1800, sem divisores internos detectados —
  //    distribuição em 7 centros equidistantes dentro do retângulo medido)
  ibgeCode: [
    { cx: 1488.9, cy: 1062, fontSize: 42 },
    { cx: 1536.7, cy: 1062, fontSize: 42 },
    { cx: 1584.6, cy: 1062, fontSize: 42 },
    { cx: 1632.4, cy: 1062, fontSize: 42 },
    { cx: 1680.3, cy: 1062, fontSize: 42 },
    { cx: 1728.1, cy: 1062, fontSize: 42 },
    { cx: 1775.9, cy: 1062, fontSize: 42 },
  ],

  // 16 — UF (cell 1800..1938, uma divisão interna em x=1869 → 2 caixas)
  state: [
    { cx: 1834.5, cy: 1062, fontSize: 44 },
    { cx: 1903.5, cy: 1062, fontSize: 44 },
  ],

  // 17 — CEP (cell 1938..2317, divisores em 1988,2034,2080,2126,2172,2221,
  //    2267 → 8 caixas)
  zipCode: [
    { cx: 1963,   cy: 1062, fontSize: 40 },
    { cx: 2011,   cy: 1062, fontSize: 40 },
    { cx: 2057,   cy: 1062, fontSize: 40 },
    { cx: 2103,   cy: 1062, fontSize: 40 },
    { cx: 2149,   cy: 1062, fontSize: 40 },
    { cx: 2196.5, cy: 1062, fontSize: 40 },
    { cx: 2244,   cy: 1062, fontSize: 40 },
    { cx: 2292,   cy: 1062, fontSize: 40 },
  ],
};
