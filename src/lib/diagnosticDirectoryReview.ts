import type { DiagnosticRoomConfig, DiagnosticExamConfig } from './diagnosticExams';
export const normalizeExamSearch=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
export function examReview(exam:DiagnosticExamConfig){
  const issues:string[]=[];
  if(!exam.tipoExame.trim())issues.push('Nome não informado');
  if(!exam.codigoSigtap)issues.push('SIGTAP não informado');
  else if(!/^\d{10}$/.test(exam.codigoSigtap))issues.push('SIGTAP com formato incompleto');
  if(exam.exigePreparo&&!exam.instrucoesPreparo.trim())issues.push('Preparo sem instruções');
  return issues;
}
export function roomReview(config:DiagnosticRoomConfig){
  const ids=new Set<string>(), repeated=new Set<string>();
  for(const exam of config.exames){if(ids.has(exam.id))repeated.add(exam.id);ids.add(exam.id);}
  const start=config.horarioInicio||'07:00',end=config.horarioFim||'17:00';
  const valid=/^([01]\d|2[0-3]):[0-5]\d$/;
  return {total:config.exames.length,review:config.exames.filter(e=>examReview(e).length>0).length,duplicateIds:repeated.size,invalidWindow:!valid.test(start)||!valid.test(end)||end<=start};
}
export function newExamId(existing:readonly DiagnosticExamConfig[],preferred:string,generate:()=>string){
  return existing.some(e=>e.id===preferred)?'exam-'+generate():preferred;
}
export function sigtapSearchTerm(value:string){
  const raw=value.trim();
  if(/^[\d.\-\s]+$/.test(raw))return {numeric:true,term:raw.replace(/\D/g,'')};
  return {numeric:false,term:raw.replace(/[%_\\]/g,' ').trim()};
}
