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

/**
 * Sub-pages that used to follow a parent module. While a sub-page has no rule of
 * its own (profile or individual), it keeps inheriting the parent, so nobody
 * loses access; once the Master saves a rule for it, that rule wins.
 */
export const PERMISSION_PARENT: Record<string, string> = {
  historico_triagem: 'triagem',
  faltosos: 'pacientes',
  pts: 'prontuario',
  relatorio_alta: 'prontuario',
  bpa_exportar: 'relatorios',
  avaliacao_multi: 'atendimento',
  avaliacao_enfermagem: 'enfermagem',
  unidades_salas: 'usuarios',
  disponibilidade: 'usuarios',
  feriados_bloqueios: 'agenda',
  logs_auditoria: 'relatorios',
};

export function hasOwnRule(modulo: string, rows: PermissionSourceRow[]): boolean {
  return rows.some((row) => row.modulo === modulo);
}

/** Same as resolveModulePermission, but falls back to the parent module when the sub-page has no rule. */
export function resolveWithParent(input: ResolutionInput, parentDefaults?: ModulePermission): ModulePermission {
  const parent = PERMISSION_PARENT[input.modulo];
  if (parent && !hasOwnRule(input.modulo, input.perfilRows) && !hasOwnRule(input.modulo, input.userRows ?? [])) {
    return resolveModulePermission({ ...input, modulo: parent, defaults: parentDefaults ?? input.defaults });
  }
  return resolveModulePermission(input);
}
