import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Globe } from 'lucide-react';
import { cn, dateStrToUtcDate, todayLocalStr } from '@/lib/utils';

export type DayStatus = 'available' | 'selected' | 'blocked' | 'holiday' | 'full' | 'past' | 'unavailable' | 'today_blocked';

export interface DayInfo {
  dateStr: string;
  status: DayStatus;
  label?: string;
}

interface CalendarioDisponibilidadeProps {
  availableDates: string[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  dayInfoMap?: Record<string, DayInfo>;
  blockToday?: boolean;
}

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const CalendarioDisponibilidade: React.FC<CalendarioDisponibilidadeProps> = ({
  availableDates,
  selectedDate,
  onSelectDate,
  dayInfoMap,
  blockToday = true,
}) => {
  const [todayStr, setTodayStr] = useState(() => todayLocalStr());
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateClock = () => {
      setTodayStr(todayLocalStr());
      setCurrentTime(
        new Date().toLocaleTimeString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    };

    updateClock();
    const id = setInterval(updateClock, 30000);
    return () => clearInterval(id);
  }, []);

  const [viewMonth, setViewMonth] = useState(() => {
    const baseDate = selectedDate || availableDates[0] || todayStr;
    const date = dateStrToUtcDate(baseDate);
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
  });

  useEffect(() => {
    const baseDate = selectedDate || availableDates[0];
    if (!baseDate) return;
    const date = dateStrToUtcDate(baseDate);
    setViewMonth({ year: date.getUTCFullYear(), month: date.getUTCMonth() });
  }, [availableDates, selectedDate]);

  const availableSet = useMemo(() => new Set(availableDates), [availableDates]);

  const monthLabel = useMemo(() => {
    const date = new Date(Date.UTC(viewMonth.year, viewMonth.month, 1, 12, 0, 0));
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }, [viewMonth]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(Date.UTC(viewMonth.year, viewMonth.month, 1, 12, 0, 0));
    const startDow = firstDay.getUTCDay();
    const daysInMonth = new Date(Date.UTC(viewMonth.year, viewMonth.month + 1, 0, 12, 0, 0)).getUTCDate();

    const cells: Array<{ day: number; dateStr: string } | null> = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(Date.UTC(viewMonth.year, viewMonth.month, day, 12, 0, 0));
      const yyyy = dateObj.getUTCFullYear();
      const mm = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getUTCDate()).padStart(2, '0');
      cells.push({ day, dateStr: `${yyyy}-${mm}-${dd}` });
    }
    return cells;
  }, [viewMonth]);

  const prevMonth = () => {
    setViewMonth((prev) => {
      if (prev.month === 0) return { year: prev.year - 1, month: 11 };
      return { year: prev.year, month: prev.month - 1 };
    });
  };

  const nextMonth = () => {
    setViewMonth((prev) => {
      if (prev.month === 11) return { year: prev.year + 1, month: 0 };
      return { year: prev.year, month: prev.month + 1 };
    });
  };

  const canGoPrev = useMemo(() => {
    const [todayYear, todayMonth] = todayStr.split('-').map(Number);
    return viewMonth.year > todayYear || (viewMonth.year === todayYear && viewMonth.month + 1 > todayMonth);
  }, [todayStr, viewMonth]);

  const getDayState = (dateStr: string): { status: DayStatus; title: string } => {
    const isToday = dateStr === todayStr;
    const isPast = dateStr < todayStr;

    if (isPast) return { status: 'past', title: 'Data passada' };
    if (isToday && blockToday) return { status: 'today_blocked', title: 'Hoje — agendamento a partir de amanhã' };

    const info = dayInfoMap?.[dateStr];
    if (info) {
      if (info.status === 'holiday') return { status: 'holiday', title: info.label || 'Feriado' };
      if (info.status === 'blocked') return { status: 'blocked', title: info.label || 'Bloqueado' };
      if (info.status === 'full') return { status: 'full', title: info.label || 'Lotado — sem vagas' };
    }

    if (dateStr === selectedDate) return { status: 'selected', title: 'Data selecionada' };
    if (availableSet.has(dateStr)) return { status: 'available', title: 'Clique para selecionar' };
    return { status: 'unavailable', title: 'Sem disponibilidade' };
  };

  return (
    <div className="rounded-xl border bg-card shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <button
          onClick={prevMonth}
          disabled={!canGoPrev}
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
            canGoPrev ? 'hover:bg-primary/10 text-foreground' : 'text-muted-foreground/30 cursor-not-allowed'
          )}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h3 className="text-sm font-semibold font-display text-foreground capitalize">{monthLabel}</h3>
        <button
          onClick={nextMonth}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-primary/10 text-foreground transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 px-2 pt-2">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="text-center text-xs font-medium text-muted-foreground py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 px-2 pb-2 gap-y-1">
        {calendarDays.map((cell, index) => {
          if (!cell) return <div key={`blank-${index}`} />;

          const { day, dateStr } = cell;
          const { status, title } = getDayState(dateStr);
          const isSelected = dateStr === selectedDate;
          const canClick = status === 'available';

          return (
            <div key={dateStr} className="flex items-center justify-center py-0.5">
              <button
                disabled={!canClick}
                onClick={() => canClick && onSelectDate(dateStr)}
                className={cn(
                  'w-9 h-9 rounded-full text-sm font-medium transition-all duration-150 relative',
                  isSelected && 'bg-primary text-primary-foreground shadow-md ring-2 ring-primary/30',
                  status === 'available' && !isSelected && 'bg-primary/15 text-primary hover:bg-primary/25 hover:shadow-sm cursor-pointer',
                  status === 'today_blocked' && 'ring-1 ring-muted-foreground/30 text-muted-foreground bg-muted/50',
                  status === 'past' && 'text-muted-foreground/30 bg-muted/20',
                  status === 'holiday' && 'text-destructive/60 bg-destructive/5 line-through',
                  status === 'blocked' && 'text-muted-foreground/60 bg-muted/40',
                  status === 'full' && 'text-primary bg-primary/10',
                  status === 'unavailable' && 'text-muted-foreground/40',
                  !canClick && !isSelected && 'cursor-default'
                )}
                title={title}
              >
                {day}
                {status === 'full' && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                )}
                {status === 'holiday' && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-destructive/60" />
                )}
              </button>
            </div>
          );
        })}
      </div>

      <div className="border-t px-4 py-2 flex flex-wrap gap-x-4 gap-y-1 bg-muted/10">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="w-2.5 h-2.5 rounded-full bg-primary/15 border border-primary/30" /> Disponível
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="w-2.5 h-2.5 rounded-full bg-primary" /> Selecionado
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="w-2.5 h-2.5 rounded-full bg-muted/40 border border-muted-foreground/20" /> Bloqueado
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="w-2.5 h-2.5 rounded-full bg-destructive/10 border border-destructive/30" /> Feriado
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="w-2.5 h-2.5 rounded-full bg-primary/10 border border-primary/30" /> Lotado
        </span>
      </div>

      <div className="border-t px-4 py-2.5 flex items-center gap-2 bg-muted/20">
        <Globe className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Horário de Brasília — {currentTime}</span>
      </div>
    </div>
  );
};
