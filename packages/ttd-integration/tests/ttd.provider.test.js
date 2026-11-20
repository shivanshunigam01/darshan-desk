import {
  MockProvider,
  QuotaService,
  loadPolicyFromEnv,
  TtdProviderError,
  parseQuotaSummary,
} from '../dist/index.js';

const policy = loadPolicyFromEnv({
  TTD_API_BASE_URL: 'https://tirupatibalaji.ap.gov.in',
  TTD_INTEGRATION_MODE: 'mock',
});

describe('quota schema', () => {
  test('valid quota response', () => {
    const raw = {
      quotaCount: 10,
      slottime: '04:00 PM',
      minpersons: '4',
      maxpersons: '9',
      advanceminpersons: '4',
      advancemaxpersons: '9',
      noOfladdus: 0,
      minAmount: 10000,
      advanceminAmount: 10000,
      darshanAmount: 200,
      maxAmount: 500000,
      advancemaxAmount: 500000,
      success: 1,
      pending: 0,
      failed: 0,
      released: 2,
      quotaReleaseTime: '11:03:00',
    };
    const r = parseQuotaSummary(raw);
    expect(r.ok).toBe(true);
    expect(r.data.quotaCount).toBe(10);
    expect(r.data.failed).not.toBe(r.data.released);
  });

  test('missing fields', () => {
    const r = parseQuotaSummary({ quotaCount: 1 });
    expect(r.ok).toBe(false);
  });

  test('invalid JSON path surfaces validation', async () => {
    const p = new MockProvider(policy, 'missing_fields');
    await expect(p.getQuotaSummary()).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('MockProvider scenarios', () => {
  test('positive availability', async () => {
    const p = new MockProvider(policy, 'default');
    const q = await p.getQuotaSummary();
    expect(q.quotaCount).toBeGreaterThan(0);
    expect(q.meta.source).toBe('mock');
  });

  test('zero availability', async () => {
    const p = new MockProvider(policy, 'zero_quota');
    const q = await p.getQuotaSummary();
    expect(q.quotaCount).toBe(0);
  });

  test('timeout', async () => {
    const p = new MockProvider(policy, 'timeout');
    await expect(p.getQuotaSummary()).rejects.toBeInstanceOf(TtdProviderError);
  });

  test('unauthorized', async () => {
    const p = new MockProvider(policy, 'unauthorized');
    await expect(p.getQuotaSummary()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  test('rate limited', async () => {
    const p = new MockProvider(policy, 'rate_limited');
    await expect(p.getQuotaSummary()).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  test('stale cache scenario', async () => {
    const p = new MockProvider(policy, 'stale_cache');
    const q = await p.getQuotaSummary();
    expect(q.meta.stale).toBe(true);
  });

  test('provider not configured scenario', async () => {
    const p = new MockProvider(policy, 'not_configured');
    await expect(p.getQuotaSummary()).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });

  test('nullable_fields preserves nulls', async () => {
    const p = new MockProvider(policy, 'nullable_fields');
    const q = await p.getQuotaSummary();
    expect(q.quotaCount).toBe(0);
    expect(q.slottime).toBeNull();
    expect(q.maxpersons).toBeNull();
    expect(q.released).toBe(0);
    expect(q.quotaReleaseTime).toBe('09:03:00');
  });

  test('release_time_change', async () => {
    const p = new MockProvider(policy, 'release_time_change');
    const q = await p.getQuotaSummary();
    expect(q.quotaReleaseTime).toBe('10:15:00');
  });
});

describe('QuotaService cache & tenant isolation', () => {
  test('stale cache when refresh too soon', async () => {
    const svc = new QuotaService({ ...policy, minRefreshMs: 60_000, cacheTtlMs: 120_000 });
    const a = await svc.getQuotaSummary('tenant-a', true);
    expect(a.quotaCount).toBeDefined();
    const b = await svc.getQuotaSummary('tenant-b', true);
    expect(b.quotaCount).toBeDefined();
    const stale = await svc.getQuotaSummary('tenant-a', false);
    expect(stale.meta.stale).toBe(true);
  });

  test('approved provider not configured', async () => {
    const { ApprovedProvider } = await import('../dist/approved.provider.js');
    const approvedPolicy = loadPolicyFromEnv({
      TTD_INTEGRATION_MODE: 'approved',
      TTD_INTEGRATION_ENABLED: 'false',
      TTD_API_BASE_URL: 'https://tirupatibalaji.ap.gov.in',
    });
    const p = new ApprovedProvider(approvedPolicy);
    expect(p.getIntegrationStatus().providerReady).toBe(false);
    await expect(p.getQuotaSummary()).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });
});