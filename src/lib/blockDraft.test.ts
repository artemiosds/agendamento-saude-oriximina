import {describe,it,expect} from 'vitest';
import {blockDraftDays,blockPreset,validBlockDraft,blockDraftOverlap,reviewBlockAppointments,type BlockDraft} from './blockDraft';
const draft:BlockDraft={dataInicio:'2026-12-30',dataFim:'2027-01-02',diaInteiro:false,horaInicio:'08:00',horaFim:'12:00',scope:'profissional',unidadeId:'',profissionalId:'p'};
const block={id:'b',titulo:'Reunião',tipo:'reuniao',dataInicio:'2027-01-02',dataFim:'2027-01-02',diaInteiro:false,horaInicio:'10:00',horaFim:'14:00',unidadeId:'u',profissionalId:'p'};
describe('conferência de rascunho de bloqueio',()=>{
 it('calcula dias inclusivos e rejeita datas impossíveis',()=>{
  expect(blockDraftDays(draft.dataInicio,draft.dataFim)).toBe(4);
  expect(blockDraftDays('2028-02-28','2028-03-01')).toBe(3);
  expect(blockDraftDays('2026-02-30','2026-03-01')).toBe(null);
  expect(blockDraftDays('2026-12-02','2026-12-01')).toBe(null);
 });
 it('atalhos respeitam virada de mês e ano',()=>{
  expect(blockPreset('2026-12-31','today')).toEqual({dataInicio:'2026-12-31',dataFim:'2026-12-31'});
  expect(blockPreset('2026-12-31','tomorrow')).toEqual({dataInicio:'2027-01-01',dataFim:'2027-01-01'});
  expect(blockPreset('2026-12-30','seven')).toEqual({dataInicio:'2026-12-30',dataFim:'2027-01-05'});
  expect(blockPreset('2028-02-20','month')).toEqual({dataInicio:'2028-02-20',dataFim:'2028-02-29'});
 });
 it('valida abrangência e horário sem impor limites de cadastro novos',()=>{
  expect(validBlockDraft(draft)).toBe(true);
  expect(validBlockDraft({...draft,horaFim:'08:00'})).toBe(false);
  expect(validBlockDraft({...draft,profissionalId:''})).toBe(false);
  expect(validBlockDraft({...draft,scope:'unidade'})).toBe(false);
  expect(validBlockDraft({...draft,diaInteiro:true,horaInicio:'',horaFim:''})).toBe(true);
 });
 it('considera limites inclusivos de data e horários adjacentes não sobrepostos',()=>{
  expect(blockDraftOverlap(draft,block)).toBe('direct');
  expect(blockDraftOverlap(draft,{...block,horaInicio:'12:00'})).toBe(null);
  expect(blockDraftOverlap(draft,{...block,dataInicio:'2027-01-03',dataFim:'2027-01-03'})).toBe(null);
  expect(blockDraftOverlap(draft,{...block,diaInteiro:true})).toBe('direct');
 });
 it('preserva abrangência profissional independente da lotação',()=>{
  expect(blockDraftOverlap(draft,{...block,unidadeId:'outra'})).toBe('direct');
  expect(blockDraftOverlap(draft,{...block,profissionalId:'outro'})).toBe(null);
  expect(blockDraftOverlap(draft,{...block,profissionalId:'',unidadeId:'outra'})).toBe('possible');
  expect(blockDraftOverlap(draft,{...block,profissionalId:'',unidadeId:''})).toBe('direct');
  expect(blockDraftOverlap({...draft,scope:'unidade',unidadeId:'u'}, {...block,profissionalId:'',unidadeId:'outra'})).toBe(null);
 });
 it('conta registros segundo a regra de ocupação e sinaliza horário desconhecido',()=>{
  const rows=[{hora:'08:00',status:'confirmado'},{hora:'12:00',status:'confirmado'},{hora:'10:00',status:'cancelado'},{hora:'09:00',status:'falta'},{hora:'',status:'confirmado'},{hora:'11:59:00',status:'concluido'}];
  expect(reviewBlockAppointments(draft,rows)).toEqual({matching:2,unknown:1});
  expect(reviewBlockAppointments({...draft,diaInteiro:true},rows)).toEqual({matching:4,unknown:0});
 });
});
