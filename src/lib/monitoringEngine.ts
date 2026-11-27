export const MONITOR_DETAIL_TTL=120_000;
export const MONITOR_CONCURRENCY=4;
export function monitorCount(result:{count:number|null;error?:unknown}):number|null{
 return !result.error&&Number.isSafeInteger(result.count)&&result.count!>=0?result.count:null;
}
export function monitorCoverage(rows:readonly {count:number|null;error?:string}[],expected:number,incomplete:boolean){
 const confirmed=rows.filter(row=>row.count!==null&&!row.error).length;
 return confirmed===0?'erro':confirmed!==expected||incomplete?'parcial':'verificado';
}
export function monitorCacheFresh(checkedAt:number|null,now:number){
 return checkedAt!==null&&now>=checkedAt&&now-checkedAt<MONITOR_DETAIL_TTL;
}
export function monitorPeriodStatus(row:{periodChecked?:boolean;periodError?:string;recent7d:number|null;recent30d:number|null},hasDate:boolean){
 return !hasDate?'Não aplicável':!row.periodChecked?'Sob demanda':row.periodError||row.recent7d===null||row.recent30d===null?'Incompleto':'Consultado';
}
export async function monitorPool<T,R>(items:readonly T[],work:(item:T)=>Promise<R>,signal:AbortSignal):Promise<R[]>{
 const results:R[]=new Array(items.length);let cursor=0;
 const worker=async()=>{while(!signal.aborted){const index=cursor++;if(index>=items.length)return;results[index]=await work(items[index]);}};
 await Promise.all(Array.from({length:Math.min(items.length,MONITOR_CONCURRENCY)},worker));
 if(signal.aborted)throw Error('Consulta cancelada.');
 return results;
}
