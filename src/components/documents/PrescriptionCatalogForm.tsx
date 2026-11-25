import {useEffect,useMemo,useState} from 'react';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {supabase} from '@/integrations/supabase/client';
import {AlertTriangle,Loader2,Pill,Plus,Search,Trash2} from 'lucide-react';
import {addCatalogMedication,catalogLabel,editPrescriptionRow,emptyPrescriptionRow,medicationWarning,searchCatalog,stockLabel,type CatalogMedication,type MedicationRow} from '@/lib/prescriptionCatalog';

type Props={professionalId:string;rows:MedicationRow[];onChange:(rows:MedicationRow[])=>void};
export default function PrescriptionCatalogForm({professionalId,rows,onChange}:Props){
 const [catalog,setCatalog]=useState<CatalogMedication[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0),[search,setSearch]=useState('');
 useEffect(()=>{
  let alive=true;const controller=new AbortController();
  setCatalog([]);setLoading(true);setError('');
  async function load(){
   try{
    if(!professionalId)throw new Error('Profissional não identificado.');
    const {data:prefs,error:prefsError}=await supabase.from('professional_preferences').select('item_id').eq('profissional_id',professionalId).eq('tipo','medication').eq('desabilitado',true).abortSignal(controller.signal);
    if(prefsError)throw prefsError;
    const hidden=new Set((prefs||[]).map(p=>p.item_id));
    const all:CatalogMedication[]=[];
    // Stable pagination avoids the default PostgREST row limit. Fetch only this user's global/personal active entries.
    const validId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(professionalId);
    for(let start=0;alive;start+=500){
     let q=supabase.from('medications').select('id,nome,nome_comercial,principio_ativo,concentracao,forma_farmaceutica,apresentacao,origem,tipo,codigo_rename,estoque_controlado,estoque_quantidade,estoque_minimo').eq('ativo',true);
     q=validId?q.or('is_global.eq.true,profissional_id.eq.'+professionalId):q.eq('is_global',true);
     const {data,error}=await q.order('nome').order('id').range(start,start+499).abortSignal(controller.signal);
     if(error)throw error;
     const page=data||[];all.push(...page.filter(m=>!hidden.has(m.id)));
     if(page.length<500)break;
    }
    if(alive)setCatalog(all);
   }catch{if(alive)setError('Não foi possível consultar o catálogo. Tente novamente ou preencha manualmente.');}
   finally{if(alive)setLoading(false);}
  }
  void load();return()=>{alive=false;controller.abort();};
 },[professionalId,retry]);
 const results=useMemo(()=>searchCatalog(catalog,search),[catalog,search]);
 const update=(i:number,field:Parameters<typeof editPrescriptionRow>[1],v:string)=>onChange(rows.map((r,j)=>j===i?editPrescriptionRow(r,field,v):r));
 const fields=[['dosagem','Dose prescrita'],['via','Via de administração'],['frequencia','Frequência'],['duracao','Duração']] as const;
 return <section className="space-y-4 rounded-xl border bg-card p-3 sm:p-4">
  <div className="flex items-center gap-3"><div className="rounded-lg bg-primary/10 p-2.5 text-primary"><Pill className="h-5 w-5"/></div><div><h4 className="font-semibold text-sm">Medicamentos</h4><p className="text-xs text-muted-foreground">Selecione a apresentação cadastrada e informe a prescrição.</p></div></div>
  <div className="space-y-2">
   <Label htmlFor="prescription-catalog-search">Buscar no catálogo de medicamentos</Label>
   <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/><Input id="prescription-catalog-search" value={search} onChange={e=>setSearch(e.target.value)} className="pl-9" placeholder="Nome, princípio ativo, concentração..."/></div>
   {loading?<p role="status" className="flex gap-2 items-center text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin"/>Carregando catálogo...</p>:error?<div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground"><span role="status">{error}</span><Button type="button" size="sm" variant="outline" onClick={()=>setRetry(v=>v+1)}>Tentar novamente</Button></div>:<p className="text-xs text-muted-foreground">{catalog.length} medicamentos disponíveis para consulta. RENAME, REME e cadastros ativos.</p>}
   {!loading&&!error&&search.trim().length>=2&&<div className="max-h-60 overflow-y-auto rounded-lg border divide-y">{results.length?results.map(m=>{
    const selected=rows.some(r=>r.catalogoId===m.id),warning=medicationWarning(m.tipo);
    return <button type="button" key={m.id} disabled={selected} className="w-full p-3 text-left hover:bg-muted/50 disabled:opacity-60 flex items-start gap-2" onClick={()=>{onChange(addCatalogMedication(rows,m));setSearch('');}}>
     <div className="flex-1 min-w-0"><p className="text-sm font-medium break-words">{catalogLabel(m)}</p><p className="text-xs text-muted-foreground">{[m.nome_comercial,m.principio_ativo,m.origem?.toUpperCase(),stockLabel(m)].filter(Boolean).join(' · ')}</p>{warning&&<p className="text-xs text-amber-700 dark:text-amber-400">{warning}</p>}</div><span className="text-xs text-primary shrink-0">{selected?'Adicionado':<Plus className="h-4 w-4"/>}</span>
    </button>;
   }):<p className="p-3 text-sm text-muted-foreground">Nenhum resultado. Use o preenchimento manual.</p>}</div>}
  </div>
  {rows.map((row,i)=><div key={i} className="space-y-3 rounded-lg border bg-muted/20 p-3">
   <div className="flex items-center justify-between"><p className="text-sm font-semibold">Medicamento {i+1}{row.catalogoId&&<span className="ml-2 font-normal text-xs text-primary">Do catálogo</span>}</p><Button type="button" variant="ghost" size="icon" aria-label={'Remover medicamento '+(i+1)} onClick={()=>onChange(rows.filter((_,j)=>i!==j))}><Trash2 className="h-4 w-4 text-destructive"/></Button></div>
   <div className="space-y-1"><Label htmlFor={'rx-med-'+i}>Nome e apresentação</Label><Input id={'rx-med-'+i} value={row.medicamento} readOnly={!!row.catalogoId} onChange={e=>update(i,'medicamento',e.target.value)} placeholder="Selecionar acima ou digitar manualmente"/>{row.catalogoId&&<p className="text-xs text-muted-foreground">Para trocar o medicamento do catálogo, remova esta linha e selecione o produto correto.</p>}</div>
   {medicationWarning(row.catalogoTipo)&&<div className="flex gap-2 rounded-md border border-amber-500/40 p-2 text-xs text-amber-700 dark:text-amber-400"><AlertTriangle className="h-4 w-4 shrink-0"/>{medicationWarning(row.catalogoTipo)}</div>}
   <div className="grid gap-3 sm:grid-cols-2">{fields.map(([key,label])=><div key={key} className="space-y-1"><Label htmlFor={'rx-'+key+'-'+i}>{label}</Label><Input id={'rx-'+key+'-'+i} value={row[key]} onChange={e=>update(i,key,e.target.value)} placeholder="Informar pelo profissional"/></div>)}</div>
   <div className="space-y-1"><Label htmlFor={'rx-observacao-'+i}>Orientações deste medicamento</Label><Textarea id={'rx-observacao-'+i} rows={2} value={row.observacao} onChange={e=>update(i,'observacao',e.target.value)}/></div>
  </div>)}
  <Button type="button" variant="outline" onClick={()=>onChange([...rows,emptyPrescriptionRow()])} className="gap-2"><Plus className="h-4 w-4"/>Adicionar medicamento manualmente</Button>
  <p className="text-xs text-muted-foreground">Concentração e apresentação não são dose prescrita. Confira medicamento, posologia e requisitos do receituário. A busca não altera estoque nem registra dispensação.</p>
 </section>;
}
