import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {supabase} from '@/integrations/supabase/client';
import BlockAppointmentReview from '@/components/BlockAppointmentReview';
import {blockDraftDays,validBlockDraft,type BlockDraft} from '@/lib/blockDraft';
import {validBlockDate} from '@/lib/blockDirectory';

const timeValid=(v:string)=>/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(v);
export function availabilityImpact(d:BlockDraft,rows:readonly {data_inicio:string;data_fim:string;dias_semana:number[];hora_inicio:string;hora_fim:string}[]){
 let matching=0,unknown=0;
 for(const r of rows){
  if(!validBlockDate(r.data_inicio)||!validBlockDate(r.data_fim)||r.data_inicio>r.data_fim||!Array.isArray(r.dias_semana)||!r.dias_semana.length||r.dias_semana.some(x=>!Number.isInteger(x)||x<0||x>6)){unknown++;continue;}
  const start=r.data_inicio>d.dataInicio?r.data_inicio:d.dataInicio,end=r.data_fim<d.dataFim?r.data_fim:d.dataFim;
  if(start>end)continue;
  const date=new Date(start+'T12:00:00Z');
  let day=false;
  for(let i=0;i<7&&date.toISOString().slice(0,10)<=end;i++,date.setUTCDate(date.getUTCDate()+1)){if(r.dias_semana.includes(date.getUTCDay())){day=true;break;}}
  if(!day)continue;
  if(!timeValid(r.hora_inicio)||!timeValid(r.hora_fim)||r.hora_inicio.slice(0,5)>=r.hora_fim.slice(0,5)){unknown++;continue;}
  if(d.diaInteiro||r.hora_inicio.slice(0,5)<d.horaFim&&d.horaInicio<r.hora_fim.slice(0,5))matching++;
 }
 return {matching,unknown};
}
export default function BlockOperationalReview({draft,scope,localUnit,canAgenda,canTreatment,canAvailability}:{draft:BlockDraft;scope:string;localUnit:string|null;canAgenda:boolean;canTreatment:boolean;canAvailability:boolean}){
 const [requested,setRequested]=useState(false);
 const days=blockDraftDays(draft.dataInicio,draft.dataFim);
 const eligible=validBlockDraft(draft)&&days!==null&&days<=366&&(localUnit===null||!!localUnit&&(draft.scope!=='unidade'||draft.unidadeId===localUnit));
 // Global blocks are scoped to the user's unit in local previews.
 const localDraft:BlockDraft=localUnit!==null&&draft.scope==='global'?{...draft,scope:'unidade',unidadeId:localUnit}:draft;
 const sessions=useQuery({queryKey:['block-session-impact',scope,localUnit,draft],enabled:eligible&&requested&&canTreatment,retry:false,gcTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false,queryFn:async({signal})=>{
  let q=supabase.from('treatment_sessions').select('scheduled_date,status,treatment_cycles!inner(unit_id)',{count:'exact',head:true}).gte('scheduled_date',draft.dataInicio).lte('scheduled_date',draft.dataFim).in('status',['agendada','pendente_agendamento']);
  if(draft.scope==='profissional')q=q.eq('professional_id',draft.profissionalId);
  const unit=localUnit??(draft.scope==='unidade'?draft.unidadeId:null);
  if(unit)q=q.eq('treatment_cycles.unit_id',unit);
  const r=await q.abortSignal(signal);if(r.error||r.count===null)throw new Error('Consulta não confirmada');return r.count;
 }});
 const availability=useQuery({queryKey:['block-availability-impact',scope,localUnit,draft],enabled:eligible&&requested&&canAvailability,retry:false,gcTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false,queryFn:async({signal})=>{
  let q=supabase.from('disponibilidades').select('data_inicio,data_fim,dias_semana,hora_inicio,hora_fim',{count:'exact'}).lte('data_inicio',draft.dataFim).gte('data_fim',draft.dataInicio);
  if(draft.scope==='profissional')q=q.eq('profissional_id',draft.profissionalId);
  const unit=localUnit??(draft.scope==='unidade'?draft.unidadeId:null);if(unit)q=q.eq('unidade_id',unit);
  const r=await q.limit(1000).abortSignal(signal);if(r.error||!r.data||r.count!==r.data.length)throw new Error('Consulta incompleta');return availabilityImpact(draft,r.data);
 }});
 return <section className="space-y-3">
 <p className="text-xs text-muted-foreground">Consulta pontual dos registros acessíveis. {localUnit!==null?'Restrita à unidade do usuário. ':''}Não altera registros e não representa vagas perdidas.</p>
 <BlockAppointmentReview draft={localDraft} scope={scope} localUnit={localUnit} canRead={canAgenda&&eligible}/>
 <Button type="button" variant="outline" size="sm" disabled={!eligible||(!canTreatment&&!canAvailability)||sessions.isFetching||availability.isFetching} onClick={()=>{if(requested){if(canTreatment)void sessions.refetch();if(canAvailability)void availability.refetch();}else setRequested(true);}}>Conferir tratamentos e disponibilidade</Button>
 {!eligible&&<p className="text-xs text-muted-foreground">Período ou horário inválido, ou superior a 366 dias.</p>}
 <div className="grid sm:grid-cols-2 gap-2">
 <div className="border rounded-lg p-3"><h3 className="text-sm font-semibold">Sessões previstas no período</h3><p className="text-lg font-semibold">{!canTreatment?'—':sessions.isFetching?'…':requested&&eligible&&sessions.isSuccess?sessions.data:'—'}</p><p className="text-xs text-muted-foreground">{!canTreatment?'Sem permissão':sessions.isError?'Consulta não confirmada':'Agendadas e pendentes com data registrada; não confirma conflito de horário nem reserva. Pode incluir sessões já contadas na Agenda.'}</p></div>
 <div className="border rounded-lg p-3"><h3 className="text-sm font-semibold">Grades com interseção</h3><p className="text-lg font-semibold">{!canAvailability?'—':availability.isFetching?'…':requested&&eligible&&availability.isSuccess?availability.data.matching:'—'}</p><p className="text-xs text-muted-foreground">{!canAvailability?'Sem permissão':availability.isError?'Consulta incompleta ou não confirmada':'Registros de disponibilidade com interseção de data, dia da semana e horário; não representa vagas.'}</p>{canAvailability&&requested&&eligible&&!availability.isFetching&&availability.isSuccess&&availability.data.unknown>0&&<p className="text-xs">{availability.data.unknown} registro(s) a conferir.</p>}</div>
 </div></section>;
}
