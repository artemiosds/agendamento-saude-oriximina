// Administrative read-only projection; never used to decide whether a slot is available.
export type BlockStatus='vigente'|'futuro'|'encerrado'|'invalido';
export type BlockScope='global'|'unidade'|'profissional';
export type BlockRow={id:string;titulo:string;tipo:string;dataInicio:string;dataFim:string;diaInteiro:boolean;horaInicio:string;horaFim:string;unidadeId:string;profissionalId:string};
type DirectoryLabel={id:string;nome:string};
export type BlockFilter={search:string;status:'todos'|BlockStatus|'conferencia';scope:'todos'|BlockScope;type:string;year:string;month:string};
export const emptyBlockFilter:BlockFilter={search:'',status:'todos',scope:'todos',type:'todos',year:'',month:'todos'};
export const normalizeBlock=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function validBlockDate(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000'))return false;
 const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function blockStatus(b:BlockRow,today:string):BlockStatus{
 if(!validBlockDate(b.dataInicio)||!validBlockDate(b.dataFim)||b.dataInicio>b.dataFim)return 'invalido';
 return b.dataFim<today?'encerrado':b.dataInicio>today?'futuro':'vigente';
}
export function blockScope(b:BlockRow):BlockScope{return b.profissionalId?'profissional':b.unidadeId?'unidade':'global';}
const types=['feriado','ferias','reuniao','indisponibilidade'];
export function buildBlockDirectory<T extends BlockRow>(rows:readonly T[],people:readonly DirectoryLabel[],units:readonly DirectoryLabel[],today:string,peopleConfirmed:boolean,unitsConfirmed:boolean){
 const personMap=new Map(people.map(p=>[p.id,p.nome]));
 const unitMap=new Map(units.map(u=>[u.id,u.nome]));
 const order={vigente:0,futuro:1,encerrado:2,invalido:3};
 return rows.map(block=>{
  const status=blockStatus(block,today),scope=blockScope(block);
  const person=personMap.get(block.profissionalId)||'',unit=unitMap.get(block.unidadeId)||'';
  const issues:string[]=[];
  if(status==='invalido')issues.push('Período inconsistente');
  if(!block.titulo.trim())issues.push('Motivo não informado');
  if(!types.includes(block.tipo))issues.push('Tipo não reconhecido');
  if(!block.diaInteiro&&(!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(block.horaInicio)||!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(block.horaFim)||block.horaInicio.slice(0,5)>=block.horaFim.slice(0,5)))issues.push('Horário parcial a conferir');
  if(block.diaInteiro&&/\bmeio[ -]dia\b/.test(normalizeBlock(block.titulo)))issues.push('Descrição de meio dia com bloqueio integral');
  if(block.profissionalId&&peopleConfirmed&&!person)issues.push('Cadastro do profissional não localizado');
  if(block.unidadeId&&unitsConfirmed&&!unit)issues.push('Cadastro da unidade não localizado na consulta');
  return {block,status,scope,person,unit,issues};
 }).sort((a,b)=>order[a.status]-order[b.status]||(a.status==='encerrado'?b.block.dataFim.localeCompare(a.block.dataFim):a.block.dataInicio.localeCompare(b.block.dataInicio))||a.block.id.localeCompare(b.block.id));
}
export type BlockEntry<T extends BlockRow=BlockRow>=ReturnType<typeof buildBlockDirectory<T>>[number];
export function blockSummary(entries:readonly BlockEntry[]){
 const counts={todos:entries.length,vigente:0,futuro:0,encerrado:0,invalido:0,conferencia:0};
 for(const e of entries){counts[e.status]++;if(e.issues.length)counts.conferencia++;}
 return counts;
}
export function filterBlockDirectory<T extends BlockRow>(entries:readonly BlockEntry<T>[],filter:BlockFilter){
 const term=normalizeBlock(filter.search);
 return entries.filter(e=>{
  if(filter.status==='conferencia'&&!e.issues.length||filter.status!=='todos'&&filter.status!=='conferencia'&&e.status!==filter.status)return false;
  if(filter.scope!=='todos'&&e.scope!==filter.scope||filter.type!=='todos'&&e.block.tipo!==filter.type)return false;
  if(filter.year||filter.month!=='todos'){
   if(e.status==='invalido')return false;
   if(filter.year){
    if(!/^\d{4}$/.test(filter.year)||filter.year==='0000')return false;
    const start=filter.year+(filter.month==='todos'?'-01': '-'+filter.month)+'-01';
    const end=filter.year+(filter.month==='todos'?'-12':'-'+filter.month)+'-31';
    if(e.block.dataFim<start||e.block.dataInicio>end)return false;
   }else{
    // Month without year: intersect any occurrence of that month, without expanding years.
    const m=Number(filter.month),y=Number(e.block.dataInicio.slice(0,4)),last=Number(e.block.dataFim.slice(0,4));
    if(!Number.isInteger(m)||m<1||m>12)return false;
    const candidate=Number(e.block.dataInicio.slice(5,7))<=m?y:y+1;
    if(candidate>last||candidate===last&&m>Number(e.block.dataFim.slice(5,7)))return false;
   }
  }
  return !term||normalizeBlock([e.block.titulo,e.person,e.unit,e.scope,e.block.tipo].join(' ')).includes(term);
 });
}
