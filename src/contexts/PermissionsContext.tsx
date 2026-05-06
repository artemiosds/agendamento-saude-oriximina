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
}

type PermissionsMap = Record<ModuleName, ModulePermission>;

interface PermissionsContextType {
  permissions: PermissionsMap | null;
  loading: boolean;
  can: (modulo: ModuleName, action: keyof ModulePermission) => boolean;
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

const defaultPerm: ModulePermission = {
  can_view: false, can_create: false, can_edit: false, can_delete: false, 
  can_execute: false, can_print: false, can_export: false, can_attach: false,
  can_sign: false, can_approve: false, can_cancel: false, can_configure: false
};

const fullPerm: ModulePermission = {
  can_view: true, can_create: true, can_edit: true, can_delete: true, 
  can_execute: true, can_print: true, can_export: true, can_attach: true,
  can_sign: true, can_approve: true, can_cancel: true, can_configure: true
};

const DEFAULT_PERMISSIONS_BY_ROLE: Record<string, Partial<PermissionsMap>> = {
  gestor: {
    dashboard: { can_view: true },
    pacientes: { can_view: true, can_create: true, can_edit: true, can_delete: false, can_execute: true },
    agenda: { can_view: true, can_create: true, can_edit: true, can_delete: true, can_execute: true },
    // ... keep others as defaults if needed, but the priority is config
  },
  // Add other roles if needed for initial seeding
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

    setLoading(true);

    try {
      const role = (user.role || '').toLowerCase().trim();
      
      // Global Master always has everything
      // user.usuario === 'admin.sms' is also a global master indicator in this app
      const isGlobalMaster = role === 'master' && (user.usuario === 'admin.sms' || !user.unidadeId);

      if (isGlobalMaster) {
        const full = {} as PermissionsMap;
        ALL_MODULES.forEach((m) => { full[m] = { ...fullPerm }; });
        setPermissions(full);
        setLoading(false);
        return;
      }

      const unidadeId = user.unidadeId || '';

      // 1. Load Profile Permissions
      const { data: perfilData } = await supabase
        .from('permissoes')
        .select('*')
        .eq('perfil', role)
        .in('unidade_id', unidadeId ? [unidadeId, ''] : ['']);

      // 2. Load Individual Overrides
      const { data: userOverrides } = await supabase
        .from('permissoes_usuario')
        .select('*')
        .eq('user_id', user.id)
        .in('unidade_id', unidadeId ? [unidadeId, ''] : ['']);

      const map: Partial<PermissionsMap> = {};
      
      ALL_MODULES.forEach((m) => {
        // Find best match for profile: unit-specific first, then global
        const pUnid = perfilData?.find(r => r.modulo === m && r.unidade_id === unidadeId);
        const pGlob = perfilData?.find(r => r.modulo === m && r.unidade_id === '');
        const activeProfile = pUnid || pGlob;

        // Find best match for individual: unit-specific first, then global
        const uUnid = userOverrides?.find(r => r.modulo === m && r.unidade_id === unidadeId);
        const uGlob = userOverrides?.find(r => r.modulo === m && r.unidade_id === '');
        const activeIndividual = uUnid || uGlob;

        // Priority: Individual > Profile > Default
        const source = activeIndividual || activeProfile;

        if (source) {
          map[m] = {
            can_view: source.can_view ?? false,
            can_create: source.can_create ?? false,
            can_edit: source.can_edit ?? false,
            can_delete: source.can_delete ?? false,
            can_execute: source.can_execute ?? false,
            can_print: source.can_print ?? false,
            can_export: source.can_export ?? false,
            can_attach: source.can_attach ?? false,
            can_sign: source.can_sign ?? false,
            can_approve: source.can_approve ?? false,
            can_cancel: source.can_cancel ?? false,
            can_configure: source.can_configure ?? false,
          };
        } else {
          // Fallback to coded defaults if no DB config exists
          map[m] = (DEFAULT_PERMISSIONS_BY_ROLE[role]?.[m]) || { ...defaultPerm };
        }
      });

      setPermissions(buildFullMap(map));
    } catch (err) {
      console.error('[Permissions] Error loading permissions:', err);
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
      .channel(`permissoes-realtime-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'permissoes' }, () => loadPermissions())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'permissoes_usuario', filter: `user_id=eq.${user.id}` }, () => loadPermissions())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, loadPermissions]);

  const can = useCallback(
    (modulo: ModuleName, action: keyof ModulePermission): boolean => {
      if (loading) return false;
      if (!permissions) return false;
      
      // Safety check for invalid module names
      if (!permissions[modulo]) {
        // Fallback for missing modules in map (shouldn't happen with buildFullMap)
        return false;
      }
      
      return permissions[modulo][action] === true;
    },
    [permissions, loading]
  );

  return (
    <PermissionsContext.Provider value={{ permissions, loading, can, reload: loadPermissions }}>
      {children}
    </PermissionsContext.Provider>
  );
};
