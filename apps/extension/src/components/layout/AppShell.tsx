import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import logoUrl from '../../assets/logo.jpg';
import { BottomNav } from './BottomNav';
import { LiveClock } from './LiveClock';
import { LoginPage } from '../../pages/LoginPage';
import { HomePage } from '../../pages/HomePage';
import { TtdAccountsPage } from '../../pages/TtdAccountsPage';
import { PilgrimsPage } from '../../pages/PilgrimsPage';
import { PreparationPage } from '../../pages/PreparationPage';
import { ReadyToFillPage } from '../../pages/ReadyToFillPage';
import { SettingsPage } from '../../pages/SettingsPage';

export function AppShell() {
  const { auth, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-[480px] w-popup items-center justify-center bg-temple-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-300 border-t-temple-red" />
      </div>
    );
  }

  if (!auth) {
    return <LoginPage />;
  }

  return (
    <div className="flex h-[600px] w-popup flex-col bg-temple-muted">
      <header className="flex items-center gap-2 border-b border-stone-200 bg-temple-black px-3 py-2 text-white">
        <img src={logoUrl} alt="" className="h-8 w-8 rounded-full object-cover" width={32} height={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">DarshanDesk</p>
          <p className="truncate text-[10px] text-stone-300">{auth.operator.displayName || auth.operator.email}</p>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/accounts" element={<TtdAccountsPage />} />
          <Route path="/pilgrims" element={<PilgrimsPage />} />
          <Route path="/preparation" element={<PreparationPage />} />
          <Route path="/fill" element={<ReadyToFillPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </div>
      <div className="px-3 pb-2">
        <LiveClock />
      </div>
      <BottomNav />
    </div>
  );
}
