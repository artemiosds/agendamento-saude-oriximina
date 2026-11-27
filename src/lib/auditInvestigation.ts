import { auditIdList } from './auditDirectory';
import { isAuditSecret } from './auditSecurity';
type Obj=Record<string,unknown>;
const object=(v:unknown):Obj|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Obj:null;
const own=(v:Obj,k:string)=>Object.prototype.hasOwnProperty.call(v,k);
export type AuditValue={present:boolean;value:unknown};
const missing:AuditValue={present:false,value:undefined};
const pick=(v:Obj|null,keys:string[]):AuditValue=>{
  if(v)for(const key of keys)if(own(v,key))return {present:true,value:v[key]};
  return missing;
};
export type AuditComparison={field:string;before:AuditValue;after:AuditValue;source:'explicit'|'snapshot'|'listed';protected:boolean};
export function auditComparisons(log:{before?:unknown;after?:unknown;changes?:unknown;campos_alterados?:unknown;detalhes?:unknown}):AuditComparison[]{
  const d=object(log.detalhes)||{};
  const out=new Map<string,AuditComparison>();
  const add=(field:string,before:AuditValue,after:AuditValue,source:AuditComparison['source'])=>{
    if(!field||out.has(field))return;
    const hidden=isAuditSecret(field);
    out.set(field,{field,before:hidden&&before.present?{present:true,value:'********'}:before,after:hidden&&after.present?{present:true,value:'********'}:after,source,protected:hidden});
  };
  for(const candidate of [log.changes,d.changes,d.alteracoes,d.campos_alterados]){
    const entries=object(candidate);
    if(!entries)continue;
    for(const [field,value] of Object.entries(entries)){
      const pair=object(value);
      const before=pick(pair,['from','before','anterior','old']);
      const after=pick(pair,['to','after','novo','new']);
      if(before.present||after.present||isAuditSecret(field))add(field,before,after,'explicit');
    }
  }
  const before=object(log.before)||object(d.old_value)||object(d.before)||object(d.old_data);
  const after=object(log.after)||object(d.new_value)||object(d.after)||object(d.new_data);
  if(before||after){
    for(const field of new Set([...Object.keys(before||{}),...Object.keys(after||{})])){
      if(['id','created_at','updated_at','unidade_id','user_id','custom_data'].includes(field))continue;
      const b=pick(before,[field]),c=pick(after,[field]);
      // Missing keys do not establish that a value was removed.
      if(before&&after&&b.present&&c.present&&JSON.stringify(b.value)===JSON.stringify(c.value))continue;
      add(field,b,c,'snapshot');
    }
  }
  for(const candidate of [log.campos_alterados,d.campos_alterados]){
    if(Array.isArray(candidate))for(const field of candidate)if(typeof field==='string')add(field,missing,missing,'listed');
  }
  return [...out.values()];
}
const relationKinds = [
  {aliases:['paciente','pacientes'],field:'paciente_id',label:'Mesmo paciente'},
  {aliases:['agendamento','agendamentos'],field:'agendamento_id',label:'Mesmo agendamento'},
  {aliases:['prontuario','prontuarios'],field:'prontuario_id',label:'Mesmo prontuário'},
  {aliases:['documento','documentos','documentos_gerados'],field:'documento_id',label:'Mesmo documento'},
  {aliases:['funcionario','funcionarios','profissional','profissionais'],field:'profissional_id',label:'Mesmo profissional'},
] as const;
type RelationEvent={id:string;entidade:string;entidade_id?:string|null;created_at:string;paciente_id?:string|null;agendamento_id?:string|null;prontuario_id?:string|null;documento_id?:string|null;profissional_id?:string|null};
export const AUDIT_TIMELINE_LIMIT=20;
export function auditTimelineQuery(event:RelationEvent){
  const kind=relationKinds.find(k=>k.aliases.some(a=>a===event.entidade?.toLowerCase()));
  const time=Date.parse(event.created_at);
  if(!kind||!Number.isFinite(time))return null;
  const direct=event[kind.field];
  const id=event.entidade_id||direct;
  // Reject conflicting identities and unsafe/placeholder keys. Never associate by name.
  if(!id||!(/^[A-Za-z0-9][A-Za-z0-9_-]{2,119}$/).test(id)||/^(undefined|null|unknown|auth|sistema|system|none|n\/d)$/i.test(id)||(direct&&direct!==id))return null;
  const values=auditIdList([id]);
  const expression=kind.field+'.in.'+values+',and(entidade.in.'+auditIdList(kind.aliases)+',entidade_id.in.'+values+')';
  const delta=7*24*60*60*1000;
  return {expression,label:kind.label,from:new Date(time-delta).toISOString(),to:new Date(time+delta).toISOString()};
}
