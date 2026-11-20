import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

const STORAGE_KEY = 'darshandesk_token';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_KEY));
  const [operator, setOperator] = useState(null);
  const [license, setLicense] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      setOperator(null);
      setLicense(null);
      setLoading(false);
      return;
    }
    api
      .me(token)
      .then((data) => {
        setOperator(data.operator);
        setLicense(data.license ?? null);
      })
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY);
        setToken(null);
        setLicense(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const login = async (email, password) => {
    const data = await api.login(email, password);
    localStorage.setItem(STORAGE_KEY, data.token);
    setToken(data.token);
    setOperator(data.operator);
    setLicense(null);
    return data.operator;
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setOperator(null);
    setLicense(null);
  };

  return (
    <AuthContext.Provider value={{ token, operator, license, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}