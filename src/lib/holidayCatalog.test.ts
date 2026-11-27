import {describe,it,expect} from 'vitest';
import {holidayCatalog,holidayEligibility,holidayPayload,type ExistingHolidayBlock} from './holidayCatalog';
const y26=holidayCatalog(2026),y27=holidayCatalog(2027);
const natal=y26.find(c=>c.date==='2026-12-25')!;
const ash=y26.find(c=>c.date==='2026-02-18')!;
const b:ExistingHolidayBlock={data_inicio:natal.date,data_fim:natal.date,dia_inteiro:true,hora_inicio:'',hora_fim:'',unidade_id:'',profissional_id:'',titulo:'Outro motivo',tipo:'reuniao'};
describe('importação de feriados Oriximiná',()=>{
 it('reproduz as 21 datas distintas do decreto municipal 510/2025',()=>{
  expect(y26.length).toBe(21);expect(new Set(y26.map(c=>c.date)).size).toBe(21);
  expect(y26.filter(c=>c.kind==='nacional').length).toBe(10);
  expect(y26.filter(c=>c.kind==='municipal').map(c=>c.date)).toEqual(['2026-08-03','2026-08-17','2026-12-24']);
  expect(y26.filter(c=>c.kind==='estadual').map(c=>c.date)).toEqual(['2026-08-15']);
  expect(y26.filter(c=>c.kind==='facultativo').length).toBe(7);
 });
 it('preserva o horário parcial municipal e categoria facultativa',()=>{
  expect(ash.fullDay).toBe(false);expect(ash.start).toBe('00:00');expect(ash.end).toBe('14:00');
  expect(holidayPayload(ash,'actor')).toEqual({titulo:'Quarta-feira de Cinzas',tipo:'ferias',data_inicio:'2026-02-18',data_fim:'2026-02-18',dia_inteiro:false,hora_inicio:'00:00',hora_fim:'14:00',unidade_id:'',profissional_id:'',criado_por:'actor'});
  expect(y26.find(c=>c.date==='2026-06-04')?.kind).toBe('facultativo');
 });
 it('não presume o decreto anual de 2027 ou feriados móveis locais',()=>{
  expect(y27.filter(c=>c.verified).length).toBe(10);
  expect(y27.find(c=>c.date==='2027-03-26')?.verified).toBe(false);
  expect(y27.find(c=>c.date==='2027-05-27')?.verified).toBe(false);
  expect(y27.find(c=>c.date==='2027-02-10')?.verified).toBe(false);
  expect(y27.filter(c=>c.kind==='municipal'&&c.verified).length).toBe(0);
  expect(holidayCatalog(2028)).toEqual([]);
 });
 it('preserva qualquer bloqueio global integral, não apenas feriados de mesmo nome',()=>{
  expect(holidayEligibility(natal,[b],'2026-11-27')).toBe('coberto');
  expect(holidayEligibility(natal,[{...b,data_inicio:'2026-12-20',data_fim:'2026-12-30'}],'2026-11-27')).toBe('coberto');
  expect(holidayEligibility(natal,[{...b,unidade_id:'u'}],'2026-11-27')).toBe('disponivel');
  expect(holidayEligibility(natal,[{...b,profissional_id:'p'}],'2026-11-27')).toBe('disponivel');
 });
 it('não amplia bloqueios parciais ou altera registros antigos',()=>{
  expect(holidayEligibility(natal,[{...b,dia_inteiro:false,hora_inicio:'08:00',hora_fim:'12:00'}],'2026-11-27')).toBe('conferir');
  const partial={...b,data_inicio:ash.date,data_fim:ash.date,dia_inteiro:false,hora_inicio:'00:00',hora_fim:'14:00'};
  expect(holidayEligibility(ash,[partial],'2026-01-01')).toBe('coberto');
  expect(holidayEligibility(ash,[{...partial,hora_fim:'12:00'}],'2026-01-01')).toBe('conferir');
  expect(holidayEligibility(ash,[],'2026-11-27')).toBe('passado');
 });
 it('somente datas confirmadas futuras ou atuais são elegíveis',()=>{
  expect(holidayEligibility(natal,[],'2026-12-25')).toBe('disponivel');
  expect(holidayEligibility(natal,[],'2026-12-26')).toBe('passado');
  expect(holidayEligibility(y27.find(c=>c.date==='2027-02-10')!,[],'2026-11-27')).toBe('provisorio');
  expect(holidayEligibility(y27.find(c=>c.date==='2027-01-01')!,[],'2026-11-27')).toBe('disponivel');
 });
});
