import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { clearTtdPortalCredentials, loadTtdPortalCredentials, saveTtdPortalCredentials } from '../lib/ttdPortalStorage.js';
import { ensureTtdAccountForPortalLogin } from '../lib/ensureTtdAccount.js';
import { Alert } from '../components/ui/alert.jsx';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Input, Label } from '../components/ui/input.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';

export default function TtdPortalUserPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [label, setLabel] = useState('My TTD login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [linked, setLinked] = useState(false);

  useEffect(() => {
    const saved = loadTtdPortalCredentials();
    if (saved) {
      setLoginId(saved.loginId);
      setPassword(saved.password);
      setLabel(saved.label);
      setLinked(true);
      window.dispatchEvent(new CustomEvent('darshandesk-portal-credentials-saved'));
    }
  }, []);

  const save = async (e) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      saveTtdPortalCredentials({ loginId, password, label });
      window.dispatchEvent(new CustomEvent('darshandesk-portal-credentials-saved'));
      await ensureTtdAccountForPortalLogin(token, loginId, label);
      setLinked(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text, field) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError(`Could not copy ${field}`);
    }
  };

  const clear = () => {
    if (!window.confirm('Remove saved TTD login from this browser?')) return;
    clearTtdPortalCredentials();
    setLoginId('');
    setPassword('');
    setLinked(false);
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title="Step 1 — TTD user login"
        description="Save the same mobile or email and password you use on the official TTD website. Stored only in this browser — not on our server."
      />

      <Alert tone="info" title="3-step workflow">
        <ol className="mt-1 list-decimal space-y-1 pl-4 text-sm">
          <li>Save TTD login here</li>
          <li>
            <Link className="underline" to="/pilgrims">
              Add pilgrim details
            </Link>
          </li>
          <li>
            <Link className="underline" to="/ready">
              Open TTD site → extension autofill
            </Link>
          </li>
        </ol>
      </Alert>

      {error && (
        <Alert tone="error" title="Could not save">
          {error}
        </Alert>
      )}

      {linked && (
        <Alert tone="success" title="TTD login saved on this device">
          Synced to the Chrome extension when this page is open. On TTD login, use <strong>Use saved TTD login</strong> in
          the extension (or the floating button on the page).
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Portal credentials</CardTitle>
          <CardDescription>For your reference when logging into TTD. DarshanDesk only links your login id for booking prep.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid gap-3">
            <div>
              <Label htmlFor="ttd-label">Friendly name</Label>
              <Input
                id="ttd-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="My TTD login"
              />
            </div>
            <div>
              <Label htmlFor="ttd-id">TTD login (mobile / email)</Label>
              <Input
                id="ttd-id"
                required
                autoComplete="username"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ttd-pass">TTD password</Label>
              <Input
                id="ttd-pass"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                Save &amp; continue
              </Button>
              <Button type="button" variant="secondary" disabled={!loginId} onClick={() => copy(loginId, 'login id')}>
                Copy login id
              </Button>
              <Button type="button" variant="secondary" disabled={!password} onClick={() => copy(password, 'password')}>
                Copy password
              </Button>
              <Button type="button" variant="ghost" onClick={clear}>
                Clear
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => navigate('/pilgrims')}>Next: Pilgrims →</Button>
        <a href="https://tirupatibalaji.ap.gov.in/#/srivaniedonations" target="_blank" rel="noreferrer">
          <Button variant="secondary">Open official TTD</Button>
        </a>
      </div>
    </div>
  );
}