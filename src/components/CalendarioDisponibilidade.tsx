import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DayStatus = 'available' | 'selected' | 'blocked' | 'holiday' | 'full' | 'past' | 'unavailable' | 'today_blocked';

export interface DayInfo {
  dateStr: string;
  status: DayStatus;
  label?: string; // e.g. "Feriado: Natal"
}

interface CalendarioDisponibilidadeProps {
  availableDates: string[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  /** Optional map of date -> extra info for richer visual states */
  dayInfoMap?: Record<string, DayInfo>;
  /** Whether today is blocked (online booking mode) */
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
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [viewMonth, setViewMonth] = useState(() => {
    if (selectedDate) {
      const d = new Date(selectedDate + 'T12:00:00');
      return { year: d.getFullYear(), month: d.getMonth() };
    }
    if (availableDates.length > 0) {
      const d = new Date(availableDates[0] + 'T12:00:00');
      return { year: d.getFullYear(), month: d.getMonth() };
    }
    return { year: today.getFullYear(), month: today.getMonth() };
  });

  useEffect(() => {
    if (!selectedDate && availableDates.length > 0) {
      const d = new Date(availableDates[0] + 'T12:00:00');
      setViewMonth({ year: d.getFullYear(), month: d.getMonth() });
    }
  }, [availableDates, selectedDate]);

  const availableSet = useMemo(() => new Set(availableDates), [availableDates]);

  const [currentTime, setCurrentTime] = useState('');
  useEffect(() => {
    const update = () => {
      setCurrentTime(
        new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
      );
    };
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, []);

  const monthLabel = useMemo(() => {
    const d = new Date(viewMonth.year, viewMonth.month, 1);
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }, [viewMonth]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewMonth.year, viewMonth.month, 1);
    const startDow = firstDay.getDay();
    const daysInMonth = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate();

    const cells: Array<{ day: number; dateStr: string } | null> = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(viewMonth.year, viewMonth.month, d);
      const yyyy = dateObj.getFullYear();
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      cells.push({ day: d, dateStr: `${yyyy}-${mm}-${dd}` });
    }
    return cells;
  }, [viewMonth]);

  const prevMonth = () => {
    setViewMonth(prev => {
      if (prev.month === 0) return { year: prev.year - 1, month: 11 };
      return { year: prev.year, month: prev.month - 1 };
    });
  };

  const nextMonth = () => {
    setViewMonth(prev => {
      if (prev.month === 11) return { year: prev.year + 1, month: 0 };
      return { year: prev.year, month: prev.month + 1 };
    });
  };

  const canGoPrev = useMemo(() => {
    const prevDate = new Date(viewMonth.year, viewMonth.month - 1, 1);
    return prevDate >= new Date(today.getFullYear(), today.getMonth(), 1);
  }, [viewMonth, today]);

  const getDayState = (dateStr: string): { status: DayStatus; title: string } => {
    const dateObj = new Date(dateStr + 'T12:00:00');
    const isToday = dateObj.getTime() === today.getTime();
    const isPast = dateObj < today;

    // Past days
    if (isPast) return { status: 'past', title: 'Data passada' };

    // Today blocked for online
    if (isToday && blockToday) return { status: 'today_blocked', title: 'Hoje — agendamento a partir de amanhã' };

    // Check dayInfoMap for richer status
    const info = dayInfoMap?.[dateStr];
    if (info) {
      if (info.status === 'holiday') return { status: 'holiday', title: info.label || 'Feriado' };
      if (info.status === 'blocked') return { status: 'blocked', title: info.label || 'Bloqueado' };
      if (info.status === 'full') return { status: 'full', title: info.label || 'Lotado — sem vagas' };
    }

    // Is it selected?
    if (dateStr === selectedDate) return { status: 'selected', title: 'Data selecionada' };

    // Available?
    if (availableSet.has(dateStr)) return { status: 'available', title: 'Clique para selecionar' };

    // Default: unavailable (no availability configured)
    return { status: 'unavailable', title: 'Sem disponibilidade' };
  };

  return (
    <div className="rounded-xl border bg-card shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <button
          onClick={prevMonth}
          disabled={!canGoPrev}
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
            canGoPrev ? "hover:bg-primary/10 text-foreground" : "text-muted-foreground/30 cursor-not-allowed"
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

      {/* Weekday headers */}
      <div className="grid grid-cols-7 px-2 pt-2">
        {WEEKDAY_LABELS.map(label => (
          <div key={label} className="text-center text-xs font-medium text-muted-foreground py-1">
            {label}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 px-2 pb-2 gap-y-1">
        {calendarDays.map((cell, i) => {
          if (!cell) return <div key={`blank-${i}`} />;

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
                  "w-9 h-9 rounded-full text-sm font-medium transition-all duration-150 relative",
                  // Selected
                  isSelected && "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/30",
                  // Available
                  status === 'available' && !isSelected && "bg-primary/15 text-primary hover:bg-primary/25 hover:shadow-sm cursor-pointer",
                  // Today blocked
                  status === 'today_blocked' && "ring-1 ring-muted-foreground/30 text-muted-foreground bg-muted/50",
                  // Past
                  status === 'past' && "text-muted-foreground/30",
                  // Holiday — red strikethrough
                  status === 'holiday' && "text-destructive/60 bg-destructive/5 line-through",
                  // Blocked manually
                  status === 'blocked' && "text-muted-foreground/50 bg-muted/40",
                  // Full / lotado
                  status === 'full' && "text-warning/70 bg-warning/10",
                  // Unavailable (no availability configured)
                  status === 'unavailable' && "text-muted-foreground/40",
                  // Disabled cursor for non-clickable
                  !canClick && !isSelected && "cursor-default",
                )}
                title={title}
              >
                {day}
                {/* Small dot indicator for full days */}
                {status === 'full' && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-warning/70" />
                )}
                {/* Small dot for holidays */}
                {status === 'holiday' && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-destructive/60" />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Legend */}
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
          <span className="w-2.5 h-2.5 rounded-full bg-warning/10 border border-warning/30" /> Lotado
        </span>
      </div>

      {/* Footer timezone */}
      <div className="border-t px-4 py-2.5 flex items-center gap-2 bg-muted/20">
        <Globe className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          Horário de Brasília — {currentTime}
        </span>
      </div>
    </div>
  );
};
