import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, dateStrToUtcDate, isoDayOfWeek, localDateStr, todayLocalStr } from "@/lib/utils";

interface DiaInfo {
  date: string;
  dayNumber: number;
  isToday: boolean;
  isSelected: boolean;
  status: "blocked" | "past" | "full" | "almostFull" | "available" | "empty";
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
}) => {
  const [currentMonth, setCurrentMonth] = useState(() => dateStrToUtcDate(selectedDate));

  useEffect(() => {
    setCurrentMonth(dateStrToUtcDate(selectedDate));
  }, [selectedDate]);

  const daysInMonth = useMemo(() => {
    const year = currentMonth.getUTCFullYear();
    const month = currentMonth.getUTCMonth();
    const firstDay = new Date(Date.UTC(year, month, 1, 12, 0, 0));
    const lastDay = new Date(Date.UTC(year, month + 1, 0, 12, 0, 0));

    const days: Date[] = [];
    for (let day = 1; day <= lastDay.getUTCDate(); day++) {
      days.push(new Date(Date.UTC(year, month, day, 12, 0, 0)));
    }

    const startWeekday = firstDay.getUTCDay();
    const prevDays: Date[] = [];
    for (let i = startWeekday; i > 0; i--) {
      prevDays.push(new Date(Date.UTC(year, month, 1 - i, 12, 0, 0)));
    }

    const endWeekday = lastDay.getUTCDay();
    const nextDays: Date[] = [];
    for (let i = 1; i < 7 - endWeekday; i++) {
      nextDays.push(new Date(Date.UTC(year, month + 1, i, 12, 0, 0)));
    }

    return [...prevDays, ...days, ...nextDays];
  }, [currentMonth]);

  // Pre-index agendamentos by date for O(1) lookup instead of filtering per day.
  // CRITICAL: chave inclui unidadeId para alinhar com SlotInfoBadge / getTurnoInfo,
  // evitando divergência (ex.: calendário mostrar 17, mas resumo do dia 11 da unidade).
  // Lista de status alinhada com STATUS_NAO_OCUPA_VAGA do DataContext.
  const STATUS_NAO_OCUPA = new Set(["cancelado", "falta", "excluido", "removido", "inativo"]);
  const agendamentosByDate = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const a of agendamentos) {
      if (STATUS_NAO_OCUPA.has(a.status)) continue;
      const profKey = `${a.profissionalId}|${a.unidadeId}`;
      let dateMap = map.get(a.data);
      if (!dateMap) {
        dateMap = new Map();
        map.set(a.data, dateMap);
      }
      dateMap.set(profKey, (dateMap.get(profKey) || 0) + 1);
    }
    return map;
  }, [agendamentos]);

  // Pre-index disponibilidades for fast lookup
  const dispIndex = useMemo(() => {
    const arr = disponibilidades.map((d: any) => ({
      profissionalId: d.profissionalId,
      unidadeId: d.unidadeId,
      dataInicio: d.dataInicio,
      dataFim: d.dataFim,
      diasSemana: d.diasSemana || [],
      vagasPorDia: d.vagasPorDia || 25,
    }));
    return arr;
  }, [disponibilidades]);

  const dayInfoMap = useMemo(() => {
    const map = new Map<string, DiaInfo>();
    const todayStr = todayLocalStr();

    const profissionaisFiltrados = filterProf !== "all"
      ? profissionais.filter((prof) => prof.id === filterProf)
      : profissionais.filter((prof) => {
          if (filterUnit !== "all" && prof.unidadeId !== filterUnit) return false;
          return true;
        });

    const matchesBlock = (bloqueio: any, profissionalId: string, unidadeId: string) => {
      if (!bloqueio.diaInteiro) return false;
      const isGlobal = (!bloqueio.unidadeId || bloqueio.unidadeId === "") && (!bloqueio.profissionalId || bloqueio.profissionalId === "");
      const isUnitLevel = unidadeId && bloqueio.unidadeId === unidadeId && (!bloqueio.profissionalId || bloqueio.profissionalId === "");
      const isProfLevel = profissionalId && bloqueio.profissionalId === profissionalId;
      return isGlobal || isUnitLevel || isProfLevel;
    };

    // Only call getAvailableSlots when a specific professional is selected
    // For "all" mode, use a fast heuristic based on availability counts
    const useDetailedSlots = filterProf !== "all" && profissionaisFiltrados.length === 1;

    for (const day of daysInMonth) {
      const dateStr = localDateStr(day);
      const dayOfWeek = day.getUTCDay();
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === selectedDate;
      const isPast = dateStr < todayStr;

      let agendamentosConfirmados = 0;
      let totalVagas = 0;
      let hasDisponibilidade = false;
      let allBlocked = profissionaisFiltrados.length > 0;

      const dateAgMap = agendamentosByDate.get(dateStr);

      if (useDetailedSlots) {
        // Single professional — use detailed slot calculation (fast for 1 prof)
        const prof = profissionaisFiltrados[0];
        if (prof) {
          const profUnit = filterUnit !== "all" ? filterUnit : prof.unidadeId;
          const isBlocked = bloqueios.some((bloqueio: any) => {
            if (dateStr < bloqueio.dataInicio || dateStr > bloqueio.dataFim) return false;
            return matchesBlock(bloqueio, prof.id, profUnit);
          });
          allBlocked = isBlocked;
          hasDisponibilidade = dispIndex.some((disp) => (
            disp.profissionalId === prof.id &&
            disp.unidadeId === profUnit &&
            dateStr >= disp.dataInicio &&
            dateStr <= disp.dataFim &&
            disp.diasSemana.includes(dayOfWeek)
          ));

          if (!isBlocked && profUnit) {
            agendamentosConfirmados = dateAgMap?.get(`${prof.id}|${profUnit}`) || 0;
            if (!isPast) {
              const slots = getAvailableSlots(prof.id, profUnit, dateStr);
              totalVagas = slots.length + agendamentosConfirmados;
            } else {
              totalVagas = agendamentosConfirmados || 1; // past days: show count
            }
          }
        }
      } else {
        // Multiple professionals — use fast heuristic (no getAvailableSlots per prof)
        for (const prof of profissionaisFiltrados) {
          const profUnit = filterUnit !== "all" ? filterUnit : prof.unidadeId;
          const isBlocked = bloqueios.some((bloqueio: any) => {
            if (dateStr < bloqueio.dataInicio || dateStr > bloqueio.dataFim) return false;
            return matchesBlock(bloqueio, prof.id, profUnit);
          });
          allBlocked = allBlocked && isBlocked;

          const profHasDisponibilidade = dispIndex.some((disp) => (
            disp.profissionalId === prof.id &&
            disp.unidadeId === profUnit &&
            dateStr >= disp.dataInicio &&
            dateStr <= disp.dataFim &&
            disp.diasSemana.includes(dayOfWeek)
          ));
          hasDisponibilidade = hasDisponibilidade || profHasDisponibilidade;

          if (isBlocked || !profUnit) continue;

          const profAgCount = dateAgMap?.get(`${prof.id}|${profUnit}`) || 0;
          agendamentosConfirmados += profAgCount;

          // Use vagasPorDia from disponibilidade as totalVagas estimate
          const profDisp = dispIndex.find((disp) => (
            disp.profissionalId === prof.id &&
            disp.unidadeId === profUnit &&
            dateStr >= disp.dataInicio &&
            dateStr <= disp.dataFim &&
            disp.diasSemana.includes(dayOfWeek)
          ));
          if (profDisp) {
            totalVagas += profDisp.vagasPorDia;
          }
        }
      }

      let status: DiaInfo["status"] = "empty";
      if (allBlocked) {
        status = "blocked";
      } else if (isPast) {
        // Past dates: show as "past" but still clickable with appointment counts
        status = agendamentosConfirmados > 0 ? "past" : "past";
      } else if (totalVagas > 0) {
        const percent = (agendamentosConfirmados / totalVagas) * 100;
        if (agendamentosConfirmados >= totalVagas) status = "full";
        else if (percent >= 70) status = "almostFull";
        else status = "available";
      } else if (hasDisponibilidade) {
        status = "full";
      }

      map.set(dateStr, {
        date: dateStr,
        dayNumber: day.getUTCDate(),
        isToday,
        isSelected,
        status,
        agendamentosCount: agendamentosConfirmados,
        totalVagas,
      });
    }

    return map;
  }, [
    agendamentosByDate,
    bloqueios,
    daysInMonth,
    dispIndex,
    filterProf,
    filterUnit,
    getAvailableSlots,
    profissionais,
    selectedDate,
  ]);

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const weekDays = ["D", "S", "T", "Q", "Q", "S", "S"];

  const goToPrevMonth = () => {
    const newDate = new Date(currentMonth);
    newDate.setUTCMonth(newDate.getUTCMonth() - 1);
    setCurrentMonth(newDate);
  };

  const goToNextMonth = () => {
    const newDate = new Date(currentMonth);
    newDate.setUTCMonth(newDate.getUTCMonth() + 1);
    setCurrentMonth(newDate);
  };

  const getDotClass = (status: DiaInfo["status"]) => {
    switch (status) {
      case "past":
      case "blocked":
        return "bg-muted-foreground/60";
      case "full":
        return "bg-primary";
      case "almostFull":
        return "bg-warning";
      case "available":
        return "bg-success";
      default:
        return "bg-muted-foreground/30";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={goToPrevMonth}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <h3 className="text-base font-medium">
          {monthNames[currentMonth.getUTCMonth()]} {currentMonth.getUTCFullYear()}
        </h3>
        <Button variant="outline" size="icon" onClick={goToNextMonth}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {weekDays.map((day, index) => (
          <div key={index} className="py-1">{day}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {daysInMonth.map((day, index) => {
          const dateStr = localDateStr(day);
          const info = dayInfoMap.get(dateStr);
          if (!info) return null;

          const isCurrentMonth =
            day.getUTCMonth() === currentMonth.getUTCMonth() &&
            day.getUTCFullYear() === currentMonth.getUTCFullYear();

          const isDisabled = info.status === "blocked";

          return (
            <button
              key={index}
              type="button"
              disabled={isDisabled}
              onClick={() => !isDisabled && onDateChange(info.date)}
              className={cn(
                'relative flex flex-col items-center justify-center py-2 rounded-md transition-colors',
                !isCurrentMonth && 'opacity-40',
                info.isSelected && 'bg-primary text-primary-foreground shadow-sm',
                !info.isSelected && !isDisabled && 'hover:bg-muted/50',
                isDisabled && 'cursor-not-allowed'
              )}
            >
              <span className="text-sm font-medium">{info.dayNumber}</span>
              {info.agendamentosCount > 0 && (
                <span
                  className={cn(
                    'absolute top-1 right-1 text-[10px] font-semibold',
                    info.isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                  )}
                >
                  {info.agendamentosCount}
                </span>
              )}
              <div className={cn('w-1.5 h-1.5 rounded-full mt-1', getDotClass(info.status))} />
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-4 justify-center text-xs text-muted-foreground pt-2 border-t">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-success" />
          <span>Com vagas</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-warning" />
          <span>Quase cheio</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <span>Lotado</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-muted-foreground/60" />
          <span>Bloqueado / passado</span>
        </div>
      </div>
    </div>
  );
};