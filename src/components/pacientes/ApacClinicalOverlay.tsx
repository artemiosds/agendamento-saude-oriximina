import { apacObservationLines } from "@/lib/apacClinicalData";
import type { ApacClinicalData, ApacProcedure } from '@/lib/apacClinicalData';

/** Pixels of the same 2480 x 3509 template used by the patient overlay. */
export default function ApacClinicalOverlay({data}:{data:ApacClinicalData}) {
  const text=(value:string,x:number,y:number,width:number,size=30)=>value?<text x={x} y={y} fontFamily="Arial, Helvetica, sans-serif" fontSize={size} fill="#000" {...(value.length*size*.6>width?{textLength:width,lengthAdjust:'spacingAndGlyphs' as const}:{})}>{value}</text>:null;
  const digits=(value:string,x:number,y:number,step:number)=>(value||'').split('').map((d,i)=><text key={i} x={x+step*i} y={y} textAnchor="middle" fontFamily="Arial" fontSize={34} fill="#000">{d}</text>);
  const proc=(p:ApacProcedure,y:number)=><g>{digits(p.codigo,176,y,73.5)}{text(p.nome,905,y,1125,29)}{text(p.codigo?String(p.quantidade):'',2135,y,150,32)}</g>;
  const lines=apacObservationLines(data.observacoes);
  const lineStep=Math.min(38,285/Math.max(lines.length,1));
  const fontSize=Math.min(29,lineStep*.78);
  return <g data-apac-clinical="1">
    {text(data.estabelecimento,150,422,1715,34)}{digits(data.cnes,1930,429,60)}
    {proc(data.principal,1242)}
    {data.secundarios.map((p,i)=><g key={i}>{proc(p,[1418,1528,1636,1745,1854][i])}</g>)}
    {text(data.diagnostico,150,2070,1230,30)}
    {text(data.cidPrincipal.replace('.',''),1405,2070,220,34)}
    {text(data.cidSecundario.replace('.',''),1658,2070,260,34)}
    {text(data.cidAssociado.replace('.',''),1940,2070,350,34)}
    {lines.map((line,i)=><g key={i}>{text(line,153,2160+i*lineStep,2150,fontSize)}</g>)}
    {text(data.solicitante,150,2630,1065,32)}
    {text(data.dataSolicitacao ? data.dataSolicitacao.slice(8,10) : '',1260,2630,75,30)}
    {text(data.dataSolicitacao ? data.dataSolicitacao.slice(5,7) : '',1360,2630,75,30)}
    {text(data.dataSolicitacao ? data.dataSolicitacao.slice(0,4) : '',1450,2630,120,30)}
    {text(data.tipoDocumento==='CNS'?'X':'',235,2725,40,34)}
    {text(data.tipoDocumento==='CPF'?'X':'',450,2725,40,34)}
    {digits(data.documento,637.5,2725,64.7)}
  </g>;
}
