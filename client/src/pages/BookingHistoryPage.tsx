import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api';
import type { BookingAttempt, AgencyPerformanceReport } from '../types/reliability';

const OUTCOMES = ['', 'in_progress', 'confirmed', 'rejected', 'uncertain', 'failed'];

export default function BookingHistoryPage() {
  const { token } = useAuth();
  const [attempts, setAttempts] = useState<BookingAttempt[]>([]);
  const [report, setReport] = useState<AgencyPerformanceReport | null>(null);
  const [stateFilter, setStateFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selected, setSelected] = useState<BookingAttempt | null>(null);
  const [diag, setDiag] = useState('');
  const [ref, setRef] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    const params = new URLSearchParams();
    if (stateFilter) params.set('state', stateFilter);
    if (outcomeFilter) params.set('outcome', outcomeFilter);
    if (categoryFilter) params.set('bookingCategory', categoryFilter);
    const [list, perf] = await Promise.all([
      api.qaAttempts(token, params.toString()),
      api.qaAgencyPerformance(token),
    ]);
    setAttempts(list.attempts);
    setReport(perf.report);
  }, [token, stateFilter, outcomeFilter, categoryFilter]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const open = async (id: string) => {
    const res = await api.qaAttempt(token!, id);
    setSelected(res.attempt);
    setDiag('');
  };

  const exportDiag = async () => {
    if (!selected) return;
    const res = await api.qaDiagnostic(token!, selected._id);
    setDiag(JSON.stringify(res.diagnostic, null, 2));
  };

  const saveReference = async () => {
    if (!selected || !ref) return;
    const res = await api.qaOfficialReference(token!, selected._id, {
      officialReference: ref,
      verificationSource: 'operator_manual',
      officialStatus: 'pending',
    });
    setSelected(res.attempt);
    await load();
  };

  return (
    <div>
      <header style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Booking history & outcomes</h1>
        <p className="muted">Production-grade attempt tracking — no auto-resubmit, no quota bypass.</p>
      </header>

      {error && <div className="alert err">{error}</div>}

      {report && (
        <section className="card">
          <h2>Agency performance</h2>
          <div className="quota-grid">
            <article className="card quota-card">
              <h3>Attempts</h3>
              <p className="quota-stat">{report.totals.attempts}</p>
            </article>
            <article className="card quota-card">
              <h3>Confirmed (verified)</h3>
              <p className="quota-stat">{report.totals.confirmed}</p>
            </article>
            <article className="card quota-card">
              <h3>Quota rejections</h3>
              <p className="quota-stat">{report.quotaRejections}</p>
            </article>
            <article className="card quota-card">
              <h3>Confirm rate</h3>
              <p className="quota-stat">{(report.totals.confirmRate * 100).toFixed(1)}%</p>
            </article>
          </div>
          <p className="muted">By category: {JSON.stringify(report.byCategory)}</p>
        </section>
      )}

      <section className="card">
        <h2>Filters</h2>
        <div className="grid-2">
          <div>
            <label>Workflow state</label>
            <input placeholder="e.g. QUOTA_REJECTED" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} />
          </div>
          <div>
            <label>Outcome</label>
            <select value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value)}>
              {OUTCOMES.map((o) => (
                <option key={o || 'all'} value={o}>
                  {o || 'All'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Booking category</label>
            <input value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} placeholder="CURRENT / ADVANCE" />
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Booking attempts</h2>
        <table className="data-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Started</th>
              <th>Category</th>
              <th>State</th>
              <th>Outcome</th>
              <th>Error</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {attempts.map((a) => (
              <tr key={a._id}>
                <td>{a.startedAt ? new Date(a.startedAt).toLocaleString('en-IN') : '—'}</td>
                <td>{a.bookingCategory || '—'}</td>
                <td>
                  <span className="pill">{a.outcomeState || a.reliabilityState}</span>
                </td>
                <td>{a.outcome}</td>
                <td>{a.errorCode || a.errorClass || '—'}</td>
                <td>
                  <button type="button" className="secondary" onClick={() => open(a._id)}>
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {attempts.length === 0 && <p className="muted">No attempts match filters.</p>}
      </section>

      {selected && (
        <section className="card">
          <h2>Attempt timeline</h2>
          <p>
            Preparation:{' '}
            <Link to={`/srivani/status/${selected.bookingPreparationId || selected.preparationId}`}>
              {String(selected.bookingPreparationId || selected.preparationId)}
            </Link>
          </p>
          {selected.operatorExplanation && <p className="muted">{selected.operatorExplanation}</p>}
          <ul className="checklist quota-timeline">
            {(selected.diagnosticEvents || selected.timeline).map((e) => (
              <li key={e._id || e.atUtc + e.type}>
                <span>{new Date(e.atUtc).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</span>
                <span>
                  <strong>{e.type}</strong> — {e.message}
                  {e.toState && <span className="muted"> → {e.toState}</span>}
                </span>
              </li>
            ))}
          </ul>
          <div className="grid-2">
            <div>
              <label>Official reference (manual recording)</label>
              <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="TTD ref / receipt id" />
              <button type="button" onClick={saveReference}>
                Record reference
              </button>
            </div>
          </div>
          <div className="actions">
            <button type="button" className="secondary" onClick={exportDiag}>
              Export test evidence (sanitized)
            </button>
          </div>
          {diag && <pre style={{ fontSize: '0.8rem', overflow: 'auto' }}>{diag}</pre>}
        </section>
      )}
    </div>
  );
}