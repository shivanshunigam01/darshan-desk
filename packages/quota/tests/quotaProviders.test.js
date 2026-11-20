import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Ensure dist exists — tests run after build
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
mkdirSync(dist, { recursive: true });

const {
  MockQuotaProvider,
  ManualQuotaProvider,
  ApprovedOfficialQuotaProvider,
  computeDonationEligibility,
  freshnessFromObservedAt,
  parseReleaseTimeOnDate,
} = await import('../dist/index.js');

const ctx = { agencyId: 'a1', operatorId: 'o1' };

describe('MockQuotaProvider', () => {
  const mock = new MockQuotaProvider();

  test('positive quota', async () => {
    const r = await mock.fetchQuota({ ...ctx, mockScenario: 'available' });
    expect(r.success).toBe(true);
    expect(r.summary?.quotaCount).toBeGreaterThan(0);
    expect(r.freshness).toBe('fresh');
  });

  test('zero quota', async () => {
    const r = await mock.fetchQuota({ ...ctx, mockScenario: 'exhausted' });
    expect(r.success).toBe(true);
    expect(r.summary?.quotaCount).toBe(0);
    expect(computeDonationEligibility(r.summary).eligible).toBe(false);
  });

  test('stale response', async () => {
    const now = new Date('2026-11-15T12:00:00.000Z').toISOString();
    const r = await mock.fetchQuota({ ...ctx, mockScenario: 'stale', nowUtc: now });
    expect(r.freshness).toBe('stale');
  });

  test('missing fields', async () => {
    const r = await mock.fetchQuota({ ...ctx, mockScenario: 'missing_fields' });
    expect(r.success).toBe(false);
    expect(r.summary).toBeNull();
    expect(r.errors.length).toBeGreaterThan(0);
  });

  test('invalid release time', async () => {
    const r = await mock.fetchQuota({ ...ctx, mockScenario: 'invalid_release_time' });
    expect(r.success).toBe(false);
    expect(r.errors.some((e) => e.toLowerCase().includes('release'))).toBe(true);
  });

  test('provider error', async () => {
    const r = await mock.fetchQuota({ ...ctx, mockScenario: 'error' });
    expect(r.success).toBe(false);
  });

  test('provider unavailable', async () => {
    const r = await mock.fetchQuota({ ...ctx, mockScenario: 'unavailable' });
    expect(r.errors[0]).toMatch(/unavailable/i);
  });

  test('TTD screenshot bar — zero available quota, high success count', async () => {
    const r = await mock.fetchQuota({ ...ctx, mockScenario: 'ttd_screenshot_bar' });
    expect(r.summary?.quotaCount).toBe(0);
    expect(r.summary?.success).toBe(700);
    expect(r.summary?.quotaReleaseTime).toBe('11:03:00');
  });

  test('different quota policy versions in mock', async () => {
    const v1 = await mock.fetchQuota({ ...ctx, mockScenario: 'available' });
    const v2 = await mock.fetchQuota({ ...ctx, mockScenario: 'policy_v2' });
    expect(v1.meta.policyVersion).toBe('srivani-sample-v1');
    expect(v2.meta.policyVersion).toBe('srivani-policy-v2');
    expect(v2.summary?.minAmount).toBe(12000);
  });
});

describe('ManualQuotaProvider', () => {
  const store = {
    observations: [],
    async getLatestForAgency(agencyId) {
      const list = this.observations.filter((o) => o.agencyId === agencyId);
      return list.sort((a, b) => b.observedAtUtc.localeCompare(a.observedAtUtc))[0] || null;
    },
    async getById(id, agencyId) {
      return this.observations.find((o) => o.id === id && o.agencyId === agencyId) || null;
    },
  };

  const manual = new ManualQuotaProvider(store);

  test('no observation', async () => {
    const r = await manual.fetchQuota(ctx);
    expect(r.success).toBe(false);
  });

  test('policy version preserved', async () => {
    store.observations.push({
      id: 'obs1',
      agencyId: 'a1',
      operatorId: 'o1',
      bookingCategory: 'SRIVANI',
      source: 'operator-visible-website',
      observedAtUtc: new Date().toISOString(),
      policyVersion: 'srivani-policy-v2',
      raw: {
        quotaCount: 5,
        slottime: '04:00 PM',
        minpersons: '1',
        maxpersons: '4',
        advanceminpersons: '1',
        advancemaxpersons: '9',
        noOfladdus: 1,
        minAmount: 12000,
        advanceminAmount: 12000,
        darshanAmount: 0,
        maxAmount: 500000,
        advancemaxAmount: 500000,
        success: 1,
        pending: 0,
        failed: 0,
        released: 1,
        quotaReleaseTime: '11:03:00',
      },
    });
    const r = await manual.fetchQuota(ctx);
    expect(r.meta.policyVersion).toBe('srivani-policy-v2');
    expect(r.meta.provider).toBe('manual');
  });
});

describe('ApprovedOfficialQuotaProvider', () => {
  test('disabled by default', async () => {
    const p = new ApprovedOfficialQuotaProvider();
    const r = await p.fetchQuota(ctx);
    expect(r.success).toBe(false);
    expect(r.errors[0]).toMatch(/disabled/i);
  });
});

describe('time helpers', () => {
  test('parse release time', () => {
    const ref = new Date('2026-11-15T06:30:00.000Z');
    expect(parseReleaseTimeOnDate('11:03:00', ref).valid).toBe(true);
    expect(parseReleaseTimeOnDate('99:99:99', ref).valid).toBe(false);
  });

  test('freshness', () => {
    const now = new Date('2026-11-15T12:00:00.000Z');
    expect(freshnessFromObservedAt('2026-11-15T11:59:00.000Z', now)).toBe('fresh');
    expect(freshnessFromObservedAt('2026-11-15T11:50:00.000Z', now)).toBe('stale');
  });
});