import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import logoUrl from '../assets/logo.jpg';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../services/darshanDeskApi';

export function LoginPage() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('login.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[560px] w-popup flex-col items-center justify-center bg-temple-black px-4 py-6 text-white">
      <img src={logoUrl} alt="DarshanDesk" className="mb-4 h-20 w-20 rounded-full object-cover shadow-lg" width={80} height={80} />
      <h1 className="text-lg font-bold tracking-tight">{t('app.name')}</h1>
      <p className="mb-5 text-center text-xs text-stone-300">{t('login.title')}</p>

      <Card className="w-full max-w-[360px] border-stone-700 bg-temple-surface text-white">
        <CardHeader>
          <CardTitle className="text-white">{t('login.submit')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={submit}>
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
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error && <Alert variant="destructive">{error}</Alert>}
            <Button className="w-full bg-temple-red hover:bg-red-900" disabled={busy}>
              {busy ? t('login.loading') : t('login.submit')}
            </Button>
            <p className="text-center text-[10px] text-stone-400">{t('login.forgot')}</p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}