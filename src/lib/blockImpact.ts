import {type BlockDraft} from './blockDraft';
import {validBlockDate} from './blockDirectory';

const timeValid=(v:string)=>/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(v);
export function availabilityImpact(d:BlockDraft,rows:readonly {data_inicio:string;data_fim:string;dias_semana:number[];hora_inicio:string;hora_fim:string}[]){
 let matching=0,unknown=0;
 for(const r of rows){
  if(!validBlockDate(r.data_inicio)||!validBlockDate(r.data_fim)||r.data_inicio>r.data_fim||!Array.isArray(r.dias_semana)||!r.dias_semana.length||r.dias_semana.some(x=>!Number.isInteger(x)||x<0||x>6)){unknown++;continue;}
  const start=r.data_inicio>d.dataInicio?r.data_inicio:d.dataInicio,end=r.data_fim<d.dataFim?r.data_fim:d.dataFim;
  if(start>end)continue;
  const date=new Date(start+'T12:00:00Z');
  let day=false;
  for(let i=0;i<7&&date.toISOString().slice(0,10)<=end;i++,date.setUTCDate(date.getUTCDate()+1)){if(r.dias_semana.includes(date.getUTCDay())){day=true;break;}}
  if(!day)continue;
  if(!timeValid(r.hora_inicio)||!timeValid(r.hora_fim)||r.hora_inicio.slice(0,5)>=r.hora_fim.slice(0,5)){unknown++;continue;}
  if(d.diaInteiro||r.hora_inicio.slice(0,5)<d.horaFim&&d.horaInicio<r.hora_fim.slice(0,5))matching++;
 }
 return {matching,unknown};
}
