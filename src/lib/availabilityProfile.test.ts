import {describe,it,expect} from 'vitest';
import {buildAvailabilityWeek,buildAvailabilityProfilePrint,profileEscape,profileDate} from './availabilityProfile';
const today='2026-11-27';
const row={id:'1',profissionalId:'p',unidadeId:'u',salaId:'t',dataInicio:'2026-11-01',dataFim:'2026-11-30',diasSemana:[1,3],horaInicio:'08:00',horaFim:'12:00',vagasPorHora:0,vagasPorDia:10};
const turns=[{id:'t',nome:'Manhã'}],rooms=[{id:'s',nome:'Consultório',unidadeId:'u'}];
const week=(rows=[row])=>buildAvailabilityWeek(rows,rooms,turns,today);
const print=(w=week())=>buildAvailabilityProfilePrint({week:w,name:'Profissional <teste>',profession:'Fisioterapia',registration:'CREFITO & registro',unit:'Unidade A',start:row.dataInicio,end:row.dataFim,status:'Vigente',emittedBy:'Administrador'});
describe('perfil semanal e ficha administrativa',()=>{
 it('preserva dias e capacidade nominal de um único período',()=>{
  const w=week();
  expect(w.valid).toBe(true);expect(w.period).toBe('vigente');expect(w.configuredDays).toBe(2);expect(w.blocks).toBe(2);expect(w.nominal).toBe(20);expect(w.days.map(d=>d.day)).toEqual([1,2,3,4,5,6,0]);expect(w.days[0].blocks[0].label).toBe('Manhã');
 });
 it('não mistura períodos, profissionais, unidades ou identificadores',()=>{
  expect(week([row,{...row,id:'2',unidadeId:'outra'}]).valid).toBe(false);
  expect(week([row,{...row,id:'2',profissionalId:'outro'}]).valid).toBe(false);
  expect(week([row,{...row,id:'2',dataFim:'2026-12-31'}]).valid).toBe(false);
  expect(week([row,row]).valid).toBe(false);
 });
 it('não inventa duração nem sala e preserva modalidade por hora',()=>{
  const w=week([{...row,salaId:'s',vagasPorHora:2}]);
  expect(w.days[0].blocks[0].label).toBe('Consultório');expect(w.days[0].blocks[0].duration).toBeNull();expect(w.mode).toBe('hora');
  expect(week([{...row,salaId:'desconhecida',vagasPorHora:2}]).days[0].blocks[0].label).toBe('Sala não localizada');
 });
 it('omite soma para sobreposição ou modalidade mista',()=>{
  const w=week([row,{...row,id:'2',horaInicio:'11:00',horaFim:'14:00'}]);
  expect(w.alerts).toBe(true);expect(w.nominal).toBeNull();expect(w.days[0].conflict).toBe(true);
  expect(week([row,{...row,id:'2',horaInicio:'12:00',horaFim:'14:00'}]).nominal).toBe(40);
  expect(week([row,{...row,id:'2',horaInicio:'12:00',horaFim:'14:00',vagasPorHora:2}]).nominal).toBeNull();
 });
 it('bloqueia impressão inconsistente e informa histórico corretamente',()=>{
  expect(week([{...row,diasSemana:[1,1]}]).valid).toBe(false);
  expect(week([{...row,horaFim:'07:00'}]).valid).toBe(false);
  expect(week([{...row,dataInicio:'2026-02-30'}]).valid).toBe(false);
  expect(()=>print(week([{...row,diasSemana:[9]}]))).toThrow();
  expect(week([{...row,dataInicio:'2026-10-01',dataFim:'2026-10-31'}]).period).toBe('encerrado');
 });
 it('escapa texto, inclui todos os dias e diferencia ficha de disponibilidade real',()=>{
  const h=print();
  expect(h).toContain('Profissional &lt;teste&gt;');expect(h).toContain('CREFITO &amp; registro');expect(h).not.toContain('Profissional <teste>');expect(h).toContain('Domingo');expect(h).toContain('Sem horário configurado');expect(h).toContain('não representa frequência');expect(h).toContain('01/11/2026');expect(profileEscape('<img>')).toBe('&lt;img&gt;');expect(profileDate('2026-02-30')).toBe('2026-02-30');
 });
});
