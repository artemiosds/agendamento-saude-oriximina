import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildLaudoApacHTML } from "@/lib/apacLaudoPrint";

interface ApacLaudoSheetProps {
  paciente: any | null;
}

/**
 * Renderiza apenas a ficha APAC dentro de um iframe (preview).
 * Em telas pequenas, escala proporcionalmente para mostrar a folha inteira
 * sem cortar a lateral direita. Não há botões aqui.
 */
export function ApacLaudoSheet({ paciente }: ApacLaudoSheetProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);

  const html = useMemo(() => (paciente ? buildLaudoApacHTML(paciente) : ""), [paciente]);

  // largura nominal da ficha (200mm ≈ 756px @ 96dpi)
  const SHEET_PX_W = 756;
  const SHEET_PX_H = 1069; // ~283mm

  useLayoutEffect(() => {
    const recalc = () => {
      const el = wrapperRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const next = Math.min(1, w / SHEET_PX_W);
      setScale(next > 0 ? next : 1);
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  // largura/altura escaladas para o contêiner reservar o espaço correto
  const scaledH = SHEET_PX_H * scale;

  return (
    <div
      ref={wrapperRef}
      className="w-full h-full overflow-auto bg-muted flex justify-center"
      style={{ padding: "8px" }}
    >
      <div style={{ width: SHEET_PX_W * scale, height: scaledH, position: "relative" }}>
        <iframe
          ref={iframeRef}
          title="Laudo APAC"
          srcDoc={html}
          style={{
            width: `${SHEET_PX_W}px`,
            height: `${SHEET_PX_H}px`,
            border: "0",
            background: "#fff",
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        />
      </div>
    </div>
  );
}

export default ApacLaudoSheet;
