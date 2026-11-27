import {validBlockDate,type BlockRow,type BlockScope} from './blockDirectory';
import {statusOcupaVaga} from './appointmentCapacity';

export type BlockDraft={dataInicio:string;dataFim:string;diaInteiro:boolean;horaInicio:string;horaFim:string;scope:BlockScope;unidadeId:string;profissionalId:string};
export function blockDraftDays(start:string,end:string):number|null{
 if(!validBlockDate(start)||!validBlockDate(end)||end<start)return null;
 return Math.round((Date.parse(end+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000)+1;
}
const validTime=(time:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(time);
export function validBlockDraft(d:BlockDraft){
 return blockDraftDays(d.dataInicio,d.dataFim)!==null&&(d.diaInteiro||validTime(d.horaInicio)&&validTime(d.horaFim)&&d.horaInicio<d.horaFim)&&(d.scope==='global'||d.scope==='unidade'&&!!d.unidadeId||d.scope==='profissional'&&!!d.profissionalId);
}
export function blockPreset(today:string,preset:'today'|'tomorrow'|'seven'|'month'){
 if(!validBlockDate(today))return null;
 const d=new Date(today+'T12:00:00Z');
 if(preset==='tomorrow')d.setUTCDate(d.getUTCDate()+1);
 const start=d.toISOString().slice(0,10);
 if(preset==='seven')d.setUTCDate(d.getUTCDate()+6);
 if(preset==='month')d.setUTCMonth(d.getUTCMonth()+1,0);
 const end=d.toISOString().slice(0,10);
 return validBlockDate(start)&&validBlockDate(end)?{dataInicio:start,dataFim:end}:null;
}
export function blockDraftOverlap(d:BlockDraft,b:BlockRow):'direct'|'possible'|null{
 if(!validBlockDraft(d)||!validBlockDate(b.dataInicio)||!validBlockDate(b.dataFim)||b.dataFim<b.dataInicio||b.dataFim<d.dataInicio||b.dataInicio>d.dataFim)return null;
 const s=b.profissionalId?'profissional':b.unidadeId?'unidade':'global';
 let scope:'direct'|'possible'='direct';
 if(d.scope!=='global'&&s!=='global'){
  if(d.scope==='profissional'&&s==='profissional'&&d.profissionalId!==b.profissionalId)return null;
  if(d.scope==='unidade'&&s==='unidade'&&d.unidadeId!==b.unidadeId)return null;
  if(d.scope!==s)scope='possible'; // Professional follows their assignments, not only home unit.
 }
 if(d.diaInteiro||b.diaInteiro)return scope;
 const start=(b.horaInicio||'00:00').slice(0,5),end=(b.horaFim||'23:59').slice(0,5);
 if(!validTime(start)||!validTime(end)||end<=start)return 'possible';
 return d.horaInicio<end&&start<d.horaFim?scope:null;
}
export function reviewBlockAppointments(d:BlockDraft,rows:readonly {hora:string;status:string}[]){
 const occupied=rows.filter(a=>statusOcupaVaga(a.status));
 if(d.diaInteiro)return {matching:occupied.length,unknown:0};
 let matching=0,unknown=0;
 for(const a of occupied){
  if(!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(a.hora)){unknown++;continue;}
  if(a.hora>=d.horaInicio&&a.hora<d.horaFim)matching++;
 }
 return {matching,unknown};
}
