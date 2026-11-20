import { allWorkflowStates, canTransition, deriveBookingOutcome } from '../dist/index.js';

const STATES = allWorkflowStates();

test('all production workflow states are registered', () => {
  expect(STATES).toEqual(
    expect.arrayContaining([
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
    ])
  );
  expect(STATES.length).toBe(14);
});

test('form fill cannot jump to CONFIRMED', () => {
  expect(canTransition({ from: 'FORM_FILLED', to: 'CONFIRMED', hasOfficialEvidence: true }).allowed).toBe(false);
});

test('submit without evidence cannot confirm', () => {
  expect(canTransition({ from: 'SUBMITTED', to: 'CONFIRMED', hasOfficialEvidence: true }).allowed).toBe(false);
});

test('payment pending cannot confirm without confirmation pending path', () => {
  expect(canTransition({ from: 'PAYMENT_PENDING', to: 'CONFIRMED', hasOfficialEvidence: true }).allowed).toBe(false);
});

test('confirmed requires official evidence', () => {
  expect(canTransition({ from: 'CONFIRMATION_PENDING', to: 'CONFIRMED', hasOfficialEvidence: false }).allowed).toBe(
    false
  );
  expect(canTransition({ from: 'CONFIRMATION_PENDING', to: 'CONFIRMED', hasOfficialEvidence: true }).allowed).toBe(true);
});

test('quota rejection preserved — cannot confirm', () => {
  expect(canTransition({ from: 'QUOTA_REJECTED', to: 'CONFIRMED', hasOfficialEvidence: true }).allowed).toBe(false);
});

test('happy path transitions', () => {
  const path = [
    ['PREPARED', 'FORM_READY'],
    ['FORM_READY', 'FORM_FILLED'],
    ['FORM_FILLED', 'REVIEW_REQUIRED'],
    ['REVIEW_REQUIRED', 'SUBMITTED'],
    ['SUBMITTED', 'PAYMENT_PENDING'],
    ['PAYMENT_PENDING', 'CONFIRMATION_PENDING'],
    ['CONFIRMATION_PENDING', 'CONFIRMED'],
  ];
  for (const [from, to] of path) {
    const r = canTransition({
      from,
      to,
      hasOfficialEvidence: to === 'CONFIRMED',
      serverRejected: false,
    });
    expect(r.allowed).toBe(true);
  }
});

test('legacy states normalize for transitions', () => {
  expect(canTransition({ from: 'SUBMISSION_IN_PROGRESS', to: 'QUOTA_REJECTED' }).allowed).toBe(true);
  expect(canTransition({ from: 'USER_REVIEW_REQUIRED', to: 'SUBMITTED' }).allowed).toBe(true);
});

test.each(STATES)('derive outcome for %s', (state) => {
  expect(deriveBookingOutcome(state)).toBeTruthy();
});