import { useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { buildLaudoApacHTML } from "@/lib/apacLaudoPrint";

interface ApacLaudoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paciente: any | null;
  unidadeNome?: string;
  cnesUnidade?: string;
}

/**
 * Laudo APAC — ficha A4 (1 página) construída em HTML/CSS.
 * Apenas leitura dos dados do paciente; não persiste nada.
 */
export function ApacLaudoModal({ open, onOpenChange, paciente }: ApacLaudoModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const laudoHTML = useMemo(() => (open && paciente ? buildLaudoApacHTML(paciente) : ""), [open, paciente]);

  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.focus();
      win.print();
    } catch (e) {
      console.error("[ApacLaudo] print failed", e);
    }
  };

  const carregando = !paciente;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[92vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-4 py-3 border-b flex flex-row items-center justify-between space-y-0">
          <DialogTitle>Laudo APAC{paciente?.nome ? ` — ${paciente.nome}` : ""}</DialogTitle>
          <Button size="sm" onClick={handlePrint} className="mr-8" disabled={carregando}>
            <Printer className="w-4 h-4 mr-2" />
            Imprimir
          </Button>
        </DialogHeader>
        <div className="flex-1 bg-muted overflow-hidden">
          {carregando ? (
            <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
              Carregando dados do paciente...
            </div>
          ) : (
            <iframe
              key={paciente?.id || "apac-laudo"}
              ref={iframeRef}
              title="Pré-visualização Laudo APAC"
              srcDoc={laudoHTML}
              className="w-full h-full bg-white border-0"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ApacLaudoModal;
