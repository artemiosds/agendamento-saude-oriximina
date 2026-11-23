import { expect, it } from 'vitest';
import { cockpitRecordedTime, cockpitTimeline, type TimelineAttendance } from './cockpitTimeline';
const day='2026-11-23';
const row={id:'a',paciente_id:'p',profissional_id:'d',sala_id:'',iniciado_em:null};
const attendance: TimelineAttendance={id:'t',agendamento_id:'a',paciente_id:'p',profissional_id:'d',unidade_id:'u',data:day,sala_id:'s',hora_inicio:'08:30',criado_em:null};
it('usa somente horas reais e válidas da data operacional',()=>{
  expect(cockpitRecordedTime(day,'08:05')).toBe(day+'T08:05:00-03:00');
  expect(cockpitRecordedTime(day,'08:05:22')).toBe(day+'T08:05:22-03:00');
  for(const value of ['',null,'25:00','08:99','08:30 texto']) expect(cockpitRecordedTime(day,value)).toBeNull();
  expect(cockpitRecordedTime('2026-02-31','08:00')).toBeNull();
});
it('cruza paciente, profissional, unidade e data sem inferir sala pelo cadastro do funcionário',()=>{
  const result=cockpitTimeline([row],[{id:'a',paciente_id:'p',unidade_id:'u',hora_chegada:'08:00'}],[attendance],'u',day);
  expect(result.rows[0].sala_id).toBe('s');
  expect(result.arrivals.a).toBe(day+'T08:00:00-03:00'); expect(result.starts.a).toBe(day+'T08:30:00-03:00');
  for(const changed of [{unidade_id:'outra'},{data:'2026-11-22'},{paciente_id:'outro'},{profissional_id:'outro'}]) {
    const bad=cockpitTimeline([row],[{id:'a',paciente_id:'outro',unidade_id:'u',hora_chegada:'08:00'}],[{...attendance,...changed}],'u',day);
    expect(bad.rows[0].sala_id).toBe(''); expect(bad.arrivals).toEqual({}); expect(bad.starts).toEqual({});
  }
});
it('mantém vínculo explícito da Agenda e não escolhe entre salas conflitantes de atendimentos antigos',()=>{
  const other={...attendance,id:'t2',sala_id:'s2'};
  expect(cockpitTimeline([row],[],[attendance,other],'u',day).rows[0].sala_id).toBe('');
  expect(cockpitTimeline([{...row,sala_id:'s-agenda'}],[],[attendance],'u',day).rows[0].sala_id).toBe('s-agenda');
  expect(cockpitTimeline([row],[],[],'u',day).rows[0].sala_id).toBe('');
});
