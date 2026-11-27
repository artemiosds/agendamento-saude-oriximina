import {useEffect,useMemo,useState} from 'react';
import {History,ChevronRight,RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {supabase} from '@/integrations/supabase/client';
import {getAuditActorLabel} from '@/lib/auditActor';
import {redactAuditData} from '@/lib/auditSecurity';
import {auditTimelineQuery,AUDIT_TIMELINE_LIMIT} from '@/lib/auditInvestigation';

export type TimelineEvent={id:string;entidade:string;entidade_id:string;created_at:string;acao:string;acao_legivel:string|null;modulo:string;status:string;user_nome:string;user_id:string;origem:string|null;role:string;unidade_id:string;unidade_nome:string|null;paciente_id:string|null;agendamento_id:string|null;prontuario_id:string|null;documento_id:string|null;profissional_id:string|null};
type Anchor=Parameters<typeof auditTimelineQuery>[0];
interface Props {event:Anchor;unitId:string|null;onOpen:(event:TimelineEvent)=>void;actionLabel:(action:string)=>string}
export default function AuditRelatedTimeline({event,unitId,onOpen,actionLabel}:Props){
  const query=auditTimelineQuery(event);
  const expression=query?.expression;
  const from=query?.from;
  const to=query?.to;
  const [revision,setRevision]=useState(0);
  const [result,setResult]=useState<{key:string;rows:TimelineEvent[];more:boolean;failed:boolean}|null>(null);
  const key=JSON.stringify([event.id,unitId,expression,from,to,revision]);
  const current=result?.key===key?result:null;
  const loading=revision>0&&!current;
  useEffect(()=>{
    if(!revision||!expression||!from||!to)return;
    const controller=new AbortController();
    void(async()=>{
      try{
        let q=supabase.from('action_logs').select('id,entidade,entidade_id,created_at,acao,acao_legivel,modulo,status,user_nome,user_id,origem,role,unidade_id,unidade_nome,paciente_id,agendamento_id,prontuario_id,documento_id,profissional_id')
          .neq('id',event.id).gte('created_at',from).lte('created_at',to).or(expression);
        if(unitId)q=q.eq('unidade_id',unitId);
        const {data,error}=await q.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(AUDIT_TIMELINE_LIMIT+1).abortSignal(controller.signal);
        if(controller.signal.aborted)return;
        if(error||!data)throw Error('consulta');
        setResult({key,rows:data.slice(0,AUDIT_TIMELINE_LIMIT).map(row=>redactAuditData(row) as TimelineEvent),more:data.length>AUDIT_TIMELINE_LIMIT,failed:false});
      }catch{if(!controller.signal.aborted)setResult({key,rows:[],more:false,failed:true});}
    })();
    return()=>controller.abort();
  },[key,revision,expression,from,to,event.id,unitId]);
  const dateFormat=useMemo(()=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Santarem',dateStyle:'short',timeStyle:'medium'}),[]);
  return <section className="space-y-3 rounded-xl border border-border p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 font-semibold text-sm"><History className="w-4 h-4 text-primary"/>Eventos relacionados</h3>
      {query&&<Button size="sm" variant="outline" disabled={loading} onClick={()=>setRevision(n=>n+1)}><RefreshCw className="h-4 w-4 mr-1"/>{loading?'Consultando…':revision?'Atualizar':'Consultar histórico'}</Button>}
    </div>
    {!query?<p className="text-xs text-muted-foreground">Não há identificador de entidade compatível e confirmado no evento. Não são feitas associações por nome ou proximidade de horário.</p>:<>
      <p className="text-xs text-muted-foreground">{query.label} · 7 dias antes e 7 dias depois do evento · {unitId?'unidade autorizada':'rede municipal autorizada'}. São vínculos registrados, não prova de causalidade. Até 20 eventos mais recentes.</p>
      {loading&&<p role="status" className="text-sm text-muted-foreground">Consultando vínculos registrados…</p>}
      {current?.failed&&<p role="alert" className="text-sm text-muted-foreground">Não foi possível confirmar o histórico. Tente novamente.</p>}
      {current&&!current.failed&&!current.rows.length&&<p className="text-sm text-muted-foreground">Nenhum outro evento encontrado nesse recorte.</p>}
      {!!current?.rows.length&&<ol className="divide-y divide-border">{current.rows.map(row=><li key={row.id}>
        <button type="button" onClick={()=>onOpen(row)} className="w-full text-left flex items-start gap-2 py-3 px-1 rounded-md hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex-1 min-w-0 space-y-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground tabular-nums">{Number.isFinite(Date.parse(row.created_at))?dateFormat.format(new Date(row.created_at)):'Horário não confirmado'}</span><Badge variant="outline" className="text-[10px]">{row.status||'Não informado'}</Badge></div>
            <p className="text-sm font-medium break-words">{row.acao_legivel||actionLabel(row.acao)}</p><p className="text-xs text-muted-foreground break-words">{getAuditActorLabel(row)} · {row.modulo}</p></div><ChevronRight className="h-4 w-4 mt-1 shrink-0 text-muted-foreground"/>
        </button></li>)}</ol>}
      {current?.more&&<p role="status" className="text-xs text-muted-foreground">Existem mais eventos nesse período. O histórico acima é parcial; use os filtros da auditoria para ampliar a investigação.</p>}
    </>}
  </section>;
}
