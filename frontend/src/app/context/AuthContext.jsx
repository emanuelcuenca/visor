import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api.js';
import { AUTH_ENDPOINTS } from '../../services/endpoints/auth.js';

/**
 * Interruptor de la autenticación. Mientras VITE_AUTH_ENABLED no sea "true" (valor por defecto),
 * la app entra directo con un usuario de desarrollo y no muestra login ni registro.
 * Se activa al final del proyecto con VITE_AUTH_ENABLED=true en .env.
 */
export const AUTH_ENABLED = import.meta.env?.VITE_AUTH_ENABLED === 'true';
const DEV_USER = { nombre: 'Desarrollo', email: 'dev@local' };

const AuthContext = createContext(null);
const TOKEN_KEY = 'geosat_token';
const readToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
const applyToken = (token) => {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
};
const mensajeDe = (err, porDefecto) => {
  const detalle = err?.response?.data?.detail;
  if (typeof detalle === 'string') return detalle;
  return err?.response ? porDefecto : 'No se pudo conectar con el servidor.';
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(AUTH_ENABLED ? null : DEV_USER);
  const [status, setStatus] = useState(!AUTH_ENABLED ? 'authenticated' : readToken() && AUTH_ENDPOINTS.me ? 'loading' : 'anonymous');

  useEffect(() => {
    const token = readToken();
    if (!AUTH_ENABLED || !token || !AUTH_ENDPOINTS.me) return;
    applyToken(token);
    api.get(AUTH_ENDPOINTS.me)
      .then(({ data }) => { setUser(data); setStatus('authenticated'); })
      .catch(() => { applyToken(null); try { localStorage.removeItem(TOKEN_KEY); } catch { /* sin almacenamiento */ } setStatus('anonymous'); });
  }, []);

  const startSession = useCallback((data, fallbackUser) => {
    const token = data?.token ?? data?.access_token;
    if (!token) return false;
    applyToken(token);
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* sin almacenamiento */ }
    setUser(data.user ?? fallbackUser);
    setStatus('authenticated');
    return true;
  }, []);

  const login = useCallback(async (email, password) => {
    if (!AUTH_ENDPOINTS.login) throw new Error('El inicio de sesión todavía no está configurado (VITE_API_LOGIN).');
    try {
      const { data } = await api.post(AUTH_ENDPOINTS.login, { email, password });
      if (!startSession(data, { email })) throw new Error('El servidor no devolvió una sesión válida.');
    } catch (err) { throw new Error(err.response ? mensajeDe(err, 'Correo o contraseña incorrectos.') : err.message); }
  }, [startSession]);

  /** Devuelve { sesionIniciada }: si el backend no entrega token, la persona debe iniciar sesión después. */
  const register = useCallback(async ({ nombre, email, password }) => {
    if (!AUTH_ENDPOINTS.register) throw new Error('El registro todavía no está configurado (VITE_API_REGISTER).');
    try {
      const { data } = await api.post(AUTH_ENDPOINTS.register, { nombre, email, password });
      return { sesionIniciada: startSession(data, { nombre, email }) };
    } catch (err) { throw new Error(mensajeDe(err, 'No se pudo crear la cuenta. Revisá los datos o probá con otro correo.')); }
  }, [startSession]);

  const logout = useCallback(() => {
    if (!AUTH_ENABLED) return;
    applyToken(null);
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* sin almacenamiento */ }
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo(() => ({ user, status, login, register, logout }), [user, status, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe utilizarse dentro de AuthProvider.');
  return ctx;
}
