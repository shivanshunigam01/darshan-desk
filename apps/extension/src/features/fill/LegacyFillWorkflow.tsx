import { useCallback, useEffect, useState } from 'react';
import type { FieldFillResult } from '@darshan-desk/fill-engine';
import type { ProtocolMessage, ProtocolResponse } from '../../shared/protocol';
import type { ExtensionSession } from '../../shared/storage';

type Payload = {
  preparationId: string;
  contentRevision?: number;
  validationStatus?: string;
  workflowStatus?: string;
  pilgrims: Array<{ id: string; fullName: string }>;
  permittedScalars: { donationAmount?: number; bookingCategory?: string };
  fieldAudit?: { ok: boolean; errors: string[] };
};

function send<T extends ProtocolMessage>(msg: T): Promise<ProtocolResponse> {
  return chrome.runtime.sendMessage(msg);
}

export default function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState('http://localhost:4000');
  const [pairingToken, setPairingToken] = useState('');
  const [session, setSession] = useState<ExtensionSession | null>(null);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [results, setResults] = useState<FieldFillResult[]>([]);
  const [validation, setValidation] = useState<{ ok: boolean; fieldErrors?: Array<{ label: string; message: string }> } | null>(
    null
  );
  const [auditErrors, setAuditErrors] = useState<string[]>([]);
  const [hasPortalLogin, setHasPortalLogin] = useState(false);
  const [loginFillNote, setLoginFillNote] = useState('');

  const refreshState = useCallback(async () => {
    const r = await send({ type: 'GET_STATE' });
    if (r.session) setSession(r.session as ExtensionSession);
    if (r.payload) {
      const p = r.payload as Payload;
      setPayload(p);
      if (!selected.length) setSelected(p.pilgrims.map((x) => x.id));
      setAuditErrors(p.fieldAudit?.errors || []);
    }
  }, [selected.length]);

  useEffect(() => {
    refreshState();
    send({ type: 'GET_PORTAL_CREDENTIALS_STATE' }).then((r) => setHasPortalLogin(Boolean(r.hasCredentials)));
  }, [refreshState]);

  const fillTtdLogin = async () => {
    setBusy(true);
    setBusyLabel('Filling TTD login on page…');
    setError('');
    setLoginFillNote('');
    try {
      const r = await send({ type: 'TTD_LOGIN_FILL_REQUEST' });
      if (!r.ok) throw new Error(r.error || 'Could not fill login');
      const report = r.fillReport as { message?: string };
      setLoginFillNote(report?.message || 'Login and password filled — enter captcha yourself.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login fill failed');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const connect = async () => {
    setBusy(true);
    setBusyLabel('Connecting to DarshanDesk…');
    setError('');
    try {
      const r = await send({ type: 'EXTENSION_PAIR_REQUEST', pairingToken, apiBaseUrl });
      if (!r.ok) throw new Error(r.error || 'Connect failed');
      setSession(r.session as ExtensionSession);
      const p = r.payload as Payload;
      setPayload(p);
      setSelected(p.pilgrims.map((x) => x.id));
      setAuditErrors((r.validation as { errors?: string[] })?.errors || p.fieldAudit?.errors || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connect failed');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const sync = async (opts?: { keepBusy?: boolean }) => {
    setBusy(true);
    setBusyLabel('Syncing preparation…');
    setError('');
    try {
      const r = await send({ type: 'PREPARATION_SYNC' });
      if (!r.ok) throw new Error(r.error || 'Sync failed');
      setSession(r.session as ExtensionSession);
      setPayload(r.payload as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      if (!opts?.keepBusy) {
        setBusy(false);
        setBusyLabel('');
      }
    }
  };

  const applyPilgrims = async () => {
    setBusy(true);
    setBusyLabel('Updating pilgrim selection…');
    try {
      const r = await send({ type: 'PREPARATION_SELECTED', pilgrimIds: selected });
      if (!r.ok) throw new Error(r.error || 'Update failed');
      setPayload(r.payload as Payload);
      setAuditErrors((r.validation as { errors?: string[] })?.errors || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setBusyLabel('Disconnecting…');
    await send({ type: 'DISCONNECT' });
    setSession(null);
    setPayload(null);
    setResults([]);
    setValidation(null);
    setBusy(false);
    setBusyLabel('');
  };

  const runFillMode = async (validateOnly: boolean) => {
    setBusy(true);
    setBusyLabel(validateOnly ? 'Validating fields on page…' : 'Applying fields on TTD page…');
    setError('');
    setResults([]);
    setValidation(null);
    setReviewed(false);
    try {
      if (!validateOnly) await applyPilgrims();
      const r = await send(
        validateOnly
          ? { type: 'FORM_VALIDATE_REQUEST' }
          : { type: 'FORM_FILL_REQUEST', allowOverwrite, validateOnly: false }
      );
      if (!r.ok) throw new Error(r.error || (validateOnly ? 'Validate failed' : 'Fill failed'));
      const report = r.fillReport as {
        results: FieldFillResult[];
        validation?: { ok: boolean; fieldErrors: Array<{ label: string; message: string }> };
        captchaRequired?: boolean;
      };
      setResults(report.results || []);
      setValidation(report.validation || (r.validation as typeof validation));
      if (report.captchaRequired) {
        setError('CAPTCHA verification required — complete on the official website.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : validateOnly ? 'Validate failed' : 'Fill failed');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const fill = () => runFillMode(false);
  const validateFields = () => runFillMode(true);

  const connected = Boolean(session?.connected);

  return (
    <div className="wrap">
      <h1>DARSHANDESK AUTOFILL</h1>
      <p className="muted">Status: {connected ? 'Connected' : 'Disconnected'}</p>

      <div className="warn">
        Final submission, declarations, OTP, and payment stay under your control on the official portal.
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row">
          <strong>TTD login page</strong>
          <span className={hasPortalLogin ? 'pill ok' : 'pill'}>{hasPortalLogin ? 'Credentials saved' : 'Not synced'}</span>
        </div>
        <p className="muted" style={{ margin: '8px 0' }}>
          On tirupatibalaji login, fills id and password only — you enter captcha and press Login.
        </p>
        <div className="actions">
          <button disabled={busy || !hasPortalLogin} onClick={fillTtdLogin}>
            Use saved TTD login
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => send({ type: 'OPEN_OFFICIAL_PORTAL' })}
          >
            Open TTD login
          </button>
        </div>
        {loginFillNote && <p className="pill ok">{loginFillNote}</p>}
        {!hasPortalLogin && (
          <p className="muted">Save login in DarshanDesk → TTD Login, then refresh this popup.</p>
        )}
      </div>

      {!connected ? (
        <>
          <div className="row">
            <label>Connect to DarshanDesk (API URL)</label>
            <input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} />
          </div>
          <div className="row">
            <label>Pairing token</label>
            <input value={pairingToken} onChange={(e) => setPairingToken(e.target.value)} placeholder="From validated preparation" />
          </div>
          <button disabled={busy || !pairingToken} onClick={connect}>
            Connect to DarshanDesk
          </button>
        </>
      ) : (
        <>
          <p>
            <span className="pill ok">Connected</span>
            <span className="pill">{session?.validationStatus || payload?.validationStatus || 'pending'}</span>
            {(session?.workflowStatus || payload?.workflowStatus) && (
              <span className="pill">{session?.workflowStatus || payload?.workflowStatus}</span>
            )}
          </p>
          <div className="card">
            <div className="row">
              <strong>Agency</strong>
              <span>{session?.agencyName || '—'}</span>
            </div>
            <div className="row">
              <strong>Operator</strong>
              <span>{session?.operatorName || '—'}</span>
            </div>
            <div className="row">
              <strong>TTD account</strong>
              <span>{session?.ttdAccountLabel || '—'}</span>
            </div>
            <div className="row">
              <strong>Booking category</strong>
              <span>{session?.bookingCategory || payload?.permittedScalars.bookingCategory}</span>
            </div>
            <div className="row">
              <strong>Donation</strong>
              <span>₹{session?.donationAmount ?? payload?.permittedScalars.donationAmount ?? '—'}</span>
            </div>
            <div className="row">
              <strong>Pilgrims selected</strong>
              <span>
                {selected.length} / {payload?.pilgrims.length || session?.pilgrimCount || 0}
              </span>
            </div>
            <div className="row">
              <strong>Preparation status</strong>
              <span>
                {session?.workflowStatus || payload?.workflowStatus || '—'} · revision{' '}
                {payload?.contentRevision ?? session?.contentRevision ?? '—'}
              </span>
            </div>
            <div className="row">
              <strong>Last synchronized</strong>
              <span className="muted">{session?.lastSyncedAt ? new Date(session.lastSyncedAt).toLocaleString() : '—'}</span>
            </div>
          </div>

          {auditErrors.length > 0 && (
            <div className="pill err">
              <div>Prepared field issues:</div>
              <ul>
                {auditErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="row">
            <label>Pilgrim group</label>
            {payload?.pilgrims.map((p) => (
              <label key={p.id} className="checkbox">
                <input type="checkbox" checked={selected.includes(p.id)} onChange={() =>
                  setSelected((prev) => (prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]))
                } />
                <span>{p.fullName}</span>
              </label>
            ))}
          </div>

          <div className="actions">
            <button
              disabled={busy || selected.length === 0}
              onClick={async () => {
                setBusy(true);
                setBusyLabel('Syncing with DarshanDesk…');
                setError('');
                try {
                  await sync({ keepBusy: true });
                  setBusyLabel('Applying fields on TTD page…');
                  if (!auditErrors.length) await fill();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Sync & fill failed');
                } finally {
                  setBusy(false);
                  setBusyLabel('');
                }
              }}
            >
              Sync &amp; Fill
            </button>
            <button className="secondary" disabled={busy || selected.length === 0} onClick={validateFields}>
              Validate fields
            </button>
            <button className="secondary" onClick={() => send({ type: 'OPEN_OFFICIAL_PORTAL' })}>
              Open TTD website
            </button>
            <button className="secondary" disabled={busy} onClick={disconnect}>
              Disconnect
            </button>
          </div>

          <p className="muted">
            On live TTD, open <strong>Pilgrim Details</strong> (e.g. SRIVANI current booking), then Sync &amp; Fill. You still enter
            captcha and submit.
          </p>

          <label className="checkbox">
            <input type="checkbox" checked={allowOverwrite} onChange={(e) => setAllowOverwrite(e.target.checked)} />
            <span>Overwrite conflicting visible values (with caution)</span>
          </label>

          {results.length > 0 && (
            <>
              <div className="row">
                <label>Field results</label>
                <div className="results">
                  {results.map((r) => (
                    <div key={r.key}>
                      <strong>{r.displayLabel}</strong>: {r.status}
                      {r.message ? ` — ${r.message}` : ''}
                    </div>
                  ))}
                </div>
              </div>

              {validation && !validation.ok && (
                <div className="pill err">
                  Validation errors:
                  <ul>
                    {validation.fieldErrors?.map((f) => (
                      <li key={f.label}>
                        {f.label}: {f.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <label className="checkbox">
                <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
                <span>I reviewed every filled field — I will submit manually on the official site</span>
              </label>
              {reviewed && validation?.ok && <p className="pill ok">Ready for operator submission (no auto-submit).</p>}
            </>
          )}
        </>
      )}

      {error && <p className="pill err">{error}</p>}

      {busy && (
        <div className="loader-overlay" role="status" aria-live="polite">
          <div className="loader-card">
            <div className="loader-spinner" aria-hidden="true" />
            <p className="loader-title">{busyLabel || 'Please wait…'}</p>
            <p className="muted loader-hint">Keep this tab on Pilgrim Details while fields are applied.</p>
          </div>
        </div>
      )}
    </div>
  );
}