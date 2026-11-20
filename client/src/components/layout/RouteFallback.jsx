import { DashboardSkeleton } from '../ui/skeleton.jsx';

export default function RouteFallback() {
  return (
    <div className="dd-fade-in" role="status" aria-live="polite">
      <DashboardSkeleton />
    </div>
  );
}