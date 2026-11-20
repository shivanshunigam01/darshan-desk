import { cn } from '../../lib/utils';

const tones = {
  default: 'bg-slate-100 text-slate-800',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  navy: 'bg-navy-50 text-navy-800',
};

export function Badge({ className, tone = 'default', children, ...props }) {
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone], className)}
      {...props}
    >
      {children}
    </span>
  );
}