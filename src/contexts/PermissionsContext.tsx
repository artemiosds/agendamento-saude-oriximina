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
  can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false,
};

const fullPerm: ModulePermission = {
  can_view: true, can_create: true, can_edit: true, can_delete: true, can_execute: true,
};

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
  coordenador: {
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
  tecnico: {
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
  enfermagem: {
    pacientes:      { can_view: true,  can_create: false, can_edit: false, can_delete: false, can_execute: false },
    encaminhamento: { can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false },
    fila:           { can_view: true,  can_create: false, can_edit: true,  can_delete: false, can_execute: true  },
    triagem:        { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_execute: true  },
    enfermagem:     { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_execute: true  },
    agenda:         { can_view: true,  can_create: false, can_edit: false, can_delete: false, can_execute: false },
    atendimento:    { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_execute: true  },
    prontuario:     { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_execute: false },
    tratamento:     { can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false },
    relatorios:     { can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false },
    usuarios:       { can_view: false, can_create: false, can_edit: false, can_delete: false, can_execute: false },
  },
};

function buildFullMap(partial: Partial<PermissionsMap>): PermissionsMap {
  const map = {} as PermissionsMap;
  ALL_MODULES.forEach((m) => { map[m] = partial[m] ?? { ...defaultPerm }; });
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
      // AuthContext já buscou o role da tabela 'funcionarios' — usar diretamente
      const role = (user.role || '').toLowerCase().trim();

      // role resolved from AuthContext

      if (!role) {
        console.warn('[Permissions] Role vazio');
        setPermissions(buildFullMap({}));
        setLoading(false);
        return;
      }

      // Master tem tudo
      if (role === 'master') {
        const full = {} as PermissionsMap;
        ALL_MODULES.forEach((m) => { full[m] = { ...fullPerm }; });
        setPermissions(full);
        setLoading(false);
        return;
      }

      const unidadeId = user.unidadeId || '';

      // Buscar permissões de perfil (unidade específica + global como fallback)
      const { data: perfilData, error: perfilErr } = await (supabase as any)
        .from('permissoes')
        .select('modulo, can_view, can_create, can_edit, can_delete, can_execute, unidade_id')
        .eq('perfil', role)
        .in('unidade_id', unidadeId ? [unidadeId, ''] : ['']);

      if (perfilErr) {
        console.error('[Permissions] Erro perfil:', perfilErr);
        setPermissions(buildFullMap(DEFAULT_PERMISSIONS_BY_ROLE[role] ?? {}));
        setLoading(false);
        return;
      }

      // Buscar overrides do usuário
      const { data: userOverrides } = await (supabase as any)
        .from('permissoes_usuario')
        .select('modulo, can_view, can_create, can_edit, can_delete, can_execute, unidade_id')
        .eq('user_id', user.id)
        .in('unidade_id', unidadeId ? [unidadeId, ''] : ['']);

      // Sem dados de perfil — semear defaults globais (unidade_id='')
      if (!perfilData || perfilData.length === 0) {
        const defaults = DEFAULT_PERMISSIONS_BY_ROLE[role];
        if (defaults) {
          const inserts = ALL_MODULES.map((m) => ({
            perfil: role,
            modulo: m,
            unidade_id: '',
            ...(defaults[m] ?? defaultPerm),
          }));
          await (supabase as any)
            .from('permissoes')
            .upsert(inserts, { onConflict: 'perfil,modulo,unidade_id' });
        }
      }

      // Montar mapa: prioridade = override usuário (unidade > global) > perfil (unidade > global)
      const map: Partial<PermissionsMap> = {};
      ALL_MODULES.forEach((m) => {
        // perfil global
        const pGlob = (perfilData || []).find((r: any) => r.modulo === m && r.unidade_id === '');
        // perfil unidade
        const pUnid = (perfilData || []).find((r: any) => r.modulo === m && r.unidade_id === unidadeId && unidadeId);
        // user global / unidade
        const uGlob = (userOverrides || []).find((r: any) => r.modulo === m && r.unidade_id === '');
        const uUnid = (userOverrides || []).find((r: any) => r.modulo === m && r.unidade_id === unidadeId && unidadeId);

        const pick = uUnid || uGlob || pUnid || pGlob;
        if (pick) {
          map[m] = {
            can_view: pick.can_view ?? false,
            can_create: pick.can_create ?? false,
            can_edit: pick.can_edit ?? false,
            can_delete: pick.can_delete ?? false,
            can_execute: pick.can_execute ?? false,
          };
        } else {
          map[m] = (DEFAULT_PERMISSIONS_BY_ROLE[role]?.[m]) ?? defaultPerm;
        }
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

  // Realtime: reage a mudanças em perfil OU overrides do usuário
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`permissoes-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'permissoes' }, () => {
        loadPermissions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'permissoes_usuario', filter: `user_id=eq.${user.id}` }, () => {
        loadPermissions();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, loadPermissions]);

  const can = useCallback(
    (modulo: ModuleName, action: keyof ModulePermission): boolean => {
      if (loading) return false;
      if (!permissions) return false;
      return permissions[modulo]?.[action] === true;
    },
    [permissions, loading]
  );

  return (
    <PermissionsContext.Provider value={{ permissions, loading, can, reload: loadPermissions }}>
      {children}
    </PermissionsContext.Provider>
  );
};
