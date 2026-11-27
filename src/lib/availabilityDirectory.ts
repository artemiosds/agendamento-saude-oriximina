// Read-only directory projection. Never used for slot generation or persistence.
export type GradePeriod = 'vigente'|'futuro'|'encerrado'|'invalido';
export type GradeMode = 'hora'|'turno'|'misto';
export type GradeMetric = 'todos'|'ativos'|'vigentes'|'sem_vigencia'|'periodos'|'conferencia';
export type GradeFilter = {metric:GradeMetric;period:'todos'|GradePeriod;mode:'todos'|GradeMode;profession:string;search:string};
type GradeRow = {id:string;profissionalId:string;unidadeId:string;dataInicio:string;dataFim:string;vagasPorHora:number;diasSemana:number[]};
type GradePerson = {id:string;nome:string;ativo:boolean;role:string;unidadeId:string;profissao?:string;cargo?:string};
type GradeUnit = {id:string;nome:string;nomeExibicao?:string};
export type GradeGroup<T extends GradeRow> = [string,T[]];
export type GradeEntry<T extends GradeRow,P extends GradePerson> = [string,{prof:P|undefined;groups:GradeGroup<T>[];active:boolean;vigente:boolean;issues:string[]}];
export const normalizeGradeSearch=(v:unknown)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
export function gradePeriod(start:string,end:string,today:string):GradePeriod{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)return 'invalido';
  return end<today?'encerrado':start>today?'futuro':'vigente';
}
export function gradeMode(rows:readonly GradeRow[]):GradeMode{
  const turno=rows.some(r=>r.vagasPorHora===0),hora=rows.some(r=>r.vagasPorHora!==0);
  return turno&&hora?'misto':turno?'turno':'hora';
}
export function gradeProfession(person:GradePerson|undefined){return person?.profissao||person?.cargo||'Não informada';}
export function buildGradeDirectory<T extends GradeRow,P extends GradePerson>(groups:ReadonlyMap<string,T[]>,people:readonly P[],units:readonly GradeUnit[],selectedUnit:string,global:boolean,ownUnit:string,today:string):GradeEntry<T,P>[]{
  const allowed=(id:string)=>(global||!!ownUnit&&id===ownUnit)&&(selectedUnit==='all'||id===selectedUnit);
  const peopleById=new Map(people.map(p=>[p.id,p]));
  const knownUnits=new Set(units.map(u=>u.id));
  const byId=new Map<string,GradeGroup<T>[]>();
  for(const [key,rows] of groups){
    const first=rows[0];if(!first||!allowed(first.unidadeId))continue;
    const list=byId.get(first.profissionalId)||[];list.push([key,rows]);byId.set(first.profissionalId,list);
  }
  for(const p of people)if(p.ativo&&p.role==='profissional'&&allowed(p.unidadeId)&&!byId.has(p.id))byId.set(p.id,[]);
  const result:GradeEntry<T,P>[]=[];
  for(const [id,entries] of byId){
    const prof=peopleById.get(id),active=!!prof?.ativo&&prof.role==='profissional';
    const issues:string[]=[];
    if(!prof)issues.push('Cadastro não localizado');
    else if(!prof.ativo)issues.push('Cadastro inativo');
    else if(prof.role!=='profissional')issues.push('Perfil diferente de profissional');
    if(entries.some(([,rows])=>!knownUnits.has(rows[0].unidadeId)))issues.push('Unidade não localizada');
    if(entries.some(([,rows])=>gradePeriod(rows[0].dataInicio,rows[0].dataFim,today)==='invalido'))issues.push('Período inconsistente');
    if(entries.some(([,rows])=>gradeMode(rows)==='misto'))issues.push('Modalidades misturadas');
    if(entries.some(([,rows])=>rows.some(r=>!r.diasSemana.length||r.diasSemana.some(d=>!Number.isInteger(d)||d<0||d>6))))issues.push('Dias da semana a conferir');
    const order={vigente:0,futuro:1,encerrado:2,invalido:3};
    const sorted=[...entries].sort(([,a],[,b])=>order[gradePeriod(a[0].dataInicio,a[0].dataFim,today)]-order[gradePeriod(b[0].dataInicio,b[0].dataFim,today)]||b[0].dataInicio.localeCompare(a[0].dataInicio));
    result.push([id,{prof,groups:sorted,active,vigente:entries.some(([,r])=>gradePeriod(r[0].dataInicio,r[0].dataFim,today)==='vigente'),issues}]);
  }
  return result.sort((a,b)=>(a[1].prof?.nome||'').localeCompare(b[1].prof?.nome||'','pt-BR')||a[0].localeCompare(b[0]));
}
export function gradeSummary<T extends GradeRow,P extends GradePerson>(entries:readonly GradeEntry<T,P>[],today:string){
  const periods={vigente:0,futuro:0,encerrado:0,invalido:0};
  for(const [,e] of entries)for(const [,r] of e.groups)periods[gradePeriod(r[0].dataInicio,r[0].dataFim,today)]++;
  const ativos=entries.filter(([,e])=>e.active).length,vigentes=entries.filter(([,e])=>e.active&&e.vigente).length;
  return {ativos,vigentes,semVigencia:ativos-vigentes,periodos:Object.values(periods).reduce((a,b)=>a+b,0),conferencia:entries.filter(([,e])=>e.issues.length>0).length,periods};
}
export function filterGradeDirectory<T extends GradeRow,P extends GradePerson>(entries:readonly GradeEntry<T,P>[],units:readonly GradeUnit[],filter:GradeFilter,today:string){
  const unitNames=new Map(units.map(u=>[u.id,normalizeGradeSearch(u.nome+' '+(u.nomeExibicao||''))]));
  const term=normalizeGradeSearch(filter.search);
  return entries.filter(([,e])=>{
    if(filter.metric==='ativos'&&!e.active||filter.metric==='vigentes'&&!(e.active&&e.vigente)||filter.metric==='sem_vigencia'&&!(e.active&&!e.vigente)||filter.metric==='periodos'&&!e.groups.length||filter.metric==='conferencia'&&!e.issues.length)return false;
    if(filter.profession!=='todos'&&gradeProfession(e.prof)!==filter.profession)return false;
    const personMatch=!term||[e.prof?.nome,e.prof?.profissao,e.prof?.cargo].some(v=>normalizeGradeSearch(v).includes(term));
    const lotationMatch=!!e.prof&&!!unitNames.get(e.prof.unidadeId)?.includes(term);
    if(filter.period==='todos'&&filter.mode==='todos'&&(personMatch||lotationMatch))return true;
    return e.groups.some(([,r])=>(filter.period==='todos'||gradePeriod(r[0].dataInicio,r[0].dataFim,today)===filter.period)&&(filter.mode==='todos'||gradeMode(r)===filter.mode)&&(personMatch||lotationMatch||!!unitNames.get(r[0].unidadeId)?.includes(term)));
  });
}
