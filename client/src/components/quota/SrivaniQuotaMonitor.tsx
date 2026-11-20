import type { ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  Banknote,
  CalendarClock,
  CircleDollarSign,
  Clock,
  Plug,
  RefreshCw,
  Ticket,
  Users,
  XCircle,
} from 'lucide-react';
import type { QuotaSummary, SrivaniQuotaPayload } from '../../types/quota';
import { formatIstDateTime } from '../../lib/formatIst';
import { QuotaOutcomeChart } from '../dashboard/QuotaOutcomeChart.jsx';
import { AnimatedKpiValue } from '../layout/AnimatedKpiValue.jsx';
import { PageHeader } from '../layout/PageHeader.jsx';
import { Badge } from '../ui/badge.jsx';
import { Button } from '../ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.jsx';
import { Alert } from '../ui/alert.jsx';
import { Skeleton } from '../ui/skeleton.jsx';
import { cn } from '../../lib/utils';

function displayScalar(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return String(value);
}

function formatInr(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return `₹${amount.toLocaleString('en-IN')}`;
}

type MetricProps = {
  title: string;
  value: ReactNode;
  hint?: string;
  icon: typeof Activity;
  tone?: 'default' | 'success' | 'warning' | 'danger';
};

function MetricCard({ title, value, hint, icon: Icon, tone = 'default', animateNumeric = false }: MetricProps & { animateNumeric?: boolean }) {
  const toneClass =
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'danger'
          ? 'text-danger'
          : 'text-navy';
  return (
    <Card className="shadow-card transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy">
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <CardDescription className="text-xs font-semibold uppercase tracking-wide">{title}</CardDescription>
          <p className={cn('mt-1 truncate text-2xl font-semibold tabular-nums', toneClass)}>
            {typeof value === 'number' && animateNumeric ? <AnimatedKpiValue value={value} /> : value}
          </p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
      </CardHeader>
    </Card>
  );
}

function SkeletonGrid() {
  return (
    <div className="dd-kpi-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" role="status">
      {Array.from({ length: 12 }).map((_, i) => (
        <Skeleton key={i} className="h-24" />
      ))}
      <span className="sr-only">Loading SRIVANI quota…</span>
    </div>
  );
}

type Props = {
  payload: SrivaniQuotaPayload | null;
  loading: boolean;
  error?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  compact?: boolean;
  showHeader?: boolean;
  integrationFallback?: { mode?: string; message?: string };
};

