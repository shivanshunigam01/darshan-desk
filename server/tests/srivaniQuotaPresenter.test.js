import { formatReportedReleaseTime, buildSrivaniQuotaPayload } from '../src/services/srivaniQuotaPresenter.js';

test('release time without date is not labeled as future session', () => {
  const r = formatReportedReleaseTime('09:03:00', null);
  expect(r.label).toBe('Reported release time: 9:03 AM');
  expect(r.detail).toMatch(/Time-only/);
});

test('release time with official applicable date shows both', () => {
  const r = formatReportedReleaseTime('09:03:00', '2026-11-16');
  expect(r.label).toContain('2026-11-16');
  expect(r.label).toContain('9:03 AM');
});

test('buildSrivaniQuotaPayload exposes contract fields', () => {
  const envelope = {
    quotaCount: 0,
    slottime: null,
    minpersons: '4',
    maxpersons: null,
    advanceminpersons: '4',
    advancemaxpersons: null,
    noOfladdus: 0,
    minAmount: 10000,
    advanceminAmount: 10000,
    darshanAmount: 200,
    maxAmount: 500000,
    advancemaxAmount: 500000,
    success: 0,
    pending: 0,
    failed: 0,
    released: 0,
    quotaReleaseTime: '09:03:00',
    meta: { source: 'mock', observedAt: '2026-11-16T04:30:00.000Z', stale: false, applicableDate: null },
  };
  const status = {
    mode: 'mock',
    enabled: true,
    providerReady: true,
    providerStatus: 'MOCK_DEV',
    baseUrl: 'https://tirupatibalaji.ap.gov.in',
    message: 'mock',
  };
  const payload = buildSrivaniQuotaPayload(envelope, status);
  expect(payload.data.maxpersons).toBeNull();
  expect(payload.data.released).toBe(0);
  expect(payload.isStale).toBe(false);
  expect(payload.providerStatus).toBe('MOCK_DEV');
  expect(payload.dashboard.cards.availableQuota).toBe(0);
});