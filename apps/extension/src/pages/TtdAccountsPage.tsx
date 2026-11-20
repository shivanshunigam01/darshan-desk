import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { useAuth } from '../hooks/useAuth';
import { ApiError, apiGet, apiPost } from '../services/darshanDeskApi';
import { savePortalCredentials } from '../shared/portalCredentials';

type TtdRow = {
  _id: string;
  accountLabel: string;
  maskedLogin?: string;
  authorizationStatus?: string;
  status?: string;
};

export function TtdAccountsPage() {
  const { t } = useTranslation();
  const { auth } = useAuth();
  const [rows, setRows] = useState<TtdRow[]>([]);
  const [q, setQ] = useState('');
  const [label, setLabel] = useState('');
  const [loginId, setLoginId] = useState('');
  const [devicePassword, setDevicePassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    if (!auth) return;
    setLoading(true);
    setError('');
    try {
      const query = q ? `?q=${encodeURIComponent(q)}` : '';
      const data = await apiGet<{ accounts: TtdRow[] }>(auth, `/api/ttd-accounts${query}`);
      setRows(data.accounts || []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('accounts.loadError'));
    } finally {
      setLoading(false);
    }
  }, [auth, q, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await apiPost(auth, '/api/ttd-accounts', {
        accountLabel: label.trim(),
        loginIdentifier: loginId.trim(),
      });
      if (loginId.trim() && devicePassword) {
        await savePortalCredentials({
          loginId: loginId.trim(),
          password: devicePassword,
          label: label.trim(),
          savedAt: new Date().toISOString(),
        });
      }
      setLabel('');
      setLoginId('');
      setDevicePassword('');
      setSuccess(t('accounts.created'));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('accounts.saveError'));
    } finally {
      setBusy(false);
    }
  };

  const authorize = async (id: string) => {
    if (!auth) return;
    setBusy(true);
    setError('');
    try {
      await apiPost(auth, `/api/ttd-accounts/${id}/consent`, { acknowledged: true });
      setSuccess(t('accounts.authorized'));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('accounts.saveError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-3 pb-2">
      <h2 className="dd-page-title text-base">{t('nav.accounts')}</h2>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-temple-red">
            <Plus className="h-4 w-4" />
            {t('accounts.add')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-2" onSubmit={create}>
            <Input placeholder={t('accounts.label')} value={label} onChange={(e) => setLabel(e.target.value)} required />
            <Input placeholder={t('accounts.loginId')} value={loginId} onChange={(e) => setLoginId(e.target.value)} required />
            <Input
              type="password"
              placeholder={t('accounts.devicePassword')}
              value={devicePassword}
              onChange={(e) => setDevicePassword(e.target.value)}
              autoComplete="new-password"
            />
            <p className="text-[10px] text-stone-500">{t('accounts.passwordNote')}</p>
            <Button type="submit" className="w-full" disabled={busy}>
              {t('accounts.save')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Input placeholder={t('accounts.search')} value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => void load()} />

      {error && <Alert variant="destructive">{error}</Alert>}
      {success && <Alert>{success}</Alert>}

      {loading ? (
        <p className="text-center text-xs text-stone-500">{t('accounts.loading')}</p>
      ) : rows.length === 0 ? (
        <Alert variant="info">{t('accounts.empty')}</Alert>
      ) : (
        <ul className="space-y-2">
          {rows.map((a) => (
            <li key={a._id} className="rounded-xl border border-red-50 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-temple-black">{a.accountLabel}</p>
                  <p className="text-[11px] text-stone-600">{a.maskedLogin}</p>
                </div>
                <Badge variant={a.authorizationStatus === 'authorized' ? 'success' : 'warn'}>
                  {a.authorizationStatus || 'pending'}
                </Badge>
              </div>
              {a.authorizationStatus !== 'authorized' && (
                <Button className="mt-2 w-full" size="sm" disabled={busy} onClick={() => authorize(a._id)}>
                  {t('accounts.authorize')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}