import { cn } from '../../lib/utils.js';

function segment(value, total, label, tone) {
  if (value === null || value === undefined || total <= 0) return null;
  const pct = Math.max(0, Math.min(100, (Number(value) / total) * 100));
  if (pct <= 0) return null;
  return (
    <MotionSegment
      key={label}
      className={cn('group relative h-full min-w-[2px] transition-[flex-grow] duration-300', tone)}
      style={{ flexGrow: pct }}
      title={`${label}: ${value}`}
      role="img"
      aria-label={`${label} ${value}`}
    />
  );
}

export function QuotaOutcomeChart({ success, pending, failed, className }) {
  const parts = [success, pending, failed].filter((v) => typeof v === 'number');
  if (parts.length === 0) {
    return (
      <p className="text-sm text-[var(--dd-text-muted)]">Official outcome counters unavailable — quota snapshot missing or null fields.</p>
    );
  }
  const total = parts.reduce((a, b) => a + b, 0) || 1;

  return (
    <div className={cn('space-y-2', className)}>
      <div
        className="flex h-3 overflow-hidden rounded-full bg-[var(--dd-border)]"
        aria-label="Official booking outcome distribution from SRIVANI snapshot"
      >
        {segment(success, total, 'Successful', 'bg-[var(--dd-success)] group-hover:brightness-110')}
        {segment(pending, total, 'Pending', 'bg-[var(--dd-warning)] group-hover:brightness-110')}
        {segment(failed, total, 'Failed', 'bg-[var(--dd-error)] group-hover:brightness-110')}
      </div>
      <ul className="flex flex-wrap gap-4 text-xs text-[var(--dd-text-muted)]">
        <li>
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--dd-success)]" aria-hidden />
          Successful: <strong className="text-[var(--dd-text)]">{success ?? '—'}</strong>
        </li>
        <li>
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--dd-warning)]" aria-hidden />
          Pending: <strong className="text-[var(--dd-text)]">{pending ?? '—'}</strong>
        </li>
        <li>
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--dd-error)]" aria-hidden />
          Failed: <strong className="text-[var(--dd-text)]">{failed ?? '—'}</strong>
        </li>
      </ul>
    </div>
  );
}

function MotionSegment({ className, style, title, ...rest }) {
  return <div className={cn('dd-enter', className)} style={style} title={title} {...rest} />;
}