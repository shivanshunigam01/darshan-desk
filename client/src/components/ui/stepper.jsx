import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export function WizardStepper({ steps, currentStep }) {
  return (
    <nav aria-label="Booking preparation progress" className="mb-6 overflow-x-auto">
      <ol className="flex min-w-max gap-2">
        {steps.map((step, i) => {
          const done = i < currentStep;
          const current = i === currentStep;
          return (
            <li
              key={step.id}
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium',
                done && 'border-green-200 bg-success-soft text-success',
                current && !done && 'border-navy bg-navy text-white',
                !done && !current && 'border-slate-200 bg-white text-slate-500'
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px]',
                  current && !done && 'bg-white text-navy',
                  done && 'bg-success text-white',
                  !done && !current && 'bg-slate-100'
                )}
                aria-hidden
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className="whitespace-nowrap">{step.label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}