import { describe, it, expect } from 'vitest';
import { resolveWithParent } from './permissionResolution';

const row = (modulo: string, can_view: boolean) => ({ perfil: 'recepcao', modulo, unidade_id: '', can_view, can_create: false, can_edit: false, can_delete: false, can_execute: false });

describe('submódulo segue o módulo pai até ter regra própria', () => {
  it('Histórico Triagem herda Triagem quando não tem regra', () => {
    expect(resolveWithParent({ modulo: 'historico_triagem', unidadeId: '', perfil: 'recepcao', perfilRows: [row('triagem', true)] }).can_view).toBe(true);
  });
  it('regra própria do Histórico Triagem vale mais que Triagem', () => {
    expect(resolveWithParent({ modulo: 'historico_triagem', unidadeId: '', perfil: 'recepcao', perfilRows: [row('triagem', false), row('historico_triagem', true)] }).can_view).toBe(true);
  });
  it('perfil é exigido para aplicar a regra salva', () => {
    expect(resolveWithParent({ modulo: 'agenda', unidadeId: '', perfil: 'recepcao', perfilRows: [row('agenda', false)], defaults: { can_view: true, can_create: true, can_edit: true, can_delete: true, can_execute: true } }).can_view).toBe(false);
  });
});
