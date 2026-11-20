import { cn } from '../../lib/utils';

export function Alert({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'destructive' | 'info' }) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border px-3 py-2 text-xs leading-relaxed',
        variant === 'default' && 'border-red-100 bg-temple-blush text-stone-800',
        variant === 'info' && 'border-sky-200 bg-sky-50 text-sky-950',
        variant === 'destructive' && 'border-red-200 bg-red-50 text-red-900',
        className
      )}
      {...props}
    />
  );
}