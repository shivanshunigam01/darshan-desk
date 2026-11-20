import { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { Input } from '../ui/input.jsx';
import { Badge } from '../ui/badge.jsx';

export function PilgrimSelectCards({ pilgrims, selectedIds, max, onToggle, fieldErrors }) {
  const [query, setQuery] = useState('');
  const atMax = selectedIds.length >= max;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pilgrims;
    return pilgrims.filter(
      (p) =>
        (p.fullName || '').toLowerCase().includes(q) ||
        (p.city || '').toLowerCase().includes(q) ||
        String(p.mobile || '').includes(q)
    );
  }, [pilgrims, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--dd-text-muted)]">
          Select up to <strong className="text-[var(--dd-text)]">{max}</strong> pilgrims from your catalog.
        </p>
        <Badge tone={atMax ? 'warning' : 'navy'}>
          <Users className="mr-1 inline h-3 w-3" aria-hidden />
          {selectedIds.length}/{max}
        </Badge>
      </div>
      <Input
        type="search"
        placeholder="Search by name, city, or mobile…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-md"
        aria-label="Search pilgrims"
      />
      {fieldErrors?.length > 0 && (
        <ul className="space-y-1 text-sm text-[var(--dd-error)]" role="alert">
          {fieldErrors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <MotionGrid className="grid gap-3 sm:grid-cols-2">
        {filtered.map((p) => {
          const selected = selectedIds.includes(p._id);
          const disabled = !selected && atMax;
          return (
            <button
              key={p._id}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(p._id)}
              className={cn(
                'rounded-[var(--dd-radius-md)] border p-4 text-left transition-all duration-200 motion-reduce:transition-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dd-accent)]',
                selected && 'border-[var(--dd-accent)] bg-[var(--dd-accent-soft)]',
                !selected && 'border-[var(--dd-border)] bg-[var(--dd-surface)] hover:border-[var(--dd-border-strong)]',
                disabled && 'cursor-not-allowed opacity-50'
              )}
              aria-pressed={selected}
            >
              <span className="font-semibold text-[var(--dd-text)]">{p.fullName}</span>
              <span className="mt-1 block text-xs text-[var(--dd-text-muted)]">
                {p.age != null ? `${p.age} yrs` : '—'} · {p.gender || '—'} · {p.city || '—'}
              </span>
              {p.mobile && <span className="mt-1 block text-xs tabular-nums text-[var(--dd-text-muted)]">{p.mobile}</span>}
            </button>
          );
        })}
      </MotionGrid>
      {!filtered.length && <p className="text-sm text-[var(--dd-text-muted)]">No pilgrims match. Add pilgrims first.</p>}
    </div>
  );
}

function MotionGrid({ className, children }) {
  return <div className={cn('dd-kpi-stagger', className)}>{children}</div>;
}