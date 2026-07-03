import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/action-button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  Clock,
  Paperclip,
  Eye,
  Pencil,
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  X,
  Trash2,
} from "lucide-react";
import ContactActionButton from "@/components/ContactActionButton";
import { AgendaNotificacaoIndividual } from "@/components/AgendaNotificacoes";
import { formatCNS } from "@/lib/cnsUtils";
import { getManchesterBadgeStyle } from "@/lib/manchesterProtocol";
import { cn, todayLocalStr } from "@/lib/utils";

export interface AgendaItemCardProps {
  ag: any;
  idx: number;
  idxPendentesManha: number;
  paciente: any | undefined;
  unidade: any | undefined;
  pacienteNomeResolved: string;
  lastAppt: any | undefined;
  triageRisco: string | undefined;
  iniciadoEm: string | null | undefined;
  displayStatus: string;
  displayStatusLabel: string;
  displayStatusClass: string;
  tipoInfo: { label: string; class: string; icon: string };
  user: any;
  isProfissional: boolean;
  isMaster: boolean;
  coordenadorPodeConcluir: boolean;
  canEdit: boolean;
  canAprovar: boolean;
  canRetorno: boolean;
  canDelete: boolean;
  canAgendaEdit: boolean;
  alertaMinutosEmAtendimento: number;
  statusActions: ReadonlyArray<{ key: string; label: string; icon: any; color: string }>;
  onOpenDetalhe: (ag: any) => void;
  onOpenEdit: (ag: any) => void;
  onAprovar: (ag: any) => void;
  onRejeitarInit: (ag: any) => void;
  onIniciarAtendimento: (ag: any) => void;
  onContinuar: (ag: any) => void;
  onVerProntuario: (ag: any) => void;
  onAbrirRetorno: (ag: any) => void;
  onStatusChange: (id: string, key: string) => void;
  onCancelInit: (ag: any) => void;
  onConcluir: (payload: {
    id: string;
    pacienteNome: string;
    profissionalNome: string;
    profissionalId: string;
    hora: string;
    iniciado_em: string | null;
  }) => void;
  onDelete: (id: string) => void;
}

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const AgendaItemCardBase: React.FC<AgendaItemCardProps> = ({
  ag,
  idx,
  idxPendentesManha,
  paciente,
  unidade,
  pacienteNomeResolved,
  lastAppt,
  triageRisco,
  iniciadoEm,
  displayStatus,
  displayStatusLabel,
  displayStatusClass,
  tipoInfo,
  user,
  isProfissional,
  isMaster,
  coordenadorPodeConcluir,
  canEdit,
  canAprovar,
  canRetorno,
  canDelete,
  canAgendaEdit,
  alertaMinutosEmAtendimento,
  statusActions,
  onOpenDetalhe,
  onOpenEdit,
  onAprovar,
  onRejeitarInit,
  onIniciarAtendimento,
  onContinuar,
  onVerProntuario,
  onAbrirRetorno,
  onStatusChange,
  onCancelInit,
  onConcluir,
  onDelete,
}) => {
  const today = todayLocalStr();
  const ehHoje = isSameDay(new Date(`${ag.data}T12:00:00`), new Date());
  const isFuture = ag.data > today;
  const STATUS_LIBERADOS = ["confirmado_chegada", "aguardando_atendimento", "apto_atendimento"];
  const canStart = isProfissional && STATUS_LIBERADOS.includes(ag.status) && !isFuture;
  const isEmAtendimento = ag.status === "em_atendimento";
  const ehPendenteOnline = ag.origem === "online" && ag.status === "pendente";
  const anexoUrl = (ag as any).attachment_url || ag.attachmentUrl;

  const typeColorBar: Record<string, string> = {
    Consulta: "border-l-[#3B82F6]",
    Retorno: "border-l-[#10B981]",
    Procedimento: "border-l-[#8B5CF6]",
    Exame: "border-l-[#F59E0B]",
    Urgência: "border-l-[#EF4444]",
    "Sessão de Tratamento": "border-l-[#F97316]",
  };

  return (
    <React.Fragment>
      {idx === idxPendentesManha && (
        <div className="flex items-center gap-2 px-3 py-1.5 mt-2 mb-1 rounded-md bg-amber-50 dark:bg-amber-950/30 border-l-4 border-amber-500">
          <Clock className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300" />
          <span className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
            Pendentes da manhã
          </span>
        </div>
      )}
      <Card
        className={cn(
          "shadow-card border-0 border-l-4",
          typeColorBar[ag.tipo] || "border-l-muted",
          isEmAtendimento && "ring-2 ring-primary/50",
          ehPendenteOnline && "ring-1 ring-warning/40",
        )}
      >
      <CardContent className="p-3 sm:p-4 space-y-2">
        <div className="flex items-start gap-3">
          <span className="text-lg font-mono font-bold text-primary w-14 shrink-0">{ag.hora}</span>
          <div className="flex-1 min-w-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="font-semibold text-foreground cursor-default truncate">
                    {tipoInfo.icon} {pacienteNomeResolved}
                    {anexoUrl && <Paperclip className="w-3.5 h-3.5 inline ml-1 text-info" />}
                  </p>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">
                    <strong>Paciente:</strong> {pacienteNomeResolved}
                  </p>
                  {paciente?.telefone && (
                    <p className="text-xs">
                      <strong>Tel:</strong> {paciente.telefone}
                    </p>
                  )}
                  {paciente?.cpf && (
                    <p className="text-xs">
                      <strong>CPF:</strong> {paciente.cpf}
                    </p>
                  )}
                  {paciente?.cns && (
                    <p className="text-xs">
                      <strong>CNS:</strong> {formatCNS(paciente.cns)}
                    </p>
                  )}
                  <p className="text-xs">
                    <strong>Tipo:</strong> {tipoInfo.label}
                  </p>
                <p className="text-xs">
                  <strong>Origem:</strong> {(ag.origem as string) === 'externo' ? '🔗 Externo' : ag.origem}
                </p>
                {(ag as any).agendadoPorExterno && (
                  <p className="text-xs text-primary font-medium">
                    📋 Agendado por externo
                  </p>
                )}
                {lastAppt && (
                  <>
                    <hr className="my-1 border-border" />
                    <p className="text-xs font-semibold">Último atendimento:</p>
                    <p className="text-xs">
                      {new Date(lastAppt.data + "T12:00:00").toLocaleDateString("pt-BR")} —{" "}
                      {lastAppt.profissional}
                    </p>
                    {lastAppt.procedimentos && <p className="text-xs">📋 {lastAppt.procedimentos}</p>}
                    {lastAppt.queixa && <p className="text-xs">QP: {lastAppt.queixa.substring(0, 80)}</p>}
                  </>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <p className="text-sm text-muted-foreground">{ag.profissionalNome}</p>
            {lastAppt && isProfissional && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                📋 Último: {new Date(lastAppt.data + "T12:00:00").toLocaleDateString("pt-BR")} —{" "}
                {lastAppt.queixa?.substring(0, 50) || lastAppt.procedimentos || "sem resumo"}
              </p>
            )}
            {ehPendenteOnline && <p className="text-xs text-warning mt-0.5">⏳ Aguardando aprovação</p>}
          </div>
          <ContactActionButton
            phone={paciente?.telefone}
            patientName={ag.pacienteNome}
            unitName={unidade?.nome}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", tipoInfo.class)}>
            {tipoInfo.label}
          </span>
          {(() => {
            const riscoRaw = triageRisco;
            if (!riscoRaw) return null;
            const m = getManchesterBadgeStyle(riscoRaw);
            if (m.label === '—') return null;
            return (
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-semibold border inline-flex items-center gap-1.5",
                  m.bg,
                  m.text,
                  m.pulse && "animate-pulse",
                )}
                style={{ borderColor: m.color }}
                title={`Classificação de risco: ${m.label}`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: m.color }}
                />
                Risco {m.label}
              </span>
            );
          })()}
          <span
            className={cn(
              "text-xs px-2.5 py-1 rounded-full font-medium shrink-0",
             displayStatusClass || "bg-muted text-muted-foreground",
           )}
         >
           {displayStatusLabel || ag.status}
          </span>
          {ag.googleEventId && (
            <span
              className={cn(
                "text-xs px-1.5 py-0.5 rounded font-medium",
                ag.syncStatus === "ok"
                  ? "bg-success/10 text-success"
                  : ag.syncStatus === "erro"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-warning/10 text-warning",
              )}
            >
              📅
            </span>
          )}
        </div>

        <div className="flex gap-1 flex-wrap">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => onOpenDetalhe(ag)}
            title="Detalhes"
          >
            <Eye className="w-3.5 h-3.5" />
          </Button>
          {/* Botão individual de aviso — MASTER e RECEPCAO */}
          {(user?.role === "master" || user?.role === "recepcao") && (
            <AgendaNotificacaoIndividual
              ag={ag}
              paciente={paciente}
              unidade={unidade}
            />
          )}
          {canEdit && !["cancelado", "concluido"].includes(ag.status) && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs"
              onClick={() => onOpenEdit(ag)}
              title="Editar"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          )}

          {/* NOVO: aprovação inline */}
          {ehPendenteOnline && canAprovar && (
            <>
              <Button
                size="sm"
                className="h-8 px-2 bg-success text-success-foreground hover:bg-success/90"
                onClick={() => onAprovar(ag)}
                title="Aprovar"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2 border-destructive text-destructive hover:bg-destructive/10"
                onClick={() => onRejeitarInit(ag)}
                title="Rejeitar"
              >
                <XCircle className="w-3.5 h-3.5" />
              </Button>
            </>
          )}

          {isProfissional && (
            <>
              {(ag.status === "pendente" || ag.status === "confirmado") && ehHoje && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-3 text-xs cursor-not-allowed opacity-50"
                        disabled
                      >
                        ⏳ Aguardando chegada
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Aguardando confirmação de chegada pela recepção</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {ag.status === "aguardando_triagem" && ehHoje && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 text-xs cursor-not-allowed opacity-50 border-warning text-warning"
                        disabled
                      >
                        🩺 Em triagem
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Aguardando técnico de enfermagem concluir a triagem</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {canStart && (
                <ActionButton
                  size="sm"
                  className="h-8 px-3 text-xs bg-success text-success-foreground hover:bg-success/90"
                  onClick={() => onIniciarAtendimento(ag)}
                  loadingText="Iniciando..."
                >
                  <Play className="w-3.5 h-3.5 mr-1" /> Iniciar atendimento
                </ActionButton>
              )}
              {isEmAtendimento && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs"
                  onClick={() => onContinuar(ag)}
                >
                  <Clock className="w-3.5 h-3.5 mr-1" /> Continuar
                </Button>
              )}
              {ag.status === "concluido" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-3 text-xs"
                  onClick={() => onVerProntuario(ag)}
                >
                  ✅ Ver prontuário
                </Button>
              )}
              {(ag.status === "falta" || ag.status === "cancelado") && (
                <span className="text-xs text-muted-foreground px-2 py-1">
                  {ag.status === "falta" ? "Faltou" : "Cancelado"}
                </span>
              )}
              {isFuture && !["falta", "cancelado", "concluido"].includes(ag.status) && (
                <span className="text-xs text-muted-foreground px-2 py-1">
                  📅 Agendado para{" "}
                  {new Date(ag.data + "T12:00:00").toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </span>
              )}
            </>
          )}
          {canRetorno && ag.status === "concluido" && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs border-accent text-accent-foreground"
              onClick={() => onAbrirRetorno(ag)}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Retorno
            </Button>
          )}
          {/* Master/Coordenador: Concluir Atendimento manualmente */}
          {(isMaster || (coordenadorPodeConcluir && user?.role === "coordenador") || (user?.role === "profissional" && ag.profissionalId === user?.id)) &&
            ag.status !== "cancelado" && ag.status !== "concluido" && !ehPendenteOnline && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs border-info text-info"
              title="Concluir atendimento (registrar procedimento e CID)"
              onClick={() => onConcluir({
                id: ag.id,
                pacienteNome: ag.pacienteNome,
                profissionalNome: ag.profissionalNome,
                profissionalId: ag.profissionalId,
                hora: ag.hora,
                iniciado_em: iniciadoEm ?? null,
              })}
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Concluir
            </Button>
          )}
          {/* Alerta de atendimento em aberto há muito tempo (Master) */}
          {isMaster && ag.status === "em_atendimento" && (() => {
            const ini = iniciadoEm;
            if (!ini) return null;
            const mins = Math.floor((Date.now() - new Date(ini).getTime()) / 60000);
            if (mins < alertaMinutosEmAtendimento) return null;
            return (
              <span
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-destructive/10 text-destructive border border-destructive/30"
                title={`Em atendimento há ${mins} min sem finalização`}
              >
                🔴 {mins} min sem finalizar
              </span>
            );
          })()}
          {ag.status !== "cancelado" &&
            ag.status !== "concluido" &&
            !ehPendenteOnline &&
            (isMaster || isProfissional || user?.role === "recepcao" || canAgendaEdit) &&
            statusActions.filter(sa => {
              // Se for profissional, só mostra ação de "falta" para a própria agenda
              if (isProfissional) {
                return sa.key === "falta" && ag.profissionalId === user?.id;
              }
              return true;
            }).map((sa) => (
              <Button
                key={sa.key}
                size="sm"
                variant="outline"
                className={cn("h-8 px-2 text-xs", ag.status === sa.key && sa.color)}
                onClick={() => onStatusChange(ag.id, sa.key)}
                disabled={ag.status === sa.key}
                title={sa.label}
              >
                <sa.icon className="w-3.5 h-3.5" />
              </Button>
            ))}
          {!isProfissional && ag.status !== "cancelado" && ag.status !== "concluido" && !ehPendenteOnline && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2 text-xs border-destructive/50 text-destructive"
              title="Cancelar Agendamento"
              onClick={() => onCancelInit(ag)}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-xs text-destructive"
                  title="Excluir"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir agendamento?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tem certeza que deseja excluir o agendamento de {ag.pacienteNome} às {ag.hora}? Esta
                    ação será registrada no log de auditoria.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onDelete(ag.id)}
                    className="bg-destructive text-destructive-foreground"
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardContent>
    </Card>
    </React.Fragment>
  );
};

export const AgendaItemCard = React.memo(AgendaItemCardBase);
export default AgendaItemCard;
