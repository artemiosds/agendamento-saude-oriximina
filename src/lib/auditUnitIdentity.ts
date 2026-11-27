export type AuditUnitRef={unidade_id?:string|null;unidade_nome?:string|null};
export type AuditUnitRow={id:string;nome?:string|null;nome_exibicao?:string|null};
const clean=(value:unknown)=>typeof value==='string'?value.trim():'';
export function unitCatalogName(row:AuditUnitRow):string{
  return [row.nome_exibicao,row.nome].map(clean).find(name=>name&&name!==row.id)||'';
}
export function recordedUnitName(ref:AuditUnitRef):string{
  const name=clean(ref.unidade_nome);
  return name&&name!==clean(ref.unidade_id)&&!/^un\d{8,}$/i.test(name)?name:'';
}
export function auditUnitLabel(ref:AuditUnitRef,currentName?:string):string{
  const recorded=recordedUnitName(ref);
  if(recorded)return recorded;
  if(clean(ref.unidade_id)&&clean(currentName))return clean(currentName)+' (cadastro atual)';
  return clean(ref.unidade_id)?'Unidade não identificada':'Unidade não registrada';
}
export function pendingAuditUnitIds(refs:readonly AuditUnitRef[],scope:string|null):string[]{
  return [...new Set(refs.filter(ref=>!recordedUnitName(ref)).map(ref=>clean(ref.unidade_id)).filter(id=>id&&id.length<=120&&(!scope||id===scope)))];
}
export function isAuditUnitField(field:string):boolean{
  return field.split('.').pop()==='unidade_id';
}
