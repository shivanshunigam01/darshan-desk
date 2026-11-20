import type { QuotaDashboardResponse } from '../../types/quota';

type Props = { data: QuotaDashboardResponse['cards'] };

function StatCard({ title, value, hint }: { title: string; value: string | number; hint?: string }) {
  return (
    <article className="card quota-card">
      <h3>{title}</h3>
      <p className="quota-stat">{value}</p>
      {hint && <p className="muted">{hint}</p>}
    </article>
  );
}

export default function QuotaSummaryCards({ data }: Props) {
  const elig = data.donationEligibility;
  return (
    <div className="quota-grid">
      <StatCard title="Booking category" value={data.bookingCategory} />
      <StatCard title="Quota release time (IST context)" value={data.quotaReleaseTime} />
      <StatCard title="Remaining time" value={data.remainingTimeLabel} hint="Computed from release time vs now (IST)" />
      <StatCard title="Available quota" value={data.availableQuota ?? '—'} />
      <StatCard title="Successful bookings" value={data.successfulBookings ?? '—'} />
      <StatCard title="Pending payments" value={data.pendingPayments ?? '—'} />
      <StatCard title="Failed bookings" value={data.failedBookings ?? '—'} hint="Failed attempts — not released inventory" />
      {data.totalReleasedQuota != null && (
        <StatCard title="Total released quota" value={data.totalReleasedQuota} />
      )}
      <StatCard title="Reporting time" value={data.reportingTime} />
      {data.pilgrimLimits && (
        <StatCard
          title="Pilgrim limits (current)"
          value={`${data.pilgrimLimits.min}–${data.pilgrimLimits.max}`}
          hint={`Advance ${data.pilgrimLimits.advanceMin}–${data.pilgrimLimits.advanceMax}`}
        />
      )}
      {data.integration && (
        <StatCard
          title="TTD API provider"
          value={data.integration.providerReady ? `${data.integration.mode} · ready` : `${data.integration.mode} · not ready`}
          hint={
            data.integration.lastSuccessfulUpdate
              ? `Last success ${new Date(data.integration.lastSuccessfulUpdate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`
              : 'No successful update yet'
          }
        />
      )}
      <article className="card quota-card">
        <h3>Donation eligibility</h3>
        <p className={`quota-stat ${elig.eligible ? 'ok-text' : 'err-text'}`}>
          {elig.eligible ? 'Eligible (observed rules)' : 'Not eligible'}
        </p>
        <p className="muted">
          Current min ₹{elig.minDonationCurrent.toLocaleString('en-IN')} · Advance min ₹
          {elig.minDonationAdvance.toLocaleString('en-IN')}
        </p>
        {!elig.eligible && (
          <ul className="muted">
            {elig.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </article>
    </div>
  );
}