import { cn } from '../../lib/utils.js';
import { AnimatedKpiValue } from './AnimatedKpiValue.jsx';
import { Skeleton } from '../ui/skeleton.jsx';

const tones = {
  default: 'text-[var(--dd-text)]',
  success: 'text-[var(--dd-success)]',
  warning: 'text-[var(--dd-warning)]',
  danger: 'text-[var(--dd-error)]',
  accent: 'text-[var(--dd-accent)]',
};

export function KPIStatCard({ label, value, hint, tone = 'default', loading, animateValue = true, className }) {
  return (
    <div
      className={cn(
        'rounded-[var(--dd-radius-md)] border border-[var(--dd-border)] bg-[var(--dd-surface)] p-4 shadow-[var(--dd-shadow-card)] transition-shadow hover:shadow-md',
        className
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--dd-text-muted)]">{label}</p>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-24" />
      ) : (
        <p className={cn('mt-2 text-2xl font-semibold tabular-nums', tones[tone] || tones.default)}>
          <AnimatedKpiValue value={value} animate={animateValue} />
        </p>
      )}
      {hint && !loading && <p className="mt-1 text-xs text-[var(--dd-text-muted)]">{hint}</p>}
    </div>
  );
}