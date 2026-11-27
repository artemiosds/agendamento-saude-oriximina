import {useMemo,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {CalendarDays,Download,RefreshCw,ShieldCheck} from 'lucide-react';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {holidayCatalog,holidayEligibility,holidayKindLabels,MUNICIPAL_SOURCE,MUNICIPAL_PDF,FEDERAL_SOURCE,STATE_SOURCE,type ExistingHolidayBlock} from '@/lib/holidayCatalog';

export async function fetchHolidayBlocks(year:number,signal?:AbortSignal):Promise<ExistingHolidayBlock[]>{
 if(year!==2026&&year!==2027)throw new Error('Ano não disponível.');
 let query=supabase.from('bloqueios').select('data_inicio,data_fim,dia_inteiro,hora_inicio,hora_fim,unidade_id,profissional_id,titulo,tipo',{count:'exact'}).lte('data_inicio',year+'-12-31').gte('data_fim',year+'-01-01').limit(1000);
 if(signal)query=query.abortSignal(signal);
 const {data,error,count}=await query;
 if(error||!data||count!==data.length)throw new Error('Lista completa de bloqueios não confirmada.');
 return data;
}
const labels={disponivel:'Disponível para seleção',coberto:'Já bloqueado',conferir:'Bloqueio parcial a conferir',passado:'Histórico — somente consulta',provisorio:'Aguardando ato oficial'};
export default function HolidayImportDialog({open,onClose,scope,today,busy,onImport}:{open:boolean;onClose:()=>void;scope:string;today:string;busy:boolean;onImport:(year:number,dates:string[])=>Promise<void>}){
 const [year,setYear]=useState(today.slice(0,4)==='2026'?2026:2027);
 const [selected,setSelected]=useState<string[]>([]);
 const [confirmed,setConfirmed]=useState(false);
 const [kind,setKind]=useState('todos');
 const q=useQuery({queryKey:['holiday-import-preview',scope,year],enabled:open,retry:false,staleTime:0,gcTime:0,refetchOnWindowFocus:false,queryFn:({signal})=>fetchHolidayBlocks(year,signal)});
 const ready=q.isSuccess&&!q.isFetching;
 const rows=useMemo(()=>holidayCatalog(year).map(candidate=>({candidate,status:ready?holidayEligibility(candidate,q.data||[],today):null})),[year,ready,q.data,today]);
 const available=rows.filter(r=>r.status==='disponivel');
 const chosen=available.filter(r=>selected.includes(r.candidate.date));
 const changeYear=(value:number)=>{setYear(value);setSelected([]);setConfirmed(false);setKind('todos');};
 const toggle=(date:string)=>{setSelected(old=>old.includes(date)?old.filter(d=>d!==date):[...old,date]);setConfirmed(false);};
 return <Dialog open={open} onOpenChange={v=>{if(!v&&!busy)onClose();}}>
  <DialogContent className="w-[calc(100vw-1rem)] max-w-4xl max-h-[90dvh] overflow-y-auto gap-3">
   <DialogHeader className="clinical-hub-hero text-left pr-9"><div className="flex items-center gap-3"><span className="clinical-patient-avatar flex items-center justify-center shrink-0"><CalendarDays className="w-5 h-5"/></span><div><p className="clinical-hub-eyebrow">Calendário institucional</p><DialogTitle className="clinical-hub-name">Importar feriados e pontos facultativos</DialogTitle><p className="clinical-patient-sub text-xs">Selecione somente as datas autorizadas para suspensão de novos agendamentos.</p></div></div></DialogHeader>
   <fieldset disabled={busy} className="min-w-0 space-y-3">
    <section className="clinical-premium p-3 space-y-2">
     <div className="flex flex-wrap items-end gap-2"><label className="flex-1 text-xs font-medium space-y-1">Ano de referência<select className="block w-full rounded-md border border-input bg-background p-2 text-sm" value={year} onChange={e=>changeYear(Number(e.target.value))}><option value={2026}>2026 · Decreto municipal publicado</option><option value={2027}>2027 · Referência parcial</option></select></label><Button type="button" size="sm" variant="outline" disabled={q.isFetching||busy} onClick={()=>{setSelected([]);setConfirmed(false);void q.refetch();}}><RefreshCw className="w-4 h-4 mr-1"/>Atualizar conferência</Button></div>
     <p className="text-xs text-muted-foreground">{year===2026?'Referência: Decreto Municipal nº 510/2025, edição 77 de 06/01/2026.':'Datas fixas de lei e previsões de calendário. Ato anual de Oriximiná para 2027 não confirmado; datas móveis locais não foram presumidas. Previsões não são importáveis nesta versão.'} Fontes conferidas em 27/11/2026; alterações posteriores precisam de conferência administrativa.</p>
     <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs"><a className="underline text-primary" href={MUNICIPAL_SOURCE} target="_blank" rel="noreferrer">Diário Oficial de Oriximiná</a><a className="underline text-primary" href={MUNICIPAL_PDF} target="_blank" rel="noreferrer">Decreto 510/2025</a><a className="underline text-primary" href={FEDERAL_SOURCE} target="_blank" rel="noreferrer">Lei federal 662/1949</a><a className="underline text-primary" href={STATE_SOURCE} target="_blank" rel="noreferrer">Referência estadual 2026</a></div>
     <p className="text-xs font-medium">Serviços essenciais e plantões devem ser mantidos. O calendário não substitui autorização da gestão de saúde.</p>
    </section>
    <section className="clinical-premium p-3 space-y-2">
     <div className="grid grid-cols-3 gap-2">{[[rows.length,'Datas de referência'],[ready?rows.filter(r=>r.status==='coberto').length:'—','Já bloqueadas'],[ready?chosen.length:'—','Selecionadas']].map(([v,l])=><div className="clinical-inset rounded-md border p-2 min-w-0" key={l}><strong className="block text-lg tabular-nums">{v}</strong><span className="text-xs text-muted-foreground">{l}</span></div>)}</div>
     {!ready&&<p role={q.isError?'alert':'status'} className="text-xs text-muted-foreground">{q.isError?'Não foi possível confirmar todos os bloqueios. Atualize a conferência; importação indisponível.':'Conferindo registros do ano...'}</p>}
     <label className="block text-xs font-medium">Categoria<select className="block w-full rounded-md border border-input bg-background p-2 text-sm" value={kind} onChange={e=>setKind(e.target.value)}><option value="todos">Todas</option>{Object.entries(holidayKindLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
     <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={!ready||busy} onClick={()=>{setSelected(available.filter(r=>r.candidate.kind==='nacional'&&r.candidate.fullDay).map(r=>r.candidate.date));setConfirmed(false);}}>Selecionar nacionais disponíveis</Button><Button type="button" size="sm" variant="ghost" onClick={()=>{setSelected([]);setConfirmed(false);}}>Limpar seleção</Button></div>
     <div className="max-h-[42vh] overflow-y-auto divide-y rounded-lg border">
      {rows.filter(r=>kind==='todos'||r.candidate.kind===kind).map(({candidate:c,status})=><label key={c.date} className="flex items-start gap-2 p-2.5 text-sm"><input className="mt-1" type="checkbox" checked={status==='disponivel'&&selected.includes(c.date)} disabled={busy||status!=='disponivel'} onChange={()=>toggle(c.date)}/><span className="flex-1 min-w-0"><strong className="block break-words">{c.date.split('-').reverse().join('/')} · {c.title}</strong><span className="block text-xs text-muted-foreground">{holidayKindLabels[c.kind]} · {c.fullDay?(c.verified?'Dia inteiro':'Horário a confirmar'):c.start+'–'+c.end} · {c.source}</span>{c.note&&<span className="block text-xs text-muted-foreground">{c.note}</span>}{!c.verified&&<span className="block text-xs text-amber-800 dark:text-amber-300">Referência não confirmada para importação.</span>}</span><span className="text-xs text-muted-foreground text-right max-w-[8rem]">{status?labels[status]:'A conferir'}</span></label>)}
     </div>
     <p className="text-xs text-muted-foreground">Datas anteriores a hoje ficam somente em consulta. Bloqueios globais existentes são preservados, independentemente do motivo. Bloqueios parciais que não cobrem a proposta exigem conferência manual. Não são alterados registros de unidade ou profissional.</p>
    </section>
    <section className="clinical-premium p-3 space-y-2">
     <h3 className="triage-section-title"><ShieldCheck className="w-4 h-4"/>Confirmação administrativa</h3>
     <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmed} disabled={busy||!ready||!chosen.length} onChange={e=>setConfirmed(e.target.checked)}/><span>Confirmei as datas selecionadas e a autorização para bloquear novos agendamentos em todas as unidades, preservando os serviços essenciais. Os pacientes já agendados não serão cancelados.</span></label>
     <Button type="button" className="w-full gradient-primary text-primary-foreground" disabled={busy||!ready||!confirmed||!chosen.length||chosen.length!==selected.length} onClick={()=>void onImport(year,chosen.map(r=>r.candidate.date))}><Download className="w-4 h-4 mr-1"/>{busy?'Importando…':'Importar '+chosen.length+' data(s) selecionada(s)'}</Button>
    </section>
   </fieldset>
  </DialogContent>
 </Dialog>;
}
