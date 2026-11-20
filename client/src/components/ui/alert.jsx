import { cn } from '../../lib/utils';

const tones = {
  info: 'border-slate-200 bg-white text-slate-800',
  success: 'border-green-200 bg-success-soft text-green-900',
  warning: 'border-amber-200 bg-warning-soft text-amber-950',
  error: 'border-red-200 bg-danger-soft text-red-900',
};

export function Alert({ tone = 'info', className, title, children }) {
  return (
    <div className={cn('rounded-lg border px-4 py-3 text-sm', tones[tone], className)} role="alert">
      {title && <p className="mb-1 font-semibold">{title}</p>}
      <div>{children}</div>
    </div>
  );
}