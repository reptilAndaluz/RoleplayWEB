import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { UserPublic, LoginInput, RegisterInput } from '@rol/shared';
import { api, ApiError } from '../lib/api.js';

interface AuthContextValue {
  user: UserPublic | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.get<{ user: UserPublic }>('/api/auth/me');
      setUser(data.user);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) {
        setUser(null);
      } else {
        // En caso de fallo de red u otros errores, reseteamos a null
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = async (input: LoginInput) => {
    const data = await api.post<{ user: UserPublic }>('/api/auth/login', input);
    setUser(data.user);
  };

  const register = async (input: RegisterInput) => {
    const data = await api.post<{ user: UserPublic }>('/api/auth/register', input);
    setUser(data.user);
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
