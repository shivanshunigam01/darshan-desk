import { NavLink, Outlet } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Landmark, LogOut, Menu, X } from 'lucide-react';
import { Suspense, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { agencyNav, platformNav } from '../config/navigation.js';
import { cn } from '../lib/utils.js';
import { Button } from './ui/button.jsx';
import { Badge } from './ui/badge.jsx';
import RouteFallback from './layout/RouteFallback.jsx';

function NavItem({ item, onNavigate, collapsed }) {
  if (item.disabled) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-[var(--dd-radius-sm)] px-3 py-2 text-sm text-slate-400',
          collapsed && 'justify-center px-2'
        )}
        title={item.note || 'Not available'}
      >
        <item.icon className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        {!collapsed && (
          <>
            <span className="truncate">{item.label}</span>
            <Badge tone="warning" className="ml-auto text-[10px]">
              Soon
            </Badge>
          </>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'dd-nav-rail relative flex items-center gap-2 rounded-[var(--dd-radius-sm)] px-3 py-2 text-sm font-medium transition-colors duration-200',
          collapsed && 'justify-center px-2',
          isActive
            ? 'bg-white/12 text-white'
            : 'text-slate-300 hover:bg-white/10 hover:text-white'
        )
      }
    >
      <item.icon className="h-4 w-4 shrink-0" aria-hidden />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );
}

export default function AppShell() {
  const { operator, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const isAgencyAdmin = operator?.role === 'admin' || operator?.role === 'super_admin';
  const isSuperAdmin = operator?.role === 'super_admin';

  const visibleAgency = agencyNav.filter((i) => !i.adminOnly || isAgencyAdmin);
  const visiblePlatform = platformNav.filter((item) => {
    if (item.superAdminOnly && !isSuperAdmin) return false;
    if (item.adminOnly && !isAgencyAdmin) return false;
    return true;
  });

  const closeMobile = () => setMobileOpen(false);
  const sidebarWidth = collapsed ? 'w-[var(--dd-sidebar-collapsed)]' : 'w-[var(--dd-sidebar-width)]';

  const sidebar = (
    <div className="flex h-full flex-col bg-[var(--dd-primary)] text-white transition-[width] duration-200">
      <div className={cn('border-b border-white/10 px-4 py-5', collapsed && 'px-2 text-center')}>
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 shrink-0 text-[var(--dd-accent)]" aria-hidden />
          {!collapsed && <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">DarshanDesk</p>}
        </div>
        {!collapsed && (
          <>
            <h1 className="mt-2 text-lg font-semibold">SRIVANI Operations</h1>
            <p className="mt-1 text-sm text-slate-300">{operator?.displayName}</p>
            <Badge tone="navy" className="mt-2 bg-white/10 text-white">
              {operator?.role || 'operator'}
            </Badge>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-4">
        {!collapsed && <p className="mb-2 px-3 text-xs font-semibold uppercase text-slate-500">Agency</p>}
        <nav className="flex flex-col gap-0.5">
          {visibleAgency.map((item) => (
            <NavItem key={item.to} item={item} onNavigate={closeMobile} collapsed={collapsed} />
          ))}
        </nav>

        {(isSuperAdmin || operator?.role === 'admin') && visiblePlatform.length > 0 && (
          <>
            {!collapsed && (
              <p className="mb-2 mt-6 px-3 text-xs font-semibold uppercase text-slate-500">
                {isSuperAdmin ? 'Super admin' : 'Agency admin'}
              </p>
            )}
            <nav className="mt-2 flex flex-col gap-0.5">
              {visiblePlatform.map((item) => (
                <NavItem key={item.to} item={item} onNavigate={closeMobile} collapsed={collapsed} />
              ))}
            </nav>
          </>
        )}
      </div>

      <div className="border-t border-white/10 p-2 space-y-2">
        <button
          type="button"
          className="hidden w-full items-center justify-center rounded-[var(--dd-radius-sm)] py-2 text-slate-300 hover:bg-white/10 lg:flex"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
        <Button variant="secondary" className={cn('w-full justify-center gap-2', collapsed && 'px-2')} onClick={logout}>
          <LogOut className="h-4 w-4 shrink-0" aria-hidden />
          {!collapsed && 'Sign out'}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[var(--dd-bg)]">
      <aside className={cn('hidden shrink-0 transition-[width] duration-200 lg:block', sidebarWidth)}>{sidebar}</aside>

      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-[var(--dd-primary)]/60 lg:hidden" onClick={closeMobile} aria-hidden />
          <aside className="fixed inset-y-0 left-0 z-50 w-[var(--dd-sidebar-width)] lg:hidden">{sidebar}</aside>
          <button
            type="button"
            className="fixed right-4 top-4 z-50 rounded-[var(--dd-radius-sm)] bg-[var(--dd-surface)] p-2 shadow-[var(--dd-shadow-card)] lg:hidden"
            onClick={closeMobile}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--dd-border)] bg-[var(--dd-surface)]/95 px-4 py-3 backdrop-blur-sm lg:px-8">
          <button
            type="button"
            className="rounded-[var(--dd-radius-sm)] border border-[var(--dd-border)] p-2 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--dd-text)]">
              {operator?.displayName || 'Operator workspace'}
            </p>
            <p className="truncate text-xs text-[var(--dd-text-muted)]">
              SRIVANI operations · {operator?.role || 'operator'}
              {operator?.agencyId ? ` · ${String(operator.agencyId).slice(-8)}` : ''}
            </p>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}