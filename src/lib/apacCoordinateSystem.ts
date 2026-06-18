// Sistema único de coordenadas do Laudo APAC.
// Todas as posições dos campos 3 a 17 são expressas em PIXELS da imagem
// oficial (referência única: src/assets/laudo-apac-oficial.jpg).
// A conversão para milímetros é feita exclusivamente por imageBoxPxToMm,
// que garante a mesma proporção em preview, impressão e PDF.

export type ApacBox = {
  x: number;       // px na imagem oficial (canto superior esquerdo)
  y: number;       // px na imagem oficial
  width: number;   // px na imagem oficial
  height: number;  // px na imagem oficial
};

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

// Dimensões naturais conhecidas da imagem oficial.
// Servem apenas como fallback; o componente passa naturalWidth/naturalHeight.
export const APAC_TEMPLATE_NATURAL_WIDTH = 2480;
export const APAC_TEMPLATE_NATURAL_HEIGHT = 3509;

export function imageBoxPxToMm(
  box: ApacBox,
  imageWidthPx: number,
  imageHeightPx: number,
) {
  return {
    leftMm: (box.x / imageWidthPx) * A4_WIDTH_MM,
    topMm: (box.y / imageHeightPx) * A4_HEIGHT_MM,
    widthMm: (box.width / imageWidthPx) * A4_WIDTH_MM,
    heightMm: (box.height / imageHeightPx) * A4_HEIGHT_MM,
  };
}

export function getTextOverlayStyle(
  box: ApacBox,
  imageWidthPx: number,
  imageHeightPx: number,
  options?: { align?: "left" | "center"; fontSizePx?: number },
): React.CSSProperties {
  const mm = imageBoxPxToMm(box, imageWidthPx, imageHeightPx);
  return {
    position: "absolute",
    left: `${mm.leftMm}mm`,
    top: `${mm.topMm}mm`,
    width: `${mm.widthMm}mm`,
    height: `${mm.heightMm}mm`,
    display: "flex",
    alignItems: "center",
    justifyContent: options?.align === "center" ? "center" : "flex-start",
    padding: options?.align === "center" ? 0 : "0 0.5mm",
    margin: 0,
    boxSizing: "border-box",
    overflow: "hidden",
    whiteSpace: "nowrap",
    lineHeight: 1,
    letterSpacing: 0,
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: `${options?.fontSizePx ?? 11}px`,
    color: "#000",
    zIndex: 2,
  };
}

export function getDigitOverlayStyle(
  box: ApacBox,
  imageWidthPx: number,
  imageHeightPx: number,
  fontSizePx = 11,
): React.CSSProperties {
  const mm = imageBoxPxToMm(box, imageWidthPx, imageHeightPx);
  return {
    position: "absolute",
    left: `${mm.leftMm}mm`,
    top: `${mm.topMm}mm`,
    width: `${mm.widthMm}mm`,
    height: `${mm.heightMm}mm`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    margin: 0,
    boxSizing: "border-box",
    overflow: "hidden",
    lineHeight: 1,
    letterSpacing: 0,
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: `${fontSizePx}px`,
    fontVariantNumeric: "tabular-nums",
    color: "#000",
    zIndex: 2,
  };
}

// Converte coordenadas de clique (clientX/clientY) para pixels na imagem.
export function clientPointToImagePx(
  point: { x: number; y: number },
  img: HTMLImageElement,
): { x: number; y: number } {
  const r = img.getBoundingClientRect();
  const sx = img.naturalWidth / r.width;
  const sy = img.naturalHeight / r.height;
  return {
    x: (point.x - r.left) * sx,
    y: (point.y - r.top) * sy,
  };
}

export function pointsToBox(
  start: { x: number; y: number },
  end: { x: number; y: number },
): ApacBox {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

// Helper interno para registrar coordenadas a partir de milímetros calibrados.
// Mantém compatibilidade com a calibração existente, expressando os valores
// como pixels da imagem oficial — única fonte de coordenadas.
export function boxFromMm(
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
): ApacBox {
  const px = APAC_TEMPLATE_NATURAL_WIDTH / A4_WIDTH_MM;
  const py = APAC_TEMPLATE_NATURAL_HEIGHT / A4_HEIGHT_MM;
  return {
    x: xMm * px,
    y: yMm * py,
    width: widthMm * px,
    height: heightMm * py,
  };
}

// Gera N caixas individuais a partir de um intervalo horizontal calibrado.
// Útil enquanto a medição manual de cada caixa não estiver concluída — as
// coordenadas continuam em pixels da imagem oficial e passam pela mesma
// conversão imageBoxPxToMm.
export function digitBoxesFromMm(params: {
  firstCenterMm: number;
  spacingMm: number;
  topMm: number;
  count: number;
  heightMm?: number;
  widthMm?: number;
}): ApacBox[] {
  const { firstCenterMm, spacingMm, topMm, count } = params;
  const widthMm = params.widthMm ?? spacingMm;
  const heightMm = params.heightMm ?? 5;
  const out: ApacBox[] = [];
  for (let i = 0; i < count; i++) {
    const centerMm = firstCenterMm + i * spacingMm;
    out.push(boxFromMm(centerMm - widthMm / 2, topMm, widthMm, heightMm));
  }
  return out;
}
