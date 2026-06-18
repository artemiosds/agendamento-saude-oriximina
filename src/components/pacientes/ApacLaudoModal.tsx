import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import ApacLaudoTemplate from "./ApacLaudoTemplate";
import { printApacLaudo } from "@/lib/apacLaudoPrint";
import { A4_WIDTH_MM, A4_HEIGHT_MM } from "@/lib/apacLaudoOverlay";

interface ApacLaudoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paciente: any | null;
}

// 96dpi: 1mm = 3.7795px
const MM_TO_PX = 96 / 25.4;
const A4_PX_W = A4_WIDTH_MM * MM_TO_PX;
const A4_PX_H = A4_HEIGHT_MM * MM_TO_PX;

export function ApacLaudoModal({ open, onOpenChange, paciente }: ApacLaudoModalProps) {
  const carregando = !paciente;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const recalc = () => {
      const el = wrapRef.current;
      if (!el) return;
      const w = el.clientWidth - 16;
      const h = el.clientHeight - 16;
      const s = Math.min(w / A4_PX_W, h / A4_PX_H, 1);
      setScale(s > 0 ? s : 1);
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[96vw] h-[92vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-4 py-3 border-b flex flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-base">
            Laudo APAC{paciente?.nome ? ` — ${paciente.nome}` : ""}
          </DialogTitle>
          <div className="flex items-center gap-2 mr-8">
            <Button size="sm" onClick={() => printApacLaudo(paciente)} disabled={carregando}>
              <Printer className="w-4 h-4 mr-2" />
              Imprimir Laudo APAC
            </Button>
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
              <X className="w-4 h-4 mr-2" />
              Fechar
            </Button>
          </div>
        </DialogHeader>
        <div ref={wrapRef} className="flex-1 overflow-auto bg-muted flex items-start justify-center p-2">
          {carregando ? (
            <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
              Carregando dados do paciente...
            </div>
          ) : (
            <div
              style={{
                width: A4_PX_W * scale,
                height: A4_PX_H * scale,
                position: "relative",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: A4_PX_W,
                  height: A4_PX_H,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                  position: "absolute",
                  top: 0,
                  left: 0,
                  boxShadow: "0 0 6px rgba(0,0,0,0.18)",
                  background: "#fff",
                }}
              >
                <ApacLaudoTemplate paciente={paciente} />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ApacLaudoModal;
