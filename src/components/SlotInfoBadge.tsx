import React, { useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
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
  const { agendamentos, disponibilidades, getAvailableSlots, getTurnoInfo } = useData();

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
    const STATUS_INATIVOS = ['cancelado', 'falta', 'excluido', 'removido', 'inativo'];
    const active = agendamentos.filter(
      a => a.profissionalId === profissionalId &&
        a.unidadeId === unidadeId &&
        a.data === date &&
        !STATUS_INATIVOS.includes(a.status),
    );

    const dayOccupied = active.length;
    const dayTotal = allDisps.reduce((sum, d) => sum + d.vagasPorDia, 0);
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
    return (
      <div ref={ref as React.Ref<HTMLDivElement>} className={cn('space-y-1.5', className)}>
        <span className="text-xs font-medium text-muted-foreground">
          📊 {totalOcupadas} de {totalVagas} vagas ocupadas no dia
        </span>
        <div className="flex flex-col gap-1">
          {turnoData.map((t) => {
            const pct = t.vagasTotal > 0 ? (t.vagasOcupadas / t.vagasTotal) * 100 : 0;
            return (
              <div
                key={t.turnoId}
                className={cn(
                  'flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg border',
                  t.lotado
                    ? 'bg-destructive/5 border-destructive/20 text-destructive'
                    : pct > 60
                      ? 'bg-warning/5 border-warning/20 text-warning'
                      : 'bg-success/5 border-success/20 text-success',
                )}
              >
                <span>{t.nome === 'Manhã' ? '🌅' : t.nome === 'Tarde' ? '🌆' : '🌙'}</span>
                <span className="font-medium">{t.nome}</span>
                <span className="text-muted-foreground">{t.horaInicio}–{t.horaFim}</span>
                <span className="ml-auto font-semibold">
                  {t.vagasLivres} de {t.vagasTotal} livres
                </span>
                {t.lotado && (
                  <span className="text-[10px] font-bold bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">
                    Lotado
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (info.isTurnoMode && turnoData.length > 0 && compact) {
    const totalLivres = turnoData.reduce((s, t) => s + t.vagasLivres, 0);
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
        {isFull
          ? '🔴 Dia lotado'
          : hasNoRemainingSlotOptions
            ? (isToday ? '⏰ Sem horários restantes hoje' : '⏰ Sem horários livres nesta data')
            : `📊 ${info.dayOccupied} de ${info.dayTotal} vagas ocupadas`
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
