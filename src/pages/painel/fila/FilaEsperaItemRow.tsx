import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  Bell,
  Play,
  CheckCircle,
  XCircle,
  Pencil,
  Trash2,
  Clock,
  ArrowRight,
  Timer,
  FileUp,
  Eye,
  CalendarClock,
  TriangleAlert,
} from "lucide-react";
import ContactActionButton from "@/components/ContactActionButton";
import { cn } from "@/lib/utils";

export interface FilaEsperaItemRowProps {
  f: any;
  numero: number;
  pacienteNomeResolved: string;
  pacienteTelefone?: string;
  profLabel: string; // "Nome — Profissão" ou "Qualquer profissional"
  unidadeNome: string;
  isChamado: boolean;
  isActive: boolean;
  waitMin: number;
  waitBgClass: string;
  waitTextClass: string;
  waitLabel: string;
  reservaTime: { expired?: boolean; minutes: number; seconds: number; slot?: any } | null;
  manchesterRisco: { color: string; subtitle: string; pulse?: boolean } | null;
  absenceInfo?: { date: string; reason: string; obs?: string };
  prioridadeBadgeClass: string;
  prioridadeLabelText: string;
  statusLabelText: string;
  statusLabelClass: string;
  canManage: boolean;
  onConfirmarEncaixe: (f: any, slot: any) => void;
  onExpirarReserva: (f: any, slot: any) => void;
  onChamar: (f: any) => void;
  onIniciar: (f: any) => void;
  onFinalizar: (f: any) => void;
  onMarcarFalta: (f: any) => void;
  onReagendar: (f: any) => void;
  onDetalhes: (f: any) => void;
  onEditar: (f: any) => void;
  onRemover: (f: any) => void;
}

