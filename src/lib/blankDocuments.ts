import DOMPurify from "dompurify";
import { buildDocumentShell, type DocumentConfig } from "@/lib/printLayout";
import { createEmptyOciData, renderOciDocument, type OciTemplateMeta } from "@/lib/ociDocument";

export interface BlankTemplate {
  id: string;
  nome: string;
  tipo: string;
  conteudo: string;
  blocos_clinicos?: unknown;
}

const approved = new Set([
  "atestado médico padrão", "declaração de comparecimento",
  "declaração de justificativa de falta", "encaminhamento clínico padrão",
  "receituário médico padrão", "termo de compromisso cer ii",
]);
type ManualField = { key?: string; type?: string; options?: string[] };
type BlankMeta = OciTemplateMeta & { mostrar_logos?: boolean; campos_manuais?: ManualField[] };
const metaOf = (t: BlankTemplate): BlankMeta => (t.blocos_clinicos && typeof t.blocos_clinicos === "object" ? t.blocos_clinicos : {}) as BlankMeta;
export const supportsBlankTemplate = (t: BlankTemplate) =>
  metaOf(t).structured_type === "OCI" || approved.has(t.nome.trim().toLocaleLowerCase("pt-BR"));

const escape = (s: string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const css = `<style>
.blank-form {font-size:11pt;line-height:1.5;color:#111;}
.blank-form p {margin:0 0 2.2mm; overflow-wrap:anywhere;}
.blank-form h1,.blank-form h2 {font-size:13pt;line-height:1.3;margin:0 0 3mm;}
.blank-form .blank-field {display:inline-block;vertical-align:baseline;min-height:6mm;max-width:100%;border-bottom:1px solid #444;}
.blank-form .blank-lines {display:block;margin:1mm 0 3mm;break-inside:avoid;}
.blank-form .blank-line {display:block;height:8mm;border-bottom:1px solid #555;}
.blank-form .blank-options {display:inline;line-height:1.8;}
.blank-form .blank-option {display:inline-block;white-space:nowrap;margin-right:3mm;}
.blank-form .blank-check {display:inline-block;vertical-align:baseline;width:3.4mm;height:3.4mm;border:1px solid #222;margin-right:1.2mm;}
.blank-form .blank-signature {margin-top:12mm;text-align:center;break-inside:avoid;}
.blank-form .blank-signature .blank-field {width:75%;height:8mm;}
.blank-form hr {margin:3mm 0;}
.blank-copy + .blank-copy {break-before:page;page-break-before:always;}
.doc-emit {display:none!important;}
@media screen {.blank-copy + .blank-copy{margin-top:12mm;border-top:1px dashed #bbb;padding-top:8mm}}
</style>`;

function blankBody(t: BlankTemplate): string {
  const meta = metaOf(t);
  // Only textual template content is retained. No images, scripts, links, forms, stored signatures or data attributes.
  const clean = DOMPurify.sanitize(t.conteudo || "", {
    ALLOWED_TAGS:["p","div","span","strong","b","em","i","u","br","h1","h2","h3","h4","ol","ul","li","table","thead","tbody","tr","td","th","hr"],
    ALLOWED_ATTR:["style","colspan","rowspan"],
    ALLOW_DATA_ATTR:false, ALLOW_ARIA_ATTR:false,
  });
  const doc = new DOMParser().parseFromString(clean,"text/html");
  // Keep only text alignment from editor styles; never preserve hidden/positioned content.
  doc.body.querySelectorAll("[style]").forEach(el=>{
    const align=(el as HTMLElement).style.textAlign;
    el.removeAttribute("style");
    if(["left","right","center","justify"].includes(align)) (el as HTMLElement).style.textAlign=align;
  });
  const walker=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT);
  const nodes: Text[]=[]; while(walker.nextNode()) nodes.push(walker.currentNode as Text);
  const manual=Array.isArray(meta.campos_manuais)?meta.campos_manuais:[];
  for(const node of nodes){
    const raw=node.data;
    const pattern=/\{\{\s*([^{}]+?)\s*\}\}/g;
    if(!pattern.test(raw)) continue;
    pattern.lastIndex=0;
    const frag=doc.createDocumentFragment();
    let last=0;
    for(const match of raw.matchAll(pattern)){
      const index=match.index!;
      frag.append(doc.createTextNode(raw.slice(last,index)));
      const key=match[1].trim().toLowerCase();
      const f=manual.find(x=>x?.key?.toLowerCase()===key);
      if(f?.type==="checkbox" && Array.isArray(f.options) && f.options.length){
        const options=doc.createElement("span");options.className="blank-options";
        for(const value of f.options.slice(0,30)){
          const opt=doc.createElement("span");opt.className="blank-option";
          const check=doc.createElement("span");check.className="blank-check";
          opt.append(check,doc.createTextNode(String(value)));options.append(opt);
        }
        frag.append(options);
      }else{
        const long=key==="medicamentos"?9:/^(motivo|observacoes|orientacoes|texto_mr3zvnx0)$/.test(key)?3:0;
        if(long){
          const group=doc.createElement("span");group.className="blank-lines";
          for(let i=0;i<long;i++){const line=doc.createElement("span");line.className="blank-line";group.append(line);}
          frag.append(group);
        }else{
          const line=doc.createElement("span");line.className="blank-field";
          line.style.width=/nome|profissional|logradouro|especialidade|unidade|destino/.test(key)?"85mm":/data|hora|dias|numero|cid|prioridade/.test(key)?"28mm":/cpf|cns|cartao_sus|telefone|rg/.test(key)?"43mm":"55mm";
          line.textContent="\u00a0";frag.append(line);
        }
      }
      last=index+match[0].length;
    }
    frag.append(doc.createTextNode(raw.slice(last)));node.replaceWith(frag);
  }
  // Empty editor paragraphs waste handwriting space; retain all actual text, clauses and signatures.
  doc.body.querySelectorAll("p").forEach(p=>{if(!p.textContent?.trim()&&!p.querySelector(".blank-field,.blank-line,.blank-check"))p.remove();});
  if(/\{\{[^{}]*\}\}/.test(doc.body.textContent||"")) throw new Error("Modelo contém variáveis não resolvidas.");
  const name=t.nome.toLocaleLowerCase("pt-BR");
  const signature=name==="receituário médico padrão"||name==="encaminhamento clínico padrão"
    ?'<div class="blank-signature"><div class="blank-field">&nbsp;</div><p>Assinatura e carimbo do profissional</p><p>Registro no conselho: ______________________</p></div>':"";
  return '<div class="blank-form">'+doc.body.innerHTML+signature+'</div>';
}

