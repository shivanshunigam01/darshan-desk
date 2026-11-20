import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { AppShell } from '../components/layout/AppShell';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import '../i18n';

function AuthGate() {
  const { auth, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-[480px] w-popup items-center justify-center bg-temple-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-300 border-t-temple-red" />
      </div>
    );
  }

  if (!auth) {
    return (
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return <AppShell />;
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/*" element={<AuthGate />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}