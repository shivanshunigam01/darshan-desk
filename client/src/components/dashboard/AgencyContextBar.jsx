import { Building2, UserCircle } from 'lucide-react';
import { Badge } from '../ui/badge.jsx';
import { NativeSelect } from '../ui/native-select.jsx';
import { cn } from '../../lib/utils.js';

export function AgencyContextBar({
  operator,
  license,
  accounts,
  selectedAccountId,
  onAccountChange,
  className,
}) {
  const agencyLabel = operator?.agencyId ? `Agency ${String(operator.agencyId).slice(-6)}` : 'Agency workspace';

  return (
    <div
      className={cn(
        'dd-enter flex flex-col gap-3 rounded-[var(--dd-radius-md)] border border-[var(--dd-border)] bg-[var(--dd-surface)] p-4 shadow-[var(--dd-shadow-card)] sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--dd-accent-soft)] text-[var(--dd-accent)]" aria-hidden>
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--dd-text-muted)]">Command center</p>
          <p className="truncate text-base font-semibold text-[var(--dd-text)]">{agencyLabel}</p>
          <p className="flex items-center gap-1 truncate text-sm text-[var(--dd-text-muted)]">
            <UserCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {operator?.displayName || operator?.email || 'Operator'}
          </p>
        </div>
        {license && (
          <Badge tone={license.licenseStatus === 'active' ? 'success' : 'warning'} className="shrink-0">
            License: {license.licenseStatus || 'unknown'}
          </Badge>
        )}
        <Badge tone="navy" className="shrink-0 bg-[var(--dd-primary)] text-white">
          {operator?.role || 'operator'}
        </Badge>
      </div>

      <div className="w-full sm:max-w-xs">
        <label htmlFor="ttd-account-context" className="mb-1 block text-xs font-medium text-[var(--dd-text-muted)]">
          TTD account context
        </label>
        <NativeSelect
          id="ttd-account-context"
          value={selectedAccountId}
          onChange={(e) => onAccountChange(e.target.value)}
          aria-label="Select TTD account context"
        >
          <option value="">All linked accounts ({accounts.length})</option>
          {accounts.map((a) => (
            <option key={a._id || a.id} value={a._id || a.id}>
              {a.label || a.displayName || a.username || `Account ${String(a._id || a.id).slice(-6)}`}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}