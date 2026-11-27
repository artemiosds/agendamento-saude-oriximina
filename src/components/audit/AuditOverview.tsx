import {useEffect,useState} from 'react';
import {Activity,CheckCircle2,AlertTriangle,Clock,ChevronRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {supabase} from '@/integrations/supabase/client';
import {AUDIT_PERIODS,AUDIT_INDICATORS,AUDIT_FAILURE_STATUSES,AUDIT_CLASSIFIED_STATUSES,auditDateBounds,auditPeriodRange,type AuditPeriod,type AuditIndicator} from '@/lib/auditOverview';
type Counts=Record<AuditIndicator,number|null>;
const icons={all:Activity,success:CheckCircle2,failure:AlertTriangle,other:Clock};
const colors={all:'clinical-tone-blue',success:'clinical-tone-teal',failure:'bg-destructive text-destructive-foreground',other:'clinical-tone-violet'};
const periodLabels={1:'Hoje',7:'7 dias',30:'30 dias'};
const number=new Intl.NumberFormat('pt-BR');
interface Props {unitId:string|null;revision:number;disabled:boolean;onApply:(range:{from:string;to:string},status:string)=>void;activeRange:{from:string;to:string;status:string;hasOtherFilters:boolean}}
export default function AuditOverview({unitId,revision,disabled,onApply,activeRange}:Props){
  const [period,setPeriod]=useState<AuditPeriod>(1);
  const [retry,setRetry]=useState(0);
  const [range,setRange]=useState(()=>auditPeriodRange(1,new Date()));
  const [result,setResult]=useState<{key:string;counts:Counts;time:string}|null>(null);
  useEffect(()=>{setRange(auditPeriodRange(period,new Date()));},[period,revision,retry]);
  const key=JSON.stringify([unitId,period,range.from,range.to,revision,retry]);
  const confirmed=result?.key===key?result:null;
  useEffect(()=>{
    const controller=new AbortController();
    const timeout=setTimeout(async()=>{
      const bounds=auditDateBounds(range.from,range.to);
      const counts=await Promise.all(AUDIT_INDICATORS.map(async ({key:metric})=>{
        try{
          let q=supabase.from('action_logs').select('id',{head:true,count:'exact'}).gte('created_at',bounds.start).lt('created_at',bounds.end);
          if(unitId)q=q.eq('unidade_id',unitId);
          if(metric==='success')q=q.eq('status','sucesso');
          if(metric==='failure')q=q.in('status',AUDIT_FAILURE_STATUSES);
          if(metric==='other')q=q.not('status','in','('+AUDIT_CLASSIFIED_STATUSES.join(',')+')');
          const {error,count}=await q.abortSignal(controller.signal);
          return [metric,error||count===null?null:count] as const;
        }catch{return [metric,null] as const;}
      }));
      if(!controller.signal.aborted)setResult({key,counts:Object.fromEntries(counts) as Counts,time:new Date().toISOString()});
    },300);
    return()=>{clearTimeout(timeout);controller.abort();};
  },[key,unitId,range.from,range.to]);
  const incomplete=!!confirmed&&Object.values(confirmed.counts).some(v=>v===null);
  const inconsistent=!!confirmed&&!incomplete&&confirmed.counts.all!==((confirmed.counts.success??0)+(confirmed.counts.failure??0)+(confirmed.counts.other??0));
  return <section className="clinical-premium p-3 space-y-3 min-w-0" aria-label="Indicadores de auditoria">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h2 className="flex items-center gap-2 font-semibold font-display"><Activity className="h-4 w-4 text-primary"/>Visão geral da auditoria</h2><p className="text-xs text-muted-foreground">Contagens do período e da abrangência autorizada, independentes dos demais filtros da listagem.</p></div>
      <div className="flex flex-wrap gap-1" aria-label="Período dos indicadores">{AUDIT_PERIODS.map(days=><Button type="button" key={days} variant={period===days?'default':'outline'} size="sm" aria-pressed={period===days} disabled={disabled} onClick={()=>{setPeriod(days);setRange(auditPeriodRange(days,new Date()));}}>{periodLabels[days]}</Button>)}</div>
    </div>
    <div className="grid grid-cols-1 min-[360px]:grid-cols-2 xl:grid-cols-4 gap-2">
      {AUDIT_INDICATORS.map(metric=>{
        const Icon=icons[metric.key];const value=confirmed?.counts[metric.key];
        const selected=activeRange.from===range.from&&activeRange.to===range.to&&activeRange.status===metric.filter&&!activeRange.hasOtherFilters;
        return <button key={metric.key} type="button" aria-pressed={selected} disabled={disabled||value==null} onClick={()=>onApply(range,metric.filter)}
          className={'clinical-premium p-2.5 sm:p-3 flex items-center gap-2 text-left min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 '+(selected?'ring-1 ring-primary':'')}>
          <span className={'clinical-dock-icon '+colors[metric.key]}><Icon className="h-4 w-4" aria-hidden="true"/></span>
          <div className="flex-1 min-w-0"><p className="text-xl sm:text-2xl font-bold tabular-nums break-words">{value==null?'—':number.format(value)}</p><p className="text-xs font-medium leading-snug break-words">{metric.label}</p></div><ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true"/>
        </button>;
      })}
    </div>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>{range.from.split('-').reverse().join('/')} a {range.to.split('-').reverse().join('/')} · horário de Oriximiná</span>
      <span>Ao clicar em um indicador, os filtros anteriores da lista são substituídos pelo período e status escolhidos.</span>
      {!confirmed&&<span role="status">Consultando contagens…</span>}
      {confirmed&&<span>Consultado às {new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Santarem',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(confirmed.time))}</span>}
      {incomplete&&<><span role="status">— = contagem não confirmada.</span><Button type="button" size="sm" variant="ghost" onClick={()=>setRetry(n=>n+1)} disabled={disabled}>Tentar novamente</Button></>}
      {inconsistent&&<span role="status">Os totais podem variar entre consultas simultâneas. Atualize para conferir.</span>}
    </div>
  </section>;
}
