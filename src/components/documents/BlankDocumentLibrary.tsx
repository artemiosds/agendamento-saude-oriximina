import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ArrowLeft, FileText, Printer, Loader2, ExternalLink } from "lucide-react";
import DocumentLibrary, { classifyDocument, type DocumentCategory } from "@/components/documents/DocumentLibrary";
import { READY_TEMPLATES } from "@/lib/readyTemplates";
import { buildBlankDocument, supportsBlankTemplate, type BlankTemplate } from "@/lib/blankDocuments";
import { loadDocumentConfig, printViaIframe, type DocumentConfig } from "@/lib/printLayout";
import { toast } from "sonner";

const APAC = "apac:official";
const APAC_URL = "https://sia.datasus.gov.br/documentos/listar_ftp_apac.php";
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDigital?: () => void;
}
type ScopedTemplate = BlankTemplate & { perfis_permitidos: string[]; tipo_modelo: string; unidade_id: string; criado_por: string };

export default function BlankDocumentLibrary({open,onOpenChange,onDigital}:Props){
  const {user}=useAuth();
  const [models,setModels]=useState<BlankTemplate[]>([]);
  const [config,setConfig]=useState<DocumentConfig|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [category,setCategory]=useState<DocumentCategory>("Todos");
  const [selected,setSelected]=useState("");
  const [copies,setCopies]=useState("1");
  const [reload,setReload]=useState(0);
  const [printing,setPrinting]=useState(false);
  const role=user?.role||"";
  const userId=user?.id||"";
  const unitId=user?.unidadeId||"";
  const readyAllowed=["master","gestao","profissional","enfermagem","tecnico"].includes(role);
  // Preserve template role and scope restrictions; no patient, signature or clinical record queries.
  useEffect(()=>{
    if(!open||!userId)return;
    let cancelled=false;
    setLoading(true);setError("");setModels([]);setConfig(null);setSelected("");setCopies("1");
    const run=async()=>{
      try{
        const [{data,error:queryError},cfg]=await Promise.all([
          supabase.from("document_templates").select("id,nome,tipo,conteudo,blocos_clinicos,perfis_permitidos,tipo_modelo,unidade_id,criado_por").eq("ativo",true).order("nome"),
          loadDocumentConfig(),
        ]);
        if(queryError)throw queryError;
        if(cancelled)return;
        const authorized=((data||[]) as unknown as ScopedTemplate[]).filter(m=>
          Array.isArray(m.perfis_permitidos)&&m.perfis_permitidos.includes(role)&&
          (m.tipo_modelo==="GLOBAL"||(m.tipo_modelo==="UNIDADE"&&!!unitId&&m.unidade_id===unitId)||(m.tipo_modelo==="PROFISSIONAL"&&m.criado_por===userId)));
        const names=new Set(authorized.map(m=>m.nome.trim().toLocaleLowerCase("pt-BR")));
        const ready=readyAllowed?READY_TEMPLATES.filter(t=>!names.has(t.nome.trim().toLocaleLowerCase("pt-BR"))).map(t=>({...t,id:"ready:"+t.id})):[];
        setModels([...authorized,...ready].filter(supportsBlankTemplate).sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR")));
        setConfig(cfg);
      }catch(e){if(!cancelled){console.error("[Formulários em branco]",e);setError("Não foi possível carregar os modelos autorizados.");}}
      finally{if(!cancelled)setLoading(false);}
    };
    void run();
    return()=>{cancelled=true;};
  },[open,userId,unitId,role,readyAllowed,reload]);
  const selectedModel=models.find(t=>t.id===selected);
  const preview=useMemo(()=>{
    if(!selectedModel||!config)return {html:"",error:""};
    try{return {html:buildBlankDocument(selectedModel,config,1),error:""};}
    catch(e){return {html:"",error:e instanceof Error?e.message:"Não foi possível preparar o formulário."};}
  },[selectedModel,config]);
  const count=Number(copies);
  const validCopies=Number.isInteger(count)&&count>=1&&count<=20;
  const canOpenApac=readyAllowed;
  const items=useMemo(()=>[
    ...models.map(m=>({id:m.id,nome:m.nome,categoria:classifyDocument(m.tipo,m.nome),descricao:"Formulário sem dados · preenchimento manual"})),
    ...(canOpenApac?[{id:APAC,nome:"APAC — Laudo de Solicitação/Autorização",categoria:"Regulação" as const,descricao:"Modelo oficial no portal DATASUS · impressão externa"}]:[]),
  ],[models,canOpenApac]);
  const print=()=>{
    if(!selectedModel||!config||!validCopies||preview.error||printing)return;
    setPrinting(true);
    try{printViaIframe(buildBlankDocument(selectedModel,config,count));}
    catch(e){toast.error(e instanceof Error?e.message:"Não foi possível abrir a impressão.");}
    finally{setPrinting(false);}
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[96vw] max-w-[1100px] max-h-[92dvh] overflow-y-auto">
      <DialogHeader className="clinical-hub-hero text-left pr-8">
        <DialogTitle className="clinical-hub-name flex items-center gap-2"><Printer className="h-5 w-5"/>Biblioteca de Documentos</DialogTitle>
        <DialogDescription className="clinical-patient-sub">Formulários institucionais para preenchimento manual</DialogDescription>
      </DialogHeader>
      <nav aria-label="Modalidades de documentos" className="clinical-hub clinical-hub-tabs">
        <Button type="button" variant="ghost" className="clinical-hub-tab flex-1 gap-2" disabled={!onDigital} aria-pressed={false} onClick={onDigital}><FileText className="h-4 w-4"/>Documentos digitais</Button>
        <Button type="button" variant="ghost" className="clinical-hub-tab flex-1 gap-2" aria-pressed={true} onClick={()=>setSelected("")}><Printer className="h-4 w-4"/>Formulários em branco</Button>
      </nav>
      {!onDigital&&<p className="text-xs text-muted-foreground">Para emitir um documento digital, abra o prontuário de um paciente.</p>}
      <div className="clinical-premium p-3 text-sm"><p className="font-semibold text-primary">Somente impressão</p><p className="text-xs text-muted-foreground">Sem dados pessoais, assinatura automática, emissão, prontuário ou produção. Preencha e assine manualmente apenas quando necessário. Modelos novos exigem revisão da versão manual.</p></div>
      {error&&<div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-sm text-destructive">{error}<Button type="button" variant="outline" size="sm" onClick={()=>setReload(v=>v+1)}>Tentar novamente</Button></div>}
      {!selected?<DocumentLibrary items={items} userId={userId} loading={loading} error={error||undefined} search={search} onSearch={setSearch} category={category} onCategory={setCategory} onGenerate={setSelected} actionLabel="Abrir formulário" disabled={loading||!!error}/>:<>
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={()=>setSelected("")}><ArrowLeft className="h-4 w-4"/>Voltar aos modelos</Button>
        {selected===APAC?<div className="clinical-premium p-4 space-y-3">
          <h3 className="text-sm font-semibold">APAC — Formulário oficial</h3>
          <p className="text-sm text-muted-foreground">O modelo local ainda não foi homologado. No portal oficial, selecione Formulario_APAC_LAUDO.pdf (ou o laudo complementar quando aplicável), abra o PDF e imprima em branco.</p>
          <Button asChild><a href={APAC_URL} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4"/>Abrir portal oficial DATASUS</a></Button>
        </div>:<div className="space-y-3 min-w-0">
          <div className="clinical-premium p-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[10rem]"><h3 className="text-sm font-semibold break-words">{selectedModel?.nome}</h3><p className="text-xs text-muted-foreground">Prévia de uma cópia · papel A4</p></div>
            <label className="text-xs font-semibold">Cópias (1–20)<Input aria-label="Quantidade de cópias" type="number" min={1} max={20} step={1} className="w-24" value={copies} onChange={e=>setCopies(e.target.value)}/></label>
            <Button type="button" className="clinical-record-action clinical-action-main" onClick={print} disabled={!validCopies||!preview.html||printing}>{printing?<Loader2 className="h-4 w-4 animate-spin"/>:<Printer className="h-4 w-4"/>}Imprimir / salvar PDF</Button>
          </div>
          {preview.error?<p role="alert" className="text-sm text-destructive">{preview.error}</p>:preview.html?<iframe title="Prévia do formulário em branco" sandbox="" srcDoc={preview.html} className="w-full h-[65vh] border rounded-lg bg-white"/>:<p role="status" className="text-sm text-muted-foreground">Prévia indisponível.</p>}
        </div>}
      </>}
    </DialogContent>
  </Dialog>;
}
