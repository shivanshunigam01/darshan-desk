import { Badge } from './ui/badge.jsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.jsx';
import { DraftAutosaveStatus } from './wizard/DraftAutosaveStatus.jsx';

export default function WizardContextPanel({
  stepIndex,
  stepLabel,
  account,
  bookingCategory,
  donationAmount,
  pilgrims,
  preparation,
  draftState,
}) {
  return (
    <Card className="sticky top-24 border-[var(--dd-border)] bg-[var(--dd-surface)] shadow-[var(--dd-shadow-card)]">
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-semibold text-[var(--dd-text)]">Live context</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-[var(--dd-text)]">
        <DraftAutosaveStatus
          state={draftState || (preparation ? 'saved' : 'idle')}
          revision={preparation?.contentRevision}
          updatedAt={preparation?.updatedAt}
        />
        <p>
          <span className="text-[var(--dd-text-muted)]">Step:</span> {stepLabel || stepIndex + 1}
        </p>
        <p>
          <span className="text-[var(--dd-text-muted)]">TTD account:</span> {account?.label || '—'}
        </p>
        <p>
          <span className="text-[var(--dd-text-muted)]">Booking:</span> {bookingCategory || '—'}
        </p>
        <p>
          <span className="text-[var(--dd-text-muted)]">Donation:</span>{' '}
          {donationAmount ? `₹${Number(donationAmount).toLocaleString('en-IN')}` : '—'}
        </p>
        <p>
          <span className="text-[var(--dd-text-muted)]">Guests:</span>{' '}
          {pilgrims?.length ? pilgrims.map((p) => p.fullName).join(', ') : '—'}
        </p>
        {preparation && (
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-[var(--dd-text-muted)]">Validation:</span>
            <Badge
              tone={
                preparation.validationStatus === 'passed'
                  ? 'success'
                  : preparation.validationStatus === 'failed'
                    ? 'danger'
                    : 'warning'
              }
            >
              {preparation.validationStatus}
            </Badge>
          </p>
        )}
      </CardContent>
    </Card>
  );
}