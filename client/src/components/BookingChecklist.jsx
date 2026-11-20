import { CheckCircle2, Circle, CircleDashed } from 'lucide-react';
import { cn } from '../lib/utils.js';

export default function BookingChecklist({ items, preparation }) {
  if (!items?.length && !preparation) return null;

  const rows =
    items?.length > 0
      ? items
      : [
          { id: 'draft', label: 'Preparation saved', done: Boolean(preparation) },
          { id: 'val', label: 'Validation completed', done: preparation?.validationStatus === 'passed' },
        ];

  return (
    <ul className="space-y-2 rounded-[var(--dd-radius-md)] border border-[var(--dd-border)] bg-[var(--dd-bg)] p-3">
      {rows.map((item) => {
        const Icon = item.done ? CheckCircle2 : item.operatorAction ? CircleDashed : Circle;
        return (
          <li key={item.id} className="flex gap-2 text-sm text-[var(--dd-text)]">
            <Icon
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0',
                item.done ? 'text-[var(--dd-success)]' : item.operatorAction ? 'text-[var(--dd-warning)]' : 'text-[var(--dd-text-muted)]'
              )}
              aria-hidden
            />
            <span>
              {item.label}
              {item.operatorAction && (
                <span className="text-[var(--dd-text-muted)]"> — you complete this on the official TTD site</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}