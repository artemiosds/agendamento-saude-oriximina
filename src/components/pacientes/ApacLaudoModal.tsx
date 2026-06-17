import { useEffect, useMemo, useRef } from "react";
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

export function ApacLaudoModal({ open, onOpenChange, paciente, unidadeNome, cnesUnidade }: ApacLaudoModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const html = useMemo(() => {
    if (!paciente) return "";
    return buildLaudoApacHTML(paciente, { unidadeNome, cnesUnidade });
  }, [paciente, unidadeNome, cnesUnidade]);

  useEffect(() => {
    if (!open || !html) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, [open, html]);

  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try { win.focus(); win.print(); } catch (e) { console.error(e); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[92vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-4 py-3 border-b flex flex-row items-center justify-between space-y-0">
          <DialogTitle>Laudo APAC — {paciente?.nome || ""}</DialogTitle>
          <Button size="sm" onClick={handlePrint} className="mr-8">
            <Printer className="w-4 h-4 mr-2" />
            Imprimir
          </Button>
        </DialogHeader>
        <div className="flex-1 bg-muted overflow-hidden">
          <iframe
            ref={iframeRef}
            title="Pré-visualização Laudo APAC"
            className="w-full h-full bg-white border-0"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ApacLaudoModal;
