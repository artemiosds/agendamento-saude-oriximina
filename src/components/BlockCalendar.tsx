import {useMemo,useState} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight,Globe,Building2,User,Clock,AlertTriangle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {cn} from '@/lib/utils';
import {validBlockDate,type BlockEntry,type BlockRow,type BlockFilter} from '@/lib/blockDirectory';
import {blockCalendarMonth,shiftBlockMonth} from '@/lib/blockCalendar';

const months=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const weekdays=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const types:Record<string,string>={feriado:'Feriado',ferias:'Recesso / Férias',reuniao:'Reunião',indisponibilidade:'Indisponibilidade'};
const statusLabels={vigente:'Vigente',futuro:'Futuro',encerrado:'Encerrado',invalido:'A conferir'};
function initialMonth(today:string,year:string,month:string){
 const candidate=(/^\d{4}$/.test(year)&&year!=='0000'?year:today.slice(0,4))+'-'+(month==='todos'?today.slice(5,7):month);
 return validBlockDate(candidate+'-01')?candidate:today.slice(0,7);
}
function formatted(date:string){return date.split('-').reverse().join('/');}
interface Props<T extends BlockRow>{entries:readonly BlockEntry<T>[];today:string;filter:BlockFilter;limited:boolean;onList:()=>void}
export default function BlockCalendar<T extends BlockRow>({entries,today,filter,limited,onList}:Props<T>){
 const [month,setMonth]=useState(()=>initialMonth(today,filter.year,filter.month));
 const [selected,setSelected]=useState('');
 const data=useMemo(()=>blockCalendarMonth(month,entries,filter.year,filter.month),[month,entries,filter.year,filter.month]);
 const selectedDay=data.days.find(d=>d.date===selected);
 const invalidCount=entries.filter(e=>e.status==='invalido').length;
 const outsideFilter=!!filter.year&&filter.year!==month.slice(0,4)||filter.month!=='todos'&&filter.month!==month.slice(5,7);
 const move=(target:string)=>{setMonth(target);setSelected('');};
 return <section className="clinical-premium p-3 sm:p-4 space-y-3 min-w-0" aria-label="Calendário mensal de bloqueios">
  <div className="flex flex-wrap items-center gap-2 justify-between">
   <div className="flex items-center gap-2 min-w-0"><span className="clinical-dock-icon clinical-tone-teal shrink-0"><CalendarDays className="w-4 h-4" aria-hidden="true"/></span><div><h2 className="font-semibold text-sm">{months[Number(month.slice(5,7))-1]} de {month.slice(0,4)}</h2><p className="text-xs text-muted-foreground">{data.count} registro(s) neste mês</p></div></div>
   <div className="flex flex-wrap items-center gap-1">
    <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label="Mês anterior" disabled={shiftBlockMonth(month,-1)===month} onClick={()=>move(shiftBlockMonth(month,-1))}><ChevronLeft className="w-4 h-4"/></Button>
    <Button type="button" size="sm" variant="outline" onClick={()=>move(today.slice(0,7))}>Hoje</Button>
    <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label="Próximo mês" disabled={shiftBlockMonth(month,1)===month} onClick={()=>move(shiftBlockMonth(month,1))}><ChevronRight className="w-4 h-4"/></Button>
   </div>
  </div>
  {outsideFilter&&<p role="status" className="text-xs text-muted-foreground">O mês exibido está fora do filtro de ano/mês. Ajuste os filtros para consultar seus registros.</p>}
  {invalidCount>0&&<p className="text-xs text-amber-800 dark:text-amber-300">{invalidCount} registro(s) com período inconsistente não podem ser posicionados no calendário. <button type="button" className="underline font-medium" onClick={onList}>Consultar na lista</button>.</p>}
  <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
   {weekdays.map(d=><div key={d} className="text-center text-[11px] sm:text-xs font-semibold text-muted-foreground py-1">{d}</div>)}
   {Array.from({length:data.offset},(_,i)=><div key={'empty-'+i} aria-hidden="true"/>)}
   {data.days.map(d=>{
    const globalFull=d.entries.some(e=>e.scope==='global'&&e.block.diaInteiro);
    const has=d.entries.length>0;
    return <button key={d.date} type="button" aria-pressed={selected===d.date} aria-label={formatted(d.date)+': '+d.entries.length+' bloqueio(s) na seleção'+(globalFull?', inclui bloqueio global de dia inteiro':'')} onClick={()=>setSelected(old=>old===d.date?'':d.date)} className={cn('rounded-md border min-w-0 min-h-[54px] sm:min-h-[88px] p-1 sm:p-2 text-left flex flex-col gap-1 focus-visible:ring-2 focus-visible:ring-ring hover:bg-muted/40',has?'bg-primary/5 border-primary/25':'bg-card',globalFull&&'border-destructive/40 bg-destructive/5',selected===d.date&&'ring-2 ring-primary')}>
     <span className={cn('text-xs sm:text-sm font-semibold tabular-nums self-start rounded px-1',d.date===today&&'bg-primary text-primary-foreground')} aria-current={d.date===today?'date':undefined}>{Number(d.date.slice(8))}</span>
     {has&&<><span className={cn('text-[10px] sm:text-xs font-semibold',globalFull?'text-destructive':'text-primary')}>{d.entries.length}<span className="hidden sm:inline"> bloqueio(s)</span></span><span className="hidden xl:block text-[10px] text-muted-foreground truncate w-full">{d.entries[0].block.titulo}</span></>}
    </button>;
   })}
  </div>
  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground"><span className="flex items-center gap-1"><span className="w-3 h-3 rounded border border-primary/40 bg-primary/10"/>Bloqueios na seleção</span><span className="flex items-center gap-1"><span className="w-3 h-3 rounded border border-destructive/50 bg-destructive/10"/>Inclui global de dia inteiro</span></div>
  {selectedDay?<div className="clinical-inset border rounded-lg p-3 space-y-2" role="region" aria-label={'Bloqueios de '+formatted(selectedDay.date)}>
   <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-sm">{formatted(selectedDay.date)} · {selectedDay.entries.length} registro(s)</h3><Button type="button" size="sm" variant="outline" onClick={onList}>Ver lista</Button></div>
   {selectedDay.entries.length===0?<p className="text-xs text-muted-foreground">Nenhum bloqueio encontrado para este dia nos filtros atuais.</p>:selectedDay.entries.map(e=>{const Icon=e.scope==='global'?Globe:e.scope==='unidade'?Building2:User;return <div key={e.block.id} className="border rounded-md bg-card p-2.5 space-y-1"><div className="flex flex-wrap items-start justify-between gap-1"><strong className="text-sm break-words min-w-0">{e.block.titulo}</strong><span className="text-xs text-muted-foreground">{statusLabels[e.status]}</span></div><p className="text-xs text-muted-foreground">{types[e.block.tipo]||'Tipo a conferir'} · {formatted(e.block.dataInicio)} a {formatted(e.block.dataFim)}</p><p className="flex items-start gap-1 text-xs"><Icon className="w-3.5 h-3.5 shrink-0"/><span className="break-words">{e.scope==='global'?'Todo o sistema':e.scope==='unidade'?e.unit||'Unidade não localizada':e.person||'Profissional não localizado'}</span></p><p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="w-3.5 h-3.5"/>{e.block.diaInteiro?'Dia inteiro':(e.block.horaInicio||'—')+' – '+(e.block.horaFim||'—')}</p>{e.issues.length>0&&<p className="flex gap-1 text-xs text-amber-800 dark:text-amber-300"><AlertTriangle className="w-3.5 h-3.5 shrink-0"/>{e.issues.join(' · ')}</p>}</div>;})}
  </div>:<p className="text-xs text-muted-foreground">Selecione um dia para conferir os registros, a abrangência e os horários.</p>}
  <p className="text-[11px] text-muted-foreground">Calendário administrativo somente para consulta. Dias sem registros na seleção não significam agenda livre. Alterações e exclusões permanecem na lista.{limited?' A consulta pode estar limitada aos registros carregados.':''}</p>
 </section>;
}
