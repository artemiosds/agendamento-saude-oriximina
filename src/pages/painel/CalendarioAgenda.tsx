import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar, CalendarDays, CalendarRange } from "lucide-react";
import { cn, dateStrToUtcDate, localDateStr, todayLocalStr } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { startOfWeek, endOfWeek, eachDayOfInterval, format, startOfMonth, endOfMonth, isSameMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type AgendaView = "month" | "week" | "day";

interface DiaInfo {
  date: string;
  dayNumber: number;
  isToday: boolean;
  isSelected: boolean;
  status: "blocked" | "past" | "full" | "almostFull" | "available" | "empty";
  agendamentosCount: number;
  totalVagas: number;
  counts: {
    confirmados: number;
    aptos: number;
    emAtendimento: number;
    concluidos: number;
    faltou: number;
    cancelados: number;
    pendentes: number;
  };
}

interface CalendarioAgendaProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  onVisibleRangeChange?: (startDate: string, endDate: string) => void;
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
  onVisibleRangeChange,
  agendamentos,
  bloqueios,
  disponibilidades,
  filterProf,
  filterUnit,
  profissionais,
}) => {
  const { user } = useAuth();
  const isProfissional = user?.role === "profissional";
  const effectiveProfFilter = isProfissional ? (user?.id || "all") : filterProf;
  const [view, setView] = useState<AgendaView>("month");
  const [currentDate, setCurrentDate] = useState(() => dateStrToUtcDate(selectedDate));

  useEffect(() => {
    setCurrentDate(dateStrToUtcDate(selectedDate));
  }, [selectedDate]);

  useEffect(() => {
    if (!onVisibleRangeChange) return;
    if (view === "month") {
      const start = startOfWeek(startOfMonth(currentDate));
      const end = endOfWeek(endOfMonth(currentDate));
      onVisibleRangeChange(localDateStr(start), localDateStr(end));
      return;
    }
    if (view === "week") {
      onVisibleRangeChange(localDateStr(startOfWeek(currentDate)), localDateStr(endOfWeek(currentDate)));
      return;
    }
    const day = localDateStr(currentDate);
    onVisibleRangeChange(day, day);
  }, [currentDate, view, onVisibleRangeChange]);

  const STATUS_NAO_OCUPA = new Set(["cancelado", "falta", "excluido", "removido", "inativo"]);

  const getDayStatus = (dateStr: string, profs: any[]): DiaInfo => {
    const date = dateStrToUtcDate(dateStr);
    const dayOfWeek = date.getUTCDay();
    const isToday = dateStr === todayLocalStr();
    const isPast = dateStr < todayLocalStr();

    let agendamentosCount = 0;
    let totalVagas = 0;
    let hasDisponibilidade = false;
    let allBlocked = profs.length > 0;

    const dayAgendamentos = agendamentos.filter(a => a.data === dateStr);
    
    // Filtro por profissional e unidade
    const relevantAgs = dayAgendamentos.filter(a => {
      const matchProf = effectiveProfFilter === "all" || a.profissionalId === effectiveProfFilter;
      const matchUnit = filterUnit === "all" || a.unidadeId === filterUnit;
      return matchProf && matchUnit;
    });

    // Normaliza status para datas futuras: agendamentos cuja data ainda não chegou
    // não podem ter status pós-chegada (apto/em atendimento/concluído). Tratamos como "confirmado".
    const todayStrCal = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const POSTERIORES = new Set([
      "confirmado_chegada","chegada_confirmada","aguardando_triagem","triagem_concluida",
      "aguardando_atendimento","aguardando_profissional","apto_atendimento","apto",
      "em_atendimento","concluido","finalizado","atendido","atendimento_encerrado","prontuario_finalizado",
    ]);
    const effectiveStatus = (a: any): string => {
      const s = String(a.status || "").toLowerCase();
      if (a.data && a.data > todayStrCal && POSTERIORES.has(s)) return "confirmado";
      return s;
    };

    const counts = {
      confirmados: relevantAgs.filter(a => effectiveStatus(a) === "confirmado").length,
      aptos: relevantAgs.filter(a => effectiveStatus(a) === "apto_atendimento").length,
      emAtendimento: relevantAgs.filter(a => effectiveStatus(a) === "em_atendimento").length,
      concluidos: relevantAgs.filter(a => ["concluido", "finalizado"].includes(effectiveStatus(a))).length,
      faltou: relevantAgs.filter(a => effectiveStatus(a) === "falta").length,
      cancelados: relevantAgs.filter(a => effectiveStatus(a) === "cancelado").length,
      pendentes: relevantAgs.filter(a => effectiveStatus(a) === "pendente").length,
    };

    agendamentosCount = relevantAgs.filter(a => !STATUS_NAO_OCUPA.has(a.status)).length;

    for (const prof of profs) {
      const profUnit = filterUnit !== "all" ? filterUnit : prof.unidadeId;
      const isBlocked = bloqueios.some((b: any) => {
        if (dateStr < b.dataInicio || dateStr > b.dataFim) return false;
        return (b.diaInteiro && ((!b.unidadeId || b.unidadeId === profUnit) && (!b.profissionalId || b.profissionalId === prof.id)));
      });
      allBlocked = allBlocked && isBlocked;
      const profHasDisp = disponibilidades.some((d) => (d.profissionalId === prof.id && d.unidadeId === profUnit && dateStr >= d.dataInicio && dateStr <= d.dataFim && d.diasSemana.includes(dayOfWeek)));
      hasDisponibilidade = hasDisponibilidade || profHasDisp;

      if (!isBlocked && profUnit) {
        const disp = disponibilidades.find((d) => (d.profissionalId === prof.id && d.unidadeId === profUnit && dateStr >= d.dataInicio && dateStr <= d.dataFim && d.diasSemana.includes(dayOfWeek)));
        if (disp) totalVagas += (disp.vagasPorDia || 25);
      }
    }

    let status: DiaInfo["status"] = "empty";
    if (allBlocked) status = "blocked";
    else if (totalVagas > 0 || agendamentosCount > 0) {
      const percent = totalVagas > 0 ? (agendamentosCount / totalVagas) * 100 : 100;
      if (agendamentosCount >= totalVagas && totalVagas > 0) status = "full";
      else if (percent >= 70) status = "almostFull";
      else status = "available";
    } else if (hasDisponibilidade) status = "full";

    return { date: dateStr, dayNumber: date.getUTCDate(), isToday, isSelected: dateStr === selectedDate, status, agendamentosCount, totalVagas, counts };
  };

  const profsFiltrados = useMemo(() => effectiveProfFilter !== "all" ? profissionais.filter(p => p.id === effectiveProfFilter) : profissionais.filter(p => filterUnit === "all" || p.unidadeId === filterUnit), [effectiveProfFilter, filterUnit, profissionais]);

  const navDate = (delta: number) => {
    const next = new Date(currentDate);
    if (view === "month") next.setUTCMonth(next.getUTCMonth() + delta);
    else if (view === "week") next.setUTCDate(next.getUTCDate() + delta * 7);
    else next.setUTCDate(next.getUTCDate() + delta);
    setCurrentDate(next);
  };

  const renderMonth = () => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start: startOfWeek(start), end: endOfWeek(end) });

    return (
      <div className="grid grid-cols-7 gap-1">
        {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map(d => (
          <div key={d} className="text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider py-2">
            {d}
          </div>
        ))}
        {days.map(d => {
          const ds = localDateStr(d);
          const info = getDayStatus(ds, profsFiltrados);
          const isCurrMonth = isSameMonth(d, currentDate);
          
          return (
            <Tooltip key={ds}>
              <TooltipTrigger asChild>
                <button 
                  onClick={() => onDateChange(ds)} 
                  className={cn(
                    "group relative h-16 sm:h-20 p-1.5 rounded-lg border transition-all text-left flex flex-col justify-between overflow-hidden",
                    info.isSelected ? "border-primary bg-primary/5 shadow-sm z-10" : "border-border hover:border-primary/40 bg-card",
                    !isCurrMonth && "opacity-30",
                    info.status === "blocked" && "bg-muted/30 cursor-not-allowed opacity-50",
                    ds < todayLocalStr() && "bg-muted/10 opacity-80"


                  )}
                >
                  <div className="flex justify-between items-start">
                    <span className={cn(
                      "text-sm sm:text-lg font-bold leading-none", 
                      info.isSelected ? "text-primary" : "text-foreground",
                      info.isToday && !info.isSelected && "text-primary/70"
                    )}>
                      {info.dayNumber}
                    </span>
                    {info.agendamentosCount > 0 && (
                      <span className="text-[10px] font-bold text-muted-foreground bg-muted/50 px-1 rounded">
                        {info.agendamentosCount}
                      </span>
                    )}
                  </div>
                  
                  <div className="space-y-0.5">
                    {info.totalVagas > 0 && (
                      <>
                        <div className="flex justify-between items-center text-[8px] font-medium opacity-70">
                          <span>{Math.round((info.agendamentosCount / info.totalVagas) * 100)}%</span>
                          <span>{info.totalVagas} v</span>
                        </div>
                        <Progress 
                          value={(info.agendamentosCount / info.totalVagas) * 100} 
                          className={cn(
                            "h-1",
                            info.status === "full" ? "bg-primary/20 [&>div]:bg-primary" :
                            info.status === "almostFull" ? "bg-warning/20 [&>div]:bg-warning" :
                            "[&>div]:bg-success"
                          )} 
                        />
                      </>
                    )}
                    {info.status === "blocked" && (
                      <span className="text-[8px] font-bold text-destructive uppercase">Blq</span>
                    )}
                    {ds < todayLocalStr() && (
                      <span className="text-[8px] font-bold text-muted-foreground uppercase">Passado</span>
                    )}
                  </div>
                  {info.isToday && <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-primary rounded-bl-sm" />}
                </button>
              </TooltipTrigger>
              <TooltipContent className="p-2 w-40 space-y-1">
                <p className="font-bold text-xs border-b pb-1">{format(d, "d 'de' MMMM", { locale: ptBR })}</p>
                <div className="grid grid-cols-2 gap-x-1 text-[10px]">
                  <span>Atend:</span> <span className="font-bold">{info.agendamentosCount}</span>
                  <span>Vagas:</span> <span className="font-bold">{info.totalVagas}</span>
                  <span>Confirm:</span> <span className="font-bold">{info.counts.confirmados}</span>
                  <span>Pend:</span> <span className="font-bold">{info.counts.pendentes}</span>
                </div>
              </TooltipContent>
            </Tooltip>
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
            <div 
              key={ds} 
              onClick={() => onDateChange(ds)} 
              className={cn(
                "p-3 rounded-lg border cursor-pointer transition-all flex flex-col items-center gap-1", 
                info.isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 bg-card"
              )}
            >
              <div className="text-[10px] font-bold text-muted-foreground uppercase">{format(d, "EEE", { locale: ptBR })}</div>
              <div className="text-xl font-bold">{info.dayNumber}</div>
              <div className="text-[10px] font-medium text-muted-foreground">{info.agendamentosCount} atend.</div>
              {info.totalVagas > 0 && (
                <div className="w-full mt-1">
                  <Progress value={(info.agendamentosCount / info.totalVagas) * 100} className="h-1" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderDay = () => {
    const date = dateStrToUtcDate(selectedDate);
    const info = getDayStatus(selectedDate, profsFiltrados);
    return (
      <div className="p-4 border rounded-xl bg-card shadow-sm border-primary/10">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-xl font-bold capitalize">{format(date, "EEEE, d 'de' MMMM", { locale: ptBR })}</h3>
            <p className="text-xs text-muted-foreground font-medium">Resumo do dia</p>
          </div>
          <div className={cn(
            "px-3 py-1 rounded-full text-[10px] font-bold border",
            info.status === "full" ? "bg-primary/10 border-primary text-primary" :
            info.status === "almostFull" ? "bg-warning/10 border-warning text-warning" :
            selectedDate < todayLocalStr() ? "bg-muted/10 border-muted text-muted-foreground" :
            "bg-success/10 border-success text-success"
          )}>
            {info.status === "full" ? "LOTADO" : info.status === "almostFull" ? "QUASE CHEIO" : selectedDate < todayLocalStr() ? "PASSADO" : "COM VAGAS"}
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatCard label="Total" value={info.agendamentosCount} color="text-primary" />
          <StatCard label="Vagas Disp." value={Math.max(0, info.totalVagas - info.agendamentosCount)} color="text-success" />
          <StatCard label="Confirm." value={info.counts.confirmados} />
          <StatCard label="Pendente" value={info.counts.pendentes} />
        </div>

        <div className="mt-4">
          <div className="flex justify-between items-end mb-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Ocupação: {info.totalVagas > 0 ? Math.round((info.agendamentosCount / info.totalVagas) * 100) : 0}%</span>
            <span className="text-[10px] font-medium text-muted-foreground">{info.agendamentosCount}/{info.totalVagas}</span>
          </div>
          <Progress value={info.totalVagas > 0 ? (info.agendamentosCount / info.totalVagas) * 100 : 0} className="h-2 rounded-full" />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/10 p-2.5 rounded-lg border border-border/40">
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-muted" onClick={() => navDate(-1)}><ChevronLeft className="h-5 w-5" /></Button>
          <div className="text-center min-w-[140px]">
            <h2 className="text-base font-bold capitalize tracking-tight">
              {format(currentDate, "MMMM", { locale: ptBR })}
              <span className="text-primary ml-1">{format(currentDate, "yyyy")}</span>
            </h2>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-muted" onClick={() => navDate(1)}><ChevronRight className="h-5 w-5" /></Button>
          <Button variant="outline" size="sm" className="h-8 text-[11px] font-bold uppercase tracking-wider ml-1 px-3 border-primary/20 text-primary hover:bg-primary/5" onClick={() => {
            const today = todayLocalStr();
            onDateChange(today);
            setCurrentDate(dateStrToUtcDate(today));
          }}>Hoje</Button>
        </div>
        
        <Tabs value={view} onValueChange={(v) => setView(v as AgendaView)} className="w-auto">
          <TabsList className="h-9 p-1 bg-muted/40 rounded-lg">
            <TabsTrigger value="day" className="h-7 text-[11px] font-bold uppercase tracking-wider px-4 data-[state=active]:shadow-sm"><Calendar className="w-3.5 h-3.5 mr-1.5" />Dia</TabsTrigger>
            <TabsTrigger value="week" className="h-7 text-[11px] font-bold uppercase tracking-wider px-4 data-[state=active]:shadow-sm"><CalendarRange className="w-3.5 h-3.5 mr-1.5" />Semana</TabsTrigger>
            <TabsTrigger value="month" className="h-7 text-[11px] font-bold uppercase tracking-wider px-4 data-[state=active]:shadow-sm"><CalendarDays className="w-3.5 h-3.5 mr-1.5" />Mês</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>


      <div className="mx-auto">
        {view === "month" && renderMonth()}
        {view === "week" && renderWeek()}
        {view === "day" && renderDay()}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center text-[9px] font-bold uppercase tracking-wider text-muted-foreground pt-3 border-t border-dashed">
        <LegendItem color="bg-success" label="Vagas" />
        <LegendItem color="bg-warning" label="Quase cheio" />
        <LegendItem color="bg-primary" label="Lotado" />
        <LegendItem color="bg-muted-foreground/40" label="Blq/Passado" />
      </div>
    </div>
  );
};

const StatCard = ({ label, value, color }: { label: string; value: number | string; color?: string }) => (
  <div className="p-2 bg-muted/30 rounded-lg border border-border/30">
    <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight mb-0.5">{label}</div>
    <div className={cn("text-base font-bold", color || "text-foreground")}>{value}</div>
  </div>
);

const LegendItem = ({ color, label }: { color: string; label: string }) => (
  <div className="flex items-center gap-1.5">
    <div className={cn("w-2 h-2 rounded-full", color)} />
    <span>{label}</span>
  </div>
);