import { cn } from '../../lib/utils.js';

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-[var(--dd-radius-md)] border border-dashed border-[var(--dd-border)] bg-[var(--dd-surface)] px-6 py-12 text-center', className)}>
      {Icon && <Icon className="mb-3 h-10 w-10 text-[var(--dd-text-muted)]" aria-hidden />}
      <h2 className="text-lg font-semibold text-[var(--dd-text)]">{title}</h2>
      {description && <p className="mt-2 max-w-md text-sm text-[var(--dd-text-muted)]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}