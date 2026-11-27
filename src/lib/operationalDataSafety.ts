import {auditCsvCell} from './auditSecurity';
export const DATA_EXPORT_LIMIT=10000;
export const DATA_EXPORT_BATCH=250;
export const DATA_EXPORT_BYTES=16*1024*1024;
export const DATA_EXPORT_FIELDS={
 pacientes:['id','nome','cpf','cns','data_nascimento','unidade_id','criado_em'],
 agendamentos:['id','paciente_id','paciente_nome','profissional_id','profissional_nome','unidade_id','data','hora','status','tipo','criado_em'],
 notification_logs:['id','agendamento_id','canal','evento','provider','status','criado_em']
} as const;
export type DataExportTable=keyof typeof DATA_EXPORT_FIELDS;
type GlobalIdentity={role?:string|null;usuario?:string|null;ativo?:boolean|null};
export function canExportGlobalData(user:GlobalIdentity|null|undefined):boolean{
 return user?.role==='master'&&user.usuario==='admin.sms'&&user.ativo===true;
}
export function confirmedCount(value:{count:number|null;error?:unknown}):number|null{
 return !value.error&&Number.isSafeInteger(value.count)&&value.count!>=0?value.count:null;
}
export type DataExportRow=Record<string,unknown>&{id:string};
export async function readDataExport(count:()=>Promise<number|null>,read:(from:number,to:number)=>Promise<DataExportRow[]>,signal:AbortSignal,progress:(done:number,total:number)=>void){
 const check=()=>{if(signal.aborted)throw Error('Consulta cancelada.');};
 check();const total=await count();check();
 if(total===null||!Number.isSafeInteger(total)||total<0)throw Error('Contagem não confirmada.');
 if(total>DATA_EXPORT_LIMIT)throw Error('Limite de exportação excedido. Utilize a exportação nativa do Lovable Cloud para o conjunto completo.');
 if(total===0)throw Error('Nenhum registro encontrado.');
 const rows:DataExportRow[]=[],seen=new Set<string>();let bytes=0;
 progress(0,total);
 for(let from=0;from<total;from+=DATA_EXPORT_BATCH){
  check();const to=Math.min(total,from+DATA_EXPORT_BATCH)-1;
  const batch=await read(from,to);check();
  if(batch.length!==to-from+1)throw Error('Exportação incompleta: lote divergente.');
  for(const row of batch){
   if(typeof row.id!=='string'||!row.id||seen.has(row.id))throw Error('Exportação inconsistente: identificador inválido ou repetido.');
   seen.add(row.id);bytes+=new TextEncoder().encode(JSON.stringify(row)).byteLength;
   if(bytes>DATA_EXPORT_BYTES)throw Error('Limite de memória da exportação atingido.');
   rows.push(row);
  }
  progress(rows.length,total);
 }
 const final=await count();check();
 if(final!==total)throw Error('A quantidade mudou durante a exportação. Tente novamente.');
 return rows;
}
export function dataExportCsv(table:DataExportTable,rows:readonly DataExportRow[]):string{
 const fields=DATA_EXPORT_FIELDS[table];
 return [fields.map(auditCsvCell).join(';'),...rows.map(row=>fields.map(field=>auditCsvCell(row[field])).join(';'))].join('\r\n');
}
