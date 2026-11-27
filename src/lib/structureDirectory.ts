// Read-only projections for the physical directory. No scheduling or occupancy rules.
export type StructureRoom = {id:string;nome:string;unidadeId:string;ativo:boolean};
export type StructureUnit = {id:string;nome:string;nomeExibicao?:string;ativo:boolean};
export type RoomStaff = {id:string;nome:string;profissao:string|null;cargo:string|null;unidade_id:string;sala_id:string|null};
export type RoomKind = 'todas'|'consultorios'|'aparelhos';
export type RoomState = 'all'|'active'|'inactive';
export type UnitMetadata = {cnes:string;videoConfigured:boolean};
export const structureSearch=(v:unknown)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
export const OPEN_ROOM_APPOINTMENT_EXCLUSIONS=['cancelado','remarcado','concluido','falta'] as const;
export function buildRoomStaff(rooms:readonly StructureRoom[],staff:readonly RoomStaff[]){
  const result=new Map<string,RoomStaff[]>();
  const roomUnits=new Map(rooms.map(r=>[r.id,r.unidadeId]));
  const seen=new Set<string>();
  for(const person of staff){
    if(!person.sala_id||roomUnits.get(person.sala_id)!==person.unidade_id||seen.has(person.id))continue;
    seen.add(person.id);
    const list=result.get(person.sala_id)||[];
    list.push(person);result.set(person.sala_id,list);
  }
  return result;
}
export function filterStructureRooms<T extends StructureRoom>(rooms:readonly T[],units:readonly StructureUnit[],devices:ReadonlySet<string>,kind:RoomKind,state:RoomState,query:string,configsReady:boolean,examNames:ReadonlyMap<string,string>){
  const byUnit=new Map(units.map(u=>[u.id,[u.nome,u.nomeExibicao].map(structureSearch).join(' ')]));
  const term=structureSearch(query);
  return rooms.filter(r=>{
    if(state==='active'&&!r.ativo||state==='inactive'&&r.ativo)return false;
    if(kind!=='todas'&&(!configsReady||(kind==='aparelhos')!==devices.has(r.id)))return false;
    return !term||[r.nome,byUnit.get(r.unidadeId),configsReady?examNames.get(r.id):''].some(v=>structureSearch(v).includes(term));
  }).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR',{numeric:true,sensitivity:'base'})||a.id.localeCompare(b.id));
}
export function summarizeStructure(units:readonly StructureUnit[],rooms:readonly StructureRoom[],devices:ReadonlySet<string>,meta:ReadonlyMap<string,UnitMetadata>,ready:boolean){
  return {units:units.length,activeUnits:units.filter(u=>u.ativo).length,rooms:rooms.length,activeRooms:rooms.filter(r=>r.ativo).length,devices:ready?rooms.filter(r=>devices.has(r.id)).length:null,consultories:ready?rooms.filter(r=>!devices.has(r.id)).length:null,videoUnits:ready?units.filter(u=>meta.get(u.id)?.videoConfigured).length:null};
}
