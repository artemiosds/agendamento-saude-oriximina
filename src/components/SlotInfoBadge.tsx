import React, { useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { cn } from '@/lib/utils';

interface SlotInfoBadgeProps {
  profissionalId: string;
  unidadeId: string;
  date: string;
  hora?: string;
  compact?: boolean;
  className?: string;
}

export const SlotInfoBadge: React.FC<SlotInfoBadgeProps> = ({
  profissionalId, unidadeId, date, hora, compact, className,
}) => {
  const { agendamentos, disponibilidades } = useData();

  const info = useMemo(() => {
    const dateObj = new Date(`${date}T00:00:00`);
    const dayOfWeek = dateObj.getDay();
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

    let hourOccupied: number | undefined;
    let hourTotal: number | undefined;
    if (hora) {
      const hPrefix = hora.substring(0, 3);
      hourOccupied = active.filter(a => a.hora.startsWith(hPrefix)).length;
      hourTotal = disp.vagasPorHora;
    }

    return { dayOccupied, dayTotal, dayAvailable, hourOccupied, hourTotal };
  }, [profissionalId, unidadeId, date, hora, agendamentos, disponibilidades]);

  if (!info) return null;

  const isFull = info.dayAvailable === 0;
  const isNearFull = info.dayAvailable <= 2 && !isFull;

  if (compact) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full',
        isFull && 'bg-destructive/10 text-destructive',
        isNearFull && 'bg-warning/10 text-warning',
        !isFull && !isNearFull && 'bg-success/10 text-success',
        className,
      )}>
        {isFull ? '🔴 Lotado' : `${info.dayAvailable} vaga${info.dayAvailable !== 1 ? 's' : ''}`}
      </span>
    );
  }

  return (
    <div className={cn(
      'flex flex-wrap items-center gap-2 text-xs',
      className,
    )}>
      <span className={cn(
        'inline-flex items-center gap-1 font-medium px-2.5 py-1 rounded-full',
        isFull && 'bg-destructive/10 text-destructive',
        isNearFull && 'bg-warning/10 text-warning',
        !isFull && !isNearFull && 'bg-success/10 text-success',
      )}>
        {isFull
          ? '🔴 Dia lotado'
          : `📊 ${info.dayOccupied} de ${info.dayTotal} vagas ocupadas`
        }
      </span>
      {!isFull && (
        <span className="text-muted-foreground">
          ({info.dayAvailable} disponíve{info.dayAvailable !== 1 ? 'is' : 'l'})
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
};
