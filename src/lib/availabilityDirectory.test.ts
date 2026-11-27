import {describe,it,expect} from 'vitest';
import {buildGradeDirectory,gradeSummary,filterGradeDirectory,gradePeriod,gradeMode,type GradeFilter} from './availabilityDirectory';
const today='2026-11-27';
const person=(id:string,unit:string)=>({id,nome:id==='p1'?'Álvaro':id,unidadeId:unit,role:'profissional',ativo:true,profissao:'Fisio'});
const row=(id:string,p:string,u:string,start:string,end:string,mode=0)=>({id,profissionalId:p,unidadeId:u,dataInicio:start,dataFim:end,vagasPorHora:mode,diasSemana:[1]});
const groups=new Map([
 ['a',[row('a','p1','u1','2026-11-01',today)]],
 ['b',[row('b','p1','u1','2026-12-01','2026-12-31',2)]],
 ['c',[row('c','p2','u1','2026-01-01','2026-02-01')]],
 ['d',[row('d','missing','u1',today,today)]],
 ['e',[row('e','p4','u2',today,today)]]
]);
const people=[person('p1','u1'),person('p2','u1'),person('p3','u1'),person('p4','u2')];
const units=[{id:'u1',nome:'Reabilitação'},{id:'u2',nome:'Outro'}];
const entries=buildGradeDirectory(groups,people,units,'all',false,'u1',today);
const filter=(overrides:Partial<GradeFilter>)=>filterGradeDirectory(entries,units,{metric:'todos',period:'todos',mode:'todos',profession:'todos',search:'',...overrides},today).map(([id])=>id);
describe('projeção administrativa da disponibilidade',()=>{
 it('inclui ativos sem grade e separa vínculos ausentes',()=>{
  expect(gradeSummary(entries,today)).toEqual({ativos:3,vigentes:1,semVigencia:2,periodos:4,conferencia:1,periods:{vigente:2,futuro:1,encerrado:1,invalido:0}});
  expect(filter({metric:'sem_vigencia'}).sort()).toEqual(['p2','p3']);
  expect(filter({metric:'conferencia'})).toEqual(['missing']);
 });
 it('não mistura períodos e modalidades de grupos diferentes',()=>{
  expect(filter({period:'vigente',mode:'hora'})).toEqual([]);
  expect(filter({period:'futuro',mode:'hora'})).toEqual(['p1']);
 });
 it('busca sem acentos por profissional e unidade',()=>{
  expect(filter({search:'alvaro'})).toEqual(['p1']);
  expect(filter({search:'reabilitacao'})).toHaveLength(4);
 });
 it('isola unidades e bloqueia escopo local vazio',()=>{
  expect(buildGradeDirectory(groups,people,units,'all',false,'',today)).toHaveLength(0);
  expect(buildGradeDirectory(groups,people,units,'u2',true,'u1',today)).toHaveLength(1);
  expect(entries.some(([id])=>id==='p4')).toBe(false);
 });
 it('classifica limites inclusivos e períodos invertidos',()=>{
  expect(gradePeriod(today,today,today)).toBe('vigente');
  expect(gradePeriod('2026-12-01',today,today)).toBe('invalido');
 });
 it('identifica modalidade mista sem alterar fonte',()=>{
  expect(gradeMode([row('x','p1','u1',today,today),row('y','p1','u1',today,today,2)])).toBe('misto');
  expect(groups.size).toBe(5);
 });
});
