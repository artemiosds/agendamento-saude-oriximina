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

const ALL_MODULES: ModuleName[] = [
  'pacientes', 'encaminhamento', 'fila', 'triagem', 'enfermagem',
  'agenda', 'atendimento', 'prontuario', 'tratamento', 'relatorios', 'usuarios',
];

const defaultPerm: ModulePermission = {
  can_view: false,
  can_create: false,
  can_edit: false,
  can_delete: false,
  can_execute: false,
};

const fullPerm: ModulePermission = {
  can_view: true,
  can_create: true,
  can_edit: true,
  can_delete: true,
  can_execute: true,
};

const PermissionsContext = createContext<PermissionsContextType | null>(null);

export const usePermissions = () => {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be used within PermissionsProvider');
  return ctx;
};

// Permissões padrão por perfil — fallback quando não há registros na tabela
const DEFAULT_PERMISSIONS_BY_ROLE: Record<string, Partial<PermissionsMap>> = {
  gestor: {
    pacientes:      { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_execute: true  },
    encaminhamento: { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_execute: true  },
    fila:           { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_execute: true  },
    triagem:        { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_execute: true  },
    enfermagem:     { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_execute: true  },
    agenda:         { can_view: true,  can_create: true,  can_edit: true,  can_delete: true,  can_execute: true  },
    atendimento:    { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_execute: true  },
    prontuario:     { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_execute: true  },
    tratamento:     { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_execute: true  },
    relatorios:     { can_view: true,  can_create: false, can_edit: false, can_delete: false, can_execute: true  },
    usuarios:       { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_execute: false },
  },
  profissional: {
    pacientes:      { can_view: true,  can_create: false, can_edit: false, can_delete: false, can_execute: false },
    encaminhamento: { can_view: true,  can_create: false, can_edit: false, can_delete: false, can_execute: false },
    fila:           { can_view: true,  can_create: false, can_edit: false, can_delete: false, can_execute: false },
    triagem:        { can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false },
    enfermagem:     { can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false },
    agenda:         { can_view: true,  can_create: false, can_edit: false, can_delete: false, can_execute: true  },
    atendimento:    { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_execute: true  },
    prontuario:     { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_execute: true  },
    tratamento:     { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_execute: true  },
    relatorios:     { can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false },
    usuarios:       { can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false },
  },
  recepcao: {
    pacientes:      { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_execute: false },
    encaminhamento: { can_view: true,  can_create: false, can_edit: false, can_delete: false, can_execute: false },
    fila:           { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_execute: true  },
    triagem:        { can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false },
    enfermagem:     { can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false },
    agenda:         { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_execute: true  },
    atendimento:    { can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false },
    prontuario:     { can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false },
    tratamento:     { can_view: true,  can_create: false, can_edit: false, can_delete: false, can_execute: false },
    relatorios:     { can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false },
    usuarios:       { can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false },
  },
  tecnico_enfermagem: {
    pacientes:      { can_view: true,  can_create: false, can_edit: false, can_delete: false, can_execute: false },
    encaminhamento: { can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false },
    fila:           { can_view: true,  can_create: false, can_edit: true,  can_delete: false, can_execute: true  },
    triagem:        { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_execute: true  },
    enfermagem:     { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_execute: true  },
    agenda:         { can_view: true,  can_create: false, can_edit: false, can_delete: false, can_execute: false },
    atendimento:    { can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false },
    prontuario:     { can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false },
    tratamento:     { can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false },
    relatorios:     { can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false },
    usuarios:       { can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false },
  },
};

