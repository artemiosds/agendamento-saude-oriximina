import { describe, expect, it } from 'vitest';
import { canManagePortalPatient, portalEmail, portalAccountExclusive, portalCanInvite } from '../../supabase/functions/_shared/portal-credentials';
describe('credenciais do portal', () => {
  const master = { role: 'master', usuario: 'master.local', unidade_id: 'u1', ativo: true };
  it('restringe Master local à unidade e nega vínculos ausentes', () => {
    expect(canManagePortalPatient(master, { unidade_id: 'u1' })).toBe(true);
    for (const unidade_id of ['u2', '', null, undefined]) expect(canManagePortalPatient(master, { unidade_id })).toBe(false);
    expect(canManagePortalPatient({ ...master, unidade_id: null }, { unidade_id: 'u1' })).toBe(false);
  });
  it('só permite Master Global ativo em toda a rede', () => {
    const global = { ...master, usuario: 'admin.sms', unidade_id: null };
    expect(canManagePortalPatient(global, { unidade_id: null })).toBe(true);
    expect(canManagePortalPatient({ ...global, ativo: false }, { unidade_id: 'u1' })).toBe(false);
    expect(canManagePortalPatient({ ...global, role: 'recepcao' }, { unidade_id: 'u1' })).toBe(false);
  });
  it('rejeita contas compartilhadas e vínculos de profissionais', () => {
    expect(portalAccountExclusive(['p1'], 'p1', 0, 0)).toBe(true);
    expect(portalAccountExclusive(['p1','p2'], 'p1', 0, 0)).toBe(false);
    expect(portalAccountExclusive(['p2'], 'p1', 0, 0)).toBe(false);
    expect(portalAccountExclusive([], 'p1', 0, 0)).toBe(false);
    expect(portalAccountExclusive(['p1'], 'p1', 1, 0)).toBe(false);
    expect(portalAccountExclusive(['p1'], 'p1', 0, 1)).toBe(false);
  });
  it('normaliza somente e-mail válido', () => {
    expect(portalEmail('  TESTE@exemplo.com ')).toBe('teste@exemplo.com');
    for (const value of ['',null,123,'sem-email','a@b','a b@exemplo.com']) expect(portalEmail(value)).toBeNull();
  });
  it('respeita bloqueios, configuração inválida e padrão legado', () => {
    expect(portalCanInvite(null, 'p1')).toBe(true);
    expect(portalCanInvite({}, 'p1')).toBe(true);
    expect(portalCanInvite({ permitirPortal: false }, 'p1')).toBe(false);
    expect(portalCanInvite({ permitirPortal: 'true' }, 'p1')).toBe(false);
    expect(portalCanInvite({ pacientesBloqueados: ['p1'] }, 'p1')).toBe(false);
    expect(portalCanInvite({ pacientesBloqueados: ['p2'] }, 'p1')).toBe(true);
    expect(portalCanInvite({ pacientesBloqueados: 'p1' }, 'p1')).toBe(false);
    expect(portalCanInvite([], 'p1')).toBe(false);
  });
});
