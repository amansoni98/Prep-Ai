import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { TOKEN_KEY } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!localStorage.getItem(TOKEN_KEY));

  // Restore session
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    api
      .get('/auth/me')
      .then((r) => setUser(r.data.user))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  // Axios interceptor signals expired sessions
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('prep-ai:unauthorized', onUnauthorized);
    return () => window.removeEventListener('prep-ai:unauthorized', onUnauthorized);
  }, []);

  const handleAuth = useCallback((data) => {
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const login = useCallback(async (email, password) => handleAuth((await api.post('/auth/login', { email, password })).data), [handleAuth]);
  const register = useCallback(
    async (name, email, password) => handleAuth((await api.post('/auth/register', { name, email, password })).data),
    [handleAuth]
  );
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
