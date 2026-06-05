import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar, CalendarDays, CalendarRange } from "lucide-react";
import { cn, dateStrToUtcDate, localDateStr, todayLocalStr } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { startOfWeek, endOfWeek, eachDayOfInterval, format, isSameDay, startOfMonth, endOfMonth, isToday as isTodayDate } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";

type AgendaView = "month" | "week" | "day";

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
  const [view, setView] = useState<AgendaView>("month");
  const [currentDate, setCurrentDate] = useState(() => dateStrToUtcDate(selectedDate));

  useEffect(() => {
    setCurrentDate(dateStrToUtcDate(selectedDate));
  }, [selectedDate]);

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

  const dispIndex = useMemo(() => {
    return disponibilidades.map((d: any) => ({
      profissionalId: d.profissionalId,
      unidadeId: d.unidadeId,
      dataInicio: d.dataInicio,
      dataFim: d.dataFim,
      diasSemana: d.diasSemana || [],
      vagasPorDia: d.vagasPorDia || 25,
    }));
  }, [disponibilidades]);

  const getDayStatus = (dateStr: string, profs: any[]): DiaInfo => {
    const date = dateStrToUtcDate(dateStr);
    const dayOfWeek = date.getUTCDay();
    const isToday = dateStr === todayLocalStr();
    const isPast = dateStr < todayLocalStr();

    let agendamentosCount = 0;
    let totalVagas = 0;
    let hasDisponibilidade = false;
    let allBlocked = profs.length > 0;

    const dateAgMap = agendamentosByDate.get(dateStr);

    for (const prof of profs) {
      const profUnit = filterUnit !== "all" ? filterUnit : prof.unidadeId;
      const isBlocked = bloqueios.some((b: any) => {
        if (dateStr < b.dataInicio || dateStr > b.dataFim) return false;
        return (b.diaInteiro && ((!b.unidadeId || b.unidadeId === profUnit) && (!b.profissionalId || b.profissionalId === prof.id)));
      });
      allBlocked = allBlocked && isBlocked;
      const profHasDisp = dispIndex.some((d) => (d.profissionalId === prof.id && d.unidadeId === profUnit && dateStr >= d.dataInicio && dateStr <= d.dataFim && d.diasSemana.includes(dayOfWeek)));
      hasDisponibilidade = hasDisponibilidade || profHasDisp;

      if (!isBlocked && profUnit) {
        agendamentosCount += dateAgMap?.get(`${prof.id}|${profUnit}`) || 0;
        const disp = dispIndex.find((d) => (d.profissionalId === prof.id && d.unidadeId === profUnit && dateStr >= d.dataInicio && dateStr <= d.dataFim && d.diasSemana.includes(dayOfWeek)));
        if (disp) totalVagas += disp.vagasPorDia;
      }
    }

    let status: DiaInfo["status"] = "empty";
    if (allBlocked) status = "blocked";
    else if (isPast) status = "past";
    else if (totalVagas > 0) {
      const percent = (agendamentosCount / totalVagas) * 100;
      if (agendamentosCount >= totalVagas) status = "full";
      else if (percent >= 70) status = "almostFull";
      else status = "available";
    } else if (hasDisponibilidade) status = "full";

    return { date: dateStr, dayNumber: date.getUTCDate(), isToday, isSelected: dateStr === selectedDate, status, agendamentosCount, totalVagas };
  };

  const profsFiltrados = useMemo(() => filterProf !== "all" ? profissionais.filter(p => p.id === filterProf) : profissionais.filter(p => filterUnit === "all" || p.unidadeId === filterUnit), [filterProf, filterUnit, profissionais]);

  // View contents
  const renderMonth = () => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start: startOfWeek(start), end: endOfWeek(end) });

    return (
      <div className="grid grid-cols-7 gap-2">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => <div key={d} className="text-center text-xs font-medium text-muted-foreground">{d}</div>)}
        {days.map(d => {
          const ds = localDateStr(d);
          const info = getDayStatus(ds, profsFiltrados);
          return (
            <button key={ds} onClick={() => onDateChange(ds)} className={cn("h-20 p-2 rounded-lg border transition-all text-left flex flex-col justify-between", info.isSelected ? "border-primary bg-primary/5" : "hover:border-primary/50", info.status === "blocked" && "opacity-50 cursor-not-allowed")}>
              <span className={cn("text-sm font-semibold", info.isSelected && "text-primary")}>{info.dayNumber}</span>
              {info.agendamentosCount > 0 && <span className="text-[10px] text-muted-foreground">{info.agendamentosCount} agend.</span>}
              {info.totalVagas > 0 && <Progress value={(info.agendamentosCount / info.totalVagas) * 100} className="h-1" />}
            </button>
          );
        })}
      </div>
    );
  };

  const renderWeek = () => {
    const days = eachDayOfInterval({ start: startOfWeek(currentDate), end: endOfWeek(currentDate) });
    return (
      <div className="grid grid-cols-7 gap-2">
        {days.map(d => {
          const ds = localDateStr(d);
          const info = getDayStatus(ds, profsFiltrados);
          return (
            <div key={ds} onClick={() => onDateChange(ds)} className={cn("p-3 rounded-lg border cursor-pointer transition-all", info.isSelected ? "border-primary bg-primary/5" : "hover:border-primary/50")}>
              <div className="text-xs text-muted-foreground uppercase">{format(d, "EEE", { locale: ptBR })}</div>
              <div className="text-xl font-bold">{info.dayNumber}</div>
              <div className="mt-2 text-xs text-muted-foreground">{info.agendamentosCount} atend.</div>
              {info.totalVagas > 0 && <Progress value={(info.agendamentosCount / info.totalVagas) * 100} className="h-1.5 mt-2" />}
            </div>
          );
        })}
      </div>
    );
  };

  const renderDay = () => {
    const info = getDayStatus(selectedDate, profsFiltrados);
    return (
      <div className="p-4 border rounded-xl bg-card">
        <div className="text-lg font-semibold capitalize">{format(dateStrToUtcDate(selectedDate), "EEEE, d 'de' MMMM", { locale: ptBR })}</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="text-xs text-muted-foreground">Total Agendamentos</div>
            <div className="text-2xl font-bold">{info.agendamentosCount}</div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="text-xs text-muted-foreground">Vagas Disponíveis</div>
            <div className="text-2xl font-bold">{Math.max(0, info.totalVagas - info.agendamentosCount)}</div>
          </div>
          <div className="col-span-2">
            <div className="text-xs text-muted-foreground mb-1">Ocupação</div>
            <Progress value={info.totalVagas > 0 ? (info.agendamentosCount / info.totalVagas) * 100 : 0} />
          </div>
        </div>
      </div>
    );
  };

  const navDate = (delta: number) => {
    const next = new Date(currentDate);
    if (view === "month") next.setUTCMonth(next.getUTCMonth() + delta);
    else if (view === "week") next.setUTCDate(next.getUTCDate() + delta * 7);
    else next.setUTCDate(next.getUTCDate() + delta);
    setCurrentDate(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navDate(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <h2 className="text-lg font-semibold min-w-[140px] text-center capitalize">
            {format(currentDate, view === "day" ? "MMMM yyyy" : "MMMM yyyy", { locale: ptBR })}
          </h2>
          <Button variant="outline" size="icon" onClick={() => navDate(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as AgendaView)}>
          <TabsList>
            <TabsTrigger value="day"><Calendar className="w-4 h-4 mr-2" />Dia</TabsTrigger>
            <TabsTrigger value="week"><CalendarRange className="w-4 h-4 mr-2" />Semana</TabsTrigger>
            <TabsTrigger value="month"><CalendarDays className="w-4 h-4 mr-2" />Mês</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {view === "month" && renderMonth()}
      {view === "week" && renderWeek()}
      {view === "day" && renderDay()}
    </div>
  );
};