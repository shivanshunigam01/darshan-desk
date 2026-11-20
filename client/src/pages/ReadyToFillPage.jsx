import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api';
import { ensureTtdAccountForPortalLogin } from '../lib/ensureTtdAccount.js';
import { loadTtdPortalCredentials } from '../lib/ttdPortalStorage.js';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Alert } from '../components/ui/alert.jsx';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';

/**
 * Step 3 — select pilgrims, validate, paste pairing token in extension, autofill on TTD.
 */
export default function ReadyToFillPage() {
  const { token } = useAuth();
  const [search] = useSearchParams();
  const preselect = search.get('pilgrim');

  const [pilgrims, setPilgrims] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [portalLabel, setPortalLabel] = useState('');
  const [preparationId, setPreparationId] = useState(null);
  const [pairing, setPairing] = useState(null);
  const [active, setActive] = useState(null);
  const [error, setError] = useState('');
  const [needsPortalLogin, setNeedsPortalLogin] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      try {
        const portal = loadTtdPortalCredentials();
        let resolvedAccountId = '';

        if (portal?.loginId) {
          setPortalLabel(portal.label || portal.loginId);
          resolvedAccountId = await ensureTtdAccountForPortalLogin(token, portal.loginId, portal.label);
        } else {
          setNeedsPortalLogin(true);
          const a = await api.ttdAccounts(token);
          if (a.accounts?.[0]) resolvedAccountId = a.accounts[0]._id;
        }

        const [p, pol, act] = await Promise.all([
          api.pilgrims(token),
          api.activePolicy(token),
          api.extensionActivePreparation(token),
        ]);

        if (cancelled) return;
        setPilgrims(p.pilgrims || []);
        setPolicy(pol.policy);
        setActive(act.active);
        if (resolvedAccountId) setAccountId(resolvedAccountId);
        if (preselect) setSelectedIds([preselect]);
        else if (act.active?.selectedPilgrimIds?.length) setSelectedIds(act.active.selectedPilgrimIds.map(String));
        else if (p.pilgrims?.length === 1) setSelectedIds([String(p.pilgrims[0]._id)]);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, preselect]);

  const toggle = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 4 ? [...prev, id] : prev));
  };

  const saveAndValidate = async () => {
    if (!accountId) {
      setError('Complete Step 1 — save your TTD login first.');
      setNeedsPortalLogin(true);
      return;
    }
    if (selectedIds.length === 0) {
      setError('Select at least one pilgrim (Step 2).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = {
        ttdAccountReferenceId: accountId,
        trustCategory: 'SRIVANI',
        bookingCategory: 'CURRENT',
        donationAmount: policy?.minimumDonation || 10000,
        pilgrimIds: selectedIds,
      };
      let id = preparationId;
      if (id) {
        await api.updatePreparation(token, id, body);
      } else {
        const cr = await api.createPreparation(token, body);
        id = cr.preparation._id;
        setPreparationId(id);
      }
      await api.consent(token, id);
      const val = await api.validate(token, id);
      if (val.preparation.validationStatus !== 'passed') {
        setError(val.preparation.validationErrors?.join(' ') || 'Validation failed.');
        return;
      }
      const pair = await api.pairExtension(token, id);
      setPairing(pair);
      const act = await api.extensionActivePreparation(token);
      setActive(act.active);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Step 3 — Autofill on TTD"
        description="Prepare once here. On the live TTD booking page, click the extension → Sync & Fill."
      />

      {needsPortalLogin && (
        <Alert tone="warning" title="Start with Step 1">
          <Link className="underline" to="/ttd-user">
            Save your TTD login id &amp; password
          </Link>{' '}
          (this browser only).
        </Alert>
      )}

      {error && (
        <Alert tone="error" title="Cannot prepare">
          {error}
        </Alert>
      )}

      {portalLabel && (
        <Alert tone="success" title="TTD user linked">
          Using <strong>{portalLabel}</strong> — log in on the official site with the same credentials, then use the extension.
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pilgrims to autofill</CardTitle>
          <CardDescription>{selectedIds.length}/4 selected · up to four per booking.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {pilgrims.map((p) => (
            <label
              key={p._id}
              className={`flex cursor-pointer gap-3 rounded-md border p-3 ${
                selectedIds.includes(p._id) ? 'border-[var(--dd-accent)] bg-[var(--dd-accent-soft)]' : 'border-[var(--dd-border)]'
              }`}
            >
              <input type="checkbox" checked={selectedIds.includes(p._id)} onChange={() => toggle(p._id)} />
              <span>
                <strong>{p.fullName}</strong>
                <span className="ml-2 text-xs text-[var(--dd-text-muted)]">
                  {p.age} · {p.idType}
                </span>
              </span>
            </label>
          ))}
          {!pilgrims.length && (
            <Link to="/pilgrims" className="text-sm text-[var(--dd-accent)] underline">
              Step 2: Add pilgrims
            </Link>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prepare extension</CardTitle>
          <CardDescription>One click — then paste the token into the Chrome extension (first time only).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button disabled={busy} onClick={saveAndValidate}>
            Prepare for autofill
          </Button>
          {pairing?.pairingToken && (
            <div>
              <label className="text-xs font-medium text-[var(--dd-text-muted)]">Paste this in the extension popup</label>
              <input
                readOnly
                className="mt-1 w-full rounded-md border border-[var(--dd-border)] bg-[var(--dd-bg)] p-2 font-mono text-xs"
                value={pairing.pairingToken}
                onFocus={(e) => e.target.select()}
              />
            </div>
          )}
          {active && (
            <p className="text-sm text-[var(--dd-success)]">
              Ready · rev {active.revision} · extension can Sync &amp; Fill until{' '}
              {active.expiresAt ? new Date(active.expiresAt).toLocaleString() : '24h'}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-[var(--dd-border)]">
        <CardHeader>
          <CardTitle className="text-base">On the live TTD site</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-[var(--dd-text-muted)]">
          <p>1. Log in at tirupatibalaji.ap.gov.in (use copy from Step 1 if needed).</p>
          <p>2. Open SRIVANI donations → pilgrim details step.</p>
          <p>3. Click the DarshanDesk extension → <strong className="text-[var(--dd-text)]">Sync &amp; Fill</strong>.</p>
          <p>4. You complete CAPTCHA and payment — we only fill allowed fields.</p>
          <a href="https://tirupatibalaji.ap.gov.in/#/srivaniedonations" target="_blank" rel="noreferrer">
            <Button className="mt-2">Open TTD SRIVANI</Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}