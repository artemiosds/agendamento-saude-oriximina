import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { sigtapSearchTerm } from '@/lib/diagnosticDirectoryReview';

type Procedure = {codigo:string;nome:string};
export default function DiagnosticSigtapLookup({code,scope,disabled,onSelect}:{code:string;scope:string;disabled:boolean;onSelect:(code:string)=>void}){
  const [open,setOpen]=useState(false);
  const [draft,setDraft]=useState('');
  const [submitted,setSubmitted]=useState<{numeric:boolean;term:string}|null>(null);
  const search=useQuery({
    queryKey:['diagnostic-sigtap-lookup',scope,submitted?.numeric,submitted?.term],
    enabled:open&&!disabled&&!!submitted&&submitted.term.length>=2,
    staleTime:0,
    retry:false,
    queryFn:async({signal})=>{
      if(!submitted)throw new Error('Informe um termo.');
      let q=supabase.from('sigtap_procedimentos').select('codigo,nome').eq('ativo',true);
      q=submitted.numeric&&submitted.term.length===10?q.eq('codigo',submitted.term):submitted.numeric?q.ilike('codigo','%'+submitted.term+'%'):q.ilike('nome','%'+submitted.term+'%');
      const {data,error}=await q.order('codigo').limit(21).abortSignal(signal);
      if(error||!data)throw error||new Error('Catálogo indisponível.');
      return data as Procedure[];
    }
  });
  const submit=()=>{
    if(disabled)return;
    const next=sigtapSearchTerm(draft);
    if(next.term.length<2)return;
    if(submitted?.numeric===next.numeric&&submitted.term===next.term)void search.refetch();
    else setSubmitted(next);
  };
  if(!open)return <Button type="button" variant="outline" size="sm" className="clinical-record-action gap-1.5" disabled={disabled} onClick={()=>{setDraft(code);setSubmitted(null);setOpen(true);}}><Search className="w-3.5 h-3.5"/>Consultar catálogo SIGTAP</Button>;
  const rows=search.isSuccess&&!search.isFetching?search.data:[];
  return <div className="clinical-inset rounded-lg border p-2.5 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs">Catálogo SIGTAP local</strong><Button type="button" variant="ghost" size="sm" onClick={()=>{setOpen(false);setSubmitted(null);}}>Fechar consulta</Button></div>
    <div className="flex flex-wrap gap-2"><Input className="flex-1 min-w-[10rem]" aria-label="Buscar procedimento SIGTAP" placeholder="Código ou nome do procedimento" value={draft} disabled={disabled} onChange={e=>{setDraft(e.target.value);setSubmitted(null);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();submit();}}}/><Button type="button" size="sm" variant="outline" disabled={disabled||sigtapSearchTerm(draft).term.length<2||search.isFetching} onClick={submit}>{search.isFetching?<Loader2 className="w-4 h-4 animate-spin"/>:<Search className="w-4 h-4 mr-1"/>}Buscar</Button></div>
    {submitted&&search.isFetching&&<p role="status" className="text-xs text-muted-foreground">Consultando catálogo...</p>}
    {submitted&&search.isError&&!search.isFetching&&<p role="alert" className="text-xs text-destructive">Não foi possível confirmar o catálogo. Tente novamente; o código cadastrado não foi alterado.</p>}
    {submitted&&search.isSuccess&&!search.isFetching&&rows.length===0&&<p className="text-xs text-muted-foreground">Nenhum procedimento ativo encontrado no catálogo local. Isso não comprova inexistência no SIGTAP oficial.</p>}
    {submitted&&rows.length>0&&<div className="divide-y max-h-56 overflow-y-auto">{rows.slice(0,20).map((row,i)=><div key={row.codigo+'-'+i} className="flex items-start gap-2 py-2"><div className="flex-1 min-w-0 text-xs"><p className="font-mono font-medium">{row.codigo}</p><p className="break-words">{row.nome}</p></div>{row.codigo===code?<span className="inline-flex gap-1 items-center text-xs text-primary"><CheckCircle2 className="w-3.5 h-3.5"/>Cadastrado</span>:<Button type="button" variant="outline" size="sm" disabled={disabled||!/^\d{10}$/.test(row.codigo)} onClick={()=>{if(window.confirm('Usar o código '+row.codigo+' — '+row.nome+' nesta modalidade? Confira a correspondência clínica.')){onSelect(row.codigo);setOpen(false);setSubmitted(null);}}}>Usar código</Button>}</div>)}</div>}
    {rows.length>20&&<p className="text-xs text-muted-foreground">Mais de 20 resultados. Refine a busca.</p>}
    <p className="text-[11px] text-muted-foreground">Consulta ao cadastro local ativo. Não confirma vigência por competência, CBO, CID, habilitação, instrumento BPA-I ou adequação clínica. Nenhum código é preenchido automaticamente.</p>
  </div>;
}
