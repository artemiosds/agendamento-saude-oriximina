import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type ModuleName =
  | 'pacientes'
  | 'encaminhamento'
  | 'fila'
  | 'triagem'
  | 'enfermagem'
  | 'agenda'
  | 'atendimento'
  | 'prontuario'
  | 'tratamento'
  | 'relatorios'
  | 'usuarios';

export interface ModulePermission {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_execute: boolean;
}

type PermissionsMap = Record<ModuleName, ModulePermission>;

interface PermissionsContextType {
  permissions: PermissionsMap | null;
  loading: boolean;
  can: (modulo: ModuleName, action: keyof ModulePermission) => boolean;
  reload: () => Promise<void>;
}

const defaultPerm: ModulePermission = {
  can_view: false,
  can_create: false,
  can_edit: false,
  can_delete: false,
  can_execute: false,
};

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
    if (!user?.role) {
      setPermissions(null);
      setLoading(false);
      return;
    }

    // Master always gets full access
    if (user.role === 'master') {
      const full: PermissionsMap = {} as PermissionsMap;
      const modules: ModuleName[] = [
        'pacientes', 'encaminhamento', 'fila', 'triagem', 'enfermagem',
        'agenda', 'atendimento', 'prontuario', 'tratamento', 'relatorios', 'usuarios',
      ];
      modules.forEach((m) => {
        full[m] = { can_view: true, can_create: true, can_edit: true, can_delete: true, can_execute: true };
      });
      setPermissions(full);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await (supabase as any)
        .from('permissoes')
        .select('modulo, can_view, can_create, can_edit, can_delete, can_execute')
        .eq('perfil', user.role);

      if (error) {
        console.error('Error loading permissions:', error);
        setLoading(false);
        return;
      }

      const map: PermissionsMap = {} as PermissionsMap;
      (data || []).forEach((row: any) => {
        map[row.modulo as ModuleName] = {
          can_view: row.can_view,
          can_create: row.can_create,
          can_edit: row.can_edit,
          can_delete: row.can_delete,
          can_execute: row.can_execute,
        };
      });
      setPermissions(map);
    } catch (err) {
      console.error('Error loading permissions:', err);
    }
    setLoading(false);
  }, [user?.role]);

  useEffect(() => {
    setLoading(true);
    loadPermissions();
  }, [loadPermissions]);

  // Realtime subscription for instant updates
  useEffect(() => {
    if (!user?.role) return;

    const channel = supabase
      .channel('permissoes-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'permissoes' }, () => {
        loadPermissions();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.role, loadPermissions]);

  const can = useCallback(
    (modulo: ModuleName, action: keyof ModulePermission): boolean => {
      if (!permissions) return false;
      const perm = permissions[modulo];
      if (!perm) return false;
      return perm[action];
    },
    [permissions]
  );

  return (
    <PermissionsContext.Provider value={{ permissions, loading, can, reload: loadPermissions }}>
      {children}
    </PermissionsContext.Provider>
  );
};
