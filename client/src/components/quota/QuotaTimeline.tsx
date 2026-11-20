import type { QuotaDashboardResponse } from '../../types/quota';

type Props = { events: QuotaDashboardResponse['timeline'] };

function formatIst(utc: string) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(utc));
}

export default function QuotaTimeline({ events }: Props) {
  return (
    <section className="card">
      <h2>Event timeline</h2>
      <ul className="checklist quota-timeline">
        {events.map((e) => (
          <li key={e.id}>
            <span className={`tl-level tl-${e.level}`}>{e.level}</span>
            <span>
              <strong>{formatIst(e.atUtc)} IST</strong>
              <br />
              {e.message}
              <br />
              <span className="muted">UTC {e.atUtc}</span>
            </span>
          </li>
        ))}
        {events.length === 0 && <li className="muted">No events yet.</li>}
      </ul>
    </section>
  );
}