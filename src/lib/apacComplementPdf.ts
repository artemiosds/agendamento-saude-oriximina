import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {activeGroups,parts,validateComplement,type Complement} from './apacComplementData';
const SHA='2f8913ab333307a65341681744b48ad17f9bb54efc756303990a2352af3bca33';
export const COMPLEMENT_SHA256=SHA;
let cache:Promise<ArrayBuffer>|undefined;
export async function loadComplementSource(){
 if(!cache)cache=(async()=>{
 const response=await fetch(import.meta.env.BASE_URL+'Formulario_Apac_Laudo_Complementar.pdf');
 if(!response.ok)throw new Error('Não foi possível carregar o formulário complementar.');
 const bytes=await response.arrayBuffer();
 if(!globalThis.crypto?.subtle)throw new Error('A emissão exige conexão segura (HTTPS).');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==SHA)throw new Error('O formulário complementar não corresponde ao PDF aprovado.');
 return bytes;
 })().catch(e=>{cache=undefined;throw e;});
 return cache;
}
export async function fillComplement(source:ArrayBuffer|Uint8Array,d:Complement){
 const errors=validateComplement(d);if(!d.areas.length||errors.length)throw new Error(errors.join(' ')||'Selecione a área complementar.');
 const pdf=await PDFDocument.load(source);
 if(pdf.getPageCount()!==2||pdf.getPages().some(p=>Math.abs(p.getWidth()-594.75)>.02||Math.abs(p.getHeight()-842.25)>.02||p.getRotation().angle!==0))throw new Error('Dimensões incorretas do formulário complementar.');
 const font=await pdf.embedFont(StandardFonts.HelveticaBold);
 for(const g of activeGroups(d))for(const f of g.fields){
 const values=parts(f,d.values[f.id]||'');
 values.forEach((v,i)=>{
 if(!v)return;
 const {box,size,min,align}=f.targets[i], [x0,y0,x1,y1]=box;
 let fs=Math.min(size,(y1-y0-.6)/1.12),w:number;
 try{w=font.widthOfTextAtSize(v,fs);while(w>x1-x0-2&&fs>min){fs=Math.max(min,fs-.1);w=font.widthOfTextAtSize(v,fs);}}
 catch{throw new Error(f.label+' contém caracteres não suportados pelo PDF.');}
 if(w>x1-x0-2||fs<5)throw new Error(f.label+' ('+g.label+'): o texto excede a área do formulário.');
 const page=pdf.getPage(f.page);
 page.drawText(v,{x:align==='center'?(x0+x1-w)/2:x0+1,y:page.getHeight()-((y0+y1)/2+.733*fs/2),size:fs,font,color:rgb(.09,.10,.14)});
 });
 }
 // Authorization months and both signatures remain blank; no clinical inference.
 pdf.setTitle('FORMULARIO_APAC_LAUDO_COMPLEMENTAR');return pdf.save();
}
export async function appendComplement(main:Uint8Array,complement:Uint8Array){
 const pdf=await PDFDocument.load(main),extra=await PDFDocument.load(complement);
 if(pdf.getPageCount()!==2||extra.getPageCount()!==2)throw new Error('Os formulários APAC devem ter duas páginas cada.');
 for(const page of await pdf.copyPages(extra,[0,1]))pdf.addPage(page);
 pdf.setTitle('FORMULARIO_APAC_LAUDO_COM_COMPLEMENTAR');return pdf.save();
}
