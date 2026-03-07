import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { User, UserRole } from '@/types';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (usuario: string, senha: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  hasPermission: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async (authUserId: string) => {
    try {
      const { data, error } = await (supabase as any)
        .from('funcionarios')
        .select('*')
        .eq('auth_user_id', authUserId)
        .eq('ativo', true)
        .single();

      if (data && !error) {
        setUser({
          id: data.id,
          authUserId: data.auth_user_id,
          nome: data.nome,
          usuario: data.usuario,
          email: data.email,
          setor: data.setor || '',
          unidadeId: data.unidade_id || '',
          salaId: data.sala_id || '',
          cargo: data.cargo || '',
          role: data.role as UserRole,
          ativo: data.ativo,
          criadoEm: data.criado_em || '',
          criadoPor: data.criado_por || '',
          tempoAtendimento: data.tempo_atendimento || 30,
          profissao: data.profissao || '',
          tipoConselho: data.tipo_conselho || '',
          numeroConselho: data.numero_conselho || '',
          ufConselho: data.uf_conselho || '',
        });
      }
    } catch (err) {
      console.error('Error loading profile:', err);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    // IMPORTANT: Set up auth state listener BEFORE checking session (Supabase best practice)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setUser(null);
        setIsLoading(false);
      }
    });

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const login = useCallback(async (usuario: string, senha: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('auth-login', {
        body: { usuario: usuario.trim(), senha },
      });

      if (error) {
        let errorMsg = 'Erro ao conectar ao servidor.';
        try {
          if (error instanceof Error && 'context' in error) {
            const resp = (error as any).context;
            if (resp instanceof Response) {
              const body = await resp.json();
              if (body?.error) errorMsg = body.error;
            }
          }
        } catch (_) { /* fallback to generic */ }
        return { success: false, error: errorMsg };
      }

      if (data?.error) {
        return { success: false, error: data.error };
      }

      if (data?.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      if (data?.user) {
        setUser({
          ...data.user,
          criadoEm: '',
          criadoPor: '',
        });
      }

      return { success: true };
    } catch (err) {
      console.error('Login error:', err);
      return { success: false, error: 'Erro ao conectar ao servidor.' };
    }
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const hasPermission = useCallback(
    (roles: UserRole[]) => {
      if (!user) return false;
      if (user.role === 'master') return true;
      return roles.includes(user.role);
    },
    [user]
  );

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};
