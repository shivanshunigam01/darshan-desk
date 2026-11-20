import * as React from 'react';
import { cn } from '../../lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-temple-black placeholder:text-stone-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-temple-red',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';