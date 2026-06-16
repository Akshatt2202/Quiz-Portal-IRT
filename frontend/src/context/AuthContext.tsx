import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

interface User { id: string; name: string; email: string; role: 'student' | 'admin'; roll_no?: string; }
interface AuthCtx { user: User | null; token: string | null; login: (email: string, password: string) => Promise<void>; logout: () => void; loading: boolean; }

const AuthContext = createContext<AuthCtx>({} as AuthCtx);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('token');
    if (stored) {
      axios.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${stored}` } })
        .then(r => { setUser(r.data); setToken(stored); })
        .catch(() => { localStorage.removeItem('token'); setToken(null); })
        .finally(() => setLoading(false));
    } else { setLoading(false); }
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await axios.post(`${API}/auth/login`, { email, password });
    if (!data.user?.role) throw new Error('Invalid user role');
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    // Explicit hard redirect based on role to clear any residual state
    window.location.href = data.user.role === 'admin' ? '/admin' : '/';
  };

  const logout = () => { localStorage.removeItem('token'); setToken(null); setUser(null); window.location.href = '/login'; };

  return <AuthContext.Provider value={{ user, token, login, logout, loading }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
export const apiClient = (token: string | null) => axios.create({ baseURL: API, headers: token ? { Authorization: `Bearer ${token}` } : {} });
