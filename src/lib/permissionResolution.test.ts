import { describe, expect, it } from 'vitest';
import { resolveModulePermission } from './permissionResolution';

const base = { can_view: true, can_create: false, can_edit: false, can_delete: false, can_execute: true };
const props = { modulo: 'tratamento', unidadeId: 'u1', perfil: 'recepcao', perfilRows: [{ modulo: 'tratamento', unidade_id: '', perfil: 'recepcao', ...base }] };

describe('permission inheritance by action', () => {
  it('inherits missing individual actions without overriding explicit denials', () => {
    const resolved = resolveModulePermission({ ...props, userRows: [
      { modulo: 'tratamento', unidade_id: 'u1', can_edit: true, can_execute: false, can_view: null },
    ] });
    expect(resolved).toEqual({ ...base, can_edit: true, can_execute: false });
  });

  it('prefers the unit to the global rule for each action', () => {
    const resolved = resolveModulePermission({ ...props,
      perfilRows: [...props.perfilRows, { modulo: 'tratamento', unidade_id: 'u1', perfil: 'recepcao', can_view: false }],
      userRows: [{ modulo: 'tratamento', unidade_id: '', can_edit: true }],
    });
    expect(resolved).toEqual({ ...base, can_view: false, can_edit: true });
  });

  it('uses the canonical role for a duplicate legacy role at the same unit', () => {
    const resolved = resolveModulePermission({ ...props, perfil: 'triagem', rawRole: 'tecnico',
      perfilRows: [
        { modulo: 'tratamento', unidade_id: 'u1', perfil: 'tecnico', can_view: false },
        { modulo: 'tratamento', unidade_id: 'u1', perfil: 'triagem', can_view: true },
      ],
    });
    expect(resolved.can_view).toBe(true);
  });
});
