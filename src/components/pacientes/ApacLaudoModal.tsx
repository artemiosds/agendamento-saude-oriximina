import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, Download, FileText, ClipboardList, Eye, CheckCircle2, AlertCircle, ChevronRight, RotateCcw, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import ApacClinicalForm from './ApacClinicalForm';
import ApacComplementForm from './ApacComplementForm';
import {emptyComplement,validateComplement} from '@/lib/apacComplementData';
import {appendComplement,fillComplement,loadComplementSource} from '@/lib/apacComplementPdf';
import { emptyApacClinicalData, validateApacClinicalData, apacSolicitanteDaUnidade } from '@/lib/apacClinicalData';
import { APAC_DOCUMENT_NAME, apacFilename, fillApacPdf, loadApprovedApac } from '@/lib/apacPdf';
import { useApacLaudoData } from '@/lib/useApacLaudoData';
import { supabase } from '@/integrations/supabase/client';

interface Props { open:boolean; onOpenChange:(open:boolean)=>void; paciente:any|null; unidadeId?:string; unidadeNome?:string; cnesUnidade?:string }
export function ApacLaudoModal(props:Props){
 // Remount the whole emission session when the patient changes or dialog closes.
 return props.open&&props.paciente?<ApacSession key={String(props.paciente.id||props.paciente.cpf||props.paciente.cns||props.paciente.nome)+'|'+(props.unidadeId||'')} {...props}/>:null;
}
function ApacSession({open,onOpenChange,paciente,unidadeId='',unidadeNome='',cnesUnidade=''}:Props){
 const [step,setStep]=useState<'principal'|'complementar'|'revisao'>('revisao');
 const [emittedKey,setEmittedKey]=useState('');
 const [complement,setComplement]=useState(emptyComplement);
 const [unitDefaults,setUnitDefaults]=useState(()=>({estabelecimento:unidadeNome,cnes:/^\d{7}$/.test(cnesUnidade)?cnesUnidade:''}));
 const [unitLoading,setUnitLoading]=useState(!!unidadeId);
 const [unitWarning,setUnitWarning]=useState('');
 const [clinical,setClinical]=useState(()=>({...emptyApacClinicalData(),...unitDefaults}));
 useEffect(()=>{
  if(!unidadeId)return;
  let alive=true;
  setUnitLoading(true);
  const load=async()=>{
   try{
    const {data,error}=await supabase.from('unidades').select('nome,custom_data').eq('id',unidadeId).single();
    if(!alive)return;
    if(error||!data)throw error||new Error('Unidade não encontrada');
    const defaults=apacSolicitanteDaUnidade(data);
    setUnitDefaults(defaults);
    setClinical(prev=>({...prev,...defaults}));
    setUnitWarning(defaults.cnes?'':'A unidade solicitante não possui CNES válido cadastrado. Confira o cadastro ou preencha o CNES manualmente.');
   }catch{
    if(alive)setUnitWarning('Não foi possível consultar o CNES da unidade solicitante. Confira e preencha manualmente antes de emitir.');
   }finally{if(alive)setUnitLoading(false);}
  };
  void load();
  return()=>{alive=false;};
 },[unidadeId]);
 const [fullPatient,setFullPatient]=useState<any>(null);
 const [patientError,setPatientError]=useState('');
 useEffect(()=>{
  let alive=true;
  if(!paciente?.id){setPatientError('Paciente sem identificação válida.');return;}
  supabase.from('pacientes').select('*').eq('id',paciente.id).single().then(({data,error})=>{
   if(!alive)return;
   if(error||!data)setPatientError('Não foi possível confirmar os dados do paciente. Feche e tente novamente.');
   else setFullPatient(data);
  });
  return()=>{alive=false;};
 },[paciente?.id]);
 const {data,ibgeLoading}=useApacLaudoData(fullPatient);
 const principalErrors=validateApacClinicalData(clinical);
 const complementErrors=validateComplement(complement);
 const errors=[...principalErrors,...complementErrors];
 const signature=JSON.stringify([fullPatient?.id,data,clinical,complement]);
 const [output,setOutput]=useState<{key:string;url:string}|null>(null);
 const [failure,setFailure]=useState<{key:string;message:string}|null>(null);
 useEffect(()=>{
  if(!fullPatient||unitLoading||ibgeLoading||errors.length)return;
  let alive=true;let url='';
  const timer=window.setTimeout(async()=>{
   try{
    let bytes=await fillApacPdf(await loadApprovedApac(),fullPatient,clinical,data);
    if(complement.areas.length)bytes=await appendComplement(bytes,await fillComplement(await loadComplementSource(),complement));
    if(!alive)return;
    const copy=new Uint8Array(bytes);
    url=URL.createObjectURL(new Blob([copy.buffer],{type:'application/pdf'}));
    setOutput({key:signature,url});
    setFailure(null);
   }catch(e){if(alive)setFailure({key:signature,message:e instanceof Error?e.message:'Falha na geração do PDF.'});}
  },180);
  return()=>{alive=false;clearTimeout(timer);if(url)URL.revokeObjectURL(url);};
 },[signature,fullPatient,unitLoading,ibgeLoading]);
 const ready=!!output&&output.key===signature&&!errors.length&&!unitLoading&&!ibgeLoading&&!patientError;
 const errorMessage=patientError||errors.join(' ')||(failure?.key===signature?failure.message:'');
 const dirty=JSON.stringify(clinical)!==JSON.stringify({...emptyApacClinicalData(),...unitDefaults})||complement.areas.length>0||Object.values(complement.values).some(Boolean);
 const close=(next:boolean)=>{if(next){onOpenChange(true);return;}if(dirty&&emittedKey!==signature&&!window.confirm('Existem alterações nesta emissão que ainda não foram baixadas. Fechar e descartar o preenchimento?'))return;onOpenChange(false);};
 const reset=()=>{if(window.confirm('Descartar os campos preenchidos?')){setClinical({...emptyApacClinicalData(),...unitDefaults});setComplement(emptyComplement());setEmittedKey('');setStep('revisao');}};
 const print=()=>{
  if(!ready||!output)return;
  // Native browser PDF viewer uses the exact same PDF (not a recreated HTML sheet).
  const win=window.open(output.url,'_blank');
  if(!win){toast.error('Permita a abertura de janelas para imprimir o PDF.');return;}
  try{win.opener=null;}catch{/* viewer may be isolated */}
  toast.info('Use o botão Imprimir do visualizador de PDF.');
 };
 const download=()=>{
  if(!ready||!output)return;
  const a=document.createElement('a');a.href=output.url;a.download=apacFilename(fullPatient?.nome).replace('.pdf',complement.areas.length?'_COM_COMPLEMENTAR.pdf':'.pdf');document.body.appendChild(a);a.click();a.remove();setEmittedKey(signature);
 };
 const canEdit=!!fullPatient&&!unitLoading;
 const steps=[{id:'principal' as const,label:'Laudo principal',icon:ClipboardList,count:principalErrors.length},{id:'complementar' as const,label:'Complementar',icon:FileText,count:complementErrors.length},{id:'revisao' as const,label:'Revisão',icon:Eye,count:0}];
 return <Dialog open={open} onOpenChange={close}>
  <DialogContent className="w-[96vw] max-w-[1400px] h-[94dvh] max-h-[94dvh] p-0 flex flex-col gap-0 overflow-hidden">
   <DialogHeader className="px-4 sm:px-6 py-3 border-b pr-12 text-left space-y-1">
    <div className="flex items-center gap-3"><div className="rounded-lg bg-primary/10 p-2.5 text-primary shrink-0"><FileText className="h-5 w-5"/></div><div className="min-w-0"><DialogTitle className="text-base sm:text-lg">Emissão de laudo APAC</DialogTitle><DialogDescription className="text-xs">Regulação · {APAC_DOCUMENT_NAME}</DialogDescription></div></div>
   </DialogHeader>
   <div className="border-b bg-muted/30 px-4 sm:px-6 py-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-center">
    <div className="min-w-0 flex gap-2 items-center"><UserRound className="h-4 w-4 shrink-0 text-muted-foreground"/><div className="min-w-0"><p className="text-xs text-muted-foreground">Paciente</p><p className="text-sm font-semibold truncate" title={paciente.nome}>{paciente.nome}</p></div></div>
    <div className="min-w-0"><p className="text-xs text-muted-foreground">Estabelecimento solicitante</p><p className="text-sm font-medium truncate" title={clinical.estabelecimento}>{clinical.estabelecimento||'Não informado'}</p></div>
    <div className="flex items-center gap-2"><div><p className="text-xs text-muted-foreground">CNES</p><p className="text-sm font-mono font-semibold">{clinical.cnes||'Não informado'}</p></div>{/^\d{7}$/.test(clinical.cnes)&&<CheckCircle2 className="h-4 w-4 text-emerald-600"/>}</div>
   </div>
   <nav aria-label="Etapas do laudo" className="grid grid-cols-3 gap-1 px-3 sm:px-5 py-2 border-b bg-background">
    {steps.map((s,i)=><Button key={s.id} type="button" variant={step===s.id?'default':'ghost'} aria-pressed={step===s.id} disabled={s.id!=='revisao'&&!canEdit} onClick={()=>setStep(s.id)} className="h-auto min-h-10 gap-1 px-1 sm:px-3 whitespace-normal text-xs sm:text-sm"><s.icon className="hidden sm:block w-4 h-4 shrink-0"/><span>{i+1}. {s.label}</span>{s.count>0&&<span className="rounded-full bg-destructive text-destructive-foreground px-1.5 text-[10px]">{s.count}</span>}{s.id==='complementar'&&complement.areas.length>0&&!s.count&&<span className="rounded bg-muted text-muted-foreground px-1 text-[10px]">{complement.areas.length}</span>}</Button>)}
   </nav>
   {unitWarning&&!clinical.cnes&&<div className="border-b px-4 py-2 text-xs text-amber-700">{unitWarning}</div>}
   {errorMessage&&<div role="alert" className="border-b px-4 py-2 text-xs text-destructive max-h-24 overflow-y-auto"><div className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4 shrink-0"/>Confira antes de emitir</div><ul className="list-disc pl-6 mt-1">{(patientError?[patientError]:errors.length?errors:[errorMessage]).map((e,i)=><li key={i}>{e}</li>)}</ul>{errors.length>0&&<button type="button" className="underline mt-1" onClick={()=>setStep(principalErrors.length?'principal':'complementar')}>Ir para os campos que precisam de revisão</button>}</div>}
   <div className="flex-1 min-h-0 flex overflow-hidden">
    <div className={step==='revisao'?'hidden':'flex-1 min-w-0 overflow-y-auto bg-muted/10'}>
     <div hidden={step!=='principal'}>{canEdit&&<ApacClinicalForm value={clinical} onChange={setClinical}/>}</div>
     <div hidden={step!=='complementar'}>{canEdit&&<ApacComplementForm value={complement} onChange={setComplement}/>}</div>
    </div>
    <div className={step==='revisao'?'flex flex-1 min-w-0 min-h-0 flex-col bg-muted/30':'hidden xl:flex xl:w-[45%] min-h-0 flex-col border-l bg-muted/30'}>
     <div className="flex items-center justify-between border-b bg-background px-3 py-2 text-xs"><span className="font-medium flex items-center gap-2"><Eye className="h-4 w-4"/> Prévia do documento</span><span className="text-muted-foreground">{complement.areas.length?4:2} páginas · A4</span></div>
     <div className="flex-1 min-h-0 p-2">
      {ready&&output?<iframe title={APAC_DOCUMENT_NAME} src={output.url} className="w-full h-full rounded border bg-white"/>:<div className="h-full flex flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground"><FileText className="h-9 w-9 opacity-40"/>{errorMessage?'Revise os dados antes de emitir.':'Preparando formulário APAC...'}</div>}
     </div>
    </div>
   </div>
   <footer className="shrink-0 border-t bg-background px-3 sm:px-5 py-3 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{complement.areas.length?'APAC + complemento · 4 páginas':'APAC padrão · 2 páginas'} · {ready?'Prévia atualizada':'Aguardando conferência'}</span><span>Preenchimento temporário, sem gravação no prontuário.</span></div>
    <div className="flex flex-wrap items-center justify-between gap-2">
     <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={!canEdit} onClick={()=>setStep('principal')}>Preencher laudo</Button>
      <Button size="sm" variant="outline" disabled={!canEdit} onClick={()=>setStep('complementar')}>Dados complementares</Button>
      {step!=='revisao'&&<Button size="sm" variant="ghost" onClick={reset}><RotateCcw className="w-4 h-4 mr-1"/>Somente dados do paciente</Button>}
     </div>
     <div className="flex flex-wrap gap-2">
      {step!=='revisao'&&<Button size="sm" variant="outline" onClick={()=>setStep(step==='principal'?'complementar':'revisao')}>{step==='principal'?'Continuar':'Ver prévia'}<ChevronRight className="w-4 h-4 ml-1"/></Button>}
      <Button size="sm" variant="secondary" onClick={print} disabled={!ready}><Printer className="w-4 h-4 mr-1"/>Imprimir Laudo APAC</Button>
      <Button size="sm" onClick={download} disabled={!ready}><Download className="w-4 h-4 mr-1"/>Baixar PDF</Button>
     </div>
    </div>
   </footer>
  </DialogContent>
 </Dialog>;
}
export default ApacLaudoModal;
