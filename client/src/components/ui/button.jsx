import { cn } from '../../lib/utils';

const variants = {
  default: 'bg-[var(--dd-primary)] text-white hover:opacity-95',
  secondary: 'bg-[var(--dd-surface)] border border-[var(--dd-border)] text-[var(--dd-text)] hover:bg-[var(--dd-accent-soft)]',
  ghost: 'text-[var(--dd-text)] hover:bg-[var(--dd-accent-soft)]',
  danger: 'bg-danger text-white hover:opacity-95',
};

const sizes = {
  default: 'h-10 px-4 py-2 text-sm',
  sm: 'h-8 px-3 text-xs',
  lg: 'h-11 px-6 text-base',
};

export function Button({
  className,
  variant = 'default',
  size = 'default',
  type = 'button',
  disabled,
  children,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}