function buildFullMap(partial: Partial<PermissionsMap>): PermissionsMap {
  const map = {} as PermissionsMap;
  ALL_MODULES.forEach((m) => {
    map[m] = partial[m] ?? { ...defaultPerm };
  });
  return map;
}

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
      // 1. Buscar role direto do banco — não confiar só no AuthContext
      //    Isso evita race condition onde user.role ainda está undefined
      let role = user.role?.toLowerCase().trim();

      if (!role) {
        // Tentar buscar da tabela profiles
        const { data: profileData } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

        if (profileData?.role) {
          role = profileData.role.toLowerCase().trim();
        } else {
          // Tentar tabela usuarios como fallback
          const { data: usuarioData } = await (supabase as any)
            .from('usuarios')
            .select('perfil, role, tipo')
            .eq('id', user.id)
            .maybeSingle();

          role = (
            usuarioData?.role ||
            usuarioData?.perfil ||
            usuarioData?.tipo ||
            ''
          ).toLowerCase().trim();
        }
      }

      console.log('[Permissions] user.id:', user.id, '| role resolvido:', role);

      if (!role) {
        console.warn('[Permissions] Role não encontrado para o usuário. Sem permissões.');
        setPermissions(buildFullMap({}));
        setLoading(false);
        return;
      }

      // 2. Master sempre tem tudo
      if (role === 'master') {
        const full = {} as PermissionsMap;
        ALL_MODULES.forEach((m) => { full[m] = { ...fullPerm }; });
        setPermissions(full);
        setLoading(false);
        return;
      }

      // 3. Buscar da tabela permissoes
      const { data, error } = await (supabase as any)
        .from('permissoes')
        .select('modulo, can_view, can_create, can_edit, can_delete, can_execute')
        .eq('perfil', role);

      if (error) {
        console.error('[Permissions] Erro ao buscar tabela permissoes:', error);
        // Usar defaults por role como fallback
        const fallback = DEFAULT_PERMISSIONS_BY_ROLE[role];
        if (fallback) {
          console.warn('[Permissions] Usando permissões padrão para role:', role);
          setPermissions(buildFullMap(fallback));
        } else {
          setPermissions(buildFullMap({}));
        }
        setLoading(false);
        return;
      }

      console.log('[Permissions] Registros encontrados na tabela:', data?.length ?? 0);

      // 4. Se tabela vazia para esse role, usar defaults
      if (!data || data.length === 0) {
        console.warn('[Permissions] Nenhum registro na tabela permissoes para role:', role, '— usando defaults');
        const fallback = DEFAULT_PERMISSIONS_BY_ROLE[role];
        if (fallback) {
          setPermissions(buildFullMap(fallback));
        } else {
          // Inserir defaults no banco para não precisar fazer isso toda vez
          const defaultsForRole = DEFAULT_PERMISSIONS_BY_ROLE[role];
          if (defaultsForRole) {
            const inserts = ALL_MODULES.map((m) => ({
              perfil: role,
              modulo: m,
              ...(defaultsForRole[m] ?? defaultPerm),
            }));
            await (supabase as any).from('permissoes').insert(inserts).throwOnError();
            setPermissions(buildFullMap(defaultsForRole));
          } else {
            setPermissions(buildFullMap({}));
          }
        }
        setLoading(false);
        return;
      }

      // 5. Montar mapa com dados do banco
      const map: Partial<PermissionsMap> = {};
      (data as any[]).forEach((row) => {
        map[row.modulo as ModuleName] = {
          can_view:    row.can_view    ?? false,
          can_create:  row.can_create  ?? false,
          can_edit:    row.can_edit    ?? false,
          can_delete:  row.can_delete  ?? false,
          can_execute: row.can_execute ?? false,
        };
      });

      setPermissions(buildFullMap(map));
    } catch (err) {
      console.error('[Permissions] Erro inesperado:', err);
      setPermissions(buildFullMap({}));
    }

    setLoading(false);
  }, [user?.id, user?.role]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  // Realtime — atualiza permissões se tabela mudar
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('permissoes-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'permissoes' },
        (payload) => {
          console.log('[Permissions] Mudança detectada na tabela permissoes:', payload);
          loadPermissions();
        }
      )
      .subscribe((status) => {
        console.log('[Permissions] Realtime status:', status);
      });

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, loadPermissions]);

  const can = useCallback(
    (modulo: ModuleName, action: keyof ModulePermission): boolean => {
      if (loading) return false;
      if (!permissions) return false;
      const perm = permissions[modulo];
      if (!perm) return false;
      return perm[action] === true;
    },
    [permissions, loading]
  );

  return (
    <PermissionsContext.Provider value={{ permissions, loading, can, reload: loadPermissions }}>
      {children}
    </PermissionsContext.Provider>
  );
};
