import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api';
import { Alert } from '../components/ui/alert.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Input, Label, Select } from '../components/ui/input.jsx';

const TZ = 'Asia/Kolkata';

function fmt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });
}

function statusBadge(status) {
  if (status === 'active') return 'success';
  if (status === 'disabled') return 'warning';
  return 'danger';
}

export default function TtdAccountsPage() {
  const { token, operator } = useAuth();
  const isAdmin = operator?.role === 'admin' || operator?.role === 'super_admin';
  const [rows, setRows] = useState([]);
  const [agencyOperators, setAgencyOperators] = useState([]);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ accountLabel: '', loginIdentifier: '' });
  const [edit, setEdit] = useState(null);
  const [assign, setAssign] = useState(null);
  const [verify, setVerify] = useState(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (statusFilter) params.set('status', statusFilter);
    api
      .ttdAccountsManage(token, params.toString())
      .then((r) => setRows(r.accounts || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, q, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!token || !isAdmin) return;
    api
      .ttdAccountOperators(token)
      .then((r) => setAgencyOperators(r.operators || []))
      .catch(() => setAgencyOperators([]));
  }, [token, isAdmin]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.ttdAccountCreate(token, form);
      setForm({ accountLabel: '', loginIdentifier: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!edit) return;
    setBusy(true);
    try {
      await api.ttdAccountUpdate(token, edit._id, {
        accountLabel: edit.accountLabel,
        loginIdentifier: edit.loginIdentifier || undefined,
        ownerId: edit.ownerId || undefined,
      });
      setEdit(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const consent = async (id) => {
    if (!window.confirm('Record owner consent and authorization for this TTD account reference?')) return;
    setBusy(true);
    try {
      await api.ttdAccountConsent(token, id);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitVerify = async (e) => {
    e.preventDefault();
    if (!verify) return;
    setBusy(true);
    try {
      await api.ttdAccountVerify(token, verify._id, {
        verificationStatus: verify.verificationStatus,
        displayName: verify.displayName,
      });
      setVerify(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitAssign = async (e) => {
    e.preventDefault();
    if (!assign) return;
    setBusy(true);
    try {
      await api.ttdAccountAssign(token, assign._id, assign.selected);
      setAssign(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id, action) => {
    const label =
      action === 'archive' ? 'Archive' : action === 'disable' ? 'Disable' : 'Re-activate';
    if (!window.confirm(`${label} this account reference?`)) return;
    setBusy(true);
    try {
      if (action === 'archive') await api.ttdAccountArchive(token, id);
      else if (action === 'disable') await api.ttdAccountDisable(token, id);
      else await api.ttdAccountActivate(token, id);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const filteredCount = useMemo(() => rows.length, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">TTD account manager</h1>
        <p className="text-sm text-slate-600">
          Multi-account references with owner consent. <strong>Reference-only</strong> — no session cookies, OTP, CAPTCHA
          tokens, or third-party passwords in MongoDB. Credentials belong on the official TTD site or a future
          device-local vault (<code className="text-xs">credentialMode: device_vault</code>) with explicit owner control.
        </p>
      </div>

      {error && (
        <Alert tone="error" title="Error">
          {error}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add account reference</CardTitle>
          <CardDescription>Login identifier is stored for operator reference only — never a password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="new-label">Account label</Label>
              <Input
                id="new-label"
                required
                value={form.accountLabel}
                onChange={(e) => setForm({ ...form, accountLabel: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="new-login">Login identifier (email / mobile)</Label>
              <Input
                id="new-login"
                required
                autoComplete="off"
                value={form.loginIdentifier}
                onChange={(e) => setForm({ ...form, loginIdentifier: e.target.value })}
              />
            </div>
            <Button type="submit" disabled={busy} className="sm:col-span-2">
              Add reference
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Accounts ({filteredCount})</CardTitle>
            <CardDescription>
              Booking counts from this agency&apos;s preparations and BookingAttempt records — not global TTD counters.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              className="w-44"
              placeholder="Search label or login"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search accounts"
            />
            <Select className="w-36" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status filter">
              <option value="">Active + disabled</option>
              <option value="active">Active only</option>
              <option value="disabled">Disabled</option>
              <option value="archived">Archived</option>
            </Select>
            <Button variant="secondary" onClick={load} disabled={loading}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading && (
            <div className="space-y-2" role="status">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-slate-100" />
              ))}
            </div>
          )}
          {!loading && (
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-2">Account label</th>
                  <th className="py-2 pr-2">Masked login</th>
                  <th className="py-2 pr-2">Verified name</th>
                  <th className="py-2 pr-2">Verification</th>
                  <th className="py-2 pr-2">Auth</th>
                  <th className="py-2 pr-2">Last verified</th>
                  <th className="py-2 pr-2">Prepared</th>
                  <th className="py-2 pr-2">Confirmed</th>
                  <th className="py-2 pr-2">Failed</th>
                  <th className="py-2 pr-2">Last booking</th>
                  <th className="py-2 pr-2">Assigned operator</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="py-2.5 font-medium text-navy">{r.accountLabel}</td>
                    <td className="py-2.5 font-mono text-xs">{r.maskedLogin}</td>
                    <td className="py-2.5">{r.verifiedDisplayName || '—'}</td>
                    <td className="py-2.5">
                      <Badge tone={r.verificationStatus === 'verified' ? 'success' : 'warning'}>
                        {r.verificationStatus}
                      </Badge>
                    </td>
                    <td className="py-2.5">
                      <Badge tone={r.authorizationStatus === 'authorized' ? 'success' : 'warning'}>
                        {r.authorizationStatus}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-slate-600">{fmt(r.lastVerifiedAt)}</td>
                    <td className="py-2.5 tabular-nums">{r.bookingsPrepared}</td>
                    <td className="py-2.5 tabular-nums text-success">{r.confirmedBookings}</td>
                    <td className="py-2.5 tabular-nums text-danger">{r.failedAttempts}</td>
                    <td className="py-2.5 text-slate-600">{fmt(r.lastBookingDate)}</td>
                    <td className="py-2.5">{r.primaryAssignedOperator || (r.assignedOperators || []).join(', ') || '—'}</td>
                    <td className="py-2.5">
                      <Badge tone={statusBadge(r.status)}>{r.status}</Badge>
                    </td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEdit({ ...r, accountLabel: r.accountLabel })}>
                          Edit
                        </Button>
                        {r.authorizationStatus !== 'authorized' && (
                          <Button size="sm" variant="secondary" disabled={busy} onClick={() => consent(r._id)}>
                            Consent
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            setVerify({ _id: r._id, displayName: r.verifiedDisplayName || '', verificationStatus: 'verified' })
                          }
                        >
                          Verify
                        </Button>
                        {isAdmin && (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() =>
                                setAssign({
                                  _id: r._id,
                                  selected: [...(r.assignedOperatorIds || [])],
                                })
                              }
                            >
                              Assign
                            </Button>
                            {r.status === 'active' && (
                              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setStatus(r._id, 'disable')}>
                                Disable
                              </Button>
                            )}
                            {r.status === 'disabled' && (
                              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setStatus(r._id, 'activate')}>
                                Activate
                              </Button>
                            )}
                            <Button size="sm" variant="danger" disabled={busy} onClick={() => setStatus(r._id, 'archive')}>
                              Archive
                            </Button>
                          </>
                        )}
                        <Link to="/booking/prepare">
                          <Button size="sm" variant="ghost">
                            Prepare
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && !rows.length && (
            <p className="text-slate-600">No account references match your filters and assignment scope.</p>
          )}
        </CardContent>
      </Card>

      {edit && (
        <Card className="border-navy-200">
          <CardHeader>
            <CardTitle>Edit account reference</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveEdit} className="grid max-w-lg gap-3">
              <div>
                <Label>Account label</Label>
                <Input value={edit.accountLabel} onChange={(e) => setEdit({ ...edit, accountLabel: e.target.value })} required />
              </div>
              {isAdmin && (
                <div>
                  <Label>Account owner (operator)</Label>
                  <Select value={edit.ownerId || ''} onChange={(e) => setEdit({ ...edit, ownerId: e.target.value })}>
                    <option value="">—</option>
                    {agencyOperators.map((o) => (
                      <option key={o._id} value={o._id}>
                        {o.displayName} ({o.role})
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>
                  Save
                </Button>
                <Button type="button" variant="secondary" onClick={() => setEdit(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {assign && isAdmin && (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle>Assign authorized operators</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitAssign} className="space-y-3">
              <fieldset className="space-y-2">
                {agencyOperators.map((o) => (
                  <label key={o._id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={assign.selected.map(String).includes(String(o._id))}
                      onChange={(e) => {
                        const id = String(o._id);
                        setAssign((a) => ({
                          ...a,
                          selected: e.target.checked
                            ? [...new Set([...a.selected.map(String), id])]
                            : a.selected.map(String).filter((x) => x !== id),
                        }));
                      }}
                    />
                    {o.displayName} <span className="text-slate-500">({o.email})</span>
                  </label>
                ))}
              </fieldset>
              <motionButtons>
                <Button type="submit" disabled={busy}>
                  Save assignments
                </Button>
                <Button type="button" variant="secondary" onClick={() => setAssign(null)}>
                  Cancel
                </Button>
              </motionButtons>
            </form>
          </CardContent>
        </Card>
      )}

      {verify && (
        <Card>
          <CardHeader>
            <CardTitle>Record verification status</CardTitle>
            <CardDescription>Operator attestation only — from permitted owner-facing checks, not scraped sessions.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitVerify} className="grid max-w-md gap-3">
              <div>
                <Label>Verified display name</Label>
                <Input value={verify.displayName} onChange={(e) => setVerify({ ...verify, displayName: e.target.value })} />
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={verify.verificationStatus}
                  onChange={(e) => setVerify({ ...verify, verificationStatus: e.target.value })}
                >
                  <option value="verified">Verified</option>
                  <option value="failed">Failed</option>
                  <option value="expired">Expired</option>
                  <option value="unverified">Unverified</option>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>
                  Record
                </Button>
                <Button type="button" variant="secondary" onClick={() => setVerify(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function motionButtons({ children }) {
  return <div className="flex gap-2">{children}</div>;
}