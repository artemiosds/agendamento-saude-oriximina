// ============================================================================
// Mapa central de coordenadas SVG do Laudo APAC.
//
// Sistema único de coordenadas: pixels da imagem oficial (2480 × 3509).
// Preview, impressão e PDF compartilham EXATAMENTE estes valores. Não há
// conversão px↔mm para posicionar campos: o SVG carrega a imagem com
// viewBox 0 0 2480 3509 e todos os textos usam esse mesmo espaço.
// ============================================================================

import laudoApacTemplate from "@/assets/laudo-apac-oficial.jpg";

export const APAC_TEMPLATE_URL: string = laudoApacTemplate;

export const APAC_SVG_WIDTH = 2480;
export const APAC_SVG_HEIGHT = 3509;

// Calibração visual — quando true, mostra retângulos e centros vermelhos
// dentro do próprio SVG (somente no preview; nunca na impressão ou PDF).
export const APAC_DEBUG = false;

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

// Tamanhos de fonte padrão (em unidades do viewBox 2480×3509).
const F_TEXT = 38;
const F_DIGIT = 44;
const F_CHECK = 60;

// Helper interno — converte uma caixa retangular calibrada (cell de cabeçalho
// + área de escrita) em um centro vertical posicionado APENAS sobre a faixa
// de preenchimento, abaixo do título do campo.
//
// titleRatio = fração superior da célula ocupada pelo título (0..1).
const dot = (
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
  titleRatio: number,
  fontSize = F_DIGIT,
): SvgDigitBox => ({
  cx: cellX + cellW / 2,
  cy: cellY + cellH * titleRatio + (cellH * (1 - titleRatio)) / 2,
  fontSize,
});

// Para campos de texto, devolve a área de escrita já recortada (abaixo do
// título). Útil para clipPath e para definir o centro vertical do texto.
const textBox = (
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
  titleRatio: number,
  fontSize = F_TEXT,
  align: "start" | "middle" = "start",
): SvgTextBox => ({
  x: cellX + 8,
  y: cellY + cellH * titleRatio,
  width: cellW - 16,
  height: cellH * (1 - titleRatio),
  fontSize,
  align,
});

// Geração das 15 caixas do CNS (linha de divisões verticais detectada na
// imagem oficial).
const CNS_X = [140, 212, 284, 358, 431, 503, 576, 649, 722, 795, 868, 941, 1014, 1086, 1159];
const CNS_W = 73;
const CNS_Y = 612;
const CNS_H = 90;
const CNS_TITLE_RATIO = 0.32;

// Telefones — o título "DDD" / "Nº DO TELEFONE" ocupa ~55% superior da
// célula; os centros dos dígitos devem ficar bem abaixo dessa faixa.
const PH1_Y = 732;
const PH1_H = 68;
const PH2_Y = 833;
const PH2_H = 68;
const PH_TITLE_RATIO = 0.55;

const ph1Number = [
  { x: 1734, w: 64 },
  { x: 1798, w: 66 },
  { x: 1864, w: 64 },
  { x: 1928, w: 65 },
  { x: 1993, w: 65 },
  { x: 2058, w: 65 },
  { x: 2123, w: 64 },
  { x: 2187, w: 65 },
  { x: 2252, w: 65 },
];

const ph2Number = [
  { x: 1733, w: 65 },
  { x: 1798, w: 64 },
  { x: 1862, w: 65 },
  { x: 1927, w: 65 },
  { x: 1992, w: 64 },
  { x: 2056, w: 65 },
  { x: 2121, w: 65 },
  { x: 2186, w: 65 },
  { x: 2251, w: 64 },
];

// IBGE — 7 caixas uniformes na faixa 1465..1800.
const IBGE_Y = 1020;
const IBGE_H = 68;
const IBGE_TITLE_RATIO = 0.32;
const IBGE_X0 = 1465;
const IBGE_W = (1800 - 1465) / 7; // 47.857

// CEP — 8 caixas com divisores ~50px de largura.
const CEP_Y = 1020;
const CEP_H = 68;
const CEP_TITLE_RATIO = 0.32;
const CEP_BOXES = [
  { x: 1938, w: 50 },
  { x: 1988, w: 46 },
  { x: 2034, w: 46 },
  { x: 2080, w: 46 },
  { x: 2126, w: 46 },
  { x: 2172, w: 49 },
  { x: 2221, w: 46 },
  { x: 2267, w: 50 },
];

