import { classifyBookingError } from '../dist/index.js';

const cases = [
  {
    name: 'quota exhausted',
    input: { officialMessage: 'Cannot book as quota exceeded', serverRejectedBooking: true },
    errorClass: 'quota_exhausted',
    state: 'QUOTA_REJECTED',
  },
  {
    name: 'stale quota observation',
    input: { quotaCountAtObservation: 10, quotaFreshness: 'stale' },
    errorClass: 'stale_quota_observation',
    state: 'VALIDATION_FAILED',
  },
  {
    name: 'session expired',
    input: { officialMessage: 'Session expired — login again' },
    errorClass: 'session_expired',
    state: 'SESSION_EXPIRED',
  },
  {
    name: 'booking category mismatch',
    input: { preparationBookingCategory: 'CURRENT', observedBookingCategory: 'ADVANCE' },
    errorClass: 'booking_category_mismatch',
    state: 'VALIDATION_FAILED',
  },
  {
    name: 'invalid pilgrim data',
    input: { pilgrimValidationErrors: ['Profile incomplete'] },
    errorClass: 'invalid_pilgrim_data',
    state: 'VALIDATION_FAILED',
  },
  {
    name: 'ineligible booking request',
    input: { preparationValidationFailed: true },
    errorClass: 'ineligible_booking_request',
    state: 'VALIDATION_FAILED',
  },
  {
    name: 'network timeout',
    input: { networkTimedOut: true },
    errorClass: 'network_timeout',
    state: 'UNKNOWN_OUTCOME',
  },
  {
    name: 'rate limit',
    input: { httpStatus: 429 },
    errorClass: 'rate_limit',
    state: 'RATE_LIMITED',
  },
  {
    name: 'unconfirmed transaction',
    input: { paymentPending: true, hasOfficialConfirmationEvidence: false },
    errorClass: 'unconfirmed_transaction',
    state: 'CONFIRMATION_PENDING',
  },
  {
    name: 'payment failure',
    input: { paymentFailed: true },
    errorClass: 'payment_failure',
    state: 'PAYMENT_PENDING',
  },
];

test.each(cases)('classifies $name', ({ input, errorClass, state }) => {
  const r = classifyBookingError(input);
  expect(r.errorClass).toBe(errorClass);
  expect(r.suggestedState).toBe(state);
  expect(r.blockAutoResubmit).toBe(true);
});

test('server rejection never implies success promotion', () => {
  const r = classifyBookingError({
    officialMessage: 'Cannot book as quota exceeded',
    serverRejectedBooking: true,
  });
  expect(r.blockSuccessPromotion).toBe(true);
});