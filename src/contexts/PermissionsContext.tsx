import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type ModuleName =
  | 'dashboard'
  | 'agenda'
  | 'fila_espera'
  | 'pacientes'
  | 'atendimentos'
  | 'gestao_tratamentos'
  | 'prontuario'
  | 'triagem'
  | 'historico_triagem'
  | 'avaliacao_enfermagem'
  | 'pts'
  | 'avaliacao_multi'
  | 'relatorio_alta'
  | 'encaminhamentos'
  | 'encaminhamentos_externos'
  | 'arquivo_digital'
  | 'relatorios'
  | 'bpa_producao'
  | 'funcionarios'
  | 'unidades_salas'
  | 'disponibilidade'
  | 'feriados_bloqueios'
  | 'logs_auditoria'
  | 'configuracoes'
  | 'permissoes'
  | 'assinatura_eletronica'
  | 'modelos_documentos'
  | 'sistema';

export interface ModulePermission {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_execute: boolean;
  can_print: boolean;
  can_export: boolean;
  can_attach: boolean;
  can_sign: boolean;
  can_approve: boolean;
  can_cancel: boolean;
  can_configure: boolean;
  granular_actions?: Record<string, boolean>;
}

type PermissionsMap = Record<ModuleName, ModulePermission>;

interface PermissionsContextType {
  permissions: PermissionsMap | null;
  loading: boolean;
  can: (modulo: ModuleName, action: string) => boolean;
  reload: () => Promise<void>;
}

export const ALL_MODULES: ModuleName[] = [
  'dashboard', 'agenda', 'fila_espera', 'pacientes', 'atendimentos', 
  'gestao_tratamentos', 'prontuario', 'triagem', 'historico_triagem', 
  'avaliacao_enfermagem', 'pts', 'avaliacao_multi', 'relatorio_alta', 
  'encaminhamentos', 'encaminhamentos_externos', 'arquivo_digital', 
  'relatorios', 'bpa_producao', 'funcionarios', 'unidades_salas', 
  'disponibilidade', 'feriados_bloqueios', 'logs_auditoria', 
  'configuracoes', 'permissoes', 'assinatura_eletronica', 
  'modelos_documentos', 'sistema'
];

export const ALL_ACTIONS: (keyof ModulePermission)[] = [
  'can_view', 'can_create', 'can_edit', 'can_delete', 'can_execute',
  'can_print', 'can_export', 'can_attach', 'can_sign', 'can_approve', 
  'can_cancel', 'can_configure'
];

export const defaultPerm: ModulePermission = {
  can_view: false, can_create: false, can_edit: false, can_delete: false, 
  can_execute: false, can_print: false, can_export: false, can_attach: false,
  can_sign: false, can_approve: false, can_cancel: false, can_configure: false,
  granular_actions: {}
};

export const fullPerm: ModulePermission = {
  can_view: true, can_create: true, can_edit: true, can_delete: true, 
  can_execute: true, can_print: true, can_export: true, can_attach: true,
  can_sign: true, can_approve: true, can_cancel: true, can_configure: true,
  granular_actions: {} // Will be treated as full access if isGlobalAdmin
};

const DEFAULT_PERMISSIONS_BY_ROLE: Record<string, Partial<PermissionsMap>> = {
  gestor: {
    dashboard: { ...fullPerm },
    pacientes: { ...fullPerm, can_delete: false },
    agenda: { ...fullPerm },
  },
};

function buildFullMap(partial: Partial<PermissionsMap>): PermissionsMap {
  const map = {} as PermissionsMap;
  ALL_MODULES.forEach((m) => { 
    map[m] = partial[m] ? { ...defaultPerm, ...partial[m] } : { ...defaultPerm }; 
  });
  return map;
}

const PermissionsContext = createContext<PermissionsContextType | null>(null);

export const usePermissions = () => {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be used within PermissionsProvider');
  return ctx;
};

