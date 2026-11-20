import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Landmark,
  KeyRound,
  Settings,
  Building2,
  BarChart3,
  ScrollText,
  CreditCard,
} from 'lucide-react';

/** Agency operator sidebar — 3-step autofill workflow */
export const agencyNav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/ttd-user', label: 'TTD Login', icon: KeyRound },
  { to: '/pilgrims', label: 'Pilgrims', icon: Users },
  { to: '/ready', label: 'Autofill on TTD', icon: ClipboardList },
  { to: '/settings', label: 'Settings', icon: Settings },
];

/** Super-admin platform sidebar */
export const platformNav = [
  { to: '/admin/overview', label: 'Overview', icon: LayoutDashboard, superAdminOnly: true },
  { to: '/admin/command-center', label: 'Command center', icon: Building2, superAdminOnly: true },
  { to: '/admin/agencies', label: 'Agencies', icon: Building2, superAdminOnly: true },
  { to: '/admin/users', label: 'Agency Users', icon: Users, disabled: true, superAdminOnly: true, note: 'Cross-agency user API pending' },
  {
    to: '/admin/account-references',
    label: 'Account References',
    icon: Landmark,
    superAdminOnly: true,
  },
  { to: '/admin/plans', label: 'Subscription Plans', icon: CreditCard, disabled: true, superAdminOnly: true, note: 'Billing API pending' },
  { to: '/admin/analytics', label: 'Booking Analytics', icon: BarChart3, superAdminOnly: true },
  { to: '/admin/license', label: 'License Management', icon: KeyRound, adminOnly: true },
  { to: '/admin/logs', label: 'System Logs', icon: ScrollText, disabled: true, superAdminOnly: true, note: 'Audit stream UI pending' },
  { to: '/admin/settings', label: 'Settings', icon: Settings, superAdminOnly: true },
];