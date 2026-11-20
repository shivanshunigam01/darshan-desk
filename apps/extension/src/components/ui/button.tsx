import * as React from 'react';
import { cn } from '../../lib/utils';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'secondary' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'icon';
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-lg text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-temple-red disabled:pointer-events-none disabled:opacity-50',
          variant === 'default' && 'bg-temple-black text-white hover:bg-temple-surface',
          variant === 'secondary' && 'border border-stone-300 bg-white text-temple-black hover:bg-stone-50',
          variant === 'ghost' && 'bg-transparent hover:bg-stone-100',
          variant === 'destructive' && 'bg-temple-red text-white hover:bg-red-900',
          size === 'default' && 'h-10 px-4 py-2',
          size === 'sm' && 'h-8 px-3 text-xs',
          size === 'icon' && 'h-9 w-9',
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';