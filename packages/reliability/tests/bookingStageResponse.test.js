import {
  SRIVANI_CURRENT_DAY_BOOKING_PATH,
  classifyBookingStageHttpResponse,
  classifyRecordedQuotaExceededResponse,
  isBookingConfirmedAllowed,
  isPaymentReadyAllowed,
} from '../dist/bookingStageResponse.js';

describe('bookingStageResponse', () => {
  test('HTTP 200 + error JSON => QUOTA_REJECTED (regression recording)', () => {
    const c = classifyBookingStageHttpResponse({
      endpoint: SRIVANI_CURRENT_DAY_BOOKING_PATH,
      httpStatus: 200,
      body: { error: 'Cannot book as quota exceeded' },
      displayedAvailableQuota: 183,
    });
    expect(c.httpOkButRejected).toBe(true);
    expect(c.bookingAccepted).toBe(false);
    expect(c.workflowStatus).toBe('QUOTA_REJECTED');
    expect(c.outcome.code).toBe('QUOTA_REJECTED');
    expect(c.officialError).toBe('Cannot book as quota exceeded');
    expect(c.blockAutoResubmit).toBe(true);
    expect(c.blockPaymentReady).toBe(true);
    expect(c.blockBookingConfirmed).toBe(true);
    expect(isPaymentReadyAllowed(c)).toBe(false);
    expect(isBookingConfirmedAllowed(c)).toBe(false);
  });

  test('recorded fixture helper', () => {
    const c = classifyRecordedQuotaExceededResponse();
    expect(c.outcome.code).toBe('QUOTA_REJECTED');
  });

  test('HTTP 200 without error is not CONFIRMED', () => {
    const c = classifyBookingStageHttpResponse({
      endpoint: SRIVANI_CURRENT_DAY_BOOKING_PATH,
      httpStatus: 200,
      body: { status: 'ok' },
    });
    expect(c.bookingAccepted).toBe(false);
    expect(c.workflowStatus).not.toBe('CONFIRMED');
    expect(isBookingConfirmedAllowed(c)).toBe(false);
  });

  test('HTTP 500 => unknown / network class', () => {
    const c = classifyBookingStageHttpResponse({
      endpoint: SRIVANI_CURRENT_DAY_BOOKING_PATH,
      httpStatus: 503,
      body: { error: 'Service unavailable' },
    });
    expect(c.bookingAccepted).toBe(false);
    expect(c.blockAutoResubmit).toBe(true);
  });
});