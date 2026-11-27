const dayClock=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Santarem',year:'numeric',month:'2-digit',day:'2-digit'});
const dayLabel=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Santarem',weekday:'long',day:'2-digit',month:'long',year:'numeric'});
const timeClock=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Santarem',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
export function auditFeedDate(value:string){
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return {key:'unknown',label:'Data não registrada',time:'—'};
  const parts=dayClock.formatToParts(date);
  const part=(name:string)=>parts.find(p=>p.type===name)?.value||'';
  return {key:part('year')+'-'+part('month')+'-'+part('day'),label:dayLabel.format(date),time:timeClock.format(date)};
}
export function groupAuditFeed<T extends {createdAt:string}>(rows:readonly T[]){
  const groups:{key:string;label:string;rows:T[]}[]=[];
  // Preserve the exact server order, including ties. Do not sort or merge events.
  for(const row of rows){
    const day=auditFeedDate(row.createdAt);
    const last=groups[groups.length-1];
    if(last?.key===day.key)last.rows.push(row);
    else groups.push({key:day.key,label:day.label,rows:[row]});
  }
  return groups;
}
export function auditFeedTone(status:string){
  if(status==='sucesso')return 'success';
  if(status==='erro'||status==='falha')return 'failure';
  if(status==='tentativa'||status==='pendente')return 'pending';
  if(status==='bloqueado')return 'blocked';
  return 'neutral';
}
export function auditFeedCounts(rows:readonly {status:string}[]){
  return rows.reduce((c,row)=>{const tone=auditFeedTone(row.status);if(tone==='success')c.success++;else if(tone==='failure')c.failure++;else c.other++;return c;},{success:0,failure:0,other:0});
}
