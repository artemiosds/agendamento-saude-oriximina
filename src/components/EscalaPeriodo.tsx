import { useId, useState } from 'react';
import { addDays, addMonths, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { dateKeyEscala } from '@/lib/escalaInformativa';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const months = Array.from({ length: 12 }, (_, month) => {
  const date = new Date(2020, month, 1);
  return { short: format(date, 'LLL', { locale: ptBR }).replace(/\.$/, ''), name: format(date, 'LLLL', { locale: ptBR }) };
});

export function EscalaPeriodo({ date, monthly, onChange }: { date: string; monthly: boolean; onChange: (date: string) => void }) {
  const labelId = useId();
  const valueId = useId();
  const selected = new Date(date + 'T12:00:00');
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(selected.getFullYear());
  const [month, setMonth] = useState(selected);
  const shift = (amount: number) => {
    const reference = new Date(date.slice(0, 7) + '-01T12:00:00');
    onChange(dateKeyEscala(monthly ? addMonths(reference, amount) : addDays(selected, 7 * amount)));
  };
  const commit = (selection: Date) => {
    onChange(dateKeyEscala(selection));
    setOpen(false);
  };

  return <div className="min-w-0 space-y-1 text-xs font-medium">
    <span id={labelId}>Período de consulta</span>
    <div className="flex items-center gap-1">
      <Button type="button" size="icon" variant="outline" className="shrink-0" aria-label="Período anterior" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Button>
      <Popover open={open} onOpenChange={next => {
        if (next) { setYear(selected.getFullYear()); setMonth(selected); }
        setOpen(next);
      }}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" aria-labelledby={labelId + ' ' + valueId}
            className="min-w-0 flex-1 gap-2 px-2 font-normal tabular-nums">
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span id={valueId}>{format(selected, monthly ? 'MM/yyyy' : 'dd/MM/yyyy', { locale: ptBR })}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="z-[60] w-auto max-w-[calc(100vw-1rem)] p-2" aria-label={monthly ? 'Escolher mês da escala' : 'Escolher data da escala'}>
          {monthly ? <div className="w-60 space-y-2 p-2">
            <div className="flex items-center justify-between">
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Ano anterior" onClick={() => setYear(y => y - 1)}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Button>
              <span className="font-semibold tabular-nums" aria-live="polite">{year}</span>
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Próximo ano" onClick={() => setYear(y => y + 1)}><ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {months.map((m, index) => {
                const active = year === selected.getFullYear() && index === selected.getMonth();
                return <Button key={m.name} type="button" size="sm" variant={active ? 'secondary' : 'ghost'} className="capitalize"
                  aria-label={m.name + ' de ' + year} aria-pressed={active}
                  onClick={() => commit(new Date(year, index, 1, 12))}>{m.short}</Button>;
              })}
            </div>
          </div> : <Calendar mode="single" locale={ptBR} weekStartsOn={1} showOutsideDays={false} initialFocus
            selected={selected} month={month} onMonthChange={setMonth}
            labels={{ labelNext: () => 'Próximo mês', labelPrevious: () => 'Mês anterior' }}
            onSelect={(day, clickedDay) => commit(day ?? clickedDay)} />}
        </PopoverContent>
      </Popover>
      <Button type="button" size="icon" variant="outline" className="shrink-0" aria-label="Próximo período" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
    </div>
  </div>;
}
