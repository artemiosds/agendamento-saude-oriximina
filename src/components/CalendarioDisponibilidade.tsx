import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CalendarioDisponibilidadeProps {
  availableDates: string[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const CalendarioDisponibilidade: React.FC<CalendarioDisponibilidadeProps> = ({
  availableDates,
  selectedDate,
  onSelectDate,
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
    // Start on the month of the first available date, or current month
    if (availableDates.length > 0) {
      const d = new Date(availableDates[0] + 'T12:00:00');
      return { year: d.getFullYear(), month: d.getMonth() };
    }
    return { year: today.getFullYear(), month: today.getMonth() };
  });

  // Update viewMonth when availableDates change and no date selected
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

    const cells: Array<{ day: number; dateStr: string; isCurrentMonth: boolean } | null> = [];

    // Leading blanks
    for (let i = 0; i < startDow; i++) cells.push(null);

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(viewMonth.year, viewMonth.month, d);
      const yyyy = dateObj.getFullYear();
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      cells.push({ day: d, dateStr: `${yyyy}-${mm}-${dd}`, isCurrentMonth: true });
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
          const dateObj = new Date(dateStr + 'T12:00:00');
          const isPast = dateObj <= today;
          const isAvailable = availableSet.has(dateStr);
          const isSelected = dateStr === selectedDate;
          const isToday = dateObj.getTime() === today.getTime();

          const canClick = !isPast && isAvailable;

          return (
            <div key={dateStr} className="flex items-center justify-center py-0.5">
              <button
                disabled={!canClick}
                onClick={() => canClick && onSelectDate(dateStr)}
                className={cn(
                  "w-9 h-9 rounded-full text-sm font-medium transition-all duration-150 relative",
                  // Selected
                  isSelected && "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/30",
                  // Available but not selected
                  !isSelected && canClick && "bg-primary/15 text-primary hover:bg-primary/25 hover:shadow-sm cursor-pointer",
                  // Today (blocked for online)
                  !isSelected && isToday && "ring-1 ring-muted-foreground/30 text-muted-foreground bg-muted/50",
                  // Past days
                  !isSelected && isPast && !isToday && "text-muted-foreground/30",
                  // Future but no availability
                  !isSelected && !isPast && !isAvailable && "text-muted-foreground/50",
                  // Disabled cursor
                  !canClick && !isSelected && "cursor-default",
                )}
                title={
                  isToday ? 'Hoje — agendamento a partir de amanhã' :
                  isPast ? 'Data passada' :
                  isAvailable ? 'Clique para selecionar' :
                  'Sem vagas disponíveis'
                }
              >
                {day}
              </button>
            </div>
          );
        })}
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
