import { describe, expect, it } from 'vitest';
import { auditSearchTerm,auditLike,auditQuote,auditCpfVariants,auditActorCpfSearch,auditRelatedSearch,auditTextSearch,auditEntityRef,auditPageRange,auditLastPage,AuditReadCache,AUDIT_CACHE_LIMIT,AUDIT_CACHE_TTL,AUDIT_OR_BUDGET } from './auditDirectory';
describe('motor de consulta de auditoria',()=>{
  it('escapa sintaxe de pesquisa e curingas',()=>{
    expect(auditSearchTerm('  Maria  ')).toBe('Maria');
    expect(auditSearchTerm('*')).toBe('');
    expect(auditLike('a_b%')).toBe('%a\\_b\\%%');
    expect(auditQuote('x",id.eq.1')).toBe('"x\\",id.eq.1"');
    expect(auditTextSearch('x",id.eq.1')[0]).toBe('user_nome.ilike."%x\\",id.eq.1%"');
  });
  it('filtra CPF completo histórico ou funcionário vinculado, sem inventar CPF',()=>{
    expect(auditCpfVariants('123.456.789-01')).toEqual(['12345678901','123.456.789-01']);
    expect(auditCpfVariants('123')).toEqual([]);
    expect(auditCpfVariants('x12345678901')).toEqual([]);
    expect(auditActorCpfSearch(['12345678901'],['f1'])).toBe('detalhes->>usuario_cpf.eq."12345678901",user_id.in.("f1")');
  });
  it('inclui vínculos diretos e históricos com entidade compatível, sinaliza limite',()=>{
    const r=auditRelatedSearch(['acao.ilike."%teste%"'],[{ids:['p1'],field:'paciente_id',entity:'paciente'}]);
    expect(r.expression).toContain('paciente_id.in.("p1")');
    expect(r.expression).toContain('and(entidade.in.("paciente","pacientes"),entidade_id.in.("p1"))');
    expect(auditRelatedSearch([],[{ids:['p1','p2','p1'],field:'paciente_id',entity:'paciente'}]).expression).toBe('paciente_id.in.("p1","p2"),and(entidade.in.("paciente","pacientes"),entidade_id.in.("p1","p2"))');
    expect(r.limited).toBe(false);
    const huge=auditRelatedSearch([], [{ids:Array.from({length:100},(_,i)=>'a'.repeat(80)+i),field:'paciente_id',entity:'paciente'}]);
    expect(huge.limited).toBe(true);
    expect(encodeURIComponent(huge.expression).length<=AUDIT_OR_BUDGET).toBe(true);
  });
  it('usa tipo explícito, não prefixo, e não confunde paciente com agendamento',()=>{
    expect(auditEntityRef({entidade:'prontuario',entidade_id:'pr1',paciente_id:'p1'})).toEqual({kind:'prontuario',id:'pr1'});
    expect(auditEntityRef({entidade:'agendamento',entidade_id:'ag1',paciente_id:'p1'})).toEqual({kind:'agendamento',id:'ag1'});
    expect(auditEntityRef({entidade:'auth',entidade_id:'p1'})).toBeNull();
    expect(auditEntityRef({entidade:'constructor',entidade_id:'p1'})).toBeNull();
    expect(auditEntityRef({entidade:'paciente',paciente_id:'p1'})).toEqual({kind:'paciente',id:'p1'});
  });
  it('calcula páginas e corrige última página vazia',()=>{
    expect(auditPageRange(0)).toEqual({from:0,to:24});
    expect(auditPageRange(1)).toEqual({from:25,to:49});
    expect(auditLastPage(51)).toBe(2);
    expect(auditLastPage(0)).toBe(0);
  });
  it('limita cache, expira e permite limpar ao atualizar',()=>{
    const cache=new AuditReadCache<string>();
    for(let i=0;i<AUDIT_CACHE_LIMIT+1;i++) cache.set(String(i),'ok',0);
    expect(cache.size).toBe(AUDIT_CACHE_LIMIT);
    expect(cache.get('0',1)).toBeUndefined();
    expect(cache.get('1',1)).toBe('ok');
    expect(cache.get('1',AUDIT_CACHE_TTL)).toBeUndefined();
    cache.clear();expect(cache.size).toBe(0);
  });
});
