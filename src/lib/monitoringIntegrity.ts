export type BucketMetric={bucket:string;fileCount:number;usedBytes:number;unknownSizeCount:number};
export type GrowthMetric={name:string;count:number|null;recent7d:number|null;recent30d:number|null;periodChecked?:boolean;periodError?:string;error?:string};
export const LINK_SAMPLE_LIMIT=100;
const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
export function storageDiagnosis(rows:readonly BucketMetric[],quota:number|null){
 const names=new Set<string>();
 const validRows=rows.every(r=>{if(!r.bucket.trim()||names.has(r.bucket)||!valid(r.fileCount)||!valid(r.usedBytes)||!valid(r.unknownSizeCount)||r.unknownSizeCount>r.fileCount||(r.fileCount===0&&r.usedBytes>0))return false;names.add(r.bucket);return true;});
 const bytes=rows.reduce((s,r)=>s+r.usedBytes,0),files=rows.reduce((s,r)=>s+r.fileCount,0),unknown=rows.reduce((s,r)=>s+r.unknownSizeCount,0);
 const consistent=validRows&&valid(bytes)&&valid(files)&&valid(unknown);
 const complete=consistent&&unknown===0;
 const reference=typeof quota==='number'&&Number.isFinite(quota)&&quota>0?quota:null;
 const percent=consistent&&reference!==null?bytes/reference*100:null;
 return {consistent,complete,bytes,files,unknown,percent,remaining:complete&&reference!==null?Math.max(0,reference-bytes):null,
  level:percent===null?'unknown':percent>=100?'exceeded':percent>=90?'critical':percent>=75?'attention':complete?'within':'partial',
  ranked:consistent?[...rows].sort((a,b)=>b.usedBytes-a.usedBytes||a.bucket.localeCompare(b.bucket)):[]};
}
export function growthDiagnosis(rows:readonly GrowthMetric[]){
 const ranked=rows.filter(r=>r.periodChecked&&!r.periodError&&!r.error&&valid(r.count)&&valid(r.recent7d)&&valid(r.recent30d)&&r.recent7d<=r.recent30d&&r.recent30d<=r.count)
 .map(r=>({name:r.name,total:r.count!,recent7d:r.recent7d!,recent30d:r.recent30d!,share:r.count!>0?r.recent30d!/r.count!*100:0}))
 .sort((a,b)=>b.recent30d-a.recent30d||a.name.localeCompare(b.name));
 const inconsistent=rows.filter(r=>r.periodChecked&&valid(r.count)&&valid(r.recent30d)&&r.recent30d>r.count).length;
 return {ranked,inconsistent};
}
export type LinkSession={id:string;cycle_id:string;patient_id:string};
export type LinkCycle={id:string;patient_id:string};
export function inspectTreatmentLinks(sessions:readonly LinkSession[],cycles:readonly LinkCycle[]){
 if(sessions.length>LINK_SAMPLE_LIMIT||cycles.length>LINK_SAMPLE_LIMIT)throw Error('Limite amostral excedido.');
 const byId=new Map<string,LinkCycle>();for(const cycle of cycles){if(!cycle.id||byId.has(cycle.id))throw Error('Retorno de ciclos inconsistente.');byId.set(cycle.id,cycle);}
 const seen=new Set<string>();let confirmed=0,missing=0,mismatch=0,incomplete=0;
 for(const session of sessions){
  if(!session.id||seen.has(session.id))throw Error('Retorno de sessões inconsistente.');
  seen.add(session.id);
  if(!session.cycle_id||!session.patient_id){incomplete++;continue;}
  const cycle=byId.get(session.cycle_id);
  if(!cycle){missing++;continue;}
  if(!cycle.patient_id){incomplete++;continue;}
  if(cycle.patient_id!==session.patient_id)mismatch++;else confirmed++;
 }
 return {sample:sessions.length,confirmed,missing,mismatch,incomplete};
}
