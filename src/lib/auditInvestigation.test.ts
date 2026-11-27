import {describe,it,expect} from 'vitest';
import {auditComparisons,auditTimelineQuery,AUDIT_TIMELINE_LIMIT} from './auditInvestigation';
describe('investigação de eventos',()=>{
  it('preserva nulo, zero, falso e vazio sem substituir pelos aliases',()=>{
    const rows=auditComparisons({changes:{a:{from:null,old:'errado',to:false},b:{from:0,to:''}}});
    expect(rows[0].before).toEqual({present:true,value:null});
    expect(rows[0].after.value).toBe(false);
    expect(rows[1].before.value).toBe(0);
    expect(rows[1].after.value).toBe('');
  });
  it('combina formatos legados sem duplicar nem sobrescrever alteração explícita',()=>{
    const rows=auditComparisons({changes:{status:{from:'a',to:'b'}},detalhes:{alteracoes:{status:{anterior:'x',novo:'y'},hora:{anterior:'07',novo:'08'}},campos_alterados:['nome']}});
    expect(rows.map(r=>r.field)).toEqual(['status','hora','nome']);
    expect(rows[0].after.value).toBe('b');
    expect(rows[1].after.value).toBe('08');
    expect(rows[2].before.present).toBe(false);
  });
  it('não inventa remoção ou valor anterior em snapshots incompletos',()=>{
    const rows=auditComparisons({before:{a:1,b:2},after:{a:1,c:3}});
    expect(rows.map(r=>r.field)).toEqual(['b','c']);
    expect(rows[0].after.present).toBe(false);
    expect(rows[1].before.present).toBe(false);
    expect(auditComparisons({before:{a:1}})[0].after.present).toBe(false);
  });
  it('protege credenciais e não transforma campo listado em valor registrado',()=>{
    const rows=auditComparisons({changes:{senha:{from:'old',to:'new'}},campos_alterados:['token','cpf']});
    expect(rows[0].before.value).toBe('********');
    expect(rows[0].after.value).toBe('********');
    expect(rows[0].protected).toBe(true);
    expect(rows[1].before.present).toBe(false);
    expect(rows[2].source).toBe('listed');
  });
  it('consulta por vínculo exato e período delimitado, sem nomes',()=>{
    const q=auditTimelineQuery({id:'log-a',entidade:'agendamento',entidade_id:'ag-123',agendamento_id:'ag-123',created_at:'2026-11-27T15:00:00Z'});
    expect(q?.expression).toBe('agendamento_id.in.("ag-123"),and(entidade.in.("agendamento","agendamentos"),entidade_id.in.("ag-123"))');
    expect(q?.from).toBe('2026-11-20T15:00:00.000Z');
    expect(q?.to).toBe('2026-12-04T15:00:00.000Z');
    expect(AUDIT_TIMELINE_LIMIT).toBe(20);
  });
  it('nega vínculos genéricos, conflitantes, malformados ou sem data',()=>{
    const e={id:'log-a',entidade:'paciente',entidade_id:'pac-123',created_at:'2026-11-27T15:00:00Z'};
    expect(auditTimelineQuery({...e,entidade:'auth'})).toBeNull();
    expect(auditTimelineQuery({...e,paciente_id:'pac-456'})).toBeNull();
    expect(auditTimelineQuery({...e,entidade_id:'x",id.eq.1'})).toBeNull();
    expect(auditTimelineQuery({...e,entidade_id:'undefined'})).toBeNull();
    expect(auditTimelineQuery({...e,created_at:'invalid'})).toBeNull();
  });
});
