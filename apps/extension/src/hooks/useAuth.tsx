import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { resolveApiBaseUrl } from '../config/api';
import {
  clearAuth,
  loadAuth,
  loadSettings,
  saveAuth,
  saveSettings,
  type ExtensionSettings,
  type OperatorAuth,
} from '../services/authStorage';
import { ApiError, fetchMe, login as apiLogin } from '../services/darshanDeskApi';

type AuthContextValue = {
  auth: OperatorAuth | null;
  settings: ExtensionSettings;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  establishAuth: (record: OperatorAuth) => Promise<void>;
  updateSettings: (patch: Partial<ExtensionSettings>) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<OperatorAuth | null>(null);
  const [settings, setSettings] = useState<ExtensionSettings>({
    language: 'en',
    apiBaseUrl: 'https://darshan.totallylearns.com',
    defaultTimezone: 'Asia/Kolkata',
    bookingAssist: false,
    paymentGateway: 'ANY',
    notifyOnContinueReady: false,
  });
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async () => {
    const [storedAuth, storedSettings] = await Promise.all([loadAuth(), loadSettings()]);
    setSettings(storedSettings);
    if (!storedAuth) {
      setAuth(null);
      setLoading(false);
      return;
    }
    try {
      const me = await fetchMe(storedAuth);
      const next: OperatorAuth = {
        ...storedAuth,
        operator: me.operator,
        license: me.license,
        savedAt: new Date().toISOString(),
      };
      await saveAuth(next);
      setAuth(next);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await clearAuth();
        setAuth(null);
      } else {
        setAuth(storedAuth);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const base = resolveApiBaseUrl();
      const { token, operator } = await apiLogin(base, email, password);
      const me = await fetchMe({ apiBaseUrl: base, token, operator, savedAt: new Date().toISOString() });
      const record: OperatorAuth = {
        apiBaseUrl: base,
        token,
        operator: me.operator,
        license: me.license,
        savedAt: new Date().toISOString(),
      };
      await saveAuth(record);
      setAuth(record);
    },
    []
  );

  const signOut = useCallback(async () => {
    await clearAuth();
    setAuth(null);
  }, []);

  const refreshSession = useCallback(async () => {
    if (!auth) return;
    const me = await fetchMe(auth);
    const next = { ...auth, operator: me.operator, license: me.license, savedAt: new Date().toISOString() };
    await saveAuth(next);
    setAuth(next);
  }, [auth]);

  const establishAuth = useCallback(async (record: OperatorAuth) => {
    await saveAuth(record);
    try {
      const me = await fetchMe(record);
      const next = { ...record, operator: me.operator, license: me.license, savedAt: new Date().toISOString() };
      await saveAuth(next);
      setAuth(next);
    } catch {
      setAuth(record);
    }
  }, []);

  const updateSettings = useCallback(async (patch: Partial<ExtensionSettings>) => {
    await saveSettings(patch);
    const next = await loadSettings();
    setSettings(next);
  }, []);

  const value = useMemo(
    () => ({ auth, settings, loading, signIn, signOut, refreshSession, establishAuth, updateSettings }),
    [auth, settings, loading, signIn, signOut, refreshSession, establishAuth, updateSettings]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}