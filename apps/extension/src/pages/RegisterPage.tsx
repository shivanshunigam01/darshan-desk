import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import logoUrl from '../assets/logo.jpg';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { useAuth } from '../hooks/useAuth';
import { ApiError, register, type RegisterPayload } from '../services/darshanDeskApi';
import type { OperatorAuth } from '../services/authStorage';

export function RegisterPage() {
  const { t } = useTranslation();
  const { settings, establishAuth } = useAuth();
  const [agencyName, setAgencyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body: RegisterPayload = {
        agencyName: agencyName.trim(),
        displayName: agencyName.trim(),
        email: email.trim(),
        password,
        consentAcknowledged: true,
      };

      const base = settings.apiBaseUrl;
      const result = await register(base, body);

      const auth: OperatorAuth = {
        apiBaseUrl: base,
        token: result.token,
        operator: {
          id: String(result.operator.id),
          email: result.operator.email,
          displayName: result.operator.displayName,
          agencyId: String(result.operator.agencyId),
          role: result.operator.role,
        },
        savedAt: new Date().toISOString(),
      };

      await establishAuth(auth);
      window.location.hash = '#/home';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('register.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[520px] w-popup flex-col items-center justify-center bg-temple-black px-4 py-6 text-white">
      <img src={logoUrl} alt="" className="mb-3 h-16 w-16 rounded-full object-cover" width={64} height={64} />
      <h1 className="text-lg font-bold">{t('register.title')}</h1>
      <p className="mb-4 text-center text-xs text-stone-400">{t('register.simpleSubtitle')}</p>

      <Card className="w-full max-w-[360px] border-stone-700 bg-temple-surface text-white">
        <CardHeader>
          <CardTitle className="text-white">{t('register.simpleSubmit')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={submit}>
            <label className="block text-xs font-medium text-stone-300">
              {t('register.agency')}
              <Input
                className="mt-1 border-stone-600 bg-stone-900 text-white"
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                required
                minLength={2}
              />
            </label>
            <label className="block text-xs font-medium text-stone-300">
              {t('login.email')}
              <Input
                className="mt-1 border-stone-600 bg-stone-900 text-white"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="block text-xs font-medium text-stone-300">
              {t('login.password')}
              <Input
                className="mt-1 border-stone-600 bg-stone-900 text-white"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </label>
            <p className="text-[10px] text-stone-500">{t('register.simpleHint')}</p>
            {error && <Alert variant="destructive">{error}</Alert>}
            <Button type="submit" className="w-full bg-temple-red hover:bg-red-900" disabled={busy}>
              {busy ? t('register.loading') : t('register.simpleSubmit')}
            </Button>
            <p className="text-center text-[10px] text-stone-400">
              <Link className="text-white underline" to="/">
                {t('register.backLogin')}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}