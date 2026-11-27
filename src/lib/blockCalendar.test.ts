import {describe,it,expect} from 'vitest';
import {buildBlockDirectory} from './blockDirectory';
import {blockCalendarMonth,shiftBlockMonth} from './blockCalendar';
const base={id:'a',titulo:'Reunião',tipo:'reuniao',dataInicio:'2026-12-30',dataFim:'2027-01-02',diaInteiro:false,horaInicio:'08:00',horaFim:'12:00',unidadeId:'u',profissionalId:'p'};
const rows=[base,{...base,id:'b',dataInicio:'2027-01-01',dataFim:'2027-01-01',diaInteiro:true,unidadeId:'',profissionalId:''},{...base,id:'c',dataInicio:'2027-02-30',dataFim:'2027-03-01'}];
const entries=buildBlockDirectory(rows,[],[],'2026-11-27',false,false);
describe('calendário administrativo de bloqueios',()=>{
 it('navega entre meses e anos sem alterar limites',()=>{
  expect(shiftBlockMonth('2026-12',1)).toBe('2027-01');
  expect(shiftBlockMonth('2027-01',-1)).toBe('2026-12');
  expect(shiftBlockMonth('0001-01',-1)).toBe('0001-01');
  expect(shiftBlockMonth('9999-12',1)).toBe('9999-12');
  expect(shiftBlockMonth('2026-13',1)).toBe('2026-13');
 });
 it('respeita fevereiro, ano bissexto e alinhamento dos dias',()=>{
  expect(blockCalendarMonth('2028-02',[]).days.length).toBe(29);
  expect(blockCalendarMonth('2027-02',[]).days.length).toBe(28);
  expect(blockCalendarMonth('2027-01',[]).offset).toBe(5);
  expect(blockCalendarMonth('2027-01',[]).days.length).toBe(31);
  expect(blockCalendarMonth('2027-13',[]).days.length).toBe(0);
 });
 it('projeta intervalos inclusivos em cada mês sem duplicar o total de registros',()=>{
  const jan=blockCalendarMonth('2027-01',entries);
  expect(jan.count).toBe(2);
  expect(jan.days[0].entries.map(e=>e.block.id)).toEqual(['a','b']);
  expect(jan.days[1].entries.map(e=>e.block.id)).toEqual(['a']);
  expect(jan.days[2].entries.length).toBe(0);
  expect(blockCalendarMonth('2026-12',entries).days[29].entries.length).toBe(1);
  expect(blockCalendarMonth('2026-12',entries).days[30].entries.length).toBe(1);
 });
 it('respeita filtros de ano e mês inclusive em intervalos que atravessam o ano',()=>{
  expect(blockCalendarMonth('2027-01',entries,'2026','12').count).toBe(0);
  expect(blockCalendarMonth('2027-01',entries,'2027','01').count).toBe(2);
  expect(blockCalendarMonth('2027-01',entries,'','12').count).toBe(0);
  expect(blockCalendarMonth('2027-01',entries.filter(e=>e.block.id==='a')).count).toBe(1);
 });
 it('preserva modalidade, escopo e registros de origem',()=>{
  const jan=blockCalendarMonth('2027-01',entries);
  expect(jan.days[0].entries[0].block.diaInteiro).toBe(false);
  expect(jan.days[0].entries[0].scope).toBe('profissional');
  expect(jan.days[0].entries[1].scope).toBe('global');
  expect(blockCalendarMonth('2027-03',entries).count).toBe(0);
  expect(rows.map(r=>r.id)).toEqual(['a','b','c']);
 });
});
