import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Landmark, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Alert } from '../components/ui/alert.jsx';
import { Button } from '../components/ui/button.jsx';
import { Input, Label } from '../components/ui/input.jsx';

const HERO_IMAGE = '/images/tirupati-balaji.jpg';

export default function LoginPage() {
  const { token, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (token) return <Navigate to="/dashboard" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div
        className="relative flex min-h-[220px] flex-1 flex-col justify-end bg-navy-900 p-8 text-white lg:min-h-screen lg:max-w-[48%] lg:p-12"
        style={{
          backgroundImage: `linear-gradient(160deg, rgba(15,39,68,0.82), rgba(15,39,68,0.55)), url(${HERO_IMAGE})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="relative z-10 max-w-md space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Tirumala · SRIVANI</p>
          <h1 className="font-serif text-3xl font-semibold leading-tight md:text-4xl">DarshanDesk Operations</h1>
          <p className="text-sm text-slate-200">
            Multi-agency preparation for official TTD booking. Validate, pair extension, and record outcomes — never auto-submit on
            the portal.
          </p>
          <h2 className="flex items-center gap-2 text-sm text-slate-300">
            <Shield className="h-4 w-4 shrink-0 text-amber-300" aria-hidden />
            Agency operators only
          </h2>
        </div>
        <p className="absolute bottom-3 left-0 right-0 text-center text-[10px] text-white/60">Temple imagery: Wikimedia Commons</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-canvas px-6 py-10 lg:px-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-navy text-white">
              <Landmark className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sign in</p>
              <h2 className="text-xl font-semibold text-navy">Operator workspace</h2>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-card">
            {error && (
              <Alert tone="error" title="Could not sign in">
                {error}
              </Alert>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full" size="lg">
              {busy ? 'Signing in…' : 'Sign in to dashboard'}
            </Button>
            <p className="text-center text-xs text-slate-500">Credentials come from your agency administrator.</p>
          </form>
        </div>
      </div>
    </div>
  );
}