export function buildBlankDocument(t: BlankTemplate, config: DocumentConfig, copies=1): string {
  if(!supportsBlankTemplate(t)) throw new Error("Modelo sem versão manual revisada.");
  if(!Number.isInteger(copies)||copies<1||copies>20) throw new Error("Informe de 1 a 20 cópias.");
  const meta=metaOf(t);
  const cfg=typeof meta.mostrar_logos==="boolean"?{...config,mostrarLogos:meta.mostrar_logos}:config;
  if(meta.structured_type==="OCI"){
    const data=createEmptyOciData({nome:"",sexo:"",prontuario:"",cns:"",cpf:"",dataNascimento:"",racaCor:"",etnia:"",nomeMae:"",nomeResponsavel:"",telefone:"",telefoneResponsavel:"",enderecoCompleto:"",municipio:"",codigoIbge:"",uf:"",cep:""},{nome:"",documentoTipo:"CNS",documentoNumero:"",conselho:"",numeroConselho:"",ufConselho:""},"","");
    // No predefined clinical codes, quantities, dates or authorizations.
    data.procedimentoPrincipal={codigo:"",nome:"",quantidade:0};
    const body=renderOciDocument(data,cfg,{structured_type:"OCI",oci:{titulo:meta.oci?.titulo,linhas_secundarias:meta.oci?.linhas_secundarias}});
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>'+escape(t.nome)+'</title><style>@page{size:A4 portrait;margin:8mm}html,body{margin:0;padding:0;background:#fff}.blank-copy+.blank-copy{break-before:page;page-break-before:always}</style></head><body>'+Array.from({length:copies},()=>'<div class="blank-copy">'+body+'</div>').join("")+'</body></html>';
  }
  const html=buildDocumentShell(escape(t.nome),blankBody(t),cfg);
  const doc=new DOMParser().parseFromString(html,"text/html");
  doc.querySelectorAll(".doc-emit").forEach(el=>el.remove());
  const page=doc.body.innerHTML;
  doc.body.innerHTML=Array.from({length:copies},()=>'<div class="blank-copy">'+page+'</div>').join("");
  return "<!DOCTYPE html>"+doc.documentElement.outerHTML.replace("</head>",css+"</head>");
}
