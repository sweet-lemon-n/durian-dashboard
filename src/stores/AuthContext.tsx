import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api';

export interface User {
  username: string;
  displayName: string;
  role: 'admin' | 'viewer';
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string, rememberMe: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ success: boolean; data: User }>('/api/auth/me', { cache: 'no-store' })
      .then((res) => {
        if (res.success) setUser(res.data);
      })
      .catch(() => {
        // Silently handle — user is simply not authenticated
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(
    async (username: string, password: string, rememberMe: boolean) => {
      const res = await api<{ success: boolean; error?: string; data?: User }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ username, password, rememberMe }),
        },
      );
      if (!res.success) throw new Error(res.error || '登录失败');
      setUser(res.data ?? null);
    },
    [],
  );

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
