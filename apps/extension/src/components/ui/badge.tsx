import { cn } from '../../lib/utils';

export function Badge({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: 'default' | 'success' | 'warn' | 'danger' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        variant === 'default' && 'bg-stone-200 text-stone-800',
        variant === 'success' && 'bg-emerald-100 text-emerald-800',
        variant === 'warn' && 'bg-amber-100 text-amber-900',
        variant === 'danger' && 'bg-red-100 text-red-800',
        className
      )}
      {...props}
    />
  );
}