export const AUDIT_PERIODS = [1,7,30] as const;
export type AuditPeriod = typeof AUDIT_PERIODS[number];
export type AuditIndicator = 'all'|'success'|'failure'|'other';
export const AUDIT_FAILURE_STATUSES = ['erro','falha'];
export const AUDIT_CLASSIFIED_STATUSES = ['sucesso',...AUDIT_FAILURE_STATUSES];
export const AUDIT_INDICATORS: {key:AuditIndicator;label:string;filter:string}[] = [
  {key:'all',label:'Eventos registrados',filter:''},
  {key:'success',label:'Sucessos',filter:'sucesso'},
  {key:'failure',label:'Erros e falhas',filter:'_failures'},
  {key:'other',label:'Demais situações',filter:'_other'},
];
// Municipal calendar (Oriximiná, UTC−03:00), independent of browser timezone.
export function auditMunicipalDate(now:Date):string {
  return new Date(now.getTime()-3*60*60*1000).toISOString().slice(0,10);
}
export function auditShiftDay(day:string,offset:number):string {
  const date=new Date(day+'T00:00:00Z');
  date.setUTCDate(date.getUTCDate()+offset);
  return date.toISOString().slice(0,10);
}
export function auditPeriodRange(days:AuditPeriod,now:Date){
  const to=auditMunicipalDate(now);
  return {from:auditShiftDay(to,1-days),to};
}
export function auditDateBounds(from:string,to:string){
  return {start:from?from+'T00:00:00-03:00':'',end:to?auditShiftDay(to,1)+'T00:00:00-03:00':''};
}
export function auditModuleDistribution(rows:readonly {modulo?:string|null}[]){
  const counts=new Map<string,number>();
  for(const row of rows){
    const key=row.modulo||'';
    counts.set(key,(counts.get(key)||0)+1);
  }
  return [...counts].map(([key,count])=>({key,count,percent:rows.length?Math.round(count/rows.length*100):0}))
    .sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key));
}
