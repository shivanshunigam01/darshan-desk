import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api';
import { Alert } from '../components/ui/alert.jsx';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Input, Label } from '../components/ui/input.jsx';
import { Badge } from '../components/ui/badge.jsx';

export default function SubscriptionPage() {
  const { operator, token } = useAuth();
  const [license, setLicense] = useState(null);
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    api
      .adminLicense(token)
      .then((r) => setLicense(r.license))
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    if (operator?.role === 'admin' && token) load();
  }, [operator, token]);

  if (operator?.role !== 'admin') {
    return <Alert tone="warning">Subscription management is available to agency admins only.</Alert>;
  }

  const activate = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      const r = await api.adminActivateLicense(token, { licenseKey: key, mode: 'active' });
      setLicense(r.license);
      setMsg('License activated.');
      setKey('');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold text-navy">Subscription &amp; license</h1>
      {error && <Alert tone="error">{error}</Alert>}
      {msg && <Alert tone="success">{msg}</Alert>}
      <Card>
        <CardHeader>
          <CardTitle>Current status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {license ? (
            <>
              <p>
                Status <Badge tone={license.licenseStatus === 'active' ? 'success' : 'warning'}>{license.licenseStatus}</Badge>
              </p>
              <p>Expires: {license.licenseExpiresAt || '—'}</p>
              <p>Enforced server-side: {license.enforced ? 'yes' : 'no'}</p>
            </>
          ) : (
            <p className="text-slate-600">Loading…</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Activate license key</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={activate} className="space-y-3">
            <Label>License key</Label>
            <Input value={key} onChange={(e) => setKey(e.target.value)} required minLength={8} />
            <Button type="submit">Activate</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}