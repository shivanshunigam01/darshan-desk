import { Home, Users, Wallet, Sparkles, Settings, Landmark } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

const items = [
  { to: '/home', key: 'nav.home', icon: Home },
  { to: '/accounts', key: 'nav.accounts', icon: Landmark },
  { to: '/pilgrims', key: 'nav.pilgrims', icon: Users },
  { to: '/preparation', key: 'nav.preparation', icon: Wallet },
  { to: '/fill', key: 'nav.fill', icon: Sparkles },
  { to: '/settings', key: 'nav.settings', icon: Settings },
] as const;

export function BottomNav() {
  const { t } = useTranslation();
  return (
    <nav
      className="grid grid-cols-3 gap-1 border-t border-stone-200 bg-white px-2 py-2"
      aria-label="Primary"
    >
      {items.map(({ to, key, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium text-stone-600 transition-colors',
              isActive && 'bg-stone-100 text-temple-red'
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