const FilaEsperaItemRowBase: React.FC<FilaEsperaItemRowProps> = ({
  f,
  numero,
  pacienteNomeResolved,
  pacienteTelefone,
  profLabel,
  unidadeNome,
  isChamado,
  isActive,
  waitMin,
  waitBgClass,
  waitTextClass,
  waitLabel,
  reservaTime,
  manchesterRisco,
  absenceInfo,
  prioridadeBadgeClass,
  prioridadeLabelText,
  statusLabelText,
  statusLabelClass,
  canManage,
  onConfirmarEncaixe,
  onExpirarReserva,
  onChamar,
  onIniciar,
  onFinalizar,
  onMarcarFalta,
  onReagendar,
  onDetalhes,
  onEditar,
  onRemover,
}) => {
  return (
    <Card
      className={cn("shadow-card border-0 transition-all", isChamado && "ring-2 ring-primary/30")}
      style={{
        borderLeft: manchesterRisco
          ? `6px solid ${manchesterRisco.color}`
          : isActive && waitMin > 60
            ? "6px solid hsl(var(--destructive))"
            : isActive && waitMin >= 30
              ? "6px solid hsl(var(--warning))"
              : isActive
                ? "6px solid hsl(var(--success))"
                : undefined,
      }}
    >
      <CardContent className="p-3 sm:p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm",
                isActive
                  ? `${waitBgClass} ${waitTextClass}`
                  : "gradient-primary text-primary-foreground",
              )}
            >
              {numero}
            </div>
            {isActive && (
              <span
                className={cn(
                  "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                  waitBgClass,
                  waitTextClass,
                )}
              >
                {waitLabel}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-foreground">{pacienteNomeResolved}</p>
              {f.origemCadastro === "demanda_reprimida" && (
                <Badge
                  variant="outline"
                  className="bg-orange-500/10 text-orange-600 border-orange-500/30 text-[10px] px-1.5 py-0"
                >
                  <FileUp className="w-3 h-3 mr-0.5" /> DEMANDA REPRIMIDA
                </Badge>
              )}
              {manchesterRisco && (
                <Badge
                  className={`text-white text-[10px] px-1.5 py-0 ${manchesterRisco.pulse ? "animate-[pulse-manchester_1.5s_infinite]" : ""}`}
                  style={{ backgroundColor: manchesterRisco.color }}
                >
                  {manchesterRisco.subtitle}
                </Badge>
              )}
              {isActive && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full",
                    waitBgClass,
                    waitTextClass,
                  )}
                >
                  <Clock className="w-3 h-3" />
                  {f.prioridade === "urgente" ? "URGENTE" : `Espera: ${waitLabel}`}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {unidadeNome || f.setor} • {profLabel} • Chegou: {f.horaChegada}
            </p>
            {absenceInfo && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive cursor-help mt-0.5">
                      <TriangleAlert className="w-3 h-3" /> Falta anterior
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="font-semibold text-sm">Última falta: {absenceInfo.date}</p>
                    <p className="text-sm">Motivo: {absenceInfo.reason}</p>
                    {absenceInfo.obs && (
                      <p className="text-sm text-muted-foreground">{absenceInfo.obs}</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {f.dataSolicitacaoOriginal && (
              <p className="text-xs text-muted-foreground mt-0.5">
                📅 Solicitação original: {f.dataSolicitacaoOriginal}
              </p>
            )}
            {f.observacoes && (
              <p className="text-xs text-muted-foreground mt-0.5">📋 {f.observacoes}</p>
            )}
            {f.descricaoClinica && (
              <p className="text-xs text-muted-foreground mt-0.5">🩺 {f.descricaoClinica}</p>
            )}
            {f.cid && <p className="text-xs text-muted-foreground mt-0.5">CID: {f.cid}</p>}
            {isChamado && reservaTime && !reservaTime.expired && reservaTime.slot && (
              <div className="flex items-center gap-1 mt-1 text-xs font-medium text-primary">
                <Timer className="w-3 h-3" />
                Reserva: {reservaTime.minutes}:{String(reservaTime.seconds).padStart(2, "0")}{" "}
                restantes — Vaga: {reservaTime.slot.hora} com {reservaTime.slot.profissionalNome}
              </div>
            )}
            {isChamado && reservaTime && reservaTime.expired && (
              <div className="flex items-center gap-1 mt-1 text-xs font-medium text-destructive">
                <Timer className="w-3 h-3" />
                Reserva expirada!
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ContactActionButton
            phone={pacienteTelefone}
            patientName={f.pacienteNome}
            unitName={unidadeNome}
          />
          <Badge className={cn("shrink-0", prioridadeBadgeClass)}>{prioridadeLabelText}</Badge>
          <span
            className={cn(
              "text-xs px-2.5 py-1 rounded-full font-medium shrink-0",
              statusLabelClass,
            )}
          >
            {statusLabelText}
          </span>
        </div>
        {canManage && (
          <div className="flex gap-1 shrink-0 flex-wrap">
            {isChamado && reservaTime?.slot && (
              <Button
                size="sm"
                variant="default"
                className="h-8 bg-success text-success-foreground hover:bg-success/90"
                onClick={() => onConfirmarEncaixe(f, reservaTime.slot)}
                title="Confirmar Encaixe"
              >
                <CheckCircle className="w-4 h-4 mr-1" /> Confirmar
              </Button>
            )}
            {isChamado && reservaTime?.slot && (
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => onExpirarReserva(f, reservaTime.slot)}
                title="Expirar Reserva / Chamar Próximo"
              >
                <ArrowRight className="w-4 h-4 mr-1" /> Próximo
              </Button>
            )}
            {!isChamado && f.status === "aguardando" && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={() => onChamar(f)}
                title="Chamar"
              >
                <Bell className="w-4 h-4" />
              </Button>
            )}
            {f.status !== "encaixado" &&
              f.status !== "atendido" &&
              f.status !== "cancelado" &&
              !isChamado && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => onIniciar(f)}
                    title="Iniciar"
                  >
                    <Play className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => onFinalizar(f)}
                    title="Finalizar"
                  >
                    <CheckCircle className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => onMarcarFalta(f)}
                    title="Marcar Falta"
                  >
                    <XCircle className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => onReagendar(f)}
                    title="Reagendar"
                  >
                    <CalendarClock className="w-4 h-4" />
                  </Button>
                </>
              )}
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => onDetalhes(f)}
              title="Detalhes"
            >
              <Eye className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => onEditar(f)}
              title="Editar"
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-destructive"
                  title="Remover"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover da fila?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tem certeza que deseja remover {pacienteNomeResolved} da fila?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onRemover(f)}>Remover</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const FilaEsperaItemRow = React.memo(FilaEsperaItemRowBase);
export default FilaEsperaItemRow;
