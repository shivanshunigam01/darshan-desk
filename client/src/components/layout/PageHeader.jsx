import { cn } from '../../lib/utils.js';

export function PageHeader({ title, description, actions, className }) {
  return (
    <header
      className={cn('flex flex-col gap-3 border-b border-[var(--dd-border)] pb-5 sm:flex-row sm:items-end sm:justify-between', className)}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--dd-text)]">{title}</h1>
        {description && <p className="mt-1 text-sm text-[var(--dd-text-muted)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
    </header>
  );
}