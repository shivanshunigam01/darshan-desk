import { canTransition, deriveBookingOutcome, normalizeOutcomeState } from '@darshan-desk/reliability';

const ALL_STATES = [
  'PREPARED',
  'FORM_READY',
  'FORM_FILLED',
  'REVIEW_REQUIRED',
  'SUBMITTED',
  'PAYMENT_PENDING',
  'CONFIRMATION_PENDING',
  'CONFIRMED',
  'QUOTA_REJECTED',
  'RATE_LIMITED',
  'SESSION_EXPIRED',
  'VALIDATION_FAILED',
  'UNKNOWN_OUTCOME',
  'FAILED',
];

test('integration: every workflow state is recognized', () => {
  for (const s of ALL_STATES) {
    expect(normalizeOutcomeState(s)).toBe(s);
    expect(deriveBookingOutcome(s)).toBeTruthy();
  }
});

test('integration: business rules on critical transitions', () => {
  expect(canTransition({ from: 'FORM_FILLED', to: 'CONFIRMED', hasOfficialEvidence: true }).allowed).toBe(false);
  expect(canTransition({ from: 'PAYMENT_PENDING', to: 'CONFIRMED', hasOfficialEvidence: true }).allowed).toBe(false);
  expect(
    canTransition({ from: 'CONFIRMATION_PENDING', to: 'CONFIRMED', hasOfficialEvidence: true }).allowed
  ).toBe(true);
  expect(canTransition({ from: 'QUOTA_REJECTED', to: 'CONFIRMED', hasOfficialEvidence: true }).allowed).toBe(false);
});

test('integration: legacy submission state maps to SUBMITTED graph', () => {
  expect(canTransition({ from: 'SUBMISSION_IN_PROGRESS', to: 'QUOTA_REJECTED' }).allowed).toBe(true);
});