import {useLayoutEffect,useMemo,useRef,useState} from 'react';
import {CalendarDays,Printer,ChevronRight,ShieldCheck,AlertTriangle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {cn} from '@/lib/utils';
import {toast} from 'sonner';
import {buildAvailabilityWeek,buildAvailabilityProfilePrint,profileEscape,profileDate,PROFILE_DAY_NAMES,type ProfileGrade,type ProfileLabel} from '@/lib/availabilityProfile';
import {gradePeriod,type GradePeriod} from '@/lib/availabilityDirectory';
import {buildDocumentShell,loadDocumentConfig,printViaIframe} from '@/lib/printLayout';

type ProfilePerson={id:string;nome:string;profissao?:string;cargo?:string;ativo:boolean;tipoConselho?:string;numeroConselho?:string;ufConselho?:string};
type ProfileUnit=ProfileLabel&{endereco?:string};
interface Props{
  person?:ProfilePerson;groups:readonly [string,ProfileGrade[]][];units:readonly ProfileUnit[];rooms:readonly ProfileLabel[];turns:readonly ProfileLabel[];
  today:string;scope:string;complete:boolean;canPrint:boolean;emittedBy:string;
  onShowPeriod:(period:GradePeriod)=>void;
}
const labels:Record<GradePeriod,string>={vigente:'Vigente',futuro:'Futuro',encerrado:'Encerrado',invalido:'A conferir'};
export default function AvailabilityProfessionalProfile({person,groups,units,rooms,turns,today,scope,complete,canPrint,emittedBy,onShowPeriod}:Props){
  const [selected,setSelected]=useState('');
  const [day,setDay]=useState<number|null>(null);
  const [printing,setPrinting]=useState(false);
  const busy=useRef(false);
  const chosen=groups.find(([key])=>key===selected)||groups.find(([,rows])=>gradePeriod(rows[0].dataInicio,rows[0].dataFim,today)==='vigente')||groups[0];
  const first=chosen?.[1][0];
  const unit=units.find(u=>u.id===first?.unidadeId);
  const week=useMemo(()=>chosen?buildAvailabilityWeek(chosen[1],rooms,turns,today):null,[chosen,rooms,turns,today]);
  const counts=useMemo(()=>{const n={vigente:0,futuro:0,encerrado:0,invalido:0};for(const [,rows] of groups)n[gradePeriod(rows[0].dataInicio,rows[0].dataFim,today)]++;return n;},[groups,today]);
  const allowed=!!(canPrint&&complete&&person&&unit&&first&&week?.valid&&week.blocks>0&&first.profissionalId===person.id);
  const signature=JSON.stringify([scope,chosen?.[0],chosen?.[1],person?.id,person?.nome,person?.profissao,person?.cargo,person?.tipoConselho,person?.numeroConselho,person?.ufConselho,unit,week,emittedBy]);
  const guard=useRef({allowed,signature});
  useLayoutEffect(()=>{guard.current={allowed,signature};return()=>{guard.current.allowed=false;};},[allowed,signature]);
  const registration=[person?.tipoConselho,person?.numeroConselho,person?.ufConselho].filter(Boolean).join(' / ');
  const print=async()=>{
    if(!allowed||busy.current||!week||!first||!person||!unit)return;
    busy.current=true;setPrinting(true);
    try{
      const body=buildAvailabilityProfilePrint({week,name:person.nome,profession:person.profissao||person.cargo||'Profissão não informada',registration,unit:unit.nome,start:first.dataInicio,end:first.dataFim,status:labels[week.period],emittedBy});
      const config=await loadDocumentConfig();
      if(!guard.current.allowed||guard.current.signature!==signature)return;
      // Do not inherit the logged-in unit's logo or footer for a different selected unit.
      const scopedConfig={...config,linha1:profileEscape(config.linha1),logoEsquerda:profileEscape(config.logoEsquerda||''),rodapeTexto:profileEscape(config.rodapeTexto||''),linha2:profileEscape(unit.nome),linha3:'',linha4:'',rodapeEndereco:profileEscape(unit.endereco||''),logosConfig:{...config.logosConfig,central:{...config.logosConfig.central,ativo:false},direita:{...config.logosConfig.direita,ativo:false}}};
      const html=buildDocumentShell('Ficha de Disponibilidade Profissional',body,scopedConfig,{Finalidade:'Consulta administrativa · grade semanal cadastrada'});
      if(html.length>8*1024*1024)throw new Error('Ficha muito extensa.');
      printViaIframe(html);
    }catch{toast.error('Não foi possível preparar a ficha de disponibilidade.');}
    finally{busy.current=false;setPrinting(false);}
  };
  const selectedDay=week?.days.find(d=>d.day===day);
  return <section className="clinical-premium p-3 space-y-3 min-w-0" aria-label="Perfil e grade semanal de disponibilidade">
    <div className="flex flex-wrap items-center gap-2"><span className="clinical-dock-icon clinical-tone-teal shrink-0"><CalendarDays className="w-4 h-4"/></span><div className="flex-1 min-w-0"><h3 className="text-sm font-semibold">Perfil de disponibilidade</h3><p className="text-xs text-muted-foreground">{person?(person.ativo?'Cadastro ativo':'Cadastro inativo')+(registration?' · '+registration:''):'Cadastro não localizado'} · Períodos na seleção</p></div>{canPrint&&<Button type="button" variant="outline" size="sm" className="clinical-record-action gap-1.5" disabled={!allowed||printing} onClick={()=>void print()}><Printer className="w-4 h-4"/>{printing?'Preparando…':'Imprimir ficha (A4)'}</Button>}</div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{(['vigente','futuro','encerrado','invalido'] as const).map(period=><button type="button" key={period} className="clinical-inset border rounded-lg p-2 text-left focus-visible:ring-2 focus-visible:ring-ring flex items-center gap-1" onClick={()=>{const target=groups.find(([,rows])=>gradePeriod(rows[0].dataInicio,rows[0].dataFim,today)===period);if(target){setSelected(target[0]);setDay(null);}onShowPeriod(period);}}><span className="flex-1 min-w-0"><strong className="block text-xl tabular-nums">{counts[period]}</strong><span className="text-xs text-muted-foreground">{labels[period]}</span></span><ChevronRight className="w-3 h-3 text-muted-foreground shrink-0"/></button>)}</div>
    {!complete&&<p role="alert" className="text-xs text-amber-800 dark:text-amber-300">Consulta possivelmente incompleta. A ficha fica indisponível até a conferência dos dados.</p>}
    {!chosen||!week||!first?<p className="text-sm text-muted-foreground">Nenhum período cadastrado nesta seleção.</p>:<>
      <label className="block space-y-1 text-xs font-medium"><span>Período para visualizar e imprimir</span><select className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm" value={chosen[0]} onChange={e=>{setSelected(e.target.value);setDay(null);}} disabled={printing}>{groups.map(([key,rows])=>{const r=rows[0];return <option key={key} value={key}>{profileDate(r.dataInicio)} a {profileDate(r.dataFim)} · {units.find(u=>u.id===r.unidadeId)?.nome||'Unidade não localizada'} · {labels[gradePeriod(r.dataInicio,r.dataFim,today)]}</option>;})}</select></label>
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{labels[week.period]}</Badge><Badge variant="outline">{week.mode==='turno'?'Por turno':week.mode==='hora'?'Por hora':'Modalidades misturadas'}</Badge><span className="text-xs text-muted-foreground break-words">{unit?.nome||'Unidade não localizada'}</span></div>
      <div className="grid grid-cols-3 gap-2">{[[week.configuredDays+'/7','Dias configurados'],[week.blocks,'Faixas semanais'],[week.nominal??'—','Vagas nominais/semana']].map(([value,label])=><div key={label} className="clinical-inset border rounded-md p-2 min-w-0"><strong className="block text-lg tabular-nums">{value}</strong><span className="text-xs text-muted-foreground break-words">{label}</span></div>)}</div>
      {(!week.valid||week.alerts)&&<p role="alert" className="flex gap-1 text-xs text-amber-800 dark:text-amber-300"><AlertTriangle className="w-4 h-4 shrink-0"/>{!week.valid?'Período ou registros inconsistentes. Ficha indisponível até conferência.':'Há horários sobrepostos ou configuração ambígua. Total nominal omitido; confira os registros.'}</p>}
      <h4 className="text-sm font-semibold">Grade semanal cadastrada</h4>
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-1.5">{week.days.map(d=><button type="button" key={d.day} aria-pressed={day===d.day} onClick={()=>setDay(day===d.day?null:d.day)} className={cn('clinical-inset rounded-lg border text-left p-2 min-w-0 flex flex-col gap-1 focus-visible:ring-2 focus-visible:ring-ring',day===d.day&&'ring-1 ring-primary',d.conflict&&'border-destructive')}><span className="font-semibold text-xs">{PROFILE_DAY_NAMES[d.day]}</span>{d.blocks.length?d.blocks.slice(0,2).map(b=><span key={b.id} className="rounded-md bg-primary/10 text-primary p-1 text-[11px] break-words">{b.start.slice(0,5)}–{b.end.slice(0,5)}<span className="block">{b.nominal} vagas</span></span>):<span className="text-xs text-muted-foreground">Sem horário</span>}{d.blocks.length>2&&<span className="text-xs text-muted-foreground">+{d.blocks.length-2} faixa(s)</span>}{(d.conflict||d.ambiguous)&&<span className="text-[10px] text-destructive">Conferir</span>}</button>)}</div>
      {selectedDay&&<div className="clinical-inset border rounded-lg p-2 space-y-2" role="region" aria-label={'Detalhes de '+PROFILE_DAY_NAMES[selectedDay.day]}><h5 className="text-xs font-semibold">{PROFILE_DAY_NAMES[selectedDay.day]} · detalhes</h5>{selectedDay.blocks.length===0?<p className="text-xs text-muted-foreground">Sem horário configurado.</p>:selectedDay.blocks.map(b=><div key={b.id} className="border-t pt-1.5 text-xs"><strong>{b.label} · {b.start}–{b.end}</strong><p className="text-muted-foreground">{b.mode} · {b.nominal} vagas cadastradas{b.perHour>0?' · '+b.perHour+' vagas/hora · duração '+(b.duration===null?'não informada':b.duration+' min'):''}</p></div>)}</div>}
      <p className="text-[11px] text-muted-foreground flex gap-1.5"><ShieldCheck className="w-4 h-4 shrink-0"/>Padrão semanal dentro da vigência; não representa presença, carga efetiva ou vagas livres. Períodos curtos podem não conter todos os dias configurados. A ficha imprime somente o período escolhido. O histórico apresenta os períodos registrados, não versões anteriores de edição.</p>
    </>}
  </section>;
}
