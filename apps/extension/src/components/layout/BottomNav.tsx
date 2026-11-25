import { Home, Users, Wallet, Sparkles, Settings, Landmark, Activity } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

const items = [
  { to: '/home', key: 'nav.home', icon: Home },
  { to: '/accounts', key: 'nav.accounts', icon: Landmark },
  { to: '/pilgrims', key: 'nav.pilgrims', icon: Users },
  { to: '/preparation', key: 'nav.preparation', icon: Wallet },
  { to: '/fill', key: 'nav.fill', icon: Sparkles },
  { to: '/monitor', key: 'nav.monitor', icon: Activity },
  { to: '/settings', key: 'nav.settings', icon: Settings },
] as const;

export function BottomNav() {
  const { t } = useTranslation();
  return (
    <nav
      className="grid grid-cols-3 gap-1 border-t border-red-100 bg-white/95 px-2 py-2 shadow-[0_-4px_16px_rgba(184,0,18,0.06)]"
      aria-label="Primary"
    >
      {items.map(({ to, key, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium text-stone-600 transition-colors',
              isActive && 'bg-temple-blush font-bold text-temple-red shadow-inner'
            )
          }
        >
          <Icon className="h-4 w-4" aria-hidden />
          <span>{t(key)}</span>
        </NavLink>
      ))}
    </nav>
  );
}