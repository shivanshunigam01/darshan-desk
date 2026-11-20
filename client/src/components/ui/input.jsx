import { cn } from '../../lib/utils';

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

export function Label({ className, children, ...props }) {
  return (
    <label className={cn('mb-1.5 block text-sm font-medium text-slate-700', className)} {...props}>
      {children}
    </label>
  );
}

export function Select({ className, children, ...props }) {
  return (
    <select
      className={cn(
        'flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}