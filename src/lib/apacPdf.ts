import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import { normalizePaciente, safeText, type AnyPaciente, type ApacLaudoData } from './apacLaudoData';
import type { ApacClinicalData } from './apacClinicalData';
import { validateApacClinicalData } from './apacClinicalData';

export const APAC_DOCUMENT_NAME = 'FORMULARIO_APAC_LAUDO';
export const APAC_ORIGINAL_SHA256 = 'c48b75c7b83c9587d7e955d087009a3db394b9241d9d594f7c068266c48c0af0';
const WIDTH = 594.96, HEIGHT = 842.04;
type Box = [number,number,number,number];
const ink=rgb(.07,.08,.10);
const upper=(v:unknown)=>safeText(v).toLocaleUpperCase('pt-BR');
const digitsOnly=(v:unknown)=>safeText(v).replace(/\D/g,'');
const exactDigits=(v:unknown,n:number)=>{const d=digitsOnly(v);return d.length===n?d:'';};
export function resolveApacIdentification(p:AnyPaciente|null){
 const cd=p?.custom_data||{};
 const cns=exactDigits(p?.cns||p?.cartao_sus||p?.cartaoSus||cd.cns,15);
 const cpf=exactDigits(p?.cpf||cd.cpf,11);
 const etnia=safeText(p?.etnia||cd.etnia);
 const rua=p?.situacaoRua??p?.situacao_rua??cd.situacaoRua??cd.situacao_rua;
 const street=rua===true||upper(rua)==='SIM'?true:rua===false||upper(rua)==='NÃO'||upper(rua)==='NAO'?false:null;
 return {documento:cns||cpf,etnia:/^(outro|outra)$/i.test(etnia)?safeText(p?.etnia_outra||cd.etnia_outra||cd.etniaOutra):etnia,street};
}
// Use exactly the point coordinates measured on the two-page approved PDF.
// Top-left coordinates; pdf-lib's bottom-left origin is converted only here.
function writer(page:PDFPage,font:PDFFont){
 function text(label:string,box:Box,value:unknown,align:'left'|'center'='left',size=9,min=6.5){
  const s=upper(value);if(!s)return;
  const [x0,y0,x1,y1]=box;const available=x1-x0-2;
  let fs=Math.min(size,(y1-y0-.25)/1.407);
  while(fs>min&&font.widthOfTextAtSize(s,fs)>available)fs=Math.max(min,fs-.2);
  const w=font.widthOfTextAtSize(s,fs);
  if(w>available+0.001||fs<5)throw new Error('O campo '+label+' excede o espaço do formulário. Revise o conteúdo.');
  const x=align==='center'?(x0+x1-w)/2:x0+1;
  // Same baseline calculation as approved Helvetica-Bold demonstration.
  const baseline=(y0+y1)/2+(.733*fs/2);
  page.drawText(s,{x,y:page.getHeight()-baseline,size:fs,font,color:ink});
 }
 function digits(label:string,edges:number[],y0:number,y1:number,value:unknown,size=8.8,phone=false){
  const s=upper(value);if(!s)return;
  const chars=Array.from(s);const n=edges.length-1;
  if(phone&&chars.length===n+1)chars.splice(0,2,chars.slice(0,2).join(''));
  if(chars.length>n)throw new Error('O campo '+label+' possui mais caracteres que o formulário.');
  chars.forEach((c,i)=>text(label,[edges[i]+.5,y0,edges[i+1]-.5,y1],c,'center',size));
 }
 function date(label:string,edges:number[],y0:number,y1:number,value:string,size=8){
  if(!value)return;
  const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const br=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const parts=iso?[iso[3],iso[2],iso[1]]:br?br.slice(1):[];
  if(parts.length!==3)throw new Error('Data inválida: '+label);
  parts.forEach((v,i)=>text(label,[edges[i]+2,y0,edges[i+1]-2,y1],v,'center',size));
 }
 function mark(label:string,b:Box){text(label,[b[0]+.7,b[1]+.5,b[2]-.7,b[3]-.5],'X','center',7);}
 function observations(value:string){
  const lines:string[]=[];
  for(const par of value.toLocaleUpperCase('pt-BR').split('\n')){
   let current='';
   for(const word of par.split(/\s+/).filter(Boolean)){
    if(font.widthOfTextAtSize(word,8.5)>526)throw new Error('Uma palavra nas observações excede a largura disponível.');
    const next=current?current+' '+word:word;
    if(font.widthOfTextAtSize(next,8.5)>526){lines.push(current);current=word;}else current=next;
   }
   lines.push(current);
  }
  if(lines.length>9)throw new Error('Observações excedem a área disponível no formulário.');
  lines.forEach((l,i)=>text('Observações',[34,686+i*13,562,698+i*13],l,'left',8.5));
 }
 return {text,digits,date,mark,observations};
}
const patientIdEdges=[32.52,49.92,67.68,85.39,103.09,120.86,138.56,156.26,174.03,191.73,209.43,227.2,244.9,262.61,280.31,298.55];
const rows=[[330.84,351.2,215.88,330.84,508.44,351.2,512.88,330.72,562.44,351.2],[357.24,377.6,215.88,357.24,508.44,377.6,512.88,357.12,562.44,377.6],[383.64,404.12,215.88,383.64,508.44,404.12,512.88,383.64,562.44,404.12],[410.04,430.53,215.88,410.04,508.44,430.53,512.88,410.04,562.44,430.53],[436.56,456.92,215.88,436.56,508.44,456.92,512.88,436.56,562.44,456.92],[464.64,485,215.76,463.08,508.2,483.56,513.96,462.24,563.4,482.72],[490.56,511.04,215.64,490.32,508.08,510.8,513.96,490.8,563.4,511.28],[518.64,539.12,216.36,518.64,508.8,539.12,513.96,518.52,563.52,539],[545.28,565.76,216.6,544.8,509.16,565.28,514.44,544.56,564,565.04],[572.16,592.52,215.64,572.04,508.08,592.52,515.28,571.68,564.72,592.16]];
const cns2=[28.8,52.38,75.96,99.54,123.12,146.7,170.28,193.86,217.43,241.01,264.59,288.17,311.75,335.33,358.91,382.43];
let sourcePromise:Promise<ArrayBuffer>|undefined;
export async function loadApprovedApac():Promise<ArrayBuffer>{
 if(!sourcePromise)sourcePromise=(async()=>{
  const r=await fetch(import.meta.env.BASE_URL+'Formulario_APAC_LAUDO.pdf');
  if(!r.ok)throw new Error('Não foi possível carregar o formulário APAC.');
  const bytes=await r.arrayBuffer();
  if(!globalThis.crypto?.subtle)throw new Error('A emissão do formulário exige conexão segura (HTTPS).');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==APAC_ORIGINAL_SHA256)throw new Error('O formulário APAC não corresponde ao modelo aprovado.');
  return bytes;
 })().catch(e=>{sourcePromise=undefined;throw e;});
 return sourcePromise;
}
export async function fillApacPdf(source:ArrayBuffer|Uint8Array,patient:AnyPaciente,clinical:ApacClinicalData,normalized?:ApacLaudoData):Promise<Uint8Array>{
 const errors=validateApacClinicalData(clinical);
 if(errors.length)throw new Error(errors.join(' '));
 if(clinical.documento&&clinical.tipoDocumento!=='CNS')throw new Error('O novo formulário exige o CNS do solicitante.');
 const pdf=await PDFDocument.load(source);
 if(pdf.getPageCount()!==2||pdf.getPages().some(p=>Math.abs(p.getWidth()-WIDTH)>.02||Math.abs(p.getHeight()-HEIGHT)>.02||p.getRotation().angle!==0))throw new Error('Dimensões incorretas do formulário APAC.');
 const font=await pdf.embedFont(StandardFonts.HelveticaBold);
 const p=normalized||normalizePaciente(patient), id=resolveApacIdentification(patient), c=clinical;
 const a=writer(pdf.getPage(0),font),b=writer(pdf.getPage(1),font);
 a.text('Estabelecimento',[34,89,452,101],c.estabelecimento);
 a.digits('CNES solicitante',[460.08,474.66,489.29,503.92,518.56,533.14,547.77,562.52],90.5,102,c.cnes);
 a.text('Nome do paciente',[34,133.6,384,146],p.nome);
 a.text('Prontuário',[390,133.5,472,146],p.prontuario,'center',8);
 if(id.street!==null)a.mark('Situação de rua',id.street?[518.88,134.04,529.67,144.6]:[547.8,134.16,558.47,144.72]);
 a.digits('CPF/CNS',patientIdEdges,158,170,id.documento);
 if(p.dataDD&&p.dataMM&&p.dataAAAA)a.date('Nascimento',[301.2,330.61,353.64,386.87],158,170,[p.dataDD,p.dataMM,p.dataAAAA].join('/'));
 if(p.sexoMasc)a.mark('Sexo masculino',[410.64,156.12,422.72,166.68]);
 else if(p.sexoFem)a.mark('Sexo feminino',[440.28,156.12,451.07,166.68]);
 a.text('Raça/cor',[458,157,500,170],p.racaCor,'center',8);
 a.text('Etnia',[514,158,561,171],id.etnia,'center',7.2,5);
 a.text('Nome da mãe',[34,180,398,193],p.nomeMae);
 a.digits('DDD celular',[404.28,420.01,435.8],184.3,193.7,p.telDDD,7.4);
 a.digits('Celular',[435.8,451.53,467.32,483.05,498.85,514.58,530.37,546.1,561.83],184.4,193.7,p.telNum,7.4,true);
 a.text('Responsável',[34.5,207,398.8,217.4],p.nomeResponsavel,'left',8.7);
 a.digits('DDD contato',[405.24,420.96,436.74],209.4,218.3,p.telRespDDD,7.4);
 a.digits('Telefone contato',[436.74,452.46,468.24,483.95,499.73,515.45,531.23,546.95,562.67],209.4,218.3,p.telRespNum,7.4,true);
 a.text('Endereço',[34,228,560,240],p.endereco);
 a.text('Município',[34,251,353,263.5],p.municipio);
 a.text('IBGE',[356,251,435,263.5],p.ibge,'center');
 a.digits('UF',[436.08,452.88,469.76],252,263.5,p.uf,8.5);
 a.digits('CEP',[469.68,481.68,492.92,504.16,515.33,526.57,538.59,549.83,561.72],252,263.5,p.cep,8);
 a.digits('Procedimento principal',[32.52,49.38,66.23,83.15,100.01,116.86,133.72,150.64,167.5,184.35,201.21],293.8,307,c.principal.codigo,9);
 a.digits('Serviço',[204.84,220.36,235.87,251.39],293.8,307,c.servico,9);
 a.digits('Classificação',[253.2,268.72,284.23,299.75],293.8,307,c.classificacao,9);
 a.text('Nome principal',[305,292,507,306.5],c.principal.nome,'left',8.6);
 a.text('Quantidade principal',[514,292,561,306.5],c.principal.codigo?c.principal.quantidade:'','center',9.5);
 c.secundarios.forEach((proc,i)=>{
  const [y0,y1,x,y,x2,y2,qx,qy,qx2,qy2]=rows[i];
  const edges=i<5?[32.52,50.52,68.52,86.53,104.53,122.53,140.53,158.53,176.54,194.54,211.4]:[32.64,50.64,68.64,86.65,104.65,122.65,140.65,158.65,176.66,194.66,211.52];
  a.digits('Código secundário '+(i+1),edges,y0+7.2,y1-.4,proc.codigo);
  a.text('Nome secundário '+(i+1),[x+1,y+5.5,x2-1,y2-.6],proc.nome,'left',8.5);
  a.text('Quantidade secundária '+(i+1),[qx+1,qy+5.5,qx2-1,qy2-.6],proc.codigo?proc.quantidade:'','center',9);
 });
 a.date('Data histopatológica',[35.28,58.36,81.4,115.16],608.5,621.6,c.histoData||'',7.7);
 a.text('CID histopatológico',[123,608,200,622],c.histoCid,'center');
 a.text('Descrição histopatológica',[207,608,561,622],c.histoDescricao,'left',8.5);
 a.text('Diagnóstico',[34,653,334,670.5],c.diagnostico,'left',8.5);
 a.text('CID principal',[340,653,399,670.5],c.cidPrincipal,'center');
 a.text('CID secundário',[402,653,468,670.5],c.cidSecundario,'center');
 a.text('CID associado',[471,653,563,670.5],c.cidAssociado,'center');
 if(c.observacoes)a.observations(c.observacoes);
 b.text('Solicitante',[32,100,295,112.9],c.solicitante,'left',8.8);
 b.date('Data solicitação',[298.92,323.62,348.3,384.44],101.5,113,c.dataSolicitacao);
 b.digits('CNS solicitante',cns2,129.1,141.1,c.documento,9);
 // Autorização e assinatura permanecem vazias. O autorizador é responsável pelo preenchimento.
 b.text('Executante',[28,268,412,281],c.executante);
 b.digits('CNES executante',[431.88,447.6,463.39,479.11,494.9,510.62,526.41,542.13],267.9,281.2,c.cnesExecutante,9);
 pdf.setTitle(APAC_DOCUMENT_NAME);
 return pdf.save();
}
export function apacFilename(name:string){return APAC_DOCUMENT_NAME+'_'+(name||'PACIENTE').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'')+'.pdf';}
