import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, Download, X } from 'lucide-react';
import { toast } from 'sonner';
import ApacClinicalForm from './ApacClinicalForm';
import { emptyApacClinicalData, validateApacClinicalData } from '@/lib/apacClinicalData';
import { APAC_DOCUMENT_NAME, apacFilename, fillApacPdf, loadApprovedApac } from '@/lib/apacPdf';
import { useApacLaudoData } from '@/lib/useApacLaudoData';
import { supabase } from '@/integrations/supabase/client';

interface Props { open:boolean; onOpenChange:(open:boolean)=>void; paciente:any|null; unidadeNome?:string; cnesUnidade?:string }
export function ApacLaudoModal(props:Props){
 // Remount the whole emission session when the patient changes or dialog closes.
 return props.open&&props.paciente?<ApacSession key={String(props.paciente.id||props.paciente.cpf||props.paciente.cns||props.paciente.nome)} {...props}/>:null;
}
function ApacSession({open,onOpenChange,paciente,unidadeNome='',cnesUnidade=''}:Props){
 const [showForm,setShowForm]=useState(false);
 const [clinical,setClinical]=useState(()=>({...emptyApacClinicalData(),estabelecimento:unidadeNome,cnes:/^\d{7}$/.test(cnesUnidade)?cnesUnidade:''}));
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
 const errors=validateApacClinicalData(clinical);
 const signature=JSON.stringify([fullPatient?.id,data,clinical]);
 const [output,setOutput]=useState<{key:string;url:string}|null>(null);
 const [failure,setFailure]=useState<{key:string;message:string}|null>(null);
 useEffect(()=>{
  if(!fullPatient||ibgeLoading||errors.length)return;
  let alive=true;let url='';
  const timer=window.setTimeout(async()=>{
   try{
    const bytes=await fillApacPdf(await loadApprovedApac(),fullPatient,clinical,data);
    if(!alive)return;
    const copy=new Uint8Array(bytes);
    url=URL.createObjectURL(new Blob([copy.buffer],{type:'application/pdf'}));
    setOutput({key:signature,url});
    setFailure(null);
   }catch(e){if(alive)setFailure({key:signature,message:e instanceof Error?e.message:'Falha na geração do PDF.'});}
  },180);
  return()=>{alive=false;clearTimeout(timer);if(url)URL.revokeObjectURL(url);};
 },[signature,fullPatient,ibgeLoading]);
 const ready=!!output&&output.key===signature&&!errors.length&&!ibgeLoading&&!patientError;
 const errorMessage=patientError||errors.join(' ')||(failure?.key===signature?failure.message:'');
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
  const a=document.createElement('a');a.href=output.url;a.download=apacFilename(fullPatient?.nome);document.body.appendChild(a);a.click();a.remove();
 };
 return <Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="max-w-5xl w-[96vw] h-[92vh] p-0 flex flex-col gap-0">
   <DialogHeader className="px-4 py-3 border-b flex flex-row items-center justify-between space-y-0 flex-wrap gap-2">
    <DialogTitle className="text-base">{APAC_DOCUMENT_NAME} — {paciente.nome}</DialogTitle>
    <div className="flex items-center gap-2 mr-8 flex-wrap">
     <Button size="sm" variant="outline" onClick={()=>setShowForm(v=>!v)} disabled={!fullPatient}>{showForm?'Ver prévia':'Preencher laudo'}</Button>
     {showForm&&<Button size="sm" variant="outline" onClick={()=>{if(window.confirm('Descartar os campos preenchidos?')){setClinical(emptyApacClinicalData());setShowForm(false);}}}>Somente dados do paciente</Button>}
     <Button size="sm" onClick={print} disabled={!ready}><Printer className="w-4 h-4 mr-2"/>Imprimir Laudo APAC</Button>
     <Button size="sm" variant="secondary" onClick={download} disabled={!ready}><Download className="w-4 h-4 mr-2"/>Baixar PDF</Button>
     <Button size="sm" variant="outline" onClick={()=>onOpenChange(false)}><X className="w-4 h-4 mr-2"/>Fechar</Button>
    </div>
   </DialogHeader>
   {errorMessage&&<div role="alert" className="border-b px-4 py-2 text-sm text-destructive">{errorMessage}</div>}
   {showForm?<div className="flex-1 overflow-auto"><ApacClinicalForm value={clinical} onChange={setClinical}/></div>:
    <div className="flex-1 min-h-0 bg-muted p-2">
     {ready&&output?<iframe title={APAC_DOCUMENT_NAME} src={output.url} className="w-full h-full border-0 bg-white"/>:
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{errorMessage?'Revise os dados antes de emitir.':'Preparando formulário de duas páginas...'}</div>}
    </div>}
  </DialogContent>
 </Dialog>;
}
export default ApacLaudoModal;
