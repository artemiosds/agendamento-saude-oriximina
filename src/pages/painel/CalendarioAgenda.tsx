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
  // Dados brutos
  agendamentos: any[];
  bloqueios: any[];
  disponibilidades: any[];
  filterProf: string;
  filterUnit: string;
  profissionais: any[];
  // Funções de disponibilidade
  getAvailableSlots: (profId: string, unidadeId: string, date: string) => string[];
  getAvailableDates: (profId: string, unidadeId: string) => string[];
  // Unidade atual para contexto
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
    // Preenchendo dias do mês
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    // Adicionar dias anteriores para completar a semana (opcional)
    const startWeekday = firstDay.getDay(); // 0=domingo
    const prevDays: Date[] = [];
    for (let i = startWeekday; i > 0; i--) {
      prevDays.push(new Date(year, month, 1 - i));
    }
    // Adicionar dias seguintes para completar a semana (opcional)
    const endWeekday = lastDay.getDay();
    const nextDays: Date[] = [];
    for (let i = 1; i < 7 - endWeekday; i++) {
      nextDays.push(new Date(year, month + 1, i));
    }
    return [...prevDays, ...days, ...nextDays];
  }, [currentMonth]);

  const dayInfoMap = useMemo(() => {
    const map = new Map<string, DiaInfo>();

    // Pré-calcular profissionais disponíveis para o filtro
    const profissionaisFiltrados = filterProf !== "all"
      ? profissionais.filter(p => p.id === filterProf)
      : profissionais.filter(p => {
          if (filterUnit !== "all" && p.unidadeId !== filterUnit) return false;
          return true;
        });

    for (const day of daysInMonth) {
      const dateStr = day.toISOString().split("T")[0];
      const isToday = dateStr === new Date().toISOString().split("T")[0];
      const isSelected = dateStr === selectedDate;

      // 1. Verificar bloqueio global
      const isBlockedGlobal = bloqueios.some(b => {
        if (!b.diaInteiro) return false;
        const inicio = new Date(b.dataInicio);
        const fim = new Date(b.dataFim);
        const current = new Date(dateStr);
        return current >= inicio && current <= fim;
      });

      // 2. Verificar fim de semana
      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
      let hasWeekendAvailability = true;
      if (isWeekend) {
        // Verificar se há disponibilidade para esse dia (para algum profissional do filtro)
        hasWeekendAvailability = profissionaisFiltrados.some(prof => {
          const profUnidade = prof.unidadeId;
          const profDisponibilidades = disponibilidades.filter(d => d.profissional_id === prof.id);
          const temDisponibilidade = profDisponibilidades.some(d => {
            const inicio = new Date(d.dataInicio);
            const fim = new Date(d.dataFim);
            const dayInRange = day >= inicio && day <= fim;
            const diasSemana = d.diasSemana || [];
            return dayInRange && diasSemana.includes(day.getDay());
          });
          return temDisponibilidade;
        });
      }

      // Se bloqueado OU (fim de semana sem disponibilidade)
      const isBlocked = isBlockedGlobal || (isWeekend && !hasWeekendAvailability);

      // 3. Contar agendamentos confirmados para este dia (respeitando filtros)
      let agendamentosConfirmados = 0;
      let totalVagas = 0;

      if (filterProf !== "all") {
        // Visão de um profissional específico
        const prof = profissionaisFiltrados[0];
        if (prof) {
          // Contar agendamentos confirmados para esse profissional
          agendamentosConfirmados = agendamentos.filter(a => {
            if (a.data !== dateStr) return false;
            if (a.profissionalId !== prof.id) return false;
            return a.status !== "cancelado" && a.status !== "falta";
          }).length;

          // Total de vagas = número de slots disponíveis
          const slots = getAvailableSlots(prof.id, prof.unidadeId, dateStr);
          totalVagas = slots.length;
        }
      } else {
        // Visão consolidada: somar agendamentos de todos os profissionais visíveis
        const profissionaisVisiveis = profissionaisFiltrados;
        agendamentosConfirmados = agendamentos.filter(a => {
          if (a.data !== dateStr) return false;
          if (!profissionaisVisiveis.some(p => p.id === a.profissionalId)) return false;
          return a.status !== "cancelado" && a.status !== "falta";
        }).length;

        // Para visão consolidada, totalVagas é a soma das vagas de todos os profissionais
        for (const prof of profissionaisVisiveis) {
          const slots = getAvailableSlots(prof.id, prof.unidadeId, dateStr);
          totalVagas += slots.length;
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
        status = "empty";
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
    unidades,
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

  const getStatusClass = (status: DiaInfo["status"]) => {
    switch (status) {
      case "blocked":
        return "bg-red-500/10 text-red-600 dark:text-red-400";
      case "full":
        return "bg-gray-700/10 text-gray-700 dark:text-gray-400";
      case "almostFull":
        return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
      case "available":
        return "bg-green-500/10 text-green-600 dark:text-green-400";
      default:
        return "";
    }
  };

  const getDotClass = (status: DiaInfo["status"]) => {
    switch (status) {
      case "blocked":
        return "bg-red-500";
      case "full":
        return "bg-gray-600";
      case "almostFull":
        return "bg-yellow-500";
      case "available":
        return "bg-green-500";
      default:
        return "bg-muted-foreground/30";
    }
  };

  return (
    <div className="space-y-3">
      {/* Cabeçalho do mês */}
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

      {/* Grade de dias da semana */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {weekDays.map((day, i) => (
          <div key={i} className="py-1">{day}</div>
        ))}
      </div>

      {/* Grade de dias */}
      <div className="grid grid-cols-7 gap-1">
        {daysInMonth.map((day, idx) => {
          const dateStr = day.toISOString().split("T")[0];
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
                info.isSelected &&
                  "bg-primary text-primary-foreground shadow-sm",
                !info.isSelected && "hover:bg-muted/50"
              )}
            >
              <span className="text-sm font-medium">{info.dayNumber}</span>
              {info.agendamentosCount > 0 && (
                <span
                  className={cn(
                    "absolute top-1 right-1 text-[10px] font-semibold",
                    info.isSelected
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground"
                  )}
                >
                  {info.agendamentosCount}
                </span>
              )}
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full mt-1",
                  getDotClass(info.status)
                )}
              />
            </button>
          );
        })}
      </div>

      {/* Legenda */}
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
