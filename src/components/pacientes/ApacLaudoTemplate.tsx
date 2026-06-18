// Componente do template oficial APAC.
// Renderiza a imagem da página 1 do PDF oficial (referência única de
// coordenadas em pixels) e sobrepõe somente os campos 3 a 17.

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { AnyPaciente } from "@/lib/apacLaudoData";
import { useApacLaudoData } from "@/lib/useApacLaudoData";
import {
  APAC_TEMPLATE_URL,
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  APAC_TEMPLATE_NATURAL_WIDTH,
  APAC_TEMPLATE_NATURAL_HEIGHT,
  APAC_DEBUG,
  buildApacRenders,
} from "@/lib/apacLaudoOverlay";
import {
  getTextOverlayStyle,
  getDigitOverlayStyle,
  imageBoxPxToMm,
} from "@/lib/apacCoordinateSystem";

interface Props {
  paciente: AnyPaciente | null;
}

export interface ApacLaudoTemplateHandle {
  element: HTMLDivElement | null;
  isReady: () => boolean;
  waitReady: (timeoutMs?: number) => Promise<void>;
}

export const ApacLaudoTemplate = forwardRef<ApacLaudoTemplateHandle, Props>(
  function ApacLaudoTemplate({ paciente }, ref) {
    const { data, ibgeLoading } = useApacLaudoData(paciente);
    const renders = useMemo(() => buildApacRenders(data), [data]);
    const rootRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const [imgLoaded, setImgLoaded] = useState(false);
    const [imgError, setImgError] = useState(false);

    const absTemplate =
      typeof window !== "undefined" && !APAC_TEMPLATE_URL.startsWith("http")
        ? `${window.location.origin}${APAC_TEMPLATE_URL}`
        : APAC_TEMPLATE_URL;

    // Dimensões reais da imagem carregada — fallback para os naturais conhecidos.
    const naturalW = imgRef.current?.naturalWidth || APAC_TEMPLATE_NATURAL_WIDTH;
    const naturalH = imgRef.current?.naturalHeight || APAC_TEMPLATE_NATURAL_HEIGHT;

    useImperativeHandle(
      ref,
      () => ({
        element: rootRef.current,
        isReady: () => imgLoaded && !ibgeLoading,
        waitReady: async (timeoutMs = 4000) => {
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

    return (
      <div
        ref={rootRef}
        className="apac-page"
        style={{
          position: "relative",
          width: `${A4_WIDTH_MM}mm`,
          height: `${A4_HEIGHT_MM}mm`,
          background: "#fff",
          overflow: "hidden",
          fontFamily: "Arial, Helvetica, sans-serif",
          color: "#000",
        }}
      >
        <img
          ref={imgRef}
          src={absTemplate}
          alt=""
          className="apac-template"
          onLoad={() => {
            setImgLoaded(true);
            setImgError(false);
          }}
          onError={() => setImgError(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: `${A4_WIDTH_MM}mm`,
            height: `${A4_HEIGHT_MM}mm`,
            objectFit: "fill",
            zIndex: 1,
            pointerEvents: "none",
            userSelect: "none",
          }}
          draggable={false}
        />
        {imgError && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "24px",
              textAlign: "center",
              color: "#900",
              fontSize: "10pt",
              background: "rgba(255,255,255,0.95)",
            }}
          >
            Não foi possível carregar o modelo oficial do Laudo APAC.
          </div>
        )}

        {renders.map((r) => {
          if (r.kind === "text") {
            if (!r.value) return null;
            const style = getTextOverlayStyle(r.box, naturalW, naturalH, {
              align: r.align,
              fontSizePx: r.fontSizePx ?? 11,
            });
            return (
              <div key={r.id} data-apac-id={r.id} style={style}>
                {r.value}
              </div>
            );
          }
          if (r.kind === "digit") {
            if (!r.value) return null;
            const style = getDigitOverlayStyle(r.box, naturalW, naturalH, r.fontSizePx ?? 11);
            return (
              <div key={r.id} data-apac-id={r.id} style={style}>
                {r.value}
              </div>
            );
          }
          // check
          if (!r.show) return null;
          const style = getTextOverlayStyle(r.box, naturalW, naturalH, {
            align: "center",
            fontSizePx: r.fontSizePx ?? 14,
          });
          return (
            <div key={r.id} data-apac-id={r.id} style={{ ...style, fontWeight: "bold" }}>
              ✕
            </div>
          );
        })}

        {APAC_DEBUG &&
          renders.map((r) => {
            const mm = imageBoxPxToMm(r.box, naturalW, naturalH);
            return (
              <div
                key={`dbg-${r.id}`}
                style={{
                  position: "absolute",
                  left: `${mm.leftMm}mm`,
                  top: `${mm.topMm}mm`,
                  width: `${mm.widthMm}mm`,
                  height: `${mm.heightMm}mm`,
                  border: "0.2mm solid rgba(255,0,0,0.8)",
                  background: "rgba(255,0,0,0.06)",
                  zIndex: 3,
                  fontSize: "6px",
                  color: "#900",
                  lineHeight: 1,
                  pointerEvents: "none",
                }}
              >
                {r.id}
              </div>
            );
          })}
      </div>
    );
  },
);

export default ApacLaudoTemplate;
