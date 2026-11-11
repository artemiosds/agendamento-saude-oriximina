import type { ModulePermission } from '@/contexts/PermissionsContext';

export const PERMISSION_ACTIONS = ['can_view', 'can_create', 'can_edit', 'can_delete', 'can_execute'] as const;

type PermissionAction = typeof PERMISSION_ACTIONS[number];

export type PermissionSourceRow = {
  modulo: string;
  unidade_id: string;
  perfil?: string;
} & Partial<Record<PermissionAction, boolean | null>>;

interface ResolutionInput {
  modulo: string;
  unidadeId: string;
  perfil: string;
  rawRole?: string;
  perfilRows: PermissionSourceRow[];
  userRows?: PermissionSourceRow[];
  defaults?: ModulePermission;
}

/** A NULL action inherits the next source. An explicit false always denies it. */
export function resolveModulePermission({
  modulo, unidadeId, perfil, rawRole, perfilRows, userRows = [], defaults,
}: ResolutionInput): ModulePermission {
  const choose = (rows: PermissionSourceRow[], unit: string, profile?: string) => {
    const matches = rows.filter((row) => row.modulo === modulo && row.unidade_id === unit);
    if (!profile) return matches[0];
    return matches.find((row) => row.perfil === profile)
      ?? matches.find((row) => row.perfil === rawRole);
  };

  const candidates = [
    ...(unidadeId ? [choose(userRows, unidadeId)] : []),
    choose(userRows, ''),
    ...(unidadeId ? [choose(perfilRows, unidadeId, perfil)] : []),
    choose(perfilRows, '', perfil),
  ];

  const effective = {} as ModulePermission;
  for (const action of PERMISSION_ACTIONS) {
    effective[action] = candidates.find((row) => row?.[action] != null)?.[action]
      ?? defaults?.[action]
      ?? false;
  }
  return effective;
}
