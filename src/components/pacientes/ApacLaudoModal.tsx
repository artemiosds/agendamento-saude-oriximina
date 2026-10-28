import ApacClinicalForm from "./ApacClinicalForm";
import { emptyApacClinicalData, validateApacClinicalData } from "@/lib/apacClinicalData";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download, X } from "lucide-react";
import { toast } from "sonner";
import ApacLaudoTemplate, { type ApacLaudoTemplateHandle } from "./ApacLaudoTemplate";
import { printApacLaudo, downloadApacLaudoPDF } from "@/lib/apacLaudoPrint";
import { A4_WIDTH_MM, A4_HEIGHT_MM } from "@/lib/apacLaudoOverlay";

interface ApacLaudoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paciente: any | null;
}

const MM_TO_PX = 96 / 25.4;
const A4_PX_W = A4_WIDTH_MM * MM_TO_PX;
const A4_PX_H = A4_HEIGHT_MM * MM_TO_PX;

export function ApacLaudoModal({ open, onOpenChange, paciente }: ApacLaudoModalProps) {
  const carregando = !paciente;
  const wrapRef = useRef<HTMLDivElement>(null);
  const templateRef = useRef<ApacLaudoTemplateHandle>(null);
  const [scale, setScale] = useState(1);
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [editing, setEditing] = useState(false);
  const [clinical, setClinical] = useState(emptyApacClinicalData);
  const [showForm, setShowForm] = useState(false);
  const patientKey = paciente?.id || paciente?.cpf || paciente?.cns || paciente?.nome || '';
  useEffect(() => {
    setEditing(false); setShowForm(false); setClinical(emptyApacClinicalData());
  }, [open, patientKey]);
  const errors = editing ? validateApacClinicalData(clinical) : [];

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
  }, [open, showForm]);

  const handlePrint = async () => {
    if (printing || errors.length) return;
    setPrinting(true);
    try {
      await templateRef.current?.waitReady(5000);
      await printApacLaudo(paciente, templateRef.current?.svg || null);
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível abrir a impressão. Tente novamente.");
    } finally {
      setPrinting(false);
    }
  };

  const handleDownload = async () => {
    if (downloading || errors.length) return;
    setDownloading(true);
    try {
      await templateRef.current?.waitReady(5000);
      await downloadApacLaudoPDF(templateRef.current?.svg || null, paciente);
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível gerar o PDF. Tente novamente.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[96vw] h-[92vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-4 py-3 border-b flex flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-base">
            Laudo APAC{paciente?.nome ? ` — ${paciente.nome}` : ""}
          </DialogTitle>
          <div className="flex items-center gap-2 mr-8 flex-wrap">
            <Button size="sm" variant="outline" disabled={carregando || printing || downloading} onClick={() => {setEditing(true);setShowForm(!showForm);}}>{showForm ? 'Ver prévia' : 'Preencher laudo'}</Button>
            {editing && <Button size="sm" variant="outline" disabled={printing || downloading} onClick={() => {if(window.confirm('Descartar os campos preenchidos e manter somente a identificação do paciente?')) {setEditing(false);setShowForm(false);setClinical(emptyApacClinicalData());}}}>Somente dados do paciente</Button>}
            <Button size="sm" onClick={handlePrint} disabled={carregando || printing || downloading || errors.length > 0}>
              <Printer className="w-4 h-4 mr-2" />
              {printing ? "Preparando impressão..." : "Imprimir Laudo APAC"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleDownload}
              disabled={carregando || downloading || printing || errors.length > 0}
            >
              <Download className="w-4 h-4 mr-2" />
              {downloading ? "Gerando PDF..." : "Baixar PDF"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
              <X className="w-4 h-4 mr-2" />
              Fechar
            </Button>
          </div>
        </DialogHeader>
        {errors.length > 0 && <div role="alert" className="border-b px-4 py-2 text-sm text-destructive">{errors.join(' ')}</div>}
        {showForm && <div className="flex-1 overflow-auto"><ApacClinicalForm value={clinical} onChange={setClinical}/></div>}
        <div ref={wrapRef} className={`flex-1 overflow-auto bg-muted flex items-start justify-center p-2 ${showForm ? "hidden" : ""}`}>
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
                <ApacLaudoTemplate ref={templateRef} paciente={paciente} clinicalData={editing ? clinical : undefined} />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ApacLaudoModal;
