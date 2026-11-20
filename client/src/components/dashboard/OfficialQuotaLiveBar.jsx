import { useEffect, useState } from 'react';
import { formatIstClock, remainingUntilRelease } from '../../lib/quotaReleaseClock.js';
import { cn } from '../../lib/utils.js';

function Stat({ label, value, tone = 'default', title }) {
  const valueClass =
    tone === 'success'
      ? 'text-[var(--dd-success)]'
      : tone === 'warning'
        ? 'text-[var(--dd-warning)]'
        : tone === 'danger'
          ? 'text-[var(--dd-error)]'
          : 'font-semibold text-[var(--dd-error)]';
  return (
    <span className="inline-flex flex-wrap items-baseline gap-1 border-r border-amber-300/60 pr-3 last:border-0 last:pr-0" title={title}>
      <span className="font-semibold text-[var(--dd-text)]">{label}:</span>
      <span className={valueClass}>{value ?? '—'}</span>
    </span>
  );
}

export function OfficialQuotaLiveBar({ quota, providerStatus, isStale }) {
  const [now, setNow] = useState(() => new Date());
  const d = quota?.data;

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const release = remainingUntilRelease(d?.quotaReleaseTime, now);
  const reporting = d?.slottime || '—';

  if (!d) {
    return (
      <MotionPanel className="rounded-[var(--dd-radius-md)] border border-amber-300/80 bg-amber-50/90 p-4 text-sm text-[var(--dd-text-muted)]">
        Live TTD quota not loaded. Enable{' '}
        <code className="text-xs">TTD_INTEGRATION_MODE=approved</code> and{' '}
        <code className="text-xs">TTD_INTEGRATION_AUTH_TOKEN</code> on the server (portal session token). Status:{' '}
        {providerStatus || 'NOT CONFIGURED'}.
      </MotionPanel>
    );
  }

  return (
    <MotionPanel
      className="space-y-2 rounded-[var(--dd-radius-md)] border border-amber-400/70 bg-gradient-to-b from-amber-50 to-amber-100/80 p-4 shadow-[var(--dd-shadow-sm)]"
      aria-label="Official SRIVANI current-day quota summary"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-900/80">Live from TTD · darshansummarySrivaniCurrentDay</span>
        {isStale && <span className="rounded bg-[var(--dd-warning)] px-2 py-0.5 text-[10px] font-medium text-white">Stale</span>}
        <span className="text-[10px] text-amber-900/60">{providerStatus}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-2 text-sm">
        <Stat label="Quota Release Time" value={d.quotaReleaseTime ?? '—'} />
        <Stat label="System Time" value={formatIstClock(now)} title="IST clock on this device" />
        <Stat label="Remaining Time" value={release.label} title="Until today's release time (IST)" />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-2 text-sm">
        <Stat label="Available Quota for (Current Day)" value={d.quotaCount ?? '—'} tone={d.quotaCount > 0 ? 'success' : 'danger'} />
        <Stat label="Reporting Time" value={reporting} />
        <Stat label="Payment Pending" value={d.pending ?? '—'} tone="warning" />
        <Stat label="Success" value={d.success ?? '—'} tone="success" />
        <Stat label="Failed" value={d.failed ?? '—'} tone="danger" />
      </div>
      <p className="text-xs text-amber-950/70">
        Min donation ₹{d.minAmount?.toLocaleString('en-IN') ?? '—'} · Darshan fee ₹{d.darshanAmount ?? '—'} · Advance limits in same payload
        (min ₹{d.advanceminAmount?.toLocaleString('en-IN') ?? '—'}, pilgrims {d.advanceminpersons ?? '—'}–{d.advancemaxpersons ?? '—'}).
      </p>
    </MotionPanel>
  );
}

function MotionPanel({ className, children, ...rest }) {
  return (
    <div className={cn('dd-enter', className)} {...rest}>
      {children}
    </div>
  );
}