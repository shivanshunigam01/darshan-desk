import { Navigate, Route, Routes } from 'react-router-dom';
import logoUrl from '../../assets/logo.jpg';
import { useAuth } from '../../hooks/useAuth';
import { BottomNav } from './BottomNav';
import { LiveClock } from './LiveClock';
import { HomePage } from '../../pages/HomePage';
import { TtdAccountsPage } from '../../pages/TtdAccountsPage';
import { PilgrimsPage } from '../../pages/PilgrimsPage';
import { PreparationPage } from '../../pages/PreparationPage';
import { ReadyToFillPage } from '../../pages/ReadyToFillPage';
import { SettingsPage } from '../../pages/SettingsPage';

export function AppShell() {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/" replace />;

  return (
    <div className="flex h-[600px] w-popup flex-col bg-temple-muted">
      <header className="flex items-center gap-2 bg-gradient-to-r from-temple-black via-[#2a0a0e] to-temple-red px-3 py-2.5 text-white shadow-md">
        <img src={logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" width={32} height={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">DarshanDesk</p>
          <p className="truncate text-[10px] text-stone-300">{auth.operator.displayName || auth.operator.email}</p>
        </div>
        <LiveClock />
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
      <BottomNav />
    </div>
  );
}
