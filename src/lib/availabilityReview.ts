import { statusOcupaVaga } from './appointmentCapacity';
import { classifyExternalQuota, quotaMatchesAvailability, type ExternalQuotaWindow } from './externalQuota';

export type ReviewGrade={id:string;profissionalId:string;unidadeId:string;dataInicio:string;dataFim:string;diasSemana:number[];horaInicio:string;horaFim:string;vagasPorHora:number;vagasPorDia:number};
export type ReviewBlock={id:string;profissionalId:string;unidadeId:string;dataInicio:string;dataFim:string;diaInteiro:boolean;horaInicio:string;horaFim:string};
type ReviewAppointment={hora:string;status:string;origem:string};
const minutes=(t:string)=>{const m=/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(t);return m?Number(m[1])*60+Number(m[2]):-1;};
export function validWindow(start:string,end:string){return minutes(start)>=0&&minutes(end)>minutes(start);}
export function timeOverlap(a:string,b:string,c:string,d:string){return validWindow(a,b)&&validWindow(c,d)&&minutes(a)<minutes(d)&&minutes(c)<minutes(b);}
export function gradeDay(date:string){const d=new Date(date+'T12:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===date?d.getUTCDay():-1;}
export function reviewDay(grades:readonly ReviewGrade[],prof:string,unit:string,date:string){
  const weekday=gradeDay(date);
  const day=weekday<0?[]:grades.filter(g=>g.profissionalId===prof&&g.dataInicio<=date&&g.dataFim>=date&&g.diasSemana.includes(weekday));
  const selected=day.filter(g=>g.unidadeId===unit);
  const invalid=selected.some(g=>!validWindow(g.horaInicio,g.horaFim)||!Number.isFinite(g.vagasPorDia)||g.vagasPorDia<0||!Number.isFinite(g.vagasPorHora)||g.vagasPorHora<0);
  const conflicts=selected.flatMap(g=>day.filter(h=>h.id!==g.id&&timeOverlap(g.horaInicio,g.horaFim,h.horaInicio,h.horaFim)).map(h=>[g.id,h.id].sort().join('|')));
  const mixed=selected.some(g=>g.vagasPorHora===0)&&selected.some(g=>g.vagasPorHora>0);
  const multipleHour=selected.filter(g=>g.vagasPorHora>0).length>1;
  return {selected,conflicts:new Set(conflicts).size,invalid,mixed,multipleHour,nominal:invalid||conflicts.length||mixed||multipleHour?null:selected.reduce((sum,g)=>sum+g.vagasPorDia,0)};
}
export function reviewBlocks(blocks:readonly ReviewBlock[],prof:string,unit:string,date:string,grades:readonly ReviewGrade[]){
  return blocks.filter(b=>b.dataInicio<=date&&b.dataFim>=date&&((!b.profissionalId&&(!b.unidadeId||b.unidadeId===unit))||b.profissionalId===prof)).map(b=>({
    ...b,overlaps:b.diaInteiro?grades.length>0:grades.some(g=>timeOverlap(g.horaInicio,g.horaFim,b.horaInicio||'00:00',b.horaFim||'23:59'))
  }));
}
export function reviewOccupancy(apps:readonly ReviewAppointment[]){
  const used=apps.filter(a=>statusOcupaVaga(a.status));
  const external=used.filter(a=>a.origem==='externo').length;
  return {total:used.length,internal:used.length-external,external};
}
export function reviewQuotas(quotas:readonly ExternalQuotaWindow[],grades:readonly ReviewGrade[],prof:string,unit:string,date:string){
  const scoped=quotas.filter(q=>q.ativo&&q.profissional_interno_id===prof&&q.unidade_id===unit&&q.periodo_inicio<=date&&q.periodo_fim>=date);
  return scoped.map(q=>{
    const classification=classifyExternalQuota(q,date);
    const matches=classification==='reserva_data_especifica'?grades.filter(g=>quotaMatchesAvailability(q,{profissionalId:prof,unidadeId:unit,date,horaInicio:g.horaInicio,horaFim:g.horaFim},grades.length)).length:0;
    return {quota:q,classification,matched:matches===1};
  });
}
export function draftWindowIssues(days:readonly {day:number;blocks:readonly {inicio:string;fim:string;nome:string;vagas:number}[]}[]){
  const issues:string[]=[];
  for(const d of days){
    if(d.blocks.some(b=>!validWindow(b.inicio,b.fim)||!Number.isFinite(b.vagas)||b.vagas<0))issues.push('Dia '+d.day+': horário ou quantidade a conferir.');
    if(d.blocks.some((b,i)=>d.blocks.slice(i+1).some(c=>timeOverlap(b.inicio,b.fim,c.inicio,c.fim))))issues.push('Dia '+d.day+': blocos sobrepostos.');
  }
  return issues;
}
