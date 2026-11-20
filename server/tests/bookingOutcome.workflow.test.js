import { canTransition, deriveBookingOutcome } from '@darshan-desk/reliability';

const FULL_PATH = [
  'PREPARED',
  'FORM_READY',
  'FORM_FILLED',
  'REVIEW_REQUIRED',
  'SUBMITTED',
  'PAYMENT_PENDING',
  'CONFIRMATION_PENDING',
];

test('integration: linear workflow until confirmation pending', () => {
  const uncertainWhileWaiting = new Set(['PAYMENT_PENDING', 'CONFIRMATION_PENDING']);
  for (let i = 0; i < FULL_PATH.length - 1; i++) {
    const from = FULL_PATH[i];
    const to = FULL_PATH[i + 1];
    expect(canTransition({ from, to }).allowed).toBe(true);
  }
  expect(deriveBookingOutcome('CONFIRMATION_PENDING')).toBe('uncertain');
  for (const state of FULL_PATH.filter((s) => !uncertainWhileWaiting.has(s) && s !== 'CONFIRMATION_PENDING')) {
    expect(deriveBookingOutcome(state)).toBe('in_progress');
  }
});

test('integration: only CONFIRMATION_PENDING may reach CONFIRMED with evidence', () => {
  expect(
    canTransition({ from: 'CONFIRMATION_PENDING', to: 'CONFIRMED', hasOfficialEvidence: true }).allowed
  ).toBe(true);
  expect(
    canTransition({ from: 'CONFIRMATION_PENDING', to: 'CONFIRMED', hasOfficialEvidence: false }).allowed
  ).toBe(false);
  for (const state of FULL_PATH.filter((s) => s !== 'CONFIRMATION_PENDING')) {
    expect(canTransition({ from: state, to: 'CONFIRMED', hasOfficialEvidence: true }).allowed).toBe(false);
  }
});