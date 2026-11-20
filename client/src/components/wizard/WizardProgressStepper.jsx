import { Check } from 'lucide-react';
import { cn } from '../../lib/utils.js';

export function WizardProgressStepper({ steps, currentStep }) {
  const progress = steps.length > 1 ? (currentStep / (steps.length - 1)) * 100 : 0;

  return (
    <nav aria-label="Booking preparation progress" className="mb-6 space-y-3">
      <div
        className="h-1.5 overflow-hidden rounded-full bg-[var(--dd-border)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        aria-label={`Step ${currentStep + 1} of ${steps.length}`}
      >
        <div
          className="h-full rounded-full bg-[var(--dd-accent)] transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
      <ol className="flex gap-1 overflow-x-auto pb-1">
        {steps.map((step, i) => {
          const done = i < currentStep;
          const current = i === currentStep;
          return (
            <li
              key={step.id}
              className={cn(
                'dd-enter flex min-w-[7.5rem] flex-1 flex-col items-center gap-1 rounded-[var(--dd-radius-sm)] px-2 py-2 text-center transition-colors',
                current && 'bg-[var(--dd-accent-soft)]',
                !current && !done && 'opacity-70'
              )}
              aria-current={current ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-transform duration-200 motion-reduce:transition-none',
                  done && 'bg-[var(--dd-success)] text-white',
                  current && !done && 'scale-110 bg-[var(--dd-accent)] text-white shadow-[var(--dd-shadow-sm)]',
                  !done && !current && 'border border-[var(--dd-border)] bg-[var(--dd-surface)] text-[var(--dd-text-muted)]'
                )}
                aria-hidden
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={cn('text-[11px] font-medium leading-tight', current ? 'text-[var(--dd-text)]' : 'text-[var(--dd-text-muted)]')}>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}