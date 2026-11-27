/** Pure helpers for scoped audit reads. No database access. */
export const AUDIT_PAGE_SIZE = 25;
export const AUDIT_LOOKUP_LIMIT = 25;
export const AUDIT_RELATED_LIMIT = 30;
export const AUDIT_OR_BUDGET = 5500;
export const AUDIT_CACHE_LIMIT = 200;
export const AUDIT_CACHE_TTL = 60_000;

export function auditSearchTerm(value: string): string {
  return value.trim().slice(0,100).replace(/[\u0000-\u001f\u007f*]/g,' ').trim();
}
export function auditLike(value: string): string {
  return '%'+value.replace(/[\\%_]/g,c=>'\\'+c)+'%';
}
export function auditQuote(value: string): string {
  return '"'+value.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
}
export function auditCpfVariants(value: string): string[] {
  if(!/^[\d.\-\s]+$/.test(value)) return [];
  const d=value.replace(/\D/g,'');
  return d.length===11 ? [d,d.slice(0,3)+'.'+d.slice(3,6)+'.'+d.slice(6,9)+'-'+d.slice(9)] : [];
}
export function auditIdList(ids: readonly string[]): string {
  return '('+ids.map(auditQuote).join(',')+')';
}
export function auditTextSearch(term: string): string[] {
  const pattern=auditQuote(auditLike(term));
  return ['user_nome','acao','entidade','entidade_id','paciente_nome','profissional_nome','acao_legivel'].map(k=>k+'.ilike.'+pattern);
}
export function auditActorCpfSearch(variants: string[], ids: string[]): string {
  const parts=variants.map(v=>'detalhes->>usuario_cpf.eq.'+auditQuote(v));
  if(ids.length) parts.push('user_id.in.'+auditIdList(ids));
  return parts.join(',');
}
export function auditRelatedSearch(parts: string[], groups: { ids:string[]; field:string; entity:string }[]) {
  const out=[...parts]; let limited=false;
  // Group values by known entity type; retain both direct and legacy relations.
  for(const group of groups) {
    const accepted: string[]=[];
    const aliases=group.entity==='documento'?['documento','documentos','documentos_gerados']:[group.entity,group.entity+'s'];
    const extraFor=(ids:string[])=>{
      const values=auditIdList(ids);
      return [group.field+'.in.'+values,'and(entidade.in.'+auditIdList(aliases)+',entidade_id.in.'+values+')'];
    };
    for(const id of new Set(group.ids)) {
      if(!id || id.length>120) { limited=true; continue; }
      if(encodeURIComponent([...out,...extraFor([...accepted,id])].join(',')).length>AUDIT_OR_BUDGET) { limited=true; continue; }
      accepted.push(id);
    }
    if(accepted.length)out.push(...extraFor(accepted));
  }
  return {expression:out.join(','),limited};
}
export type AuditEntityKind = 'paciente'|'agendamento'|'prontuario'|'profissional';
export function auditEntityRef(log: {entidade:string;entidade_id?:string|null;paciente_id?:string|null;agendamento_id?:string|null;prontuario_id?:string|null;profissional_id?:string|null}): {kind:AuditEntityKind;id:string}|null {
  const aliases:Record<string,AuditEntityKind> = {paciente:'paciente',pacientes:'paciente',agendamento:'agendamento',agendamentos:'agendamento',prontuario:'prontuario',prontuarios:'prontuario',funcionario:'profissional',funcionarios:'profissional',profissional:'profissional',profissionais:'profissional'};
  const key=typeof log.entidade==='string'?log.entidade.toLowerCase():'';
  if(!Object.prototype.hasOwnProperty.call(aliases,key))return null;
  const kind=aliases[key];
  const id=log.entidade_id || log[({paciente:'paciente_id',agendamento:'agendamento_id',prontuario:'prontuario_id',profissional:'profissional_id'} as const)[kind]];
  return typeof id==='string' && id.trim() && id.length<=120 ? {kind,id} : null;
}
export function auditPageRange(page: number) {
  const from=Math.max(0,Math.floor(page))*AUDIT_PAGE_SIZE;
  return {from,to:from+AUDIT_PAGE_SIZE-1};
}
export function auditLastPage(count: number) { return Math.max(0,Math.ceil(count/AUDIT_PAGE_SIZE)-1); }
export class AuditReadCache<T> {
  private entries = new Map<string,{value:T;expires:number}>();
  get(key:string, now=Date.now()):T|undefined {
    const entry=this.entries.get(key);
    if(!entry || entry.expires<=now) {this.entries.delete(key);return undefined;}
    this.entries.delete(key);this.entries.set(key,entry);return entry.value;
  }
  set(key:string,value:T,now=Date.now()) {
    this.entries.delete(key);this.entries.set(key,{value,expires:now+AUDIT_CACHE_TTL});
    while(this.entries.size>AUDIT_CACHE_LIMIT) {
      const oldest=this.entries.keys().next().value;
      if(oldest===undefined) break;
      this.entries.delete(oldest);
    }
  }
  clear(){this.entries.clear();}
  get size(){return this.entries.size;}
}