export interface ApacSvgFields {
  patientName: SvgTextBox;       // 3
  recordNumber: SvgTextBox;      // 4
  cns: SvgDigitBox[];            // 5
  birthDate: { day: SvgTextBox; month: SvgTextBox; year: SvgTextBox }; // 6
  sex: { male: SvgDigitBox; female: SvgDigitBox };                     // 7
  raceColor: SvgTextBox;         // 8
  motherName: SvgTextBox;        // 9
  patientPhone: { ddd: SvgDigitBox[]; number: SvgDigitBox[] };         // 10
  responsibleName: SvgTextBox;   // 11
  responsiblePhone: { ddd: SvgDigitBox[]; number: SvgDigitBox[] };     // 12
  address: SvgTextBox;           // 13
  municipality: SvgTextBox;      // 14
  ibgeCode: SvgDigitBox[];       // 15
  state: SvgTextBox;             // 16
  zipCode: SvgDigitBox[];        // 17
}

export const APAC_SVG_FIELDS: ApacSvgFields = {
  // 3 — Nome do paciente
  patientName: textBox(140, 535, 1807, 74, 0.42, F_TEXT, "start"),
  // 4 — Nº prontuário
  recordNumber: textBox(1965, 535, 352, 74, 0.42, F_TEXT, "middle"),
  // 5 — CNS (15 caixas)
  cns: CNS_X.map((x) => dot(x, CNS_Y, CNS_W, CNS_H, CNS_TITLE_RATIO, F_DIGIT)),
  // 6 — Data de nascimento (3 áreas independentes — DD, MM, AAAA)
  birthDate: {
    day:   textBox(1264, 609, 104, 97, CNS_TITLE_RATIO, F_DIGIT, "middle"),
    month: textBox(1368, 609, 95,  97, CNS_TITLE_RATIO, F_DIGIT, "middle"),
    year:  textBox(1463, 609, 162, 97, CNS_TITLE_RATIO, F_DIGIT, "middle"),
  },
  // 7 — Sexo (marcação ✕ centralizada na caixinha)
  sex: {
    male:   { cx: 1756, cy: 662, fontSize: F_CHECK },
    female: { cx: 1992, cy: 662, fontSize: F_CHECK },
  },
  // 8 — Raça/Cor
  raceColor: textBox(2061, 609, 258, 97, CNS_TITLE_RATIO, 32, "start"),
  // 9 — Nome da mãe
  motherName: textBox(140, 729, 1510, 74, 0.42, F_TEXT, "start"),
  // 10 — Telefone do paciente
  patientPhone: {
    ddd: [
      dot(1669, PH1_Y, 33, PH1_H, PH_TITLE_RATIO),
      dot(1702, PH1_Y, 32, PH1_H, PH_TITLE_RATIO),
    ],
    number: ph1Number.map((b) => dot(b.x, PH1_Y, b.w, PH1_H, PH_TITLE_RATIO)),
  },
  // 11 — Nome do responsável
  responsibleName: textBox(140, 830, 1509, 74, 0.42, F_TEXT, "start"),
  // 12 — Telefone do responsável (coordenadas próprias — não reutiliza 10)
  responsiblePhone: {
    ddd: [
      dot(1668, PH2_Y, 33, PH2_H, PH_TITLE_RATIO),
      dot(1701, PH2_Y, 32, PH2_H, PH_TITLE_RATIO),
    ],
    number: ph2Number.map((b) => dot(b.x, PH2_Y, b.w, PH2_H, PH_TITLE_RATIO)),
  },
  // 13 — Endereço
  address: textBox(140, 917, 2177, 74, 0.42, 32, "start"),
  // 14 — Município
  municipality: textBox(140, 1017, 1325, 74, 0.42, F_TEXT, "start"),
  // 15 — IBGE (7 caixas)
  ibgeCode: Array.from({ length: 7 }, (_, i) =>
    dot(IBGE_X0 + i * IBGE_W, IBGE_Y, IBGE_W, IBGE_H, IBGE_TITLE_RATIO),
  ),
  // 16 — UF
  state: textBox(1800, 1017, 138, 74, 0.42, F_TEXT, "middle"),
  // 17 — CEP (8 caixas)
  zipCode: CEP_BOXES.map((b) => dot(b.x, CEP_Y, b.w, CEP_H, CEP_TITLE_RATIO)),
};
