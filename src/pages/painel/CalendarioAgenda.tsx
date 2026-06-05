import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar, CalendarDays, CalendarRange, Info } from "lucide-react";
import { cn, dateStrToUtcDate, localDateStr, todayLocalStr } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { startOfWeek, endOfWeek, eachDayOfInterval, format, startOfMonth, endOfMonth, isSameMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
}) => {
  const [view, setView] = useState<AgendaView>("month");
  const [currentDate, setCurrentDate] = useState(() => dateStrToUtcDate(selectedDate));

  useEffect(() => {
    setCurrentDate(dateStrToUtcDate(selectedDate));
  }, [selectedDate]);

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
      const matchProf = filterProf === "all" || a.profissionalId === filterProf;
      const matchUnit = filterUnit === "all" || a.unidadeId === filterUnit;
      return matchProf && matchUnit;
    });

    const counts = {
      confirmados: relevantAgs.filter(a => a.status === "confirmado").length,
      aptos: relevantAgs.filter(a => a.status === "apto_atendimento").length,
      emAtendimento: relevantAgs.filter(a => a.status === "em_atendimento").length,
      concluidos: relevantAgs.filter(a => ["concluido", "finalizado"].includes(a.status)).length,
      faltou: relevantAgs.filter(a => a.status === "falta").length,
      cancelados: relevantAgs.filter(a => a.status === "cancelado").length,
      pendentes: relevantAgs.filter(a => a.status === "pendente").length,
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
    else if (isPast) status = "past";
    else if (totalVagas > 0) {
      const percent = (agendamentosCount / totalVagas) * 100;
      if (agendamentosCount >= totalVagas) status = "full";
      else if (percent >= 70) status = "almostFull";
      else status = "available";
    } else if (hasDisponibilidade) status = "full";

    return { date: dateStr, dayNumber: date.getUTCDate(), isToday, isSelected: dateStr === selectedDate, status, agendamentosCount, totalVagas, counts };
  };

  const profsFiltrados = useMemo(() => filterProf !== "all" ? profissionais.filter(p => p.id === filterProf) : profissionais.filter(p => filterUnit === "all" || p.unidadeId === filterUnit), [filterProf, filterUnit, profissionais]);

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
      <div className="grid grid-cols-7 gap-2 sm:gap-4">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => (
          <div key={d} className="text-center text-xs font-bold text-muted-foreground uppercase tracking-wider py-2">
            {d}
          </div>
        ))}
        {days.map(d => {
          const ds = localDateStr(d);
          const info = getDayStatus(ds, profsFiltrados);
          const isCurrMonth = isSameMonth(d, currentDate);
          
          return (
            <TooltipProvider key={ds}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    onClick={() => onDateChange(ds)} 
                    className={cn(
                      "group relative h-24 sm:h-32 p-2 rounded-xl border-2 transition-all text-left flex flex-col justify-between overflow-hidden",
                      info.isSelected ? "border-primary bg-primary/5 shadow-md scale-[1.02] z-10" : "border-border hover:border-primary/40 bg-card",
                      !isCurrMonth && "opacity-40",
                      info.status === "blocked" && "bg-muted/30 cursor-not-allowed opacity-60"
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <span className={cn(
                        "text-lg sm:text-2xl font-black leading-none", 
                        info.isSelected ? "text-primary" : "text-foreground",
                        info.isToday && !info.isSelected && "text-primary/70"
                      )}>
                        {info.dayNumber}
                      </span>
                      {info.agendamentosCount > 0 && (
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] sm:text-xs font-bold text-muted-foreground">
                            {info.agendamentosCount}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-1">
                      {info.totalVagas > 0 && (
                        <>
                          <div className="flex justify-between items-center text-[10px] font-medium opacity-70">
                            <span>{Math.round((info.agendamentosCount / info.totalVagas) * 100)}%</span>
                            <span>{info.totalVagas} vagas</span>
                          </div>
                          <Progress 
                            value={(info.agendamentosCount / info.totalVagas) * 100} 
                            className={cn(
                              "h-1.5",
                              info.status === "full" ? "bg-primary/20 [&>div]:bg-primary" :
                              info.status === "almostFull" ? "bg-warning/20 [&>div]:bg-warning" :
                              "[&>div]:bg-success"
                            )} 
                          />
                        </>
                      )}
                      {info.status === "blocked" && (
                        <span className="text-[10px] font-bold text-destructive uppercase">Bloqueado</span>
                      )}
                    </div>
                    {info.isToday && <div className="absolute top-0 right-0 w-2 h-2 bg-primary rounded-bl-lg" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="p-3 w-48 space-y-2">
                  <p className="font-bold border-bottom pb-1 mb-1">{format(d, "d 'de' MMMM", { locale: ptBR })}</p>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <span>Atendimentos:</span> <span className="font-bold">{info.agendamentosCount}</span>
                    <span>Vagas totais:</span> <span className="font-bold">{info.totalVagas}</span>
                    <span>Confirmados:</span> <span className="font-bold">{info.counts.confirmados}</span>
                    <span>Pendentes:</span> <span className="font-bold">{info.counts.pendentes}</span>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
    );
  };

  const renderWeek = () => {
    const days = eachDayOfInterval({ start: startOfWeek(currentDate), end: endOfWeek(currentDate) });
    return (
      <div className="grid grid-cols-7 gap-3">
        {days.map(d => {
          const ds = localDateStr(d);
          const info = getDayStatus(ds, profsFiltrados);
          return (
            <div 
              key={ds} 
              onClick={() => onDateChange(ds)} 
              className={cn(
                "p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col items-center gap-2", 
                info.isSelected ? "border-primary bg-primary/5 shadow-md" : "border-border hover:border-primary/40 bg-card"
              )}
            >
              <div className="text-xs font-bold text-muted-foreground uppercase">{format(d, "EEEE", { locale: ptBR })}</div>
              <div className="text-3xl font-black">{info.dayNumber}</div>
              <div className="text-sm font-medium text-muted-foreground">{info.agendamentosCount} atendimentos</div>
              {info.totalVagas > 0 && (
                <div className="w-full mt-2">
                  <div className="flex justify-between text-[10px] mb-1 font-bold">
                    <span>Ocupação</span>
                    <span>{Math.round((info.agendamentosCount / info.totalVagas) * 100)}%</span>
                  </div>
                  <Progress value={(info.agendamentosCount / info.totalVagas) * 100} className="h-2" />
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
      <div className="p-6 border-2 rounded-2xl bg-card shadow-sm border-primary/10">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-2xl font-black capitalize">{format(date, "EEEE, d 'de' MMMM", { locale: ptBR })}</h3>
            <p className="text-muted-foreground font-medium">Resumo operacional do dia</p>
          </div>
          <div className={cn(
            "px-4 py-2 rounded-full text-sm font-bold border",
            info.status === "full" ? "bg-primary/10 border-primary text-primary" :
            info.status === "almostFull" ? "bg-warning/10 border-warning text-warning" :
            "bg-success/10 border-success text-success"
          )}>
            {info.status === "full" ? "Lotado" : info.status === "almostFull" ? "Quase Cheio" : "Com Vagas"}
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Agendamentos" value={info.agendamentosCount} color="text-primary" />
          <StatCard label="Vagas Disponíveis" value={Math.max(0, info.totalVagas - info.agendamentosCount)} color="text-success" />
          <StatCard label="Confirmados" value={info.counts.confirmados} />
          <StatCard label="Pendentes" value={info.counts.pendentes} />
          <StatCard label="Em Atendimento" value={info.counts.emAtendimento} color="text-info" />
          <StatCard label="Concluídos" value={info.counts.concluidos} color="text-success" />
          <StatCard label="Faltas" value={info.counts.faltou} color="text-destructive" />
          <StatCard label="Cancelados" value={info.counts.cancelados} color="text-destructive" />
        </div>

        <div className="mt-8">
          <div className="flex justify-between items-end mb-2">
            <div>
              <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Ocupação da Agenda</span>
              <div className="text-3xl font-black">{info.totalVagas > 0 ? Math.round((info.agendamentosCount / info.totalVagas) * 100) : 0}%</div>
            </div>
            <span className="text-sm font-medium text-muted-foreground">{info.agendamentosCount} de {info.totalVagas} vagas utilizadas</span>
          </div>
          <Progress value={info.totalVagas > 0 ? (info.agendamentosCount / info.totalVagas) * 100 : 0} className="h-4 rounded-full" />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-muted/30 p-4 rounded-2xl border border-border/50">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="rounded-full h-10 w-10 border-2" onClick={() => navDate(-1)}><ChevronLeft className="h-5 w-5" /></Button>
          <div className="text-center min-w-[180px]">
            <h2 className="text-xl font-black capitalize tracking-tight">
              {format(currentDate, "MMMM", { locale: ptBR })}
              <span className="text-primary ml-1">{format(currentDate, "yyyy")}</span>
            </h2>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{view === "month" ? "Visualização Mensal" : view === "week" ? "Visualização Semanal" : "Resumo do Dia"}</p>
          </div>
          <Button variant="outline" size="icon" className="rounded-full h-10 w-10 border-2" onClick={() => navDate(1)}><ChevronRight className="h-5 w-5" /></Button>
          <Button variant="ghost" size="sm" className="font-bold text-primary hover:text-primary/80" onClick={() => {
            const today = todayLocalStr();
            onDateChange(today);
            setCurrentDate(dateStrToUtcDate(today));
          }}>Hoje</Button>
        </div>
        
        <Tabs value={view} onValueChange={(v) => setView(v as AgendaView)} className="w-full md:w-auto">
          <TabsList className="grid grid-cols-3 w-full border-2 p-1 h-12 rounded-xl">
            <TabsTrigger value="day" className="rounded-lg font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Calendar className="w-4 h-4 mr-2" />Dia</TabsTrigger>
            <TabsTrigger value="week" className="rounded-lg font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><CalendarRange className="w-4 h-4 mr-2" />Semana</TabsTrigger>
            <TabsTrigger value="month" className="rounded-lg font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><CalendarDays className="w-4 h-4 mr-2" />Mês</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="transition-all duration-500 ease-in-out">
        {view === "month" && renderMonth()}
        {view === "week" && renderWeek()}
        {view === "day" && renderDay()}
      </div>

      <div className="flex flex-wrap gap-6 justify-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground pt-4 border-t border-dashed">
        <LegendItem color="bg-success" label="Com vagas" />
        <LegendItem color="bg-warning" label="Quase cheio" />
        <LegendItem color="bg-primary" label="Lotado" />
        <LegendItem color="bg-destructive" label="Excedido" />
        <LegendItem color="bg-muted-foreground/40" label="Bloqueado / Passado" />
      </div>
    </div>
  );
};

const StatCard = ({ label, value, color }: { label: string; value: number | string; color?: string }) => (
  <div className="p-4 bg-muted/40 rounded-xl border border-border/40 hover:border-primary/20 transition-colors">
    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
    <div className={cn("text-3xl font-black", color || "text-foreground")}>{value}</div>
  </div>
);

const LegendItem = ({ color, label }: { color: string; label: string }) => (
  <div className="flex items-center gap-2">
    <div className={cn("w-3 h-3 rounded-sm shadow-sm", color)} />
    <span>{label}</span>
  </div>
);