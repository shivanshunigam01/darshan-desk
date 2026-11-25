import { assessOfficialOutcomeFromSignals, extractOfficialErrorLine } from '../dist/officialOutcome.js';
import { classifyQuotaDisplayMismatch } from '../dist/classify.js';

describe('officialOutcome', () => {
  test('classifies quota rejected without rewriting message', () => {
    const msg = 'Cannot book as quota exceeded';
    const a = assessOfficialOutcomeFromSignals({
      visibleText: msg,
      displayedAvailableQuota: 183,
      paymentPendingCount: 317,
    });
    expect(a.code).toBe('QUOTA_REJECTED');
    expect(a.officialMessage).toBe(msg);
    expect(a.quotaDisplayMismatch).toBe(true);
    expect(a.blockAutoResubmit).toBe(true);
    expect(a.blockSuccessPromotion).toBe(true);
  });

  test('does not mark confirmed on Success counter alone', () => {
    const a = assessOfficialOutcomeFromSignals({
      visibleText: 'Available Quota: 183\nPayment Pending: 317\nSuccess: 0',
      displayedAvailableQuota: 183,
    });
    expect(a.code).not.toBe('CONFIRMED');
    expect(a.confirmationStatus).not.toBe('confirmed');
  });

  test('classifyQuotaDisplayMismatch reference scenario', () => {
    const r = classifyQuotaDisplayMismatch({
      displayedQuotaCount: 183,
      quotaFreshness: 'stale',
      officialMessage: 'Cannot book as quota exceeded',
    });
    expect(r.suggestedState).toBe('QUOTA_REJECTED');
    expect(r.blockSuccessPromotion).toBe(true);
  });

  test('extractOfficialErrorLine preserves wording', () => {
    expect(extractOfficialErrorLine('Foo\nCannot book as quota exceeded\nBar')).toBe(
      'Cannot book as quota exceeded'
    );
  });

  test('session expiry', () => {
    const a = assessOfficialOutcomeFromSignals({ visibleText: 'Session expired — please login again' });
    expect(a.code).toBe('SESSION_EXPIRED');
  });

  test('payment pending is not confirmation', () => {
    const a = assessOfficialOutcomeFromSignals({
      visibleText: 'Payment pending for pilgrim booking',
      paymentPendingCount: 2,
    });
    expect(a.code).toBe('PAYMENT_PENDING');
    expect(a.confirmationStatus).toBe('pending');
    expect(a.blockSuccessPromotion).toBe(true);
  });

  test('confirmed requires explicit confirmation copy', () => {
    const a = assessOfficialOutcomeFromSignals({
      visibleText: 'Booking confirmed. Reference number TTD12345',
    });
    expect(a.code).toBe('CONFIRMED');
    expect(a.confirmationStatus).toBe('confirmed');
  });
});