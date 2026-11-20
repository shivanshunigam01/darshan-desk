import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api';
import type { BookingAttempt, QaDashboard } from '../types/reliability';

export default function QaReliabilityPage() {
  const { token } = useAuth();
  const [dashboard, setDashboard] = useState<QaDashboard | null>(null);
  const [attempts, setAttempts] = useState<BookingAttempt[]>([]);
  const [selected, setSelected] = useState<BookingAttempt | null>(null);
  const [preparationId, setPreparationId] = useState('');
  const [mockMessage, setMockMessage] = useState('Cannot book as quota exceeded');
  const [quotaCount, setQuotaCount] = useState('42');
  const [quotaFresh, setQuotaFresh] = useState('stale');
  const [diagnostic, setDiagnostic] = useState<string>('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    const [d, a] = await Promise.all([api.qaDashboard(token), api.qaAttempts(token)]);
    setDashboard(d.dashboard);
    setAttempts(a.attempts);
  }, [token]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const createAttempt = async () => {
    if (!preparationId) return;
    await api.qaCreateAttempt(token, preparationId);
    await load();
  };

  const pick = async (id: string) => {
    const res = await api.qaAttempt(token, id);
    setSelected(res.attempt);
  };

  const recordMockSignal = async () => {
    if (!selected) return;
    const res = await api.qaMockSignal(token, {
      attemptId: selected._id,
      officialMessage: mockMessage,
      serverRejectedBooking: /quota exceeded/i.test(mockMessage),
      quotaCountAtObservation: Number(quotaCount),
      quotaFreshness: quotaFresh,
    });
    setSelected(res.attempt);
    await load();
  };

  const exportDiag = async () => {
    if (!selected) return;
    const res = await api.qaDiagnostic(token, selected._id);
    setDiagnostic(JSON.stringify(res.diagnostic, null, 2));
  };

  const advanceReview = async () => {
    if (!selected) return;
    const res = await api.qaTransition(token, selected._id, {
      toState: 'REVIEW_REQUIRED',
      message: 'Operator review required before any submission',
    });
    setSelected(res.attempt);
  };

  return (
    <div>
      <h1>Booking reliability & QA</h1>
      <p className="muted">
        Tracks booking attempts transparently. Positive quota display + official quota rejection is classified — never
        promoted to success. No auto-resubmit.
      </p>
      <p className="muted">
        Cross-check the <a href="/srivani/quota">Quota dashboard</a> before recording mock signals. Ticket allocation is not
        guaranteed.
      </p>

      {error && <div className="alert err">{error}</div>}

      {dashboard && (
        <section className="card">
          <h2>QA dashboard</h2>
          <div className="quota-grid">
            <article className="card quota-card">
              <h3>Total attempts</h3>
              <p className="quota-stat">{dashboard.totalAttempts}</p>
            </article>
            <article className="card quota-card">
              <h3>Auto-resubmit blocked</h3>
              <p className="quota-stat">{dashboard.blockedAutoResubmit}</p>
            </article>
          </div>
          <p className="muted">By state: {JSON.stringify(dashboard.byState)}</p>
          <p className="muted">By error: {JSON.stringify(dashboard.byError)}</p>
          <ul className="muted">
            {dashboard.notices.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Create attempt from preparation</h2>
        <input placeholder="Preparation ID" value={preparationId} onChange={(e) => setPreparationId(e.target.value)} />
        <div className="actions">
          <button type="button" onClick={createAttempt}>
            Start reliability tracking
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Attempts</h2>
        <ul className="checklist">
          {attempts.map((a) => (
            <li key={a._id}>
              <button type="button" className="secondary" onClick={() => pick(a._id)}>
                {a._id.slice(-6)}
              </button>
              <span>
                <span className="pill">{a.outcomeState || a.reliabilityState}</span>
                <span className="muted"> {a.outcome}</span>
                {a.errorClass && <span className="pill err"> {a.errorClass}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {selected && (
        <>
          <section className="card">
            <h2>Error report</h2>
            <p>
              State: <strong>{selected.reliabilityState}</strong>
            </p>
            {selected.errorClass && <p className="err-text">Class: {selected.errorClass}</p>}
            <ul>
              {selected.errorReport?.reasons?.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p className="muted">Auto-resubmit blocked: {String(selected.autoResubmitBlocked)}</p>
            <p className="muted">Submission attempted (guard): {String(selected.submissionAttempted)}</p>
          </section>

          <section className="card">
            <h2>Booking attempt timeline</h2>
            <ul className="checklist quota-timeline">
              {selected.timeline.map((e) => (
                <li key={e._id || e.atUtc + e.type}>
                  <span>{new Date(e.atUtc).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</span>
                  <span>
                    <strong>{e.type}</strong> — {e.message}
                    {e.toState && <span className="muted"> → {e.toState}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h2>Mock official signal (QA environment)</h2>
            <p className="muted">Reference: stale positive quota then &quot;Cannot book as quota exceeded&quot;</p>
            <label>Official message</label>
            <input value={mockMessage} onChange={(e) => setMockMessage(e.target.value)} />
            <label>Quota count shown earlier</label>
            <input value={quotaCount} onChange={(e) => setQuotaCount(e.target.value)} />
            <label>Quota freshness</label>
            <select value={quotaFresh} onChange={(e) => setQuotaFresh(e.target.value)}>
              <option value="fresh">fresh</option>
              <option value="stale">stale</option>
              <option value="unknown">unknown</option>
            </select>
            <div className="actions">
              <button type="button" onClick={recordMockSignal}>
                Record signal (no resubmit)
              </button>
              <button type="button" className="secondary" onClick={advanceReview}>
                Mark user review required
              </button>
              <button type="button" className="secondary" onClick={exportDiag}>
                Export sanitized diagnostic
              </button>
            </div>
          </section>

          {diagnostic && (
            <section className="card">
              <h2>Sanitized diagnostic export</h2>
              <pre style={{ fontSize: '0.8rem', overflow: 'auto' }}>{diagnostic}</pre>
            </section>
          )}
        </>
      )}
    </div>
  );
}