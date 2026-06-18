// ============================================================================
// Laudo APAC — renderização SVG única.
//
// Toda a folha (template oficial + campos 3 a 17) vive dentro de UM único
// elemento <svg> com viewBox 0 0 2480 3509. Preview, impressão e PDF leem
// exatamente este mesmo elemento serializado — não há duplicação de
// coordenadas nem reconstrução em HTML.
// ============================================================================

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AnyPaciente } from "@/lib/apacLaudoData";
import { useApacLaudoData } from "@/lib/useApacLaudoData";
import {
  APAC_CALIBRATE,
  APAC_DEBUG,
  APAC_SVG_FIELDS,
  APAC_SVG_HEIGHT,
  APAC_SVG_WIDTH,
  APAC_TEMPLATE_URL,
  type SvgDigitBox,
  type SvgTextBox,
} from "@/lib/apacLaudoCoordinates";

interface Props {
  paciente: AnyPaciente | null;
}

export interface ApacLaudoSvgHandle {
  /** O <svg> ao vivo — usado pela impressão / PDF. */
  svg: SVGSVGElement | null;
  /** Container externo (apenas para fluxo de layout). */
  element: HTMLDivElement | null;
  isReady: () => boolean;
  waitReady: (timeoutMs?: number) => Promise<void>;
}

// ---------- Sub-componentes SVG ----------

function SvgFieldText({
  value,
  box,
  clipId,
}: {
  value: string;
  box: SvgTextBox;
  clipId?: string;
}) {
  if (!value) return null;
  const cx = box.align === "middle" ? box.x + box.width / 2 : box.x;
  const cy = box.y + box.height / 2;
  return (
    <text
      x={cx}
      y={cy}
      textAnchor={box.align === "middle" ? "middle" : "start"}
      dominantBaseline="middle"
      fontFamily="Arial, Helvetica, sans-serif"
      fontSize={box.fontSize}
      fontWeight={400}
      fill="#000"
      clipPath={clipId ? `url(#${clipId})` : undefined}
    >
      {value}
    </text>
  );
}

function SvgDigit({ digit, box }: { digit: string; box: SvgDigitBox }) {
  if (!digit) return null;
  return (
    <text
      x={box.cx}
      y={box.cy}
      textAnchor="middle"
      dominantBaseline="middle"
      fontFamily="Arial, Helvetica, sans-serif"
      fontSize={box.fontSize}
      fontWeight={400}
      fill="#000"
    >
      {digit}
    </text>
  );
}

function SvgDigits({ value, boxes }: { value: string; boxes: SvgDigitBox[] }) {
  const v = (value || "").slice(0, boxes.length);
  return (
    <>
      {v.split("").map((d, i) => (
        <SvgDigit key={i} digit={d} box={boxes[i]} />
      ))}
    </>
  );
}

// Debug overlays (mesmo SVG, mesma coordenada — não afeta print/PDF).
function DebugTextBox({ box, id }: { box: SvgTextBox; id: string }) {
  return (
    <g>
      <rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        fill="rgba(255,0,0,0.08)"
        stroke="red"
        strokeWidth={2}
      />
      <text x={box.x + 4} y={box.y + 22} fontSize={20} fill="#900" fontFamily="Arial">
        {id}
      </text>
    </g>
  );
}

function DebugDigit({ box, id }: { box: SvgDigitBox; id?: string }) {
  return (
    <g>
      <circle cx={box.cx} cy={box.cy} r={6} fill="red" />
      {id ? (
        <text x={box.cx + 8} y={box.cy - 6} fontSize={14} fill="#900" fontFamily="Arial">
          {id}
        </text>
      ) : null}
    </g>
  );
}

export const ApacLaudoSvg = forwardRef<ApacLaudoSvgHandle, Props>(function ApacLaudoSvg(
  { paciente },
  ref,
) {
  const { data, ibgeLoading } = useApacLaudoData(paciente);
  const F = APAC_SVG_FIELDS;

  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const absTemplate = useMemo(
    () =>
      typeof window !== "undefined" && !APAC_TEMPLATE_URL.startsWith("http")
        ? `${window.location.origin}${APAC_TEMPLATE_URL}`
        : APAC_TEMPLATE_URL,
    [],
  );

  // Pré-carrega a imagem para sabermos quando o SVG está pronto para impressão.
  useEffect(() => {
    setImgLoaded(false);
    setImgError(false);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setImgLoaded(true);
    img.onerror = () => setImgError(true);
    img.src = absTemplate;
  }, [absTemplate]);

  useImperativeHandle(
    ref,
    () => ({
      svg: svgRef.current,
      element: rootRef.current,
      isReady: () => imgLoaded && !ibgeLoading,
      waitReady: async (timeoutMs = 5000) => {
        const start = Date.now();
        while (!imgLoaded && !imgError && Date.now() - start < timeoutMs) {
          await new Promise((r) => setTimeout(r, 80));
        }
        while (ibgeLoading && Date.now() - start < timeoutMs) {
          await new Promise((r) => setTimeout(r, 80));
        }
        if ((document as any).fonts?.ready) {
          try {
            await (document as any).fonts.ready;
          } catch {
            /* noop */
          }
        }
      },
    }),
    [imgLoaded, imgError, ibgeLoading],
  );

  // Modo calibração: clique no SVG imprime as coordenadas do viewBox
  // (sistema 2480×3509), independentemente do zoom do modal.
  const handleCalibrationClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!APAC_CALIBRATE) return;
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return;
    const p = pt.matrixTransform(m.inverse());
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    // eslint-disable-next-line no-console
    console.log(`[APAC calibrate] x=${x}  y=${y}  → { cx: ${x}, cy: ${y} }`);
  };

  return (
    <div ref={rootRef} className="apac-svg-wrap" style={{ width: "100%", height: "100%" }}>
      <svg
        ref={svgRef}
        id="apac-laudo-svg"
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${APAC_SVG_WIDTH} ${APAC_SVG_HEIGHT}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        onClick={APAC_CALIBRATE ? handleCalibrationClick : undefined}
        style={{ display: "block", background: "#fff", cursor: APAC_CALIBRATE ? "crosshair" : undefined }}
      >
        <defs>
          <clipPath id="clip-patient-name">
            <rect x={F.patientName.x} y={F.patientName.y} width={F.patientName.width} height={F.patientName.height} />
          </clipPath>
          <clipPath id="clip-record-number">
            <rect x={F.recordNumber.x} y={F.recordNumber.y} width={F.recordNumber.width} height={F.recordNumber.height} />
          </clipPath>
          <clipPath id="clip-race-color">
            <rect x={F.raceColor.x} y={F.raceColor.y} width={F.raceColor.width} height={F.raceColor.height} />
          </clipPath>
          <clipPath id="clip-mother-name">
            <rect x={F.motherName.x} y={F.motherName.y} width={F.motherName.width} height={F.motherName.height} />
          </clipPath>
          <clipPath id="clip-responsible-name">
            <rect x={F.responsibleName.x} y={F.responsibleName.y} width={F.responsibleName.width} height={F.responsibleName.height} />
          </clipPath>
          <clipPath id="clip-address">
            <rect x={F.address.x} y={F.address.y} width={F.address.width} height={F.address.height} />
          </clipPath>
          <clipPath id="clip-municipality">
            <rect x={F.municipality.x} y={F.municipality.y} width={F.municipality.width} height={F.municipality.height} />
          </clipPath>
          {/* UF é renderizada como 2 dígitos individuais — sem clipPath. */}
        </defs>

        {/* Imagem oficial — base do documento. */}
        <image
          href={absTemplate}
          xlinkHref={absTemplate}
          x={0}
          y={0}
          width={APAC_SVG_WIDTH}
          height={APAC_SVG_HEIGHT}
          preserveAspectRatio="none"
        />

        {imgError && (
          <text
            x={APAC_SVG_WIDTH / 2}
            y={APAC_SVG_HEIGHT / 2}
            textAnchor="middle"
            fontSize={48}
            fill="#900"
            fontFamily="Arial, Helvetica, sans-serif"
          >
            Não foi possível carregar o modelo oficial do Laudo APAC.
          </text>
        )}

        {/* Campos 3–17 */}
        <SvgFieldText value={data.nome} box={F.patientName} clipId="clip-patient-name" />
        <SvgFieldText value={data.prontuario} box={F.recordNumber} clipId="clip-record-number" />

        <SvgDigits value={data.cns} boxes={F.cns} />

        <SvgFieldText value={data.dataDD} box={F.birthDate.day} />
        <SvgFieldText value={data.dataMM} box={F.birthDate.month} />
        <SvgFieldText value={data.dataAAAA} box={F.birthDate.year} />

        {data.sexoMasc && <SvgDigit digit="✕" box={F.sex.male} />}
        {data.sexoFem && <SvgDigit digit="✕" box={F.sex.female} />}

        <SvgFieldText value={data.racaCor} box={F.raceColor} clipId="clip-race-color" />
        <SvgFieldText value={data.nomeMae} box={F.motherName} clipId="clip-mother-name" />

        <SvgDigits value={data.telDDD} boxes={F.patientPhone.ddd} />
        <SvgDigits value={data.telNum} boxes={F.patientPhone.number} />

        <SvgFieldText value={data.nomeResponsavel} box={F.responsibleName} clipId="clip-responsible-name" />

        <SvgDigits value={data.telRespDDD} boxes={F.responsiblePhone.ddd} />
        <SvgDigits value={data.telRespNum} boxes={F.responsiblePhone.number} />

        <SvgFieldText value={data.endereco} box={F.address} clipId="clip-address" />
        <SvgFieldText value={data.municipio} box={F.municipality} clipId="clip-municipality" />

        <SvgDigits value={data.ibge} boxes={F.ibgeCode} />

        <SvgDigits value={data.uf} boxes={F.state} />

        <SvgDigits value={data.cep} boxes={F.zipCode} />

        {/* Debug — só aparece no preview. Removido na impressão/PDF. */}
        {APAC_DEBUG && (
          <g data-apac-debug="1">
            <DebugTextBox box={F.patientName} id="3" />
            <DebugTextBox box={F.recordNumber} id="4" />
            {F.cns.map((b, i) => <DebugDigit key={`5-${i}`} box={b} id={i === 0 ? "5" : undefined} />)}
            <DebugTextBox box={F.birthDate.day} id="6.DD" />
            <DebugTextBox box={F.birthDate.month} id="6.MM" />
            <DebugTextBox box={F.birthDate.year} id="6.AAAA" />
            <DebugDigit box={F.sex.male} id="7.M" />
            <DebugDigit box={F.sex.female} id="7.F" />
            <DebugTextBox box={F.raceColor} id="8" />
            <DebugTextBox box={F.motherName} id="9" />
            {F.patientPhone.ddd.map((b, i) => <DebugDigit key={`10d-${i}`} box={b} id={i === 0 ? "10.DDD" : undefined} />)}
            {F.patientPhone.number.map((b, i) => <DebugDigit key={`10n-${i}`} box={b} id={i === 0 ? "10.N" : undefined} />)}
            <DebugTextBox box={F.responsibleName} id="11" />
            {F.responsiblePhone.ddd.map((b, i) => <DebugDigit key={`12d-${i}`} box={b} id={i === 0 ? "12.DDD" : undefined} />)}
            {F.responsiblePhone.number.map((b, i) => <DebugDigit key={`12n-${i}`} box={b} id={i === 0 ? "12.N" : undefined} />)}
            <DebugTextBox box={F.address} id="13" />
            <DebugTextBox box={F.municipality} id="14" />
            {F.ibgeCode.map((b, i) => <DebugDigit key={`15-${i}`} box={b} id={i === 0 ? "15" : undefined} />)}
            {F.state.map((b, i) => <DebugDigit key={`16-${i}`} box={b} id={i === 0 ? "16" : undefined} />)}
            {F.zipCode.map((b, i) => <DebugDigit key={`17-${i}`} box={b} id={i === 0 ? "17" : undefined} />)}
          </g>
        )}
      </svg>
    </div>
  );
});

export default ApacLaudoSvg;
