import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Landmark, Users, UserCircle, Wallet, Sparkles } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Alert } from '../components/ui/alert';
import { useAuth } from '../hooks/useAuth';
import { ApiError, apiGet } from '../services/darshanDeskApi';

type HomeSummary = {
  agencyName: string;
  licenseStatus: string;
  operatorCount: number;
  pilgrimCount: number;
  ttdAccountCount: number;
  preparationCount: number;
  validatedPreparations: number;
  accountAgeDays: number;
  yourRole: string;
};

function StatTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-red-100 bg-gradient-to-br from-white to-temple-blush p-3 shadow-sm">
      <div className="mb-1 flex items-center gap-1.5 text-temple-red">
        <Icon className="h-4 w-4" aria-hidden />
        <span className="text-[10px] font-bold uppercase tracking-wide text-stone-600">{label}</span>
      </div>
      <p className="text-xl font-extrabold text-temple-black">{value}</p>
    </div>
  );
}

export function HomePage() {
  const { t } = useTranslation();
  const { auth } = useAuth();
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!auth) return;
    apiGet<HomeSummary>(auth, '/api/extension/home-summary')
      .then(setSummary)
      .catch((e) => setError(e instanceof ApiError ? e.message : t('home.loadError')));
  }, [auth, t]);

  const ageLabel =
    summary == null
      ? '—'
      : summary.accountAgeDays === 0
        ? t('home.accountAgeToday')
        : t('home.accountAgeDays', { days: summary.accountAgeDays });

  return (
    <div className="animate-fade-in space-y-3 pb-2">
      <div>
        <h2 className="dd-page-title text-base">{t('home.dashboard')}</h2>
        <p className="text-xs text-stone-600">
          {summary?.agencyName || auth?.operator.displayName || t('home.welcome')}
        </p>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="grid grid-cols-2 gap-2">
        <StatTile label={t('home.users')} value={summary?.operatorCount ?? '…'} icon={UserCircle} />
        <StatTile label={t('home.pilgrims')} value={summary?.pilgrimCount ?? '…'} icon={Users} />
        <StatTile label={t('home.ttdAccounts')} value={summary?.ttdAccountCount ?? '…'} icon={Landmark} />
        <StatTile label={t('home.preparations')} value={summary?.preparationCount ?? '…'} icon={Wallet} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-temple-red">
            <CalendarDays className="h-4 w-4" />
            {t('home.accountAge')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-lg font-bold text-temple-black">{ageLabel}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">{summary?.yourRole || auth?.operator.role}</Badge>
            <Badge variant={summary?.licenseStatus === 'active' ? 'success' : 'warn'}>
              {t('home.license')}: {summary?.licenseStatus || auth?.license?.status || 'trial'}
            </Badge>
            <Badge variant="default">
              <Sparkles className="mr-1 inline h-3 w-3" />
              {t('home.validatedPrep', { count: summary?.validatedPreparations ?? 0 })}
            </Badge>
          </div>
          <p className="text-xs text-stone-600">{t('home.subtitle')}</p>
        </CardContent>
      </Card>
    </div>
  );
}