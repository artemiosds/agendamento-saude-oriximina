import {auditCsvCell,auditEscapeHtml,auditSafeText,maskAuditIdentifier} from './auditSecurity';
import {auditReportDays} from './auditActivityReport';
export const EXPORT_LIMITS={csv:5000,pdf:500} as const;
export const EXPORT_BATCH=250;
export type ExportFormat=keyof typeof EXPORT_LIMITS;
export type ExportScope='page'|'filtered';
export function auditExportEligibility(format:ExportFormat,from:string,to:string,count:number,partial:boolean):string{
  if(partial)return 'A pesquisa por vínculos está parcial. Refine os filtros antes de exportar todos os resultados.';
  const days=auditReportDays(from,to);
  if(!Number.isFinite(days)||days<1||days>31)return 'Informe um período válido de até 31 dias nos filtros da listagem.';
  if(!Number.isSafeInteger(count)||count<1)return 'Nenhum total confirmado para exportação.';
  if(count>EXPORT_LIMITS[format])return 'O recorte excede '+EXPORT_LIMITS[format].toLocaleString('pt-BR')+' eventos para '+format.toUpperCase()+'. Refine os filtros.';
  return '';
}
export async function readFilteredExport<T extends {id:string}>(format:ExportFormat,count:()=>Promise<number>,read:(from:number,to:number)=>Promise<T[]>,signal:AbortSignal,progress:(done:number,total:number)=>void):Promise<T[]>{
  const check=()=>{if(signal.aborted)throw Error('Consulta cancelada.');};
  check();const expected=await count();check();
  if(!Number.isSafeInteger(expected)||expected<=0)throw Error('Nenhum total confirmado para exportação.');
  if(expected>EXPORT_LIMITS[format])throw Error('O recorte ultrapassou o limite. Refine os filtros.');
  const seen=new Set<string>(),rows:T[]=[];
  progress(0,expected);
  for(let from=0;from<expected;from+=EXPORT_BATCH){
    check();const to=Math.min(expected,from+EXPORT_BATCH)-1;
    const batch=await read(from,to);check();
    if(batch.length!==to-from+1)throw Error('Cobertura da exportação não confirmada.');
    for(const row of batch){if(!row.id||seen.has(row.id))throw Error('Registros repetidos ou inválidos durante a exportação.');seen.add(row.id);rows.push(row);}
    progress(rows.length,expected);
  }
  const final=await count();check();
  if(final!==expected)throw Error('O total mudou durante a leitura. Atualize e tente novamente.');
  return rows;
}
// Additional protection for common document formats in free text; not a full DLP scanner.
export function exportSafeText(value:unknown):string{
  return auditSafeText(String(value??'')).replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/g,v=>maskAuditIdentifier(v,'cpf'))
    .replace(/\b\d{15}\b/g,v=>maskAuditIdentifier(v,'cns'))
    .replace(/(\b(?:senha|password|passwd|token|api[_-]?key|secret|authorization)\b\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,'$1********');
}
export function auditExportCsv(metadata:string[][],headers:string[],rows:string[][]):string{
  const line=(r:string[])=>r.map(auditCsvCell).join(';');
  return [...metadata.map(line),'',line(headers),...rows.map(line)].join('\r\n');
}
export function auditExportHtml(metadata:string[][],headers:string[],rows:string[][]):string{
  const esc=auditEscapeHtml;
  return '<section style="font-size:10px;margin-bottom:12px">'+metadata.map(([k,v])=>'<div><strong>'+esc(k)+':</strong> '+esc(v)+'</div>').join('')+'</section>'+
    '<table style="width:100%;border-collapse:collapse;table-layout:fixed"><thead><tr>'+headers.map(h=>'<th style="padding:3px;font-size:9px;overflow-wrap:anywhere">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr style="break-inside:avoid">'+r.map(v=>'<td style="padding:3px;font-size:9px;overflow-wrap:anywhere">'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
}
