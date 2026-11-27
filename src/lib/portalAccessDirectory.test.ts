import { describe, expect, it } from 'vitest';
import { isPortalId, portalSearchExpression, maskPortalCpf, maskPortalEmail, portalPageRange, portalLastPage, portalLinkRate } from './portalAccessDirectory';

describe('listagem administrativa do portal', () => {
  it('busca CPF completo formatado ou sem pontuação', () => {
    const filter = 'cpf.eq."12345678901",cpf.eq."123.456.789-01"';
    expect(portalSearchExpression('123.456.789-01')).toBe(filter);
    expect(portalSearchExpression('12345678901')).toBe(filter);
    expect(portalSearchExpression('789')).toContain('cpf.ilike."%789%"');
    expect(portalSearchExpression('123.456')).toContain('cpf.ilike."%123.456%"');
    expect(portalSearchExpression('Maria 123')).toBe('nome.ilike."%Maria 123%",email.ilike."%Maria 123%"');
  });
  it('mantém a busca textual dentro de valores citados e escapa curingas', () => {
    expect(portalSearchExpression('Maria Silva')).toBe('nome.ilike."%Maria Silva%",email.ilike."%Maria Silva%"');
    expect(portalSearchExpression('a_b@exemplo.com')).toContain('a\\\\_b@exemplo.com');
    expect(portalSearchExpression('x",id.not.is.null')).toContain('x\\"');
    expect(portalSearchExpression('   ')).toBeNull();
    expect(portalSearchExpression('*')).toBeNull();
  });
  it('não exibe CPF ou e-mail integral e preserva cadastro antigo sem CPF', () => {
    expect(maskPortalCpf('123.456.789-01')).toBe('***.***.***-01');
    expect(maskPortalCpf(null)).toBe('Não informado');
    expect(maskPortalCpf('123')).toBe('A conferir');
    expect(maskPortalEmail('ana@exemplo.com')).toBe('a***@e***');
    expect(maskPortalEmail('')).toBe('Sem e-mail');
  });
  it('paginação inclusiva e última página sem perder registros', () => {
    expect(portalPageRange(1,25)).toEqual({from:0,to:24});
    expect(portalPageRange(2,25)).toEqual({from:25,to:49});
    expect(portalLastPage(101,25)).toBe(5);
    expect(portalLastPage(0,25)).toBe(1);
  });
  it('não inventa percentual se a contagem estiver incompleta ou inconsistente', () => {
    const c = {todos:100,ativo:20,bloqueado:5,sem:75,semEmail:10,semCpf:0};
    expect(portalLinkRate(c)).toBe(25);
    expect(portalLinkRate({...c,ativo:null})).toBeNull();
    expect(portalLinkRate({...c,todos:101})).toBeNull();
    expect(portalLinkRate({...c,todos:0})).toBeNull();
  });
  it('valida identificadores antes de compor filtros de bloqueio', () => {
    expect(isPortalId('00000000-0000-4000-8000-000000000001')).toBe(true);
    expect(isPortalId('x),id.not.is.null')).toBe(false);
  });
});
