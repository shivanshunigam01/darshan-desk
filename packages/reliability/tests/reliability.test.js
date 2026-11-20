import {
  canTransition,
  classifyBookingError,
  classifyQuotaDisplayMismatch,
  buildSanitizedExport,
} from '../dist/index.js';

test('quota exceeded after positive display is not success', () => {
  const r = classifyQuotaDisplayMismatch({
    displayedQuotaCount: 42,
    quotaFreshness: 'stale',
    officialMessage: 'Cannot book as quota exceeded',
  });
  expect(r.suggestedState).toBe('QUOTA_REJECTED');
  expect(r.errorClass).toBe('quota_exhausted');
  expect(r.blockSuccessPromotion).toBe(true);
  expect(r.blockAutoResubmit).toBe(true);
  expect(r.reasons.some((x) => x.includes('stale'))).toBe(true);
});

test('CONFIRMED requires evidence', () => {
  const t = canTransition({
    from: 'CONFIRMATION_PENDING',
    to: 'CONFIRMED',
    hasOfficialEvidence: false,
  });
  expect(t.allowed).toBe(false);
});

test('server rejection cannot become CONFIRMED', () => {
  const t = canTransition({
    from: 'SUBMITTED',
    to: 'CONFIRMED',
    serverRejected: true,
    hasOfficialEvidence: true,
  });
  expect(t.allowed).toBe(false);
});

test('QUOTA_REJECTED to CONFIRMED blocked', () => {
  const t = canTransition({
    from: 'QUOTA_REJECTED',
    to: 'CONFIRMED',
    hasOfficialEvidence: true,
  });
  expect(t.allowed).toBe(false);
});

test('rate limit classification', () => {
  const r = classifyBookingError({ httpStatus: 429, reliabilityState: 'SUBMITTED' });
  expect(r.errorClass).toBe('rate_limit');
  expect(r.suggestedState).toBe('RATE_LIMITED');
});

test('sanitized export redacts mobile', () => {
  const doc = buildSanitizedExport({
    attemptId: 'a1',
    preparationId: 'p1',
    reliabilityState: 'QUOTA_REJECTED',
    errorClass: 'quota_exhausted',
    events: [{ atUtc: new Date().toISOString(), type: 'official', message: 'User mobile 9876543210 failed' }],
  });
  expect(doc.timelineSummary[0].summary).toContain('[MOBILE_REDACTED]');
  expect(doc.timelineSummary[0].summary).not.toContain('9876543210');
});