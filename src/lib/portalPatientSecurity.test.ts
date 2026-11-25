import { describe, expect, it } from 'vitest';
import { parsePortalAccess, mergePortalQueue, type PortalQueueEntry } from './portalPatientSecurity';
import { PORTAL_PERMISSOES_PADRAO } from '@/types';

const status = { allowed: true, portal_ativo: true, paciente_bloqueado: false, paciente_id: 'p1', permissoes: PORTAL_PERMISSOES_PADRAO };
const row: PortalQueueEntry = { id: 'f1', paciente_id: 'p1', posicao: 1, status: 'aguardando', hora_chegada: '08:00', setor: 'Recepção', profissional_id: '' };

describe('autorização do portal', () => {
  it('nega respostas ausentes, incompletas ou contraditórias', () => {
    for (const value of [null, {}, { allowed: true }, { ...status, paciente_id: null }, { ...status, permissoes: {} }, { ...status, portal_ativo: false }, { ...status, paciente_bloqueado: true }]) expect(parsePortalAccess(value).allowed).toBe(false);
  });
  it('respeita as permissões e não propaga chaves extras', () => {
    const result = parsePortalAccess({ ...status, permissoes: { ...status.permissoes, cancelar: false, token: 'ignored' } });
    expect(result.allowed).toBe(true);
    expect(result.permissoes.cancelar).toBe(false);
    expect(result.permissoes).not.toHaveProperty('token');
  });
});
describe('fila do paciente', () => {
  it('notifica somente na transição para chamado', () => {
    const first = mergePortalQueue([row], { ...row, status: 'chamado' }, 'p1');
    expect(first.called).toBe(true);
    expect(mergePortalQueue(first.queue, { ...row, status: 'chamado' }, 'p1').called).toBe(false);
  });
  it('ignora outros pacientes e remove registros encerrados', () => {
    expect(mergePortalQueue([row], { ...row, paciente_id: 'p2', status: 'chamado' }, 'p1')).toEqual({ queue: [row], called: false });
    expect(mergePortalQueue([row], { ...row, status: 'atendido' }, 'p1').queue).toEqual([]);
  });
});
