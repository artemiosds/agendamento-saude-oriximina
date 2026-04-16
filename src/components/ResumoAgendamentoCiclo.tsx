import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, MessageCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizePhone, isValidNormalizedPhone } from "@/lib/phoneUtils";
import { toast } from "sonner";

export interface ResumoSessaoItem {
  numero: number;
  data: string; // ISO yyyy-mm-dd
  hora?: string;
  status: "agendada" | "ja_agendada" | "erro";
  mensagem?: string;
}

interface ResumoAgendamentoCicloProps {
  pacienteNome: string;
  pacienteTelefone?: string | null;
  profissionalNome: string;
  tratamento: string;
  itens: ResumoSessaoItem[];
  onClose: () => void;
}

function formatDateBR(iso: string) {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");
}

function gerarLinkWhatsApp(
  telefoneNormalizado: string,
  pacienteNome: string,
  profissionalNome: string,
  tratamento: string,
  datas: string[],
) {
  const listaDatas = datas.length > 0 ? datas.join(", ") : "—";
  const msg =
    `Olá, ${pacienteNome}! 👋\n\n` +
    `Seu ciclo de tratamento de *${tratamento}* com o(a) profissional *${profissionalNome}* foi agendado com sucesso. ✅\n\n` +
    `📅 Sessões marcadas para os dias: ${listaDatas}\n\n` +
    `Em caso de dúvidas, entre em contato. Obrigado!`;
  return `https://wa.me/${telefoneNormalizado}?text=${encodeURIComponent(msg)}`;
}

export const ResumoAgendamentoCiclo: React.FC<ResumoAgendamentoCicloProps> = ({
  pacienteNome,
  pacienteTelefone,
  profissionalNome,
  tratamento,
  itens,
  onClose,
}) => {
  const novas = itens.filter((i) => i.status === "agendada");
  const jaExistiam = itens.filter((i) => i.status === "ja_agendada");
  const erros = itens.filter((i) => i.status === "erro");

  const datasParaMensagem = [...novas, ...jaExistiam]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((i) => formatDateBR(i.data) + (i.hora ? ` às ${i.hora}` : ""));

  const telefoneNorm = normalizePhone(pacienteTelefone);
  const telefoneValido = isValidNormalizedPhone(telefoneNorm);

  const handleNotificar = () => {
    if (!telefoneNorm || !telefoneValido) {
      toast.error("Paciente sem WhatsApp válido cadastrado.");
      return;
    }
    const link = gerarLinkWhatsApp(
      telefoneNorm,
      pacienteNome,
      profissionalNome,
      tratamento,
      datasParaMensagem,
    );
    window.open(link, "_blank", "noopener,noreferrer");
  };

  return (
    <Card className="shadow-card border-0 border-l-4 border-l-success animate-fade-in">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-success/10">
              <CheckCircle className="w-5 h-5 text-success" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">
                Resumo do agendamento do ciclo
              </h3>
              <p className="text-xs text-muted-foreground">
                Processadas {itens.length} sessões — {novas.length} novas, {jaExistiam.length} já existentes
                {erros.length > 0 && `, ${erros.length} com erro`}
              </p>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={onClose}
            aria-label="Fechar resumo"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-success/5 border border-success/20 p-2 text-center">
            <p className="text-lg font-bold text-success">{novas.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Agendadas</p>
          </div>
          <div className="rounded-lg bg-info/5 border border-info/20 p-2 text-center">
            <p className="text-lg font-bold text-info">{jaExistiam.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Já existiam</p>
          </div>
          <div className={cn(
            "rounded-lg p-2 text-center border",
            erros.length > 0
              ? "bg-destructive/5 border-destructive/20"
              : "bg-muted/30 border-border",
          )}>
            <p className={cn("text-lg font-bold", erros.length > 0 ? "text-destructive" : "text-muted-foreground")}>
              {erros.length}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Erros</p>
          </div>
        </div>

        {erros.length > 0 && (
          <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3 space-y-1">
            <div className="flex items-center gap-2 text-destructive text-sm font-medium">
              <AlertCircle className="w-4 h-4" /> Falhas no processamento
            </div>
            <ul className="text-xs text-destructive/90 list-disc pl-5 space-y-0.5">
              {erros.slice(0, 5).map((e, i) => (
                <li key={i}>
                  Sessão {e.numero} ({formatDateBR(e.data)}): {e.mensagem || "erro desconhecido"}
                </li>
              ))}
              {erros.length > 5 && <li>… e mais {erros.length - 5}</li>}
            </ul>
          </div>
        )}

        <div className="border-t pt-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {telefoneValido
              ? "Envie o resumo do ciclo para o paciente via WhatsApp."
              : "Paciente sem WhatsApp válido — não é possível notificar."}
          </p>
          <Button
            onClick={handleNotificar}
            disabled={!telefoneValido}
            className="bg-success hover:bg-success/90 text-success-foreground"
            size="sm"
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            Notificar Paciente via WhatsApp
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ResumoAgendamentoCiclo;
