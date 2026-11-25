import {useEffect,useId,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {supabase} from '@/integrations/supabase/client';
import {AREAS,activeGroups,type Complement,type Area} from '@/lib/apacComplementData';
function CidField({id,value,onChange}:{id:string;value:string;onChange:(v:string)=>void}){
 const [q,setQ]=useState(''),[results,setResults]=useState<{codigo:string;descricao:string}[]>([]),[status,setStatus]=useState('');
 useEffect(()=>{
 let live=true;const s=q.trim().replace(/[%_,()]/g,'');
 if(s.length<2){setResults([]);setStatus('');return;}
 const t=setTimeout(async()=>{try{
 const query=supabase.from('cid10_codigos').select('codigo,descricao').limit(15);
 const {data,error}=await (/^[A-Za-z]\d/.test(s)?query.ilike('codigo',s.replace('.','')+'%'):query.ilike('descricao','%'+s+'%'));
 if(live){setResults(error?[]:data||[]);setStatus(error?'Catálogo indisponível. Confira o código manualmente.':!data?.length?'Nenhum resultado encontrado.':'');}
 }catch{if(live)setStatus('Catálogo indisponível. Confira o código manualmente.');}},250);
 return()=>{live=false;clearTimeout(t);};
 },[q]);
 return <div className="space-y-1"><Input id={id} value={value} maxLength={5} placeholder="CID-10" onChange={e=>onChange(e.target.value.toUpperCase())}/><Input aria-label="Buscar CID por descrição ou código" placeholder="Buscar CID-10..." value={q} onChange={e=>setQ(e.target.value)}/>{status&&<p className="text-xs text-muted-foreground">{status}</p>}{results.map(r=><button key={r.codigo} type="button" className="block w-full text-left rounded border p-2 text-xs" onClick={()=>{onChange(r.codigo);setQ('');setResults([]);}}>{r.codigo} — {r.descricao}</button>)}</div>;
}
export default function ApacComplementForm({value,onChange}:{value:Complement;onChange:(d:Complement)=>void}){
 const prefix=useId();
 const [visible,setVisible]=useState<Record<string,number>>({});
 const set=(id:string,v:string)=>onChange({...value,values:{...value.values,[id]:v}});
 const toggle=(id:Area)=>{const active=value.areas.includes(id);if(active&&!window.confirm('Desativar esta seção? Os campos dela não serão emitidos.'))return;onChange({...value,areas:active?value.areas.filter(a=>a!==id):[...value.areas,id]});};
 const groups=activeGroups(value);
 const count=(series:string)=>Math.max(1,visible[series]||0,...groups.filter(g=>g.series===series&&g.fields.some(f=>value.values[f.id]?.trim())).map(g=>g.row||1));
 return <section className="space-y-4 p-4 border-t" aria-label="Dados complementares APAC">
 <div><h3 className="text-base font-semibold">Dados complementares (opcional)</h3><p className="text-sm text-muted-foreground">Selecione somente as áreas pertinentes. Sem seleção, permanece o APAC padrão de 2 páginas. Com seleção, serão 4 páginas. Dados não informados ficam em branco.</p></div>
 <div className="grid gap-2 sm:grid-cols-2">{AREAS.map(a=><label key={a.id} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer"><input type="checkbox" checked={value.areas.includes(a.id)} onChange={()=>toggle(a.id)}/><span className="text-sm font-medium">{a.label}</span></label>)}</div>
 {value.areas.includes('quimioterapia')&&<div className="rounded border p-3 text-sm space-y-2"><p>Use a lista oficial vigente de medicamentos antineoplásicos. O sistema não possui catálogo específico validado e não recomenda medicamentos.</p><label className="flex items-center gap-2"><input type="checkbox" checked={value.values['quimioterapia.med_catalog_confirmed']==='sim'} onChange={e=>set('quimioterapia.med_catalog_confirmed',e.target.checked?'sim':'')}/>Conferi os códigos e descrições na lista oficial.</label></div>}
 {groups.filter(g=>!g.series||g.row!<=count(g.series)).map(g=><div key={g.id} className="rounded-lg border p-3 space-y-3">
 <div className="flex items-center justify-between gap-2"><h4 className="font-semibold text-sm">{g.label}</h4>{g.row&&g.row>1&&<Button size="sm" type="button" variant="ghost" onClick={()=>{const values={...value.values};g.fields.forEach(f=>delete values[f.id]);onChange({...value,values});if(g.series)setVisible(v=>({...v,[g.series!]:Math.max(1,g.row!-1)}));}}>Limpar linha</Button>}</div>
 <div className="grid gap-3 sm:grid-cols-2">{g.fields.map(f=>{const id=prefix+'-'+f.id;const val=value.values[f.id]||'';return <div key={f.id} className="space-y-1"><Label htmlFor={id}>{f.label}</Label>{f.kind==='choice'?<div className="flex flex-wrap gap-1" role="group" aria-label={f.label}>{f.options!.map(o=><Button key={o.value} type="button" size="sm" variant={val===o.value?'default':'outline'} aria-pressed={val===o.value} onClick={()=>set(f.id,val===o.value?'':o.value)}>{o.label}</Button>)}</div>:f.kind==='cid'?<CidField id={id} value={val} onChange={v=>set(f.id,v)}/>:<Input id={id} type={f.kind==='date'||f.kind==='wholeDate'?'date':'text'} inputMode={f.kind==='digits'?'numeric':f.kind==='decimal'||f.kind==='splitDecimal'||f.kind==='height'?'decimal':undefined} value={val} maxLength={f.kind==='height'?4:f.max||180} onChange={e=>set(f.id,e.target.value)}/>}</div>;})}</div>
 {g.series&&g.row===count(g.series)&&g.row<groups.filter(x=>x.series===g.series).length&&<Button type="button" variant="outline" size="sm" onClick={()=>setVisible(v=>({...v,[g.series!]:count(g.series!)+1}))}>Adicionar {g.series.includes('medicamentos')?'medicamento':g.series.includes('areas')?'área irradiada':'tratamento anterior'}</Button>}
 </div>)}
 {value.areas.length>0&&<p className="text-xs text-muted-foreground">Meses autorizados, assinaturas e carimbos ficam em branco para os responsáveis. Altura/IMC: informe somente altura em metros; nenhuma unidade ou resultado será convertido automaticamente. A seleção de área não comprova elegibilidade regulatória.</p>}
 </section>;
}
