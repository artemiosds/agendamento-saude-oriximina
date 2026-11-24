import { describe, expect, it } from 'vitest';
import { canUseTeamEvaluation, pendingTeamMembers, validateTeamRequest } from './teamEvaluation';

describe('avaliação em equipe', () => {
  it('oferece a função aos profissionais e Master ativos, sem abrir acesso à recepção', () => {
    for (const role of ['master', 'profissional', 'enfermagem'] as const) expect(canUseTeamEvaluation({ role, ativo: true })).toBe(true);
    expect(canUseTeamEvaluation({ role: 'recepcao', ativo: true })).toBe(false);
    expect(canUseTeamEvaluation({ role: 'profissional', ativo: false })).toBe(false);
    expect(canUseTeamEvaluation(null)).toBe(false);
  });
  it('não confunde dois profissionais com a mesma especialidade', () => {
    const members = ['a', 'b'].map(id => ({ id, name: id, specialty: 'Fisioterapia', reason: 'Avaliar' }));
    expect(pendingTeamMembers({ members, opinions: [{ professional_id: 'a', name: 'a', specialty: 'Fisioterapia', evaluation: 'Avaliado', recommendations: '', created_at: '' }] })).toEqual([members[1]]);
  });
  it('exige contexto e motivo individual e rejeita duplicação', () => {
    const member = { id: 'a', name: 'A', specialty: 'Nutrição', reason: 'Avaliar alimentação' };
    expect(validateTeamRequest('', [member])).toBeTruthy();
    expect(validateTeamRequest('Contexto', [])).toBeTruthy();
    expect(validateTeamRequest('Contexto', [member, member])).toBeTruthy();
    expect(validateTeamRequest('Contexto', [{ ...member, reason: ' ' }])).toBeTruthy();
    expect(validateTeamRequest('Contexto', [member])).toBeNull();
  });
});
