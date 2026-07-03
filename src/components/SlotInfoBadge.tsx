import React, { useMemo } from 'react';
import { useOperacional } from '@/contexts/OperacionalContext';
import { cn, isoDayOfWeek, todayLocalStr } from '@/lib/utils';

interface SlotInfoBadgeProps {
  profissionalId: string;
  unidadeId: string;
  date: string;
  hora?: string;
  compact?: boolean;
  className?: string;
}

export const SlotInfoBadge = React.forwardRef<HTMLElement, SlotInfoBadgeProps>(({
  profissionalId, unidadeId, date, hora, compact, className,
}, ref) => {
  const { agendamentos, disponibilidades, getAvailableSlots, getTurnoInfo } = useOperacional();

  const turnoData = useMemo(() => {
    return getTurnoInfo(profissionalId, unidadeId, date);
  }, [getTurnoInfo, profissionalId, unidadeId, date]);

  const info = useMemo(() => {
    const dayOfWeek = isoDayOfWeek(date);
    const allDisps = disponibilidades.filter(
      d => d.profissionalId === profissionalId &&
        d.unidadeId === unidadeId &&
        d.diasSemana.includes(dayOfWeek) &&
        date >= d.dataInicio && date <= d.dataFim,
    );
    if (allDisps.length === 0) return null;

    const isTurnoMode = allDisps.some(d => d.vagasPorHora === 0);

    // Status que NÃO ocupam vaga (mantém em sincronia com DataContext.statusOcupaVaga)
    const STATUS_NAO_OCUPA_VAGA = new Set([
      "cancelado",
      "falta",
      "excluido",
      "removido",
      "inativo",
    ]);

    const active = agendamentos.filter(
      a => a.profissionalId === profissionalId &&
        a.unidadeId === unidadeId &&
        a.data === date &&
        !STATUS_NAO_OCUPA_VAGA.has(a.status),
    );

    // Contagem real de pacientes ativos no dia para este profissional/unidade
    const dayOccupied = active.length;
    const dayTotal = turnoData.reduce((sum, t) => sum + t.vagasTotal, 0);
    const dayAvailable = Math.max(0, dayTotal - dayOccupied);
    const dayExcedido = dayOccupied > dayTotal;
    const availableSlotOptions = getAvailableSlots(profissionalId, unidadeId, date).length;

    let hourOccupied: number | undefined;
    let hourTotal: number | undefined;
    if (hora && !isTurnoMode) {
      const disp = allDisps[0];
      const hPrefix = hora.substring(0, 3);
      hourOccupied = active.filter(a => a.hora.startsWith(hPrefix)).length;
      hourTotal = disp.vagasPorHora;
    }

    return { dayOccupied, dayTotal, dayAvailable, dayExcedido, hourOccupied, hourTotal, availableSlotOptions, isTurnoMode };
  }, [profissionalId, unidadeId, date, hora, agendamentos, disponibilidades, getAvailableSlots]);

  if (!info) return null;

  const isToday = date === todayLocalStr();
  const isFull = info.dayAvailable === 0;
  const isNearFull = info.dayAvailable <= 2 && !isFull;
  const hasAvailableSlotOptions = info.availableSlotOptions > 0;
  const hasNoRemainingSlotOptions = !isFull && !hasAvailableSlotOptions;

  // Turno mode: show per-turno breakdown
  if (info.isTurnoMode && turnoData.length > 0 && !compact) {
    const totalOcupadas = turnoData.reduce((s, t) => s + t.vagasOcupadas, 0);
    const totalVagas = turnoData.reduce((s, t) => s + t.vagasTotal, 0);
    const totalExcedido = totalOcupadas > totalVagas;
    return (
      <div ref={ref as React.Ref<HTMLDivElement>} className={cn('space-y-1.5', className)}>
        <span className={cn(
          "text-xs font-medium",
          totalExcedido ? "text-destructive font-semibold" : "text-muted-foreground",
        )}>
          📊 {totalOcupadas} pacientes agendados no dia
          {totalExcedido && ' • LIMITE EXCEDIDO'}
        </span>
        <div className="flex flex-col gap-1.5">
          {turnoData.map((t) => {
            const pct = t.vagasTotal > 0 ? (t.vagasOcupadas / t.vagasTotal) * 100 : 0;
            const titulo = t.descricao || t.nome;
            const periodo = t.periodo || t.nome;
            const emoji = periodo === 'Manhã' ? '🌅' : periodo === 'Tarde' ? '🌆' : '🌙';
            const disponiveis = Math.max(0, t.vagasTotal - t.vagasOcupadas);
            const excedente = Math.max(0, t.vagasOcupadas - t.vagasTotal);
            let situacao = 'Disponível';
            let situacaoClass = 'bg-success/10 text-success';
            let mensagem = '';
            if (t.excedido) {
              situacao = 'Excedido';
              situacaoClass = 'bg-destructive/10 text-destructive';
              mensagem = `Há ${excedente} agendamento${excedente !== 1 ? 's' : ''} acima da capacidade prevista.`;
            } else if (t.lotado) {
              situacao = 'Lotado';
              situacaoClass = 'bg-destructive/10 text-destructive';
              mensagem = 'Sem vagas restantes neste bloco.';
            } else if (pct >= 80) {
              situacao = 'Quase cheio';
              situacaoClass = 'bg-warning/10 text-warning';
              mensagem = `Restam ${disponiveis} vaga${disponiveis !== 1 ? 's' : ''} neste bloco.`;
            } else {
              mensagem = `Restam ${disponiveis} vaga${disponiveis !== 1 ? 's' : ''} neste bloco.`;
            }
            return (
              <div
                key={t.turnoId}
                className={cn(
                  'flex flex-col gap-1 text-xs px-2.5 py-2 rounded-lg border',
                  t.excedido || t.lotado
                    ? 'bg-destructive/5 border-destructive/20'
                    : pct >= 80
                      ? 'bg-warning/5 border-warning/20'
                      : 'bg-success/5 border-success/20',
                )}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span>{emoji}</span>
                  <span className="font-semibold text-foreground">{titulo}</span>
                  {t.descricao && (
                    <span className="text-muted-foreground">
                      {periodo} • {t.horaInicio} às {t.horaFim}
                    </span>
                  )}
                  {!t.descricao && (
                    <span className="text-muted-foreground">{t.horaInicio} às {t.horaFim}</span>
                  )}
                  <span className={cn('ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full', situacaoClass)}>
                    {situacao}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground">
                  <span>Capacidade: <strong className="text-foreground">{t.vagasTotal} vagas</strong></span>
                  <span>Agendados neste bloco: <strong className="text-foreground">{t.vagasOcupadas} paciente{t.vagasOcupadas !== 1 ? 's' : ''}</strong></span>
                  <span>Disponíveis: <strong className="text-foreground">{disponiveis} vaga{disponiveis !== 1 ? 's' : ''}</strong></span>
                </div>
                {mensagem && (
                  <p className="text-[11px] text-muted-foreground italic">{mensagem}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (info.isTurnoMode && turnoData.length > 0 && compact) {
    const totalLivres = turnoData.reduce((s, t) => s + t.vagasLivresInternas, 0);
    const allFull = turnoData.every(t => t.lotado);
    return (
      <span
        ref={ref as React.Ref<HTMLSpanElement>}
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full',
          allFull && 'bg-destructive/10 text-destructive',
          !allFull && totalLivres <= 2 && 'bg-warning/10 text-warning',
          !allFull && totalLivres > 2 && 'bg-success/10 text-success',
          className,
        )}
      >
        {allFull ? '🔴 Lotado' : `${totalLivres} vaga${totalLivres !== 1 ? 's' : ''}`}
      </span>
    );
  }

  if (compact) {
    return (
      <span
        ref={ref as React.Ref<HTMLSpanElement>}
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full',
          (isFull || hasNoRemainingSlotOptions) && 'bg-destructive/10 text-destructive',
          isNearFull && hasAvailableSlotOptions && 'bg-warning/10 text-warning',
          !isFull && !isNearFull && hasAvailableSlotOptions && 'bg-success/10 text-success',
          className,
        )}
      >
        {isFull
          ? '🔴 Lotado'
          : hasNoRemainingSlotOptions
            ? (isToday ? '⏰ Sem horários hoje' : '⏰ Sem horários livres')
            : `${info.dayAvailable} vaga${info.dayAvailable !== 1 ? 's' : ''}`}
      </span>
    );
  }

  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      className={cn(
        'flex flex-wrap items-center gap-2 text-xs',
        className,
      )}
    >
      <span className={cn(
        'inline-flex items-center gap-1 font-medium px-2.5 py-1 rounded-full',
        (isFull || hasNoRemainingSlotOptions) && 'bg-destructive/10 text-destructive',
        isNearFull && hasAvailableSlotOptions && 'bg-warning/10 text-warning',
        !isFull && !isNearFull && hasAvailableSlotOptions && 'bg-success/10 text-success',
      )}>
        {info.dayExcedido
          ? `⚠️ ${info.dayOccupied} de ${info.dayTotal} vagas ocupadas (LIMITE EXCEDIDO)`
          : isFull
            ? `🔴 Dia lotado (${info.dayOccupied} de ${info.dayTotal})`
            : hasNoRemainingSlotOptions
              ? (isToday ? '⏰ Sem horários restantes hoje' : '⏰ Sem horários livres nesta data')
              : `📊 ${info.dayOccupied} pacientes agendados no dia`
        }
      </span>
      {!isFull && (
        <span className="text-muted-foreground">
          {hasNoRemainingSlotOptions
            ? `(${info.dayAvailable} vaga${info.dayAvailable !== 1 ? 's' : ''} no dia, mas sem horário livre restante)`
            : `(${info.dayAvailable} disponíve${info.dayAvailable !== 1 ? 'is' : 'l'} • ${info.availableSlotOptions} horário${info.availableSlotOptions !== 1 ? 's' : ''} livre${info.availableSlotOptions !== 1 ? 's' : ''})`}
        </span>
      )}
      {info.hourOccupied !== undefined && info.hourTotal !== undefined && (
        <span className={cn(
          'inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded-full',
          info.hourOccupied >= info.hourTotal
            ? 'bg-destructive/10 text-destructive'
            : 'bg-muted text-muted-foreground',
        )}>
          ⏰ {info.hourOccupied}/{info.hourTotal} neste horário
        </span>
      )}
    </div>
  );
});

SlotInfoBadge.displayName = 'SlotInfoBadge';
