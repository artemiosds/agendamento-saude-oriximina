export type StaffReview = 'cpf'|'cbo'|'cns'|'lotacao'|'acesso'|'conselho';
export interface StaffReviewInput {
  role:string; cpf?:string|null; unidade_id?:string|null; auth_user_id?:string|null;
  tipo_conselho?:string|null; numero_conselho?:string|null; uf_conselho?:string|null; coren?:string|null;
  custom_data?:Record<string,unknown>|null;
}
export const staffSearchText=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
export const staffDigits=(value:unknown)=>String(value??'').replace(/\D/g,'');
export function reviewStaff(f:StaffReviewInput):StaffReview[]{
  const issues:StaffReview[]=[];
  const cd=f.custom_data||{};
  const clinical=['profissional','tecnico','enfermagem'].includes(f.role);
  if(!String(f.cpf??'').trim()||staffDigits(f.cpf).length!==11)issues.push('cpf');
  if(clinical&&!/^\d{6}$/.test(String(cd.cbo_codigo??'').trim()))issues.push('cbo');
  if(clinical&&staffDigits(cd.cns).length!==15)issues.push('cns');
  if(!String(f.unidade_id??'').trim())issues.push('lotacao');
  if(!f.auth_user_id)issues.push('acesso');
  if(clinical&&(f.tipo_conselho||f.numero_conselho||f.uf_conselho)&&(!f.tipo_conselho||!f.numero_conselho||!f.uf_conselho))issues.push('conselho');
  return issues;
}
export const staffReviewLabels:Record<StaffReview,string>={cpf:'CPF ausente ou formato incompleto',cbo:'CBO ausente ou formato incompleto',cns:'CNS ausente ou formato incompleto',lotacao:'Sem lotação informada',acesso:'Sem vínculo de autenticação',conselho:'Conselho informado parcialmente'};
export interface StaffSchedule {profissionalId:string;unidadeId:string;dataInicio:string;dataFim?:string|null;diasSemana:number[]}
export function buildCurrentStaffSchedules(rows:readonly StaffSchedule[],today:string,allowedUnits:ReadonlySet<string>){
  const result=new Map<string,Set<string>>();
  for(const row of rows){
    if(!allowedUnits.has(row.unidadeId)||!row.profissionalId||!/^\d{4}-\d{2}-\d{2}$/.test(row.dataInicio)||row.dataInicio>today||(row.dataFim&&(!/^\d{4}-\d{2}-\d{2}$/.test(row.dataFim)||row.dataFim<today))||!row.diasSemana?.length)continue;
    const units=result.get(row.profissionalId)||new Set<string>();
    units.add(row.unidadeId);result.set(row.profissionalId,units);
  }
  return result;
}
