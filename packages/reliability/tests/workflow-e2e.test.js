import { canTransition, deriveBookingOutcome, normalizeOutcomeState } from '../dist/index.js';

const FULL_PATH = [
  'PREPARED',
  'FORM_READY',
  'FORM_FILLED',
  'REVIEW_REQUIRED',
  'SUBMITTED',
  'PAYMENT_PENDING',
  'CONFIRMATION_PENDING',
  'CONFIRMED',
];

test('end-to-end happy path with evidence on confirm only', () => {
  for (let i = 0; i < FULL_PATH.length - 1; i++) {
    const from = FULL_PATH[i];
    const to = FULL_PATH[i + 1];
    const r = canTransition({
      from,
      to,
      hasOfficialEvidence: to === 'CONFIRMED',
      serverRejected: false,
    });
    expect(r.allowed).toBe(true);
  }
  expect(deriveBookingOutcome('CONFIRMED')).toBe('confirmed');
});

test('all workflow states normalize and derive outcome', () => {
  const states = [
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
  for (const s of states) {
    expect(normalizeOutcomeState(s)).toBe(s);
    expect(deriveBookingOutcome(s)).toBeTruthy();
  }
});

test('failure branches do not confirm', () => {
  for (const from of ['QUOTA_REJECTED', 'UNKNOWN_OUTCOME', 'FAILED', 'VALIDATION_FAILED']) {
    expect(canTransition({ from, to: 'CONFIRMED', hasOfficialEvidence: true }).allowed).toBe(false);
  }
});