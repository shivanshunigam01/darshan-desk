import { cn } from '../../lib/utils';

export function Alert({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'destructive' }) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border px-3 py-2 text-xs leading-relaxed',
        variant === 'default' && 'border-amber-200 bg-amber-50 text-amber-950',
        variant === 'destructive' && 'border-red-200 bg-red-50 text-red-900',
        className
      )}
      {...props}
    />
  );
}