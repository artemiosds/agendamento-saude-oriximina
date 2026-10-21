import { describe, expect, it } from 'vitest';
import { receivedReferralBody, referralDate } from './encaminhamentoDocument';
import type { EncaminhamentoData } from '@/services/encaminhamentoService';

describe('official referral document body', () => {
  it('includes patient identification, specialty, justification and original professional registration', () => {
    const html = receivedReferralBody({ paciente_nome: 'Paciente Teste', paciente_cpf: '000.000.000-00', paciente_cns: '000000000000000',
      paciente_data_nascimento: '2000-01-02', especialidade_destino: 'Fonoaudiologia', paciente_cid: 'Z00', data_geracao: '2026-10-01',
      conteudo_documento: 'Documento original', observacao: 'Justificativa registrada', profissional_origem_nome: 'Profissional Teste',
      profissional_origem_profissao: 'Fonoaudiólogo', profissional_origem_conselho: 'CRFa 123 PA' } as EncaminhamentoData);
    for (const text of ['000.000.000-00', '000000000000000', '02/01/2000', 'Fonoaudiologia', 'Justificativa registrada', 'CRFa 123 PA', 'Documento original']) expect(html).toContain(text);
  });
  it('escapes untrusted fields and makes missing information explicit', () => {
    const html = receivedReferralBody({ paciente_nome: '<script>alert(1)</script>', conteudo_documento: '<img src=x onerror=alert(1)>', observacao: '', data_geracao: '' } as EncaminhamentoData);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('Não informado');
    expect(referralDate('2000-01-02')).toBe('02/01/2000');
  });
  it('preserves formatted templates while stripping executable content', () => {
    const html = receivedReferralBody({ conteudo_documento: '<p>Texto <strong>original</strong><script>alert(1)</script></p>' } as EncaminhamentoData);
    expect(html).toContain('<strong>original</strong>');
    expect(html).not.toContain('<script>');
  });
});
