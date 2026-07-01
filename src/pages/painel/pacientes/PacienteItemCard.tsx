import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Phone,
  Mail,
  Pencil,
  Trash2,
  Users,
  Clock,
  FileUp,
  Eye,
  FileText,
  Printer,
} from "lucide-react";
import { FileSignature } from "lucide-react";
import ContactActionButton from "@/components/ContactActionButton";
import { formatCNS } from "@/components/PacienteDetalheModal";

export interface PacienteItemCardProps {
  paciente: any;
  naFila: boolean;
  filaEntry?: { horaChegada: string; prioridade: string; unidadeId?: string } | undefined;
  demandaReprimida: boolean;
  unidadeNome: string;
  canAddToFila: boolean;
  canDelete: boolean;
  onImprimirFicha: (p: any) => void;
  onImprimirLaudoApac: (p: any) => void;
  onAddFila: (p: any) => void;
  onOpenDetalhe: (p: any) => void;
  onVerProntuarios: (p: any) => void;
  onEditar: (p: any) => void;
  onDelete: (p: any) => void;
}

const PacienteItemCardBase: React.FC<PacienteItemCardProps> = ({
  paciente: p,
  naFila,
  filaEntry,
  demandaReprimida,
  unidadeNome,
  canAddToFila,
  canDelete,
  onImprimirFicha,
  onImprimirLaudoApac,
  onAddFila,
  onOpenDetalhe,
  onVerProntuarios,
  onEditar,
  onDelete,
}) => {
  return (
    <Card className="shadow-card border-0 hover:shadow-elevated transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground">{p.nome}</h3>
              {naFila && (
                <Badge
                  variant="outline"
                  className="bg-warning/10 text-warning border-warning/30 text-[10px] px-1.5 py-0"
                >
                  <Clock className="w-3 h-3 mr-0.5" /> FILA DE ESPERA
                </Badge>
              )}
              {demandaReprimida && (
                <Badge
                  variant="outline"
                  className="bg-orange-500/10 text-orange-600 border-orange-500/30 text-[10px] px-1.5 py-0"
                >
                  <FileUp className="w-3 h-3 mr-0.5" /> DEMANDA REPRIMIDA
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{p.cpf || "Sem CPF"}</p>
            {p.cns && (
              <p className="text-xs text-muted-foreground mt-0.5">CNS: {formatCNS(p.cns)}</p>
            )}
            {naFila && filaEntry && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Entrada: {filaEntry.horaChegada} •{" "}
                {filaEntry.prioridade !== "normal" ? filaEntry.prioridade : ""}
              </p>
            )}
          </div>
          <div className="flex gap-1 flex-wrap">
            <ContactActionButton
              phone={p.telefone}
              patientName={p.nome}
              unitName={unidadeNome}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => onImprimirFicha(p)}
              title="Imprimir Ficha"
            >
              <Printer className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => onImprimirLaudoApac(p)}
              title="Imprimir Laudo APAC"
            >
              <FileSignature className="w-3.5 h-3.5" />
            </Button>
            {canAddToFila && !naFila && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-warning"
                onClick={() => onAddFila(p)}
                title="Adicionar à fila"
              >
                <Users className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => onOpenDetalhe(p)}
              title="Detalhes"
            >
              <Eye className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => onVerProntuarios(p)}
              title="Ver Prontuários"
            >
              <FileText className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => onEditar(p)}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir paciente?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Excluir {p.nome}? Será verificado se há agendamentos ativos vinculados. Esta
                      ação é irreversível e será registrada em log.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onDelete(p)}
                      className="bg-destructive text-destructive-foreground"
                    >
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1 min-w-0">
            <Phone className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{p.telefone}</span>
          </span>
          {p.email && (
            <span className="flex items-center gap-1 min-w-0">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{p.email}</span>
            </span>
          )}
        </div>
        {(p.descricaoClinica || p.cid) && (
          <div className="mt-1.5 text-xs text-muted-foreground space-y-0.5">
            {p.descricaoClinica && <p>🩺 {p.descricaoClinica}</p>}
            {p.cid && <p>CID: {p.cid}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const PacienteItemCard = React.memo(PacienteItemCardBase);
export default PacienteItemCard;
