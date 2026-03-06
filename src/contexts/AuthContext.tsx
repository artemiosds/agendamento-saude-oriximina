import React, { createContext, useContext, useState, useCallback } from 'react';
import { User, UserRole } from '@/types';
import { mockUsers } from '@/data/mockData';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
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
  const [user, setUser] = useState<User | null>(() => {
    const saved = sessionStorage.getItem('sms_user');
    return saved ? JSON.parse(saved) : null;
  });

  const login = useCallback(async (usuario: string, senha: string) => {
    // Find user by username or email
    const found = mockUsers.find(
      (u) => (u.usuario === usuario || u.email === usuario) && u.ativo
    );

    if (!found) {
      return { success: false, error: 'Usuário não encontrado ou inativo.' };
    }

    // For the master admin, check plain password (in production would use bcrypt)
    if (found.id === 'u1') {
      if (senha !== 'sms@2025') {
        return { success: false, error: 'Senha incorreta.' };
      }
    } else {
      // For demo, any password works for other users
      if (senha !== '123456') {
        return { success: false, error: 'Senha incorreta.' };
      }
    }

    setUser(found);
    sessionStorage.setItem('sms_user', JSON.stringify(found));
    return { success: true };
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    sessionStorage.removeItem('sms_user');
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
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};
