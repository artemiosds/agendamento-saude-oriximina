import {describe,it,expect} from 'vitest';
import {reviewDay,reviewBlocks,reviewOccupancy,reviewQuotas,draftWindowIssues,timeOverlap,gradeDay} from './availabilityReview';
const date='2026-11-27';
const grade={id:'a',profissionalId:'p',unidadeId:'u',dataInicio:'2026-11-01',dataFim:'2026-11-30',diasSemana:[5],horaInicio:'08:00',horaFim:'12:00',vagasPorHora:0,vagasPorDia:10};
const other={...grade,id:'b',horaInicio:'12:00',horaFim:'16:00'};
const block={id:'b',profissionalId:'',unidadeId:'',dataInicio:date,dataFim:date,diaInteiro:true,horaInicio:'',horaFim:''};
const quota={id:'q',profissional_interno_id:'p',unidade_id:'u',periodo_inicio:date,periodo_fim:date,turno:'manha',horario_inicio:'08:00',horario_fim:'12:00',dia_semana:5,ativo:true,vagas_total:3,vagas_usadas:1};
describe('conferência administrativa de capacidade',()=>{
 it('usa data e dia da semana e não mistura profissionais/unidades',()=>{
  expect(gradeDay(date)).toBe(5);expect(gradeDay('2026-02-30')).toBe(-1);
  expect(reviewDay([grade,{...grade,id:'x',profissionalId:'outro'}],'p','u',date).nominal).toBe(10);
  expect(reviewDay([grade],'p','u','2026-11-28').nominal).toBe(0);
 });
 it('identifica sobreposição inclusive entre unidades, sem contar duas vezes',()=>{
  expect(reviewDay([grade,{...other,horaInicio:'11:00'}],'p','u',date).conflicts).toBe(1);
  expect(reviewDay([grade,{...other,unidadeId:'outra',horaInicio:'11:00'}],'p','u',date).nominal).toBeNull();
  expect(reviewDay([grade,other],'p','u',date).nominal).toBe(20);
  expect(timeOverlap('08:00','12:00','12:00','13:00')).toBe(false);
 });
 it('não produz total enganoso para grade inválida, mista ou com múltiplas faixas por hora',()=>{
  expect(reviewDay([{...grade,horaFim:'07:00'}],'p','u',date).nominal).toBeNull();
  expect(reviewDay([grade,{...other,vagasPorHora:2}],'p','u',date).nominal).toBeNull();
  expect(reviewDay([{...grade,vagasPorHora:2},{...other,vagasPorHora:2}],'p','u',date).nominal).toBeNull();
 });
 it('separa bloqueios gerais, por unidade e profissional conforme escopo do motor',()=>{
  const blocks=[block,{...block,id:'u',unidadeId:'u'},{...block,id:'p',profissionalId:'p',unidadeId:'outra'},{...block,id:'x',unidadeId:'outra'},{...block,id:'z',diaInteiro:false,horaInicio:'13:00',horaFim:'14:00'}];
  const r=reviewBlocks(blocks,'p','u',date,[grade]);
  expect(r.map(b=>b.id)).toEqual(['b','u','p','z']);expect(r.map(b=>b.overlaps)).toEqual([true,true,true,false]);
 });
 it('reutiliza a regra de ocupação, incluindo concluídos e excluindo cancelados e faltas',()=>{
  const apps=['confirmado','concluido','falta','cancelado','remarcado'].map((status,i)=>({status,hora:'08:00',origem:i===1?'externo':'recepcao'}));
  expect(reviewOccupancy(apps)).toEqual({total:3,internal:2,external:1});
 });
 it('diferencia cotas diárias, limites do período e configurações ambíguas',()=>{
  expect(reviewQuotas([quota],[grade],'p','u',date)[0].matched).toBe(true);
  expect(reviewQuotas([{...quota,periodo_inicio:'2026-11-01'}],[grade],'p','u',date)[0].classification).toBe('limite_periodo');
  expect(reviewQuotas([{...quota,turno:'integral'}],[grade,other],'p','u',date)[0].matched).toBe(false);
  expect(reviewQuotas([{...quota,unidade_id:'outra'}],[grade],'p','u',date)).toEqual([]);
 });
 it('avisa sobre rascunhos sobrepostos sem alterar dados',()=>{
  const days=[{day:5,blocks:[{inicio:'08:00',fim:'12:00',nome:'M',vagas:10},{inicio:'11:00',fim:'14:00',nome:'T',vagas:10}]}];
  const before=JSON.stringify(days);expect(draftWindowIssues(days)).toHaveLength(1);expect(JSON.stringify(days)).toBe(before);
 });
});
