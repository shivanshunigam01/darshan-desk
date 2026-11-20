import { cn } from '../../lib/utils.js';

export function Skeleton({ className, ...props }) {
  return <div className={cn('dd-skeleton', className)} aria-hidden {...props} />;
}

export function DashboardSkeleton({ variant = 'default' }) {
  if (variant === 'command') {
    return (
      <div className="space-y-6" aria-busy="true" role="status">
        <Skeleton className="h-14 w-full max-w-2xl" />
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
        <span className="sr-only">Loading command center…</span>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}