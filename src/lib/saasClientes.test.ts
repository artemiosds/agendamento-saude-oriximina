import { describe, it, expect } from 'vitest';
import { cnpjValido, diasParaVencer, licencaEfetiva, novoCliente, validarCliente } from './saasClientes';

const hoje = new Date('2026-11-07T12:00:00Z');

describe('Painel Central SaaS', () => {
  it('valida CNPJ pelos dígitos verificadores', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-82')).toBe(false);
    expect(cnpjValido('')).toBe(true);
  });
  it('cliente suspenso perde todos os módulos', () => {
    const c = { ...novoCliente(), status: 'suspenso' as const };
    expect(Object.values(licencaEfetiva(c, hoje)).some(Boolean)).toBe(false);
  });
  it('licença vencida desliga módulos mesmo com status ativo', () => {
    const c = { ...novoCliente(), status: 'ativo' as const, vencimento: '2026-11-06' };
    expect(diasParaVencer(c, hoje)).toBe(-1);
    expect(licencaEfetiva(c, hoje).faturamento_sus).toBe(false);
  });
  it('vencendo hoje ainda está liberada', () => {
    const c = { ...novoCliente(), status: 'ativo' as const, vencimento: '2026-11-07' };
    expect(licencaEfetiva(c, hoje).faturamento_sus).toBe(true);
  });
  it('exige nome e vencimento após início', () => {
    const c = { ...novoCliente(), nome: '', inicio: '2026-11-07', vencimento: '2026-01-01' };
    const e = validarCliente(c);
    expect(e).toContain('Informe o nome da instituição.');
    expect(e).toContain('Vencimento anterior ao início.');
  });
});
