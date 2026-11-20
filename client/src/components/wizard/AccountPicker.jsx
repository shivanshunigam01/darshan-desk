import { useMemo, useState } from 'react';
import { Search, ShieldCheck } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { Input } from '../ui/input.jsx';
import { Badge } from '../ui/badge.jsx';

export function AccountPicker({ accounts, value, onChange, error }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        (a.label || '').toLowerCase().includes(q) ||
        (a.accountHint || '').toLowerCase().includes(q) ||
        (a.displayName || '').toLowerCase().includes(q)
    );
  }, [accounts, query]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--dd-text-muted)]" aria-hidden />
        <Input
          type="search"
          placeholder="Search linked accounts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
          aria-label="Search TTD accounts"
        />
      </div>
      {error && (
        <p className="text-sm text-[var(--dd-error)]" role="alert">
          {error}
        </p>
      )}
      {!accounts.length ? (
        <p className="text-sm text-[var(--dd-text-muted)]">No authorized accounts. Add references in TTD Account Manager.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2" role="listbox" aria-label="TTD accounts">
          {filtered.map((a) => {
            const selected = value === a._id;
            return (
              <li key={a._id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onChange(a._id)}
                  className={cn(
                    'flex w-full gap-3 rounded-[var(--dd-radius-md)] border p-4 text-left transition-all duration-200 motion-reduce:transition-none',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dd-accent)]',
                    selected
                      ? 'border-[var(--dd-accent)] bg-[var(--dd-accent-soft)] shadow-[var(--dd-shadow-sm)]'
                      : 'border-[var(--dd-border)] bg-[var(--dd-surface)] hover:border-[var(--dd-border-strong)]'
                  )}
                >
                  <ShieldCheck className={cn('mt-0.5 h-5 w-5 shrink-0', selected ? 'text-[var(--dd-accent)]' : 'text-[var(--dd-text-muted)]')} />
                  <span className="min-w-0">
                    <span className="block font-semibold text-[var(--dd-text)]">{a.label || 'Account'}</span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--dd-text-muted)]">{a.accountHint || '—'}</span>
                    {a.authorizationStatus && (
                      <Badge tone="success" className="mt-2 text-[10px]">
                        {a.authorizationStatus}
                      </Badge>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {accounts.length > 0 && !filtered.length && (
        <p className="text-sm text-[var(--dd-text-muted)]">No accounts match your search.</p>
      )}
    </div>
  );
}