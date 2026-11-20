export default function TtdOfficialReference({ reference, policy }) {
  if (!reference) return null;

  const sample = reference.quotaStatusBar?.sampleFixtureMapping;

  return (
    <section className="card ttd-ref">
      <h2>Official TTD UI reference</h2>
      <p className="muted">
        {reference.trustDonation?.trustName}. Values below are from configurable policy{' '}
        <strong>{policy?.policyVersion || sample?.policyVersion || '—'}</strong> — verify live rules before booking.
      </p>

      <div className="ttd-quota-bar" role="presentation">
        <div>
          <span className="muted">Quota release</span>
          <strong>{policy?.releaseTime || sample?.quotaReleaseTime}</strong>
        </div>
        <div>
          <span className="muted">Reporting</span>
          <strong>{policy?.reportingTime || sample?.reportingTime}</strong>
        </div>
        <div>
          <span className="muted">Min donation (₹)</span>
          <strong>{(policy?.minimumDonation ?? sample?.minimumDonation)?.toLocaleString?.('en-IN') ?? sample?.minimumDonation}</strong>
        </div>
        <div>
          <span className="muted">Current max pilgrims</span>
          <strong>{policy?.maximumCurrentPilgrims ?? sample?.maximumCurrentPilgrims}</strong>
        </div>
      </div>

      <ul className="muted" style={{ marginTop: '0.75rem' }}>
        {reference.quotaStatusBar?.operatorNotes?.map((n) => (
          <li key={n}>{n}</li>
        ))}
        {reference.trustDonation?.automationExclusions?.map((x) => (
          <li key={x}>
            DarshanDesk does <strong>not</strong> automate: {x}
          </li>
        ))}
      </ul>
    </section>
  );
}