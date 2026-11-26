export const HISTORY_PAGE_SIZE=100;
export type HistoryRow={id:string;data_atendimento?:string;hora_atendimento?:string;criado_em?:string;[key:string]:unknown};
export const escapeClinicalHtml=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
export async function collectClinicalHistory<T extends HistoryRow>(load:(cursor:string)=>Promise<T[]>):Promise<T[]>{
 const all:T[]=[];let cursor='';
 while(true){
  const page=await load(cursor);
  if(page.length===0)break;
  if(page.some((row,i)=>!row.id||row.id<=(i?page[i-1].id:cursor)))throw new Error('A paginação do histórico não avançou corretamente.');
  all.push(...page);
  if(page.length<HISTORY_PAGE_SIZE)break;
  cursor=page[page.length-1].id;
 }
 return all.sort((a,b)=>String(b.data_atendimento||'').localeCompare(String(a.data_atendimento||''))||String(b.hora_atendimento||'').localeCompare(String(a.hora_atendimento||''))||String(b.criado_em||'').localeCompare(String(a.criado_em||''))||b.id.localeCompare(a.id));
}
export function periodBounds(period:'all'|'today'|'week'|'month',today:string){
 if(period==='all')return {dataInicial:'',dataFinal:''};
 const [y,m,d]=today.split('-').map(Number);
 const start=new Date(Date.UTC(y,m-1,period==='month'?1:period==='week'?d-6:d));
 return {dataInicial:start.toISOString().slice(0,10),dataFinal:today};
}
export function clinicalHistorySections(row:HistoryRow){
 const fields=[['queixa_principal','Queixa principal'],['anamnese','Anamnese / histórico'],['soap_subjetivo','S — Subjetivo'],['soap_objetivo','O — Objetivo'],['soap_avaliacao','A — Avaliação'],['soap_plano','P — Plano'],['sinais_sintomas','Sinais e sintomas'],['exame_fisico','Exame físico'],['hipotese','Hipótese / avaliação'],['conduta','Conduta'],['evolucao','Evolução'],['procedimentos_texto','Procedimentos'],['outro_procedimento','Outros procedimentos'],['prescricao','Prescrição'],['solicitacao_exames','Solicitação de exames'],['resultado_exame','Resultados de exames'],['indicacao_retorno','Indicação de retorno'],['observacoes','Observações']];
 return fields.filter(([key])=>typeof row[key]==='string'&&String(row[key]).trim()).map(([key,label])=>'<div class="section"><div class="section-title">'+label+'</div><div class="section-content" style="font-size:10pt;white-space:pre-wrap;overflow-wrap:anywhere">'+escapeClinicalHtml(row[key])+'</div></div>').join('');
}