export const PermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<PermissionsMap | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPermissions = useCallback(async () => {
    if (!user) {
      setPermissions(null);
      setLoading(false);
      return;
    }

    // Só ativa o spinner no PRIMEIRO carregamento. Recargas (realtime / reload manual)
    // mantêm o estado anterior para não derrubar guards de rota durante a atualização.
    setPermissions((prev) => {
      if (prev === null) setLoading(true);
      return prev;
    });

    try {
      const role = (user.role || '').toLowerCase().trim();
      const isGlobalAdmin = user.usuario === 'admin.sms' || (role === 'master' && !user.unidadeId);

      if (isGlobalAdmin) {
        const full = {} as PermissionsMap;
        ALL_MODULES.forEach((m) => { full[m] = { ...fullPerm }; });
        setPermissions(full);
        setLoading(false);
        return;
      }

      const unidadeId = user.unidadeId || '';

      const [perfilRes, userRes] = await Promise.all([
        supabase.from('permissoes').select('*').eq('perfil', role).in('unidade_id', [unidadeId, '']),
        supabase.from('permissoes_usuario').select('*').eq('user_id', user.id).in('unidade_id', [unidadeId, ''])
      ]);

      const map: Partial<PermissionsMap> = {};
      ALL_MODULES.forEach((m) => {
        const pUnid = perfilRes.data?.find(r => r.modulo === m && r.unidade_id === unidadeId);
        const pGlob = perfilRes.data?.find(r => r.modulo === m && r.unidade_id === '');
        const activeProfile = pUnid || pGlob;

        const uUnid = userRes.data?.find(r => r.modulo === m && r.unidade_id === unidadeId);
        const uGlob = userRes.data?.find(r => r.modulo === m && r.unidade_id === '');
        const activeIndividual = uUnid || uGlob;

        // As permissões básicas vêm do perfil ou do padrão do sistema
        const profile = activeProfile || (DEFAULT_PERMISSIONS_BY_ROLE[role]?.[m]) || defaultPerm;
        
        // As permissões individuais (exceções) sobrescrevem apenas se não forem NULL
        map[m] = {
          can_view: activeIndividual?.can_view !== null && activeIndividual?.can_view !== undefined ? activeIndividual.can_view : (profile.can_view ?? false),
          can_create: activeIndividual?.can_create !== null && activeIndividual?.can_create !== undefined ? activeIndividual.can_create : (profile.can_create ?? false),
          can_edit: activeIndividual?.can_edit !== null && activeIndividual?.can_edit !== undefined ? activeIndividual.can_edit : (profile.can_edit ?? false),
          can_delete: activeIndividual?.can_delete !== null && activeIndividual?.can_delete !== undefined ? activeIndividual.can_delete : (profile.can_delete ?? false),
          can_execute: activeIndividual?.can_execute !== null && activeIndividual?.can_execute !== undefined ? activeIndividual.can_execute : (profile.can_execute ?? false),
          can_print: activeIndividual?.can_print !== null && activeIndividual?.can_print !== undefined ? activeIndividual.can_print : (profile.can_print ?? false),
          can_export: activeIndividual?.can_export !== null && activeIndividual?.can_export !== undefined ? activeIndividual.can_export : (profile.can_export ?? false),
          can_attach: activeIndividual?.can_attach !== null && activeIndividual?.can_attach !== undefined ? activeIndividual.can_attach : (profile.can_attach ?? false),
          can_sign: activeIndividual?.can_sign !== null && activeIndividual?.can_sign !== undefined ? activeIndividual.can_sign : (profile.can_sign ?? false),
          can_approve: activeIndividual?.can_approve !== null && activeIndividual?.can_approve !== undefined ? activeIndividual.can_approve : (profile.can_approve ?? false),
          can_cancel: activeIndividual?.can_cancel !== null && activeIndividual?.can_cancel !== undefined ? activeIndividual.can_cancel : (profile.can_cancel ?? false),
          can_configure: activeIndividual?.can_configure !== null && activeIndividual?.can_configure !== undefined ? activeIndividual.can_configure : (profile.can_configure ?? false),
          granular_actions: { 
            ...((profile as any).granular_actions || {}), 
            ...((activeIndividual as any)?.granular_actions || {}) 
          },
        };
      });

      setPermissions(buildFullMap(map));
    } catch (err) {
      console.error('[Permissions] Error:', err);
      setPermissions(buildFullMap({}));
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.role, user?.unidadeId, user?.usuario]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`perm-realtime-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'permissoes' }, () => loadPermissions())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'permissoes_usuario', filter: `user_id=eq.${user.id}` }, () => loadPermissions())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, loadPermissions]);

  const can = useCallback(
    (modulo: ModuleName, action: string): boolean => {
      // Durante o primeiríssimo load (sem permissões ainda), libera por padrão
      // para evitar que guards derrubem a navegação. Após carregar, o filtro real entra em vigor.
      if (!permissions) return true;

      const modPerm = permissions[modulo];
      if (!modPerm) return false;

      // Global admin / master sem unidade → libera tudo
      const isGlobalAdmin = user?.usuario === 'admin.sms';
      if (isGlobalAdmin) return true;

      // Mapeia atalhos curtos para o campo padrão CRUD
      const standardMap: Record<string, keyof ModulePermission> = {
        view: 'can_view',
        create: 'can_create',
        edit: 'can_edit',
        delete: 'can_delete',
        execute: 'can_execute',
        print: 'can_print',
        export: 'can_export',
        attach: 'can_attach',
        sign: 'can_sign',
        approve: 'can_approve',
        cancel: 'can_cancel',
        configure: 'can_configure',
      };

      const isStandardKey = action.startsWith('can_') && (action in modPerm);
      const mappedKey = standardMap[action];

      // 1) Ação padrão CRUD (can_view, can_edit, view, edit, etc.)
      if (isStandardKey) {
        return (modPerm as any)[action] === true;
      }
      if (mappedKey) {
        return (modPerm as any)[mappedKey] === true;
      }

      // 2) Ação granular específica do sistema (ex: start_appointment, finalize, generate)
      // Se foi explicitamente configurada → respeita o valor.
      if (modPerm.granular_actions && action in modPerm.granular_actions) {
        return modPerm.granular_actions[action] === true;
      }

      // 3) RETROCOMPATIBILIDADE: ações granulares não configuradas no banco
      // devem default-allow quando o usuário consegue VER o módulo.
      // Isso evita que novas ações granulares quebrem fluxos antigos que já funcionavam
      // antes da introdução do sistema de permissões granulares.
      if (modPerm.can_view) return true;

      return false;
    },
    [permissions, loading, user?.usuario]
  );

  return (
    <PermissionsContext.Provider value={{ permissions, loading, can, reload: loadPermissions }}>
      {children}
    </PermissionsContext.Provider>
  );
};
