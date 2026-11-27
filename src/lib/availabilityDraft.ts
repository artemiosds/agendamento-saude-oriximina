// Draft-only shortcuts and nominal summary; never generate or reserve appointments.
export const WEEKDAY_PRESETS={uteis:[1,2,3,4,5],fim_semana:[0,6],todos:[0,1,2,3,4,5,6],nenhum:[]} as const;
export function selectDraftDays<T extends {ativo:boolean}>(days:readonly T[],selected:readonly number[],activate:(day:T)=>T):T[]{
  const wanted=new Set(selected);
  return days.map((day,i)=>wanted.has(i)?(day.ativo?day:activate(day)):{...day,ativo:false});
}
export function copyDraftDays<T>(days:readonly T[],source:number,targets:readonly number[],copy:(from:T,to:T)=>T):T[]{
  if(!Number.isInteger(source)||source<0||source>=days.length)return [...days];
  const selected=new Set(targets.filter(i=>Number.isInteger(i)&&i>=0&&i<days.length&&i!==source));
  return days.map((day,i)=>selected.has(i)?copy(days[source],day):day);
}
export function renewalDateAllowed(start:string,end:string,sourceEnd:string,today:string):boolean{
  return /^\d{4}-\d{2}-\d{2}$/.test(start)&&/^\d{4}-\d{2}-\d{2}$/.test(end)&&start>sourceEnd&&start>=today&&end>=start;
}
export function nominalWeek(mode:'por_hora'|'por_turno',hourDays:readonly {ativo:boolean;horaInicio:string;horaFim:string}[],turnDays:readonly {ativo:boolean;blocos:readonly {ativo:boolean;vagas:number;horaInicio:string;horaFim:string;nome:string}[]}[],daily:number){
  const days=mode==='por_hora'?hourDays.flatMap((day,i)=>day.ativo?[{day:i,blocks:[{inicio:day.horaInicio,fim:day.horaFim,vagas:daily,nome:'Por hora'}]}]:[]):turnDays.flatMap((day,i)=>day.ativo&&day.blocos.some(b=>b.ativo)?[{day:i,blocks:day.blocos.filter(b=>b.ativo).map(b=>({inicio:b.horaInicio,fim:b.horaFim,vagas:b.vagas,nome:b.nome}))}]:[]);
  return {days,blocks:days.reduce((sum,d)=>sum+d.blocks.length,0),nominal:days.reduce((sum,d)=>sum+d.blocks.reduce((n,b)=>n+b.vagas,0),0)};
}
