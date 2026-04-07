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
  const { agendamentos, disponibilidades, getAvailableSlots } = useData();

  const info = useMemo(() => {
    const dayOfWeek = isoDayOfWeek(date);
    const disp = disponibilidades.find(
      d => d.profissionalId === profissionalId &&
        d.unidadeId === unidadeId &&
        d.diasSemana.includes(dayOfWeek) &&
        date >= d.dataInicio && date <= d.dataFim,
    );
    if (!disp) return null;

    const active = agendamentos.filter(
      a => a.profissionalId === profissionalId &&
        a.unidadeId === unidadeId &&
        a.data === date &&
        !['cancelado', 'falta'].includes(a.status),
    );

    const dayOccupied = active.length;
    const dayTotal = disp.vagasPorDia;
    const dayAvailable = Math.max(0, dayTotal - dayOccupied);
    const availableSlotOptions = getAvailableSlots(profissionalId, unidadeId, date).length;

    let hourOccupied: number | undefined;
    let hourTotal: number | undefined;
    if (hora) {
      const hPrefix = hora.substring(0, 3);
      hourOccupied = active.filter(a => a.hora.startsWith(hPrefix)).length;
      hourTotal = disp.vagasPorHora;
    }

    return { dayOccupied, dayTotal, dayAvailable, hourOccupied, hourTotal, availableSlotOptions };
  }, [profissionalId, unidadeId, date, hora, agendamentos, disponibilidades, getAvailableSlots]);

  if (!info) return null;

  const isToday = date === todayLocalStr();
  const isFull = info.dayAvailable === 0;
  const isNearFull = info.dayAvailable <= 2 && !isFull;
  const hasAvailableSlotOptions = info.availableSlotOptions > 0;
  const hasNoRemainingSlotOptions = !isFull && !hasAvailableSlotOptions;

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
