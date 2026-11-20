import { Link } from 'react-router-dom';
import { Badge } from '../ui/badge.jsx';
import { Button } from '../ui/button.jsx';
import { cn } from '../../lib/utils.js';

function toneForValidation(status) {
  if (status === 'passed') return 'success';
  if (status === 'failed') return 'danger';
  return 'warning';
}

function toneForWorkflow(status) {
  if (status === 'verified') return 'success';
  if (['submitted_pending_verification', 'awaiting_official', 'extension_connected'].includes(status)) return 'warning';
  return 'default';
}

export function RecentRecordsTable({ preparations, attempts, className }) {
  const prepRows = [...preparations]
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, 8);
  const attemptRows = [...(attempts || [])]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    .slice(0, 5);

  return (
    <div className={cn('space-y-6', className)}>
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--dd-text-muted)]">Recent preparations</h3>
          <Link to="/booking/prepare">
            <Button size="sm" variant="secondary">
              New preparation
            </Button>
          </Link>
        </div>
        <div className="overflow-x-auto rounded-[var(--dd-radius-md)] border border-[var(--dd-border)]">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="bg-[var(--dd-bg)] text-xs uppercase text-[var(--dd-text-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium" scope="col">
                  Updated
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  Pilgrim / label
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  Validation
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  Workflow
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  Open
                </th>
              </tr>
            </thead>
            <tbody>
              {prepRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-[var(--dd-text-muted)]">
                    No preparations yet.
                  </td>
                </tr>
              ) : (
                prepRows.map((p) => (
                  <tr key={p._id} className="border-t border-[var(--dd-border)] hover:bg-[var(--dd-accent-soft)]/30">
                    <td className="px-3 py-2 tabular-nums text-[var(--dd-text-muted)]">
                      {p.updatedAt ? new Date(p.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'}
                    </td>
                    <td className="max-w-[12rem] truncate px-3 py-2 font-medium text-[var(--dd-text)]">
                      {p.label || p.pilgrimName || p._id?.slice(-8) || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={toneForValidation(p.validationStatus)}>{p.validationStatus || '—'}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={toneForWorkflow(p.workflowStatus)}>{p.workflowStatus || '—'}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Link className="text-[var(--dd-accent)] underline-offset-2 hover:underline" to={`/booking/prepare/${p._id}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {attemptRows.length > 0 && (
        <section>
          <MotionBlock className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--dd-text-muted)]">Recent booking attempts</h3>
            <Link to="/srivani/history">
              <Button size="sm" variant="secondary">
                Full history
              </Button>
            </Link>
          </MotionBlock>
          <div className="overflow-x-auto rounded-[var(--dd-radius-md)] border border-[var(--dd-border)]">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="bg-[var(--dd-bg)] text-xs uppercase text-[var(--dd-text-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium" scope="col">
                    State
                  </th>
                  <th className="px-3 py-2 font-medium" scope="col">
                    Outcome
                  </th>
                  <th className="px-3 py-2 font-medium" scope="col">
                    Category
                  </th>
                </tr>
              </thead>
              <tbody>
                {attemptRows.map((a) => (
                  <tr key={a._id} className="border-t border-[var(--dd-border)]">
                    <td className="px-3 py-2">{a.state || '—'}</td>
                    <td className="px-3 py-2">{a.outcome || '—'}</td>
                    <td className="px-3 py-2">{a.bookingCategory || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function MotionBlock({ className, children }) {
  return <div className={cn('dd-enter', className)}>{children}</div>;
}