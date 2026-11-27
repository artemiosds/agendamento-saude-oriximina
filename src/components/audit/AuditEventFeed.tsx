import {useMemo} from 'react';
import {Activity,AlertCircle,ArrowUpRight,Building2,CalendarDays,CheckCircle2,Clock,Database,FileText,Lock,Monitor,UserRound} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {auditFeedDate,auditFeedTone,groupAuditFeed} from '@/lib/auditEventFeed';

export type AuditFeedEvent={id:string;createdAt:string;action:string;module:string;status:string;actor:string;role:string;entity:string;entityType:string;entitySubtitle:string;unit:string;device:string;summary:string;error:string;fields:string[]};
const tones={
  success:{Icon:CheckCircle2,rail:'!border-l-emerald-500',mark:'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'},
  failure:{Icon:AlertCircle,rail:'!border-l-red-500',mark:'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'},
  pending:{Icon:Clock,rail:'!border-l-amber-500',mark:'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'},
  blocked:{Icon:Lock,rail:'!border-l-slate-500',mark:'bg-muted text-foreground'},
  neutral:{Icon:Activity,rail:'!border-l-border',mark:'bg-muted text-muted-foreground'}
};
function DataCell({Icon,label,value,secondary}:{Icon:typeof UserRound;label:string;value:string;secondary?:string}){
  return <div className="flex min-w-0 items-start gap-2.5">
    <span className="clinical-dock-icon clinical-tone-neutral"><Icon className="h-4 w-4" aria-hidden="true"/></span>
    <div className="min-w-0 flex-1"><p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">{label}</p><p className="text-sm font-medium leading-snug break-words">{value||'Não registrado'}</p>{secondary&&<p className="mt-0.5 text-xs text-muted-foreground break-words leading-snug">{secondary}</p>}</div>
  </div>;
}
export default function AuditEventFeed({events,onOpen}:{events:AuditFeedEvent[];onOpen:(id:string)=>void}){
  const groups=useMemo(()=>groupAuditFeed(events),[events]);
  return <div className="space-y-3 p-2.5 sm:p-3">
    {groups.map((group,index)=><section key={group.key+':'+index} aria-label={group.label} className="space-y-2.5">
      <div className="clinical-date-divider flex flex-wrap items-center gap-2 px-1"><span className="clinical-dock-icon clinical-tone-teal"><CalendarDays className="h-4 w-4" aria-hidden="true"/></span><h3 className="text-sm font-semibold capitalize">{group.label}</h3><span className="text-xs text-muted-foreground">· {group.rows.length} nesta página</span></div>
      <div className="space-y-2">
        {group.rows.map(event=>{
          const tone=tones[auditFeedTone(event.status)],StatusIcon=tone.Icon;
          const status=event.status||'Não informado';
          return <article key={event.id} className={'clinical-premium min-w-0 overflow-hidden !border-l-4 '+tone.rail}>
            <div className="grid grid-cols-1 lg:grid-cols-[98px_minmax(0,1fr)]">
              <div className="clinical-inset flex items-center flex-wrap gap-2 border-b px-3 py-2 lg:flex-col lg:items-start lg:justify-start lg:border-b-0 lg:border-r lg:p-2.5">
                <div className="flex items-center gap-1.5 text-primary"><Clock className="h-3.5 w-3.5" aria-hidden="true"/><time className="clinical-record-time tabular-nums">{auditFeedDate(event.createdAt).time}</time></div>
                <span className={'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide '+tone.mark}><StatusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true"/><span className="break-all">{status}</span></span>
              </div>
              <div className="min-w-0 p-2.5 sm:px-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><h4 className="text-sm sm:text-[15px] font-bold leading-snug break-words">{event.action||'Ação não registrada'}</h4><span className="clinical-record-type inline-flex items-center gap-1 rounded-md clinical-inset border px-2 py-0.5 text-[11px] font-semibold"><Database className="h-3 w-3" aria-hidden="true"/>{event.module||'Módulo não registrado'}</span></div>
                    {event.summary&&<p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2 break-words">{event.summary}</p>}
                  </div>
                  <Button type="button" size="sm" variant="outline" className="clinical-record-action clinical-action-main shrink-0 h-8 gap-1" aria-label={'Investigar evento: '+event.action} onClick={()=>onOpen(event.id)}><span className="hidden sm:inline">Investigar</span><ArrowUpRight className="h-4 w-4" aria-hidden="true"/></Button>
                </div>
                <div className="clinical-inset mt-2 grid grid-cols-1 gap-2.5 rounded-lg border p-2 sm:grid-cols-2 xl:grid-cols-3">
                  <DataCell Icon={UserRound} label="Responsável" value={event.actor} secondary={event.role}/>
                  <DataCell Icon={FileText} label="Registro afetado" value={event.entity} secondary={[event.entityType,event.entitySubtitle].filter(Boolean).join(' · ')}/>
                  <DataCell Icon={Building2} label="Unidade registrada" value={event.unit}/>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                  <span className="inline-flex min-w-0 items-center gap-1.5"><Monitor className="h-3.5 w-3.5 shrink-0" aria-hidden="true"/><span className="break-words">{event.device==='-'?'Dispositivo não registrado':event.device}</span></span>
                  {event.fields.length>0&&<span className="inline-flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 shrink-0" aria-hidden="true"/>{event.fields.length} {event.fields.length===1?'campo informado':'campos informados'}</span>}
                  {event.fields.slice(0,3).map((field,i)=><span key={i} className="rounded border border-border px-1.5 py-0.5 break-all">{field}</span>)}
                  {event.fields.length>3&&<span>+{event.fields.length-3}</span>}
                </div>
                {event.error&&<div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-2.5 py-2 text-xs text-destructive"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true"/><div className="min-w-0"><span className="font-semibold">Erro registrado: </span><span className="break-words line-clamp-2">{event.error}</span></div></div>}
              </div>
            </div>
          </article>;
        })}
      </div>
    </section>)}
  </div>;
}
