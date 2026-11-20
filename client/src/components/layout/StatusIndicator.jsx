import { cn } from '../../lib/utils.js';

const map = {
  success: 'bg-[var(--dd-success)]',
  warning: 'bg-[var(--dd-warning)]',
  danger: 'bg-[var(--dd-error)]',
  neutral: 'bg-[var(--dd-text-muted)]',
  accent: 'bg-[var(--dd-accent)]',
};

export function StatusIndicator({ tone = 'neutral', label, className }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm text-[var(--dd-text)]', className)}>
      <span className={cn('h-2 w-2 shrink-0 rounded-full', map[tone] || map.neutral)} aria-hidden />
      {label}
    </span>
  );
}