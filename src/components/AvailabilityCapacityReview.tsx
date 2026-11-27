import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, RefreshCw, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { reviewDay,reviewBlocks,reviewOccupancy,reviewQuotas,gradeDay,type ReviewGrade,type ReviewBlock } from '@/lib/availabilityReview';

interface Props {
  profissionalId:string;unidadeId:string;inicio:string;fim:string;today:string;scope:string;
  grades:readonly ReviewGrade[];blocks:readonly ReviewBlock[];
  directoryComplete:boolean;blocksReady:boolean;canReadAgenda:boolean;canReadQuotas:boolean;canReadBlocks:boolean;
}
export default function AvailabilityCapacityReview({profissionalId,unidadeId,inicio,fim,today,scope,grades,blocks,directoryComplete,blocksReady,canReadAgenda,canReadQuotas,canReadBlocks}:Props){
  const [date,setDate]=useState(today<inicio?inicio:today>fim?fim:today);
  const [submitted,setSubmitted]=useState('');
  const valid=gradeDay(date)>=0&&date>=inicio&&date<=fim;
  const confirmed=valid&&date===submitted;
  const ready=confirmed&&directoryComplete;
  const q=useQuery({
    queryKey:['availability-review',scope,profissionalId,unidadeId,submitted,canReadAgenda,canReadQuotas],
    enabled:ready&&(canReadAgenda||canReadQuotas),retry:false,staleTime:0,refetchOnWindowFocus:false,
    queryFn:async({signal})=>{
      const [agenda,quota]=await Promise.all([
        canReadAgenda?supabase.from('agendamentos').select('hora,status,origem',{count:'exact'}).eq('profissional_id',profissionalId).eq('unidade_id',unidadeId).eq('data',submitted).limit(1000).abortSignal(signal):Promise.resolve(null),
        canReadQuotas?supabase.from('quotas_externas').select('id,profissional_interno_id,unidade_id,periodo_inicio,periodo_fim,turno,horario_inicio,horario_fim,dia_semana,ativo,vagas_total,vagas_usadas',{count:'exact'}).eq('profissional_interno_id',profissionalId).eq('unidade_id',unidadeId).eq('ativo',true).lte('periodo_inicio',submitted).gte('periodo_fim',submitted).limit(1000).abortSignal(signal):Promise.resolve(null)
      ]);
      const complete=(r:{data:unknown[]|null;count:number|null;error:unknown}|null)=>!!r&&!r.error&&r.data!==null&&r.count===r.data.length;
      return {agenda:agenda&&complete(agenda)?agenda.data:null,quotas:quota&&complete(quota)?(quota.data||[]).map(x=>({...x,ativo:x.ativo===true})):null};
    }
  });
  const day=reviewDay(grades,profissionalId,unidadeId,date);
  const result=ready&&q.isSuccess&&!q.isFetching?q.data:null;
  const occupancy=canReadAgenda&&result?.agenda?reviewOccupancy(result.agenda):null;
  const quotas=canReadQuotas&&result?.quotas?reviewQuotas(result.quotas,day.selected,profissionalId,unidadeId,date):null;
  const applicableBlocks=canReadBlocks&&blocksReady?reviewBlocks(blocks,profissionalId,unidadeId,date,day.selected):null;
  const nominal=ready?day.nominal:null;
  return <section className="clinical-inset rounded-lg border p-3 space-y-3">
    <div className="flex flex-wrap items-center gap-2"><CalendarCheck className="w-4 h-4 text-primary"/><h4 className="text-sm font-semibold flex-1">Conferência de capacidade por data</h4><span className="text-xs text-muted-foreground">Somente consulta</span></div>
    <div className="flex flex-wrap items-end gap-2"><div className="flex-1 min-w-[9rem]"><label className="text-xs font-medium" htmlFor="availability-review-date">Data dentro do período</label><Input id="availability-review-date" type="date" min={inicio} max={fim} value={date} onChange={e=>{setDate(e.target.value);setSubmitted('');}}/></div><Button type="button" size="sm" variant="outline" disabled={!valid||!directoryComplete||q.isFetching} onClick={()=>{if(confirmed){if(canReadAgenda||canReadQuotas)void q.refetch();}else setSubmitted(date);}}><RefreshCw className="w-3.5 h-3.5 mr-1"/>Conferir</Button></div>
    {!directoryComplete&&<p role="alert" className="text-xs text-muted-foreground">Grade não confirmada ou consulta possivelmente incompleta. Atualize a página antes de conferir.</p>}
    {ready&&<>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{[[nominal??'—','Vagas nominais da grade'],[occupancy?.total??'—','Agendamentos que ocupam vaga'],[occupancy?.internal??'—','Origem não externa'],[occupancy?.external??'—','Origem externa']].map(([value,label])=><div key={label} className="clinical-premium p-2 min-w-0"><strong className="block text-lg tabular-nums">{value}</strong><span className="text-xs text-muted-foreground break-words">{label}</span></div>)}</div>
      {q.isFetching&&<p role="status" className="text-xs text-muted-foreground">Consultando registros da data...</p>}
      {canReadAgenda&&!q.isFetching&&!occupancy&&<p role="status" className="text-xs text-muted-foreground">Ocupação não confirmada. Consulte novamente; nenhum zero foi presumido.</p>}
      {!canReadAgenda&&<p className="text-xs text-muted-foreground">Consulta de agendamentos não autorizada para este perfil.</p>}
      {day.selected.length===0&&<p className="text-xs text-muted-foreground">Não há horários cadastrados para este profissional/unidade na data.</p>}
      {day.selected.map(g=><div key={g.id} className="flex flex-wrap justify-between gap-2 border-t pt-1.5 text-xs"><span>{g.horaInicio}–{g.horaFim} · {g.vagasPorHora===0?'Por turno':'Por hora'}</span><span>{g.vagasPorDia} vagas cadastradas{g.vagasPorHora>0?' · '+g.vagasPorHora+'/hora':''}</span></div>)}
      {(day.conflicts>0||day.invalid||day.mixed||day.multipleHour)&&<div role="alert" className="text-xs text-amber-800 dark:text-amber-300 space-y-1"><p className="flex gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0"/>Conferência necessária; total nominal omitido para evitar dupla contagem.</p>{day.conflicts>0&&<p>{day.conflicts} par(es) de horários sobrepostos na grade carregada, inclusive em outras unidades autorizadas.</p>}{day.invalid&&<p>Horários ou quantidades inconsistentes.</p>}{day.mixed&&<p>Modalidades misturadas.</p>}{day.multipleHour&&<p>Mais de uma faixa por hora na mesma data.</p>}</div>}
      <div className="border-t pt-2 space-y-1"><h5 className="text-sm font-medium">Bloqueios registrados</h5>
        {!canReadBlocks||!blocksReady?<p className="text-xs text-muted-foreground">Consulta não autorizada ou não confirmada.</p>:applicableBlocks?.length===0?<p className="text-xs text-muted-foreground">Nenhum bloqueio encontrado na data.</p>:applicableBlocks?.map(b=><p key={b.id} className="text-xs text-muted-foreground">{b.diaInteiro?'Dia inteiro':(b.horaInicio||'00:00')+'–'+(b.horaFim||'23:59')} · {b.profissionalId?'Profissional':b.unidadeId?'Unidade':'Geral'} · {b.overlaps?'Coincide com horário da grade':'Sem interseção com a grade'}</p>)}
      </div>
      <div className="border-t pt-2 space-y-1"><h5 className="text-sm font-medium">Cotas externas</h5>
        {!canReadQuotas||!quotas?<p className="text-xs text-muted-foreground">Consulta não autorizada ou não confirmada.</p>:quotas.length===0?<p className="text-xs text-muted-foreground">Nenhuma cota ativa encontrada para a data.</p>:quotas.map(({quota,classification,matched},i)=><div key={quota.id||i} className="border rounded-md p-2 text-xs"><strong>{classification==='limite_periodo'?'Limite do período':classification==='reserva_data_especifica'&&matched?'Reserva da data vinculada à grade':'Configuração a conferir'}</strong><p>{quota.periodo_inicio} a {quota.periodo_fim} · {quota.turno||'Turno não informado'} {quota.horario_inicio&&quota.horario_fim?quota.horario_inicio+'–'+quota.horario_fim:''}</p><p>{quota.vagas_total} autorizada(s) · {quota.vagas_usadas} utilizada(s) na cota</p>{classification==='reserva_data_especifica'&&!matched&&<p className="text-amber-800 dark:text-amber-300">Não corresponde inequivocamente a uma faixa da grade.</p>}</div>)}
      </div>
      <p className="text-[11px] text-muted-foreground">Consulta pontual dos registros acessíveis. Vagas nominais não descontam bloqueios, nem consideram horários restantes e exceções. Cotas externas têm regras próprias e não são subtraídas automaticamente da recepção. Consulte a Agenda para confirmar os horários efetivamente disponíveis. Nenhuma reserva é criada por esta tela.</p>
    </>}
  </section>;
}
