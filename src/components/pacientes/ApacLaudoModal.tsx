import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import ApacLaudoSheet from "./ApacLaudoSheet";
import { printApacLaudo } from "@/lib/apacLaudoPrint";

interface ApacLaudoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paciente: any | null;
  unidadeNome?: string;
  cnesUnidade?: string;
}

/**
 * Modal de pré-visualização do Laudo APAC.
 * - Botão Imprimir: abre janela exclusiva (não imprime a página do sistema).
 * - Botão Fechar.
 * Sem persistência no banco.
 */
export function ApacLaudoModal({ open, onOpenChange, paciente }: ApacLaudoModalProps) {
  const carregando = !paciente;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[96vw] h-[92vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-4 py-3 border-b flex flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-base">
            Laudo APAC{paciente?.nome ? ` — ${paciente.nome}` : ""}
          </DialogTitle>
          <div className="flex items-center gap-2 mr-8">
            <Button
              size="sm"
              onClick={() => printApacLaudo(paciente)}
              disabled={carregando}
            >
              <Printer className="w-4 h-4 mr-2" />
              Imprimir Laudo APAC
            </Button>
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
              <X className="w-4 h-4 mr-2" />
              Fechar
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          {carregando ? (
            <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
              Carregando dados do paciente...
            </div>
          ) : (
            <ApacLaudoSheet key={paciente?.id || "apac"} paciente={paciente} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ApacLaudoModal;
