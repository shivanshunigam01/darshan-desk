import { cn } from '../../lib/utils.js';

export function NativeSelect({ className, ...props }) {
  return (
    <select
      className={cn(
        'h-9 w-full min-w-0 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border)] bg-[var(--dd-surface)] px-3 py-1.5 text-sm text-[var(--dd-text)] shadow-[var(--dd-shadow-sm)] transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dd-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dd-bg)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}