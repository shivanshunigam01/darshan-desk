import { Cloud, CloudOff, Loader2 } from 'lucide-react';
import { Badge } from '../ui/badge.jsx';
import { cn } from '../../lib/utils.js';

const STATES = {
  idle: { label: 'Draft not saved yet', tone: 'warning', icon: CloudOff },
  saving: { label: 'Saving draft…', tone: 'navy', icon: Loader2 },
  saved: { label: 'Draft saved', tone: 'success', icon: Cloud },
  error: { label: 'Save failed', tone: 'danger', icon: CloudOff },
};

export function DraftAutosaveStatus({ state, revision, updatedAt, className }) {
  const meta = STATES[state] || STATES.idle;
  const Icon = meta.icon;
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border)] bg-[var(--dd-bg)] px-3 py-2 text-xs',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <Icon className={cn('h-3.5 w-3.5', state === 'saving' && 'animate-spin motion-reduce:animate-none')} aria-hidden />
      <Badge tone={meta.tone}>{meta.label}</Badge>
      {typeof revision === 'number' && (
        <span className="text-[var(--dd-text-muted)]">
          Revision <strong className="text-[var(--dd-text)]">{revision}</strong>
        </span>
      )}
      {updatedAt && (
        <span className="text-[var(--dd-text-muted)]">
          · {new Date(updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
        </span>
      )}
    </div>
  );
}