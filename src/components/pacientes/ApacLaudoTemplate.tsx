// Componente do template oficial APAC.
// Renderiza a imagem da página 1 do PDF oficial e sobrepõe somente os
// campos 3 a 17. Tamanho real 210×297 mm — escala visual fica por conta
// do contêiner que renderiza este componente.

import { useMemo } from "react";
import { normalizePaciente, type AnyPaciente } from "@/lib/apacLaudoData";
import {
  APAC_TEMPLATE_URL,
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  buildOverlays,
} from "@/lib/apacLaudoOverlay";

interface Props {
  paciente: AnyPaciente | null;
  onTemplateLoad?: () => void;
  onTemplateError?: () => void;
}

export function ApacLaudoTemplate({ paciente, onTemplateLoad, onTemplateError }: Props) {
  const overlays = useMemo(() => buildOverlays(normalizePaciente(paciente)), [paciente]);

  return (
    <div
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
        src={APAC_TEMPLATE_URL}
        alt="Laudo APAC — template oficial"
        className="apac-template"
        onLoad={onTemplateLoad}
        onError={onTemplateError}
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
      {overlays.map((o, i) => {
        if (o.kind === "text") {
          if (!o.value) return null;
          return (
            <div
              key={i}
              className="apac-value"
              style={{
                position: "absolute",
                zIndex: 2,
                left: `${o.left}mm`,
                top: `${o.top}mm`,
                width: `${o.width}mm`,
                fontSize: `${o.fontSize}pt`,
                lineHeight: 1,
                color: "#000",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textAlign: o.align === "center" ? "center" : "left",
              }}
            >
              {o.value}
            </div>
          );
        }
        if (o.kind === "digits") {
          const v = (o.value || "").slice(0, o.count);
          return (
            <span key={i}>
              {Array.from(v).map((ch, j) => (
                <div
                  key={j}
                  className="apac-value apac-digit"
                  style={{
                    position: "absolute",
                    zIndex: 2,
                    left: `${o.startLeft + j * o.spacing}mm`,
                    top: `${o.top}mm`,
                    transform: "translateX(-50%)",
                    fontSize: `${o.fontSize}pt`,
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1,
                    color: "#000",
                  }}
                >
                  {ch}
                </div>
              ))}
            </span>
          );
        }
        // check
        if (!o.show) return null;
        return (
          <div
            key={i}
            className="apac-value apac-check"
            style={{
              position: "absolute",
              zIndex: 2,
              left: `${o.left}mm`,
              top: `${o.top}mm`,
              transform: "translate(-50%, -50%)",
              fontSize: `${o.fontSize}pt`,
              fontWeight: "bold",
              lineHeight: 1,
              color: "#000",
            }}
          >
            ✕
          </div>
        );
      })}
    </div>
  );
}

export default ApacLaudoTemplate;
