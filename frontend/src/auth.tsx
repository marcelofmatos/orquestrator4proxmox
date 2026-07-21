import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Me } from './api.js';

interface AuthCtx { user: Me | null; loading: boolean; login: (u: string, p: string) => Promise<void>; logout: () => Promise<void>; }
const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.me().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false)); }, []);
  const login = async (u: string, p: string) => { setUser(await api.login(u, p)); };
  const logout = async () => { await api.logout(); setUser(null); };
  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}