export default function SrivaniQuotaMonitor({
  payload,
  loading,
  error,
  onRefresh,
  refreshing,
  compact = false,
  showHeader = true,
  integrationFallback,
}: Props) {
  const d: QuotaSummary | undefined = payload?.data;
  const integration = payload?.integration ?? integrationFallback;

  const providerStatus = payload?.providerStatus ?? integration?.providerStatus ?? 'NOT_CONFIGURED';
  const statusTone =
    providerStatus === 'READY' || providerStatus === 'MOCK_DEV' ? 'success' : providerStatus === 'NOT_CONFIGURED' ? 'warning' : 'warning';

  return (
    <div className="space-y-4">
      {showHeader && !compact && (
        <PageHeader
          title="SRIVANI quota monitor"
          description="Endpoint /dms/darshansummarySrivaniCurrentDay via server-approved provider. Null fields preserved; stale snapshots labeled."
          actions={
            onRefresh ? (
              <Button variant="secondary" disabled={refreshing || loading} onClick={onRefresh} className="gap-2">
                <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} aria-hidden />
                {refreshing ? 'Refreshing…' : 'Manual refresh'}
              </Button>
            ) : undefined
          }
          className="dd-enter border-[var(--dd-border)]"
        />
      )}

      <div className="dd-fade-in flex flex-wrap items-center gap-2 text-sm" key={providerStatus}>
        <Badge tone={statusTone === 'success' ? 'success' : 'warning'}>{providerStatus}</Badge>
        {payload?.isStale && <Badge tone="warning">Stale data</Badge>}
        {payload?.staleReason && <span className="text-xs text-slate-500">({payload.staleReason})</span>}
        {payload?.source && (
          <span className="text-slate-600">
            Source: <strong>{payload.source}</strong>
          </span>
        )}
        {payload?.observedAt && (
          <span className="text-slate-600">
            Last observed (IST): <strong>{formatIstDateTime(payload.observedAt)}</strong>
          </span>
        )}
        {payload?.lastSuccessfulUpdate && (
          <span className="text-slate-600">
            Last success: <strong>{formatIstDateTime(payload.lastSuccessfulUpdate)}</strong>
          </span>
        )}
      </div>

      {integration?.message && providerStatus === 'NOT_CONFIGURED' && (
        <Alert tone="warning" title="Provider not configured">
          {integration.message}
        </Alert>
      )}

      {error && (
        <Alert tone="error" title="Could not load quota">
          {error}
        </Alert>
      )}

      {payload?.isStale && d && (
        <Alert tone="warning" title="Stale snapshot">
          Serving cached or interval-throttled data. Manual refresh may be rate-limited by server policy (default 60s).
        </Alert>
      )}

      {loading && !d && <SkeletonGrid />}

      {d && (
        <>
          <Card className="border-[var(--dd-border)] bg-[var(--dd-surface)] p-4 shadow-[var(--dd-shadow-card)]">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--dd-text-muted)]">Official outcome distribution</p>
            <QuotaOutcomeChart success={d.success} pending={d.pending} failed={d.failed} />
          </Card>

          <div
            className={cn(
              'dd-kpi-stagger grid gap-3',
              compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
            )}
          >
            <MetricCard
              title="Available quota"
              icon={Ticket}
              value={d.quotaCount === null || d.quotaCount === undefined ? '—' : d.quotaCount}
              hint="Current inventory — not a booking guarantee"
              tone={
                d.quotaCount === null || d.quotaCount === undefined ? 'warning' : d.quotaCount > 0 ? 'success' : 'warning'
              }
              animateNumeric={typeof d.quotaCount === 'number'}
            />
            <MetricCard
              title="Successful bookings"
              icon={Activity}
              value={d.success === null || d.success === undefined ? '—' : d.success}
              tone="success"
              animateNumeric={typeof d.success === 'number'}
            />
            <MetricCard
              title="Payment pending"
              icon={CircleDollarSign}
              value={d.pending === null || d.pending === undefined ? '—' : d.pending}
              tone="warning"
              animateNumeric={typeof d.pending === 'number'}
            />
            <MetricCard
              title="Failed bookings"
              icon={XCircle}
              value={d.failed === null || d.failed === undefined ? '—' : d.failed}
              hint="Failed attempts — not returned to released inventory"
              tone="danger"
              animateNumeric={typeof d.failed === 'number'}
            />
            <MetricCard
              title="Total released"
              icon={RefreshCw}
              value={displayScalar(d.released)}
              hint="Official released counter — distinct from available quota"
            />
            <MetricCard
              title="Quota release time"
              icon={CalendarClock}
              value={payload.releaseDisplay?.label ?? displayScalar(d.quotaReleaseTime)}
              hint={payload.releaseDisplay?.detail}
            />
            <MetricCard title="Darshan slot time" icon={Clock} value={displayScalar(d.slottime)} />
            <MetricCard title="Donation minimum" icon={Banknote} value={formatInr(d.minAmount)} hint={`Advance min ${formatInr(d.advanceminAmount)}`} />
            <MetricCard
              title="Current-day pilgrim limit"
              icon={Users}
              value={d.maxpersons === null ? '—' : `max ${d.maxpersons}`}
              hint={d.minpersons !== null ? `min ${d.minpersons}` : 'min not reported'}
            />
            <MetricCard
              title="Advance pilgrim limit"
              icon={Users}
              value={d.advancemaxpersons === null ? '—' : `max ${d.advancemaxpersons}`}
              hint={d.advanceminpersons !== null ? `min ${d.advanceminpersons}` : 'min not reported'}
            />
            <MetricCard
              title="Data freshness"
              icon={AlertTriangle}
              value={payload.isStale ? 'Stale' : 'Fresh'}
              hint={`Observed ${formatIstDateTime(payload.observedAt)}`}
              tone={payload.isStale ? 'warning' : 'success'}
            />
            <MetricCard
              title="Provider connection"
              icon={Plug}
              value={providerStatus}
              hint={integration?.mode ? `Mode: ${integration.mode}` : undefined}
              tone={statusTone === 'success' ? 'success' : 'warning'}
            />
          </div>

          {payload.applicableDate && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardHeader>
                <CardTitle className="text-base">Official applicable date</CardTitle>
                <CardDescription>Supplied by upstream with this snapshot — not inferred locally.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm font-medium text-navy">{payload.applicableDate}</CardContent>
            </Card>
          )}
        </>
      )}

      {!loading && !d && !error && (
        <Alert tone="warning" title="No quota data">
          Integration is NOT CONFIGURED or no snapshot yet. Enable approved TTD credentials server-side, or use a dev mock scenario on the
          quota monitor page.
        </Alert>
      )}
    </div>
  );
}