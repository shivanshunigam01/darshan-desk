import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../api';
import { Alert } from '../../components/ui/alert.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.jsx';
import { Input } from '../../components/ui/input.jsx';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'agencies', label: 'Agencies' },
  { id: 'accounts', label: 'Account report' },
  { id: 'analytics', label: 'Booking analytics' },
];

function StatCard({ title, value, hint }) {
  return (
    <Card className="border-stone-200">
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
        <p className="mt-1 text-2xl font-semibold text-navy">{value ?? '—'}</p>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function MiniBarChart({ series, labelKey, valueKey }) {
  const max = Math.max(1, ...series.map((s) => s[valueKey] || 0));
  return (
    <div className="space-y-2">
      {series.slice(0, 14).map((row) => (
        <div key={row[labelKey]} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 truncate text-slate-600">{row[labelKey]}</span>
          <div className="h-2 flex-1 rounded bg-stone-100">
            <div
              className="h-2 rounded bg-amber-600"
              style={{ width: `${Math.round(((row[valueKey] || 0) / max) * 100)}%` }}
            />
          </div>
          <span className="w-8 text-right font-mono text-slate-700">{row[valueKey]}</span>
        </div>
      ))}
    </div>
  );
}

async function downloadCsv(fetchPromise, filename) {
  const res = await fetchPromise;
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminCommandCenterPage({ initialTab = 'overview' }) {
  const { token, operator } = useAuth();
  const [tab, setTab] = useState(initialTab);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [overview, setOverview] = useState(null);
  const [agencies, setAgencies] = useState({ rows: [], total: 0, page: 1 });
  const [accounts, setAccounts] = useState({ rows: [], total: 0, page: 1 });
  const [analytics, setAnalytics] = useState(null);

  const [agencySearch, setAgencySearch] = useState('');
  const [agencyStatus, setAgencyStatus] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [accountVerification, setAccountVerification] = useState('');
  const [analyticsFrom, setAnalyticsFrom] = useState('');
  const [analyticsTo, setAnalyticsTo] = useState('');
  const [analyticsAgencyId, setAnalyticsAgencyId] = useState('');
  const [agencyOptions, setAgencyOptions] = useState([]);

  const isSuper = operator?.role === 'super_admin';

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const loadOverview = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.platformOverview(token);
      setOverview(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadAgencies = useCallback(
    async (page = 1) => {
      if (!token) return;
      setLoading(true);
      setError('');
      try {
        const q = new URLSearchParams({ page: String(page), limit: '15' });
        if (agencySearch) q.set('search', agencySearch);
        if (agencyStatus) q.set('subscriptionStatus', agencyStatus);
        const data = await api.platformAgencies(token, q.toString());
        setAgencies(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [token, agencySearch, agencyStatus]
  );

  const loadAccounts = useCallback(
    async (page = 1) => {
      if (!token) return;
      setLoading(true);
      setError('');
      try {
        const q = new URLSearchParams({ page: String(page), limit: '15' });
        if (accountSearch) q.set('search', accountSearch);
        if (accountVerification) q.set('verificationStatus', accountVerification);
        const data = await api.platformAccounts(token, q.toString());
        setAccounts(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [token, accountSearch, accountVerification]
  );

  const loadAnalytics = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams();
      if (analyticsFrom) q.set('from', analyticsFrom);
      if (analyticsTo) q.set('to', analyticsTo);
      if (analyticsAgencyId) q.set('agencyId', analyticsAgencyId);
      const data = await api.platformAnalytics(token, q.toString());
      setAnalytics(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, analyticsFrom, analyticsTo, analyticsAgencyId]);

  const loadAgencyOptions = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.platformAgencies(token, 'page=1&limit=100');
      setAgencyOptions(data.rows || []);
    } catch {
      setAgencyOptions([]);
    }
  }, [token]);

  useEffect(() => {
    if (!isSuper) return;
    if (tab === 'overview') loadOverview();
    if (tab === 'agencies') loadAgencies(1);
    if (tab === 'accounts') loadAccounts(1);
    if (tab === 'analytics') {
      loadAgencyOptions();
      loadAnalytics();
    }
  }, [tab, isSuper, loadOverview, loadAgencies, loadAccounts, loadAnalytics, loadAgencyOptions]);

  const cards = overview?.cards;
  const cardItems = useMemo(
    () =>
      cards
        ? [
            ['Total registered agencies', cards.totalRegisteredAgencies],
            ['Active agencies', cards.activeAgencies],
            ['Suspended agencies', cards.suspendedAgencies],
            ['Total SaaS users', cards.totalSaasUsers],
            ['Active users', cards.activeUsers, `${overview.activeWindowDays}d window`],
            ['Verified accounts', cards.verifiedAccounts],
            ['Linked TTD references', cards.totalLinkedTtdAccountReferences],
            ['Prepared bookings', cards.preparedBookings],
            ['Verified confirmed bookings', cards.verifiedConfirmedBookings],
            ['Failed booking attempts', cards.failedBookingAttempts],
            ['Pending confirmations', cards.pendingConfirmations],
            ['Active subscriptions', cards.activeSubscriptions],
            ['Expired subscriptions', cards.expiredSubscriptions],
          ]
        : [],
    [cards, overview?.activeWindowDays]
  );

  if (!isSuper) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-navy">Command center</h1>
        <Alert tone="warning">Super admin access required. Sign in as the platform super admin account.</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-navy">Super Admin Command Center</h1>
          <p className="text-sm text-slate-600">Platform-wide metrics from verified DarshanDesk records only.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant={tab === t.id ? 'default' : 'secondary'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {tab === 'overview' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cardItems.map(([title, value, hint]) => (
              <StatCard key={title} title={title} value={value} hint={hint} />
            ))}
          </div>
          {overview?.notices?.map((n) => (
            <p key={n} className="text-xs text-slate-500">
              {n}
            </p>
          ))}
        </>
      )}

      {tab === 'agencies' && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <CardTitle>Agencies</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Search name or code" value={agencySearch} onChange={(e) => setAgencySearch(e.target.value)} />
              <select
                className="rounded-md border border-stone-300 px-2 py-2 text-sm"
                value={agencyStatus}
                onChange={(e) => setAgencyStatus(e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="expired">Expired</option>
              </select>
              <Button size="sm" onClick={() => loadAgencies(1)}>
                Search
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  downloadCsv(api.platformExportAgencies(token, new URLSearchParams({ search: agencySearch, subscriptionStatus: agencyStatus }).toString()), 'agencies.csv')
                }
              >
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Agency</th>
                  <th className="py-2 pr-3">Administrator</th>
                  <th className="py-2 pr-3">Plan</th>
                  <th className="py-2 pr-3">Licensed / active ops</th>
                  <th className="py-2 pr-3">Accounts</th>
                  <th className="py-2 pr-3">Prepared / confirmed</th>
                  <th className="py-2 pr-3">Subscription</th>
                  <th className="py-2">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {agencies.rows.map((row) => (
                  <tr key={row.id} className="border-b border-stone-100">
                    <td className="py-2 pr-3 font-medium">{row.name}</td>
                    <td className="py-2 pr-3">
                      <a title={row.administratorEmail}>
                        {row.administratorName}
                      </a>
                    </td>
                    <td className="py-2 pr-3">{row.subscriptionPlan}</td>
                    <td className="py-2 pr-3">
                      {row.licensedOperatorCount} / {row.activeOperators}
                    </td>
                    <td className="py-2 pr-3">{row.linkedAccountCount}</td>
                    <td className="py-2 pr-3">
                      {row.preparedBookings} / {row.confirmedBookings}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge tone={row.subscriptionStatus === 'active' ? 'success' : 'warning'}>{row.subscriptionStatus}</Badge>
                    </td>
                    <td className="py-2 text-xs text-slate-600">
                      {row.lastActivity ? new Date(row.lastActivity).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Paginate page={agencies.page} total={agencies.total} pageSize={15} onPage={(p) => loadAgencies(p)} />
          </CardContent>
        </Card>
      )}

      {tab === 'accounts' && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <CardTitle>TTD account references</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Search label or mask" value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} />
              <select
                className="rounded-md border border-stone-300 px-2 py-2 text-sm"
                value={accountVerification}
                onChange={(e) => setAccountVerification(e.target.value)}
              >
                <option value="">All verification</option>
                <option value="verified">Verified</option>
                <option value="unverified">Unverified</option>
                <option value="failed">Failed</option>
              </select>
              <Button size="sm" onClick={() => loadAccounts(1)}>
                Search
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  downloadCsv(
                    api.platformExportAccounts(
                      token,
                      new URLSearchParams({ search: accountSearch, verificationStatus: accountVerification }).toString()
                    ),
                    'accounts.csv'
                  )
                }
              >
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Agency</th>
                  <th className="py-2 pr-3">Masked ID</th>
                  <th className="py-2 pr-3">Verified name</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Attempts</th>
                  <th className="py-2 pr-3">Confirmed</th>
                  <th className="py-2 pr-3">Failures</th>
                  <th className="py-2">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {accounts.rows.map((row) => (
                  <tr key={row.id} className="border-b border-stone-100">
                    <td className="py-2 pr-3">{row.agencyName}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{row.maskedAccountIdentifier}</td>
                    <td className="py-2 pr-3">{row.verifiedAccountName || '—'}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={row.verificationStatus === 'verified' ? 'success' : 'warning'}>{row.verificationStatus}</Badge>
                    </td>
                    <td className="py-2 pr-3">{row.bookingAttempts}</td>
                    <td className="py-2 pr-3">{row.confirmedBookings}</td>
                    <td className="py-2 pr-3">{row.failures}</td>
                    <td className="py-2 text-xs text-slate-600">
                      {row.lastActivity ? new Date(row.lastActivity).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Paginate page={accounts.page} total={accounts.total} pageSize={15} onPage={(p) => loadAccounts(p)} />
          </CardContent>
        </Card>
      )}

      {tab === 'analytics' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <div>
                <CardTitle>Booking analytics</CardTitle>
                <p className="text-xs text-slate-500">
                  Verified confirmations require operator-verified BookingAttempt records (not official TTD counters).
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input type="date" value={analyticsFrom} onChange={(e) => setAnalyticsFrom(e.target.value)} />
                <Input type="date" value={analyticsTo} onChange={(e) => setAnalyticsTo(e.target.value)} />
                <select
                  className="rounded-md border border-stone-300 px-2 py-2 text-sm"
                  value={analyticsAgencyId}
                  onChange={(e) => setAnalyticsAgencyId(e.target.value)}
                >
                  <option value="">All agencies</option>
                  {agencyOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <Button size="sm" onClick={loadAnalytics} disabled={loading}>
                  Apply filters
                </Button>
              </div>
            </CardHeader>
            {analytics && (
              <CardContent className="text-sm text-slate-700">
                Totals: {analytics.totals.confirmed} verified confirmed / {analytics.totals.attempts} attempts
                <p className="mt-1 text-xs text-slate-500">{analytics.disclaimer}</p>
              </CardContent>
            )}
          </Card>

          {analytics ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Confirmed bookings by agency</CardTitle>
                </CardHeader>
                <CardContent>
                  <MiniBarChart
                    series={analytics.perAgencyConfirmed.map((r) => ({ name: r.agencyName, confirmed: r.confirmed }))}
                    labelKey="name"
                    valueKey="confirmed"
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Date trend (attempts / confirmed)</CardTitle>
                </CardHeader>
                <CardContent>
                  <MiniBarChart
                    series={analytics.dateTrend.map((r) => ({ name: r.date, confirmed: r.attempts }))}
                    labelKey="name"
                    valueKey="confirmed"
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Current vs Advance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {['CURRENT', 'ADVANCE', 'UNKNOWN'].map((cat) => (
                    <p key={cat}>
                      <strong>{cat}</strong>: {analytics.byCategory[cat]?.confirmed ?? 0} confirmed /{' '}
                      {analytics.byCategory[cat]?.total ?? 0} attempts
                    </p>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Error categories</CardTitle>
                </CardHeader>
                <CardContent>
                  <MiniBarChart
                    series={Object.entries(analytics.errorCategories || {}).map(([name, count]) => ({ name, confirmed: count }))}
                    labelKey="name"
                    valueKey="confirmed"
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Unconfirmed & application failures</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>
                    Uncertain: {analytics.unconfirmedOutcomes?.uncertain ?? 0} · In progress (submitted):{' '}
                    {analytics.unconfirmedOutcomes?.in_progress ?? 0}
                  </p>
                  <MiniBarChart
                    series={Object.entries(analytics.applicationFailures || {}).map(([name, count]) => ({ name, confirmed: count }))}
                    labelKey="name"
                    valueKey="confirmed"
                  />
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Per-account confirmed</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-1 pr-2">Agency</th>
                        <th className="py-1 pr-2">Label</th>
                        <th className="py-1 pr-2">Mask</th>
                        <th className="py-1 pr-2">Attempts</th>
                        <th className="py-1">Confirmed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.perAccountConfirmed.map((row) => (
                        <tr key={row.accountId} className="border-t border-stone-100">
                          <td className="py-1 pr-2">{row.agencyName}</td>
                          <td className="py-1 pr-2">{row.label}</td>
                          <td className="py-1 pr-2 font-mono">{row.maskedIdentifier}</td>
                          <td className="py-1 pr-2">{row.attempts}</td>
                          <td className="py-1">{row.confirmed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          ) : (
            !loading && (
              <p className="text-sm text-slate-500 lg:col-span-2">No analytics loaded. Adjust filters and click Apply.</p>
            )
          )}
        </div>
      )}
    </div>
  );
}

function Paginate({ page, total, pageSize, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-slate-500">
        Page {page} of {pages} ({total} rows)
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}