import {describe,it,expect} from 'vitest';
import {buildBlockDirectory,blockSummary,filterBlockDirectory,emptyBlockFilter,validBlockDate,blockStatus,type BlockFilter} from './blockDirectory';
const today='2026-11-27';
const base={id:'a',titulo:'Reunião',tipo:'reuniao',dataInicio:today,dataFim:today,diaInteiro:true,horaInicio:'',horaFim:'',unidadeId:'',profissionalId:''};
const rows=[base,{...base,id:'b',titulo:'Férias',tipo:'ferias',dataInicio:'2026-12-29',dataFim:'2027-01-04',unidadeId:'u',profissionalId:'p'},{...base,id:'c',titulo:'Quarta-feira de Cinzas (meio dia)',tipo:'feriado',dataInicio:'2026-02-18',dataFim:'2026-02-18'},{...base,id:'d',dataInicio:'2026-02-30',dataFim:'2026-03-01'},{...base,id:'e',dataInicio:'2026-10-01',dataFim:'2026-10-02',unidadeId:'u',diaInteiro:false,horaInicio:'12:00',horaFim:'08:00'},{...base,id:'f',dataInicio:'2026-12-10',dataFim:'2026-12-10',profissionalId:'unknown'}];
const people=[{id:'p',nome:'Álvaro'}],units=[{id:'u',nome:'Reabilitação'}];
const entries=buildBlockDirectory(rows,people,units,today,true,true);
const ids=(filter:Partial<BlockFilter>)=>filterBlockDirectory(entries,{...emptyBlockFilter,...filter}).map(e=>e.block.id);
describe('diretório administrativo de bloqueios',()=>{
 it('classifica vigência inclusiva e ordena sem alterar fonte',()=>{
  expect(blockSummary(entries)).toEqual({todos:6,vigente:1,futuro:2,encerrado:2,invalido:1,conferencia:4});
  expect(entries.map(e=>e.block.id)).toEqual(['a','f','b','e','c','d']);
  expect(rows.map(r=>r.id)).toEqual(['a','b','c','d','e','f']);
  expect(blockStatus(base,today)).toBe('vigente');
 });
 it('identifica datas impossíveis e intervalos invertidos',()=>{
  expect(validBlockDate('2026-02-30')).toBe(false);
  expect(validBlockDate('2028-02-29')).toBe(true);
  expect(blockStatus({...base,dataFim:'2026-11-26'},today)).toBe('invalido');
 });
 it('filtra períodos que cruzam ano e mês',()=>{
  expect(ids({year:'2027',month:'01'})).toEqual(['b']);
  expect(ids({year:'2026',month:'12'})).toEqual(['f','b']);
  expect(ids({month:'01'})).toEqual(['b']);
  expect(ids({year:'2027',month:'02'})).toEqual([]);
  expect(ids({year:'202'})).toEqual([]);
 });
 it('combina tipo, abrangência, situação e busca sem acentos',()=>{
  expect(ids({search:'alvaro',scope:'profissional',type:'ferias',status:'futuro'})).toEqual(['b']);
  expect(ids({search:'reabilitacao'})).toEqual(['b','e']);
  expect(ids({search:'reuniao',scope:'global',status:'vigente'})).toEqual(['a']);
  expect(ids({scope:'unidade',status:'encerrado'})).toEqual(['e']);
 });
 it('não interpreta descrição de meio dia como mudança no bloqueio',()=>{
  expect(ids({status:'conferencia'})).toEqual(['f','e','c','d']);
  expect(entries.find(e=>e.block.id==='c')?.block.diaInteiro).toBe(true);
  expect(entries.find(e=>e.block.id==='c')?.issues).toContain('Descrição de meio dia com bloqueio integral');
 });
 it('não declara cadastro ausente se a consulta não foi confirmada',()=>{
  const limited=buildBlockDirectory(rows,[],[],today,false,false);
  expect(limited.find(e=>e.block.id==='f')?.issues).toEqual([]);
  expect(limited.find(e=>e.block.id==='b')?.issues).toEqual([]);
  expect(blockSummary([]).todos).toBe(0);
 });
});
