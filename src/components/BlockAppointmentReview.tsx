import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {CalendarCheck,RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {supabase} from '@/integrations/supabase/client';
import {STATUS_LIBERA_VAGA} from '@/lib/appointmentCapacity';
import {blockDraftDays,reviewBlockAppointments,validBlockDraft,type BlockDraft} from '@/lib/blockDraft';

export default function BlockAppointmentReview({draft,scope,localUnit,canRead}:{draft:BlockDraft;scope:string;localUnit:string|null;canRead:boolean}){
 const [requested,setRequested]=useState(false);
 const days=blockDraftDays(draft.dataInicio,draft.dataFim);
 const eligible=canRead&&validBlockDraft(draft)&&days!==null&&days<=366&&(localUnit===null||!!localUnit&&draft.scope!=='global'&&(draft.scope!=='unidade'||draft.unidadeId===localUnit));
 const q=useQuery({
  queryKey:['block-impact-preview',scope,localUnit,draft],
  enabled:eligible&&requested,retry:false,staleTime:0,gcTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false,
  queryFn:async({signal})=>{
   let query=supabase.from('agendamentos').select(draft.diaInteiro?'hora':'hora,status',{count:'exact',head:draft.diaInteiro}).gte('data',draft.dataInicio).lte('data',draft.dataFim).not('status','in','('+[...STATUS_LIBERA_VAGA].join(',')+')');
   if(draft.scope==='profissional')query=query.eq('profissional_id',draft.profissionalId);
   if(draft.scope==='unidade')query=query.eq('unidade_id',draft.unidadeId);
   else if(localUnit!==null)query=query.eq('unidade_id',localUnit);
   const r=await query.limit(1000).abortSignal(signal);
   if(r.error||r.count===null)throw new Error('Consulta não confirmada.');
   if(draft.diaInteiro)return {matching:r.count,unknown:0,limited:false};
   // A partial result cannot establish an exact impact. No patient identifiers are fetched.
   if(!r.data||r.count!==r.data.length)return {matching:null,unknown:null,limited:true};
   const rows=r.data as unknown as {hora:string;status:string}[];
   return {...reviewBlockAppointments(draft,rows),limited:false};
  }
 });
 const result=eligible&&requested&&q.isSuccess&&!q.isFetching?q.data:null;
 return <div className="clinical-inset border rounded-lg p-3 space-y-2">
  <div className="flex flex-wrap gap-2 items-center"><CalendarCheck className="w-4 h-4 text-primary"/><h4 className="text-sm font-semibold flex-1">Conferência dos agendamentos existentes</h4><Button type="button" size="sm" variant="outline" disabled={!eligible||q.isFetching} onClick={()=>{if(requested)void q.refetch();else setRequested(true);}}><RefreshCw className="w-3.5 h-3.5 mr-1"/>Conferir</Button></div>
  {!canRead?<p className="text-xs text-muted-foreground">Consulta da Agenda não autorizada para este perfil.</p>:days!==null&&days>366?<p className="text-xs text-muted-foreground">Prévia disponível para períodos de até 366 dias. A regra de cadastro não foi alterada.</p>:!eligible?<p className="text-xs text-muted-foreground">Preencha período, horários e abrangência válidos.</p>:!requested?<p className="text-xs text-muted-foreground">Clique em Conferir para consultar os registros da seleção antes de salvar.</p>:q.isFetching?<p role="status" className="text-xs text-muted-foreground">Consultando a Agenda...</p>:q.isError||!result?<p role="alert" className="text-xs text-amber-800 dark:text-amber-300">Consulta não confirmada. Tente novamente; nenhum zero foi presumido.</p>:result.limited?<p role="alert" className="text-xs text-amber-800 dark:text-amber-300">Há mais registros que o limite da consulta parcial. Confira na Agenda ou reduza o período da prévia. Total não confirmado.</p>:<div role="status" className="space-y-1"><p className="text-sm font-medium">{result.matching} agendamento(s) que ocupam vaga {draft.diaInteiro?'no período':'com horário inicial dentro da faixa'}</p>{!!result.unknown&&<p className="text-xs text-amber-800 dark:text-amber-300">{result.unknown} registro(s) sem horário reconhecido; confira na Agenda.</p>}{!!result.matching&&<p className="text-xs text-amber-800 dark:text-amber-300">Existem agendamentos na seleção. Eles não serão cancelados ou remarcados pelo bloqueio.</p>}<p className="text-[11px] text-muted-foreground">Consulta pontual às {new Date(q.dataUpdatedAt).toLocaleTimeString('pt-BR',{timeZone:'America/Santarem',hour:'2-digit',minute:'2-digit'})}.</p></div>}
  <p className="text-[11px] text-muted-foreground">Somente registros acessíveis, sem nomes de pacientes. Exclui faltas e cancelamentos conforme a regra de ocupação existente. {localUnit!==null&&draft.scope==='profissional'?'A prévia local não abrange outras unidades onde o profissional atende. ':''}Não inclui sessões sem agendamento nem confirma vagas livres. Novos registros podem surgir após a conferência.</p>
 </div>;
}
