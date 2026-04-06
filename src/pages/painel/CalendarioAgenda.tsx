import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiaInfo {
  date: string;            // YYYY-MM-DD
  dayNumber: number;
  isToday: boolean;
  isSelected: boolean;
  status: "blocked" | "full" | "almostFull" | "available" | "empty";
  agendamentosCount: number;
  totalVagas: number;
}

interface CalendarioAgendaProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  agendamentos: any[];
  bloqueios: any[];
  disponibilidades: any[];
  filterProf: string;
  filterUnit: string;
  profissionais: any[];
  getAvailableSlots: (profId: string, unidadeId: string, date: string) => string[];
  getAvailableDates: (profId: string, unidadeId: string) => string[];
  unidades: any[];
}

export const CalendarioAgenda: React.FC<CalendarioAgendaProps> = ({
  selectedDate,
  onDateChange,
  agendamentos,
  bloqueios,
  disponibilidades,
  filterProf,
  filterUnit,
  profissionais,
  getAvailableSlots,
  getAvailableDates,
  unidades,
}) => {
  const [currentMonth, setCurrentMonth] = useState(() => new Date(selectedDate));

  const daysInMonth = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: Date[] = [];
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    const startWeekday = firstDay.getDay();
    const prevDays: Date[] = [];
    for (let i = startWeekday; i > 0; i--) {
      prevDays.push(new Date(year, month, 1 - i));
    }
    const endWeekday = lastDay.getDay();
    const nextDays: Date[] = [];
    for (let i = 1; i < 7 - endWeekday; i++) {
      nextDays.push(new Date(year, month + 1, i));
    }
    return [...prevDays, ...days, ...nextDays];
  }, [currentMonth]);

  const dayInfoMap = useMemo(() => {
    const map = new Map<string, DiaInfo>();
    const todayStr = new Date().toISOString().split("T")[0];

    const profissionaisFiltrados = filterProf !== "all"
      ? profissionais.filter(p => p.id === filterProf)
      : profissionais.filter(p => {
          if (filterUnit !== "all" && p.unidadeId !== filterUnit) return false;
          return true;
        });

    for (const day of daysInMonth) {
      const year = day.getFullYear();
      const month = String(day.getMonth() + 1).padStart(2, "0");
      const dayNum = String(day.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${dayNum}`;

      const isToday = dateStr === todayStr;
      const isSelected = dateStr === selectedDate;

      // 1. Check global block
      const isBlockedGlobal = bloqueios.some(b => {
        if (!b.diaInteiro) return false;
        return dateStr >= b.dataInicio && dateStr <= b.dataFim;
      });

      // 2. Check weekend availability using camelCase field names
      const dayOfWeek = day.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      let hasWeekendAvailability = true;
      if (isWeekend) {
        hasWeekendAvailability = profissionaisFiltrados.some(prof => {
          return disponibilidades.some(d => {
            const matchProf = d.profissionalId === prof.id;
            const inRange = dateStr >= d.dataInicio && dateStr <= d.dataFim;
            const matchDay = (d.diasSemana || []).includes(dayOfWeek);
            return matchProf && inRange && matchDay;
          });
        });
      }

      const isBlocked = isBlockedGlobal || (isWeekend && !hasWeekendAvailability);

      // 3. Count appointments and total slots
      let agendamentosConfirmados = 0;
      let totalVagas = 0;

      if (filterProf !== "all") {
        const prof = profissionaisFiltrados[0];
        if (prof) {
          agendamentosConfirmados = agendamentos.filter(a => {
            if (a.data !== dateStr) return false;
            if (a.profissionalId !== prof.id) return false;
            return a.status !== "cancelado" && a.status !== "falta";
          }).length;

          const profUnit = filterUnit !== "all" ? filterUnit : prof.unidadeId;
          if (profUnit) {
            const slots = getAvailableSlots(prof.id, profUnit, dateStr);
            totalVagas = slots.length + agendamentosConfirmados;
          }
        }
      } else {
        for (const prof of profissionaisFiltrados) {
          const profAgendamentos = agendamentos.filter(a => {
            if (a.data !== dateStr) return false;
            if (a.profissionalId !== prof.id) return false;
            return a.status !== "cancelado" && a.status !== "falta";
          }).length;
          agendamentosConfirmados += profAgendamentos;

          const profUnit = prof.unidadeId;
          if (profUnit) {
            const slots = getAvailableSlots(prof.id, profUnit, dateStr);
            totalVagas += slots.length + profAgendamentos;
          }
        }
      }

      let status: DiaInfo["status"] = "empty";
      if (isBlocked) {
        status = "blocked";
      } else if (totalVagas > 0) {
        const percent = (agendamentosConfirmados / totalVagas) * 100;
        if (agendamentosConfirmados >= totalVagas) {
          status = "full";
        } else if (percent >= 70) {
          status = "almostFull";
        } else {
          status = "available";
        }
      } else {
        // Check if any disponibilidade covers this day (even if all slots are past/taken)
        const hasDisp = profissionaisFiltrados.some(prof => {
          return disponibilidades.some(d => {
            return d.profissionalId === prof.id &&
              dateStr >= d.dataInicio && dateStr <= d.dataFim &&
              (d.diasSemana || []).includes(dayOfWeek);
          });
        });
        status = hasDisp ? "full" : "empty";
      }

      map.set(dateStr, {
        date: dateStr,
        dayNumber: day.getDate(),
        isToday,
        isSelected,
        status,
        agendamentosCount: agendamentosConfirmados,
        totalVagas,
      });
    }

    return map;
  }, [
    daysInMonth,
    selectedDate,
    agendamentos,
    bloqueios,
    disponibilidades,
    filterProf,
    filterUnit,
    profissionais,
    getAvailableSlots,
  ]);

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const weekDays = ["D", "S", "T", "Q", "Q", "S", "S"];

  const goToPrevMonth = () => {
    const newDate = new Date(currentMonth);
    newDate.setMonth(newDate.getMonth() - 1);
    setCurrentMonth(newDate);
  };

  const goToNextMonth = () => {
    const newDate = new Date(currentMonth);
    newDate.setMonth(newDate.getMonth() + 1);
    setCurrentMonth(newDate);
  };

  const getDotClass = (status: DiaInfo["status"]) => {
    switch (status) {
      case "blocked": return "bg-red-500";
      case "full": return "bg-gray-600";
      case "almostFull": return "bg-yellow-500";
      case "available": return "bg-green-500";
      default: return "bg-muted-foreground/30";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={goToPrevMonth}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <h3 className="text-base font-medium">
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </h3>
        <Button variant="outline" size="icon" onClick={goToNextMonth}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {weekDays.map((day, i) => (
          <div key={i} className="py-1">{day}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {daysInMonth.map((day, idx) => {
          const year = day.getFullYear();
          const month = String(day.getMonth() + 1).padStart(2, "0");
          const dayNum = String(day.getDate()).padStart(2, "0");
          const dateStr = `${year}-${month}-${dayNum}`;
          const info = dayInfoMap.get(dateStr);
          if (!info) return null;

          const isCurrentMonth =
            day.getMonth() === currentMonth.getMonth() &&
            day.getFullYear() === currentMonth.getFullYear();

          return (
            <button
              key={idx}
              onClick={() => onDateChange(info.date)}
              className={cn(
                "relative flex flex-col items-center justify-center py-2 rounded-md transition-colors",
                !isCurrentMonth && "opacity-40",
                info.isSelected && "bg-primary text-primary-foreground shadow-sm",
                !info.isSelected && "hover:bg-muted/50"
              )}
            >
              <span className="text-sm font-medium">{info.dayNumber}</span>
              {info.agendamentosCount > 0 && (
                <span
                  className={cn(
                    "absolute top-1 right-1 text-[10px] font-semibold",
                    info.isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                  )}
                >
                  {info.agendamentosCount}
                </span>
              )}
              <div className={cn("w-1.5 h-1.5 rounded-full mt-1", getDotClass(info.status))} />
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-4 justify-center text-xs text-muted-foreground pt-2 border-t">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span>Com vagas</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-yellow-500" />
          <span>Quase cheio</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-gray-600" />
          <span>Lotado</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span>Bloqueado</span>
        </div>
      </div>
    </div>
  );
};
