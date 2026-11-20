import sampleFixture from '../fixtures/srivaniQuotaSample.json' with { type: 'json' };
import { normalizeQuotaSummary } from '../normalize.js';
import { freshnessFromObservedAt, parseReleaseTimeOnDate } from '../time.js';
import type {
  QuotaDataProvider,
  QuotaFetchContext,
  QuotaFetchResult,
  QuotaScenario,
  QuotaSummary,
  QuotaTimelineEvent,
} from '../types.js';

export class MockQuotaProvider implements QuotaDataProvider {
  readonly kind = 'mock' as const;
  readonly label = 'Mock fixture provider';

  async fetchQuota(context: QuotaFetchContext): Promise<QuotaFetchResult> {
    const scenario = context.mockScenario ?? 'available';
    const now = context.nowUtc ? new Date(context.nowUtc) : new Date();
    const timeline: QuotaTimelineEvent[] = [
      {
        id: 'mock-start',
        atUtc: now.toISOString(),
        level: 'info',
        message: `Mock provider scenario: ${scenario}`,
      },
    ];
    const diagnostics = ['Mock data — not live TTD quota.'];

    if (scenario === 'delayed') {
      await sleep(1500);
      timeline.push({
        id: 'mock-delay',
        atUtc: new Date().toISOString(),
        level: 'warn',
        message: 'Simulated delayed response (>1s)',
      });
    }

    if (scenario === 'error' || scenario === 'unavailable') {
      timeline.push({
        id: 'mock-err',
        atUtc: new Date().toISOString(),
        level: 'error',
        message: 'Simulated provider failure',
      });
      return {
        success: false,
        summary: null,
        meta: {
          provider: 'mock',
          sourceLabel: 'fixture-json',
          observedAtUtc: now.toISOString(),
          bookingCategory: 'SRIVANI',
        },
        freshness: 'unknown',
        errors: [scenario === 'unavailable' ? 'Quota provider unavailable' : 'Mock provider error'],
        diagnostics,
        timeline,
      };
    }

    let raw: Partial<QuotaSummary> & Record<string, unknown> = { ...sampleFixture };

    if (scenario === 'exhausted') {
      raw = { ...raw, quotaCount: 0 };
    } else if (scenario === 'stale') {
      /* observedAt set below to 10 min ago */
    } else if (scenario === 'missing_fields') {
      delete (raw as Record<string, unknown>).quotaCount;
      delete (raw as Record<string, unknown>).quotaReleaseTime;
    } else if (scenario === 'invalid_release_time') {
      raw = { ...raw, quotaReleaseTime: '99:99:99' };
    } else if (scenario === 'ttd_screenshot_bar') {
      raw = {
        ...raw,
        quotaCount: 0,
        success: 700,
        pending: 0,
        failed: 0,
        quotaReleaseTime: '11:03:00',
        slottime: '04:00 PM',
      };
    } else if (scenario === 'policy_v2') {
      raw = { ...raw, minAmount: 12000, advanceminAmount: 12000, quotaCount: 15 };
    }

    const policyVersion =
      scenario === 'policy_v2' ? 'srivani-policy-v2' : scenario === 'ttd_screenshot_bar' ? 'srivani-sample-v1' : 'srivani-sample-v1';

    const observedAt =
      scenario === 'stale'
        ? new Date(now.getTime() - 10 * 60 * 1000).toISOString()
        : now.toISOString();

    const normalized = normalizeQuotaSummary(raw);
    let releaseOk = true;
    if (normalized.summary) {
      const parsed = parseReleaseTimeOnDate(normalized.summary.quotaReleaseTime, now);
      releaseOk = parsed.valid;
      if (!parsed.valid && parsed.error) normalized.errors.push(parsed.error);
    }

    timeline.push({
      id: 'mock-normalize',
      atUtc: new Date().toISOString(),
      level: normalized.errors.length ? 'warn' : 'info',
      message: normalized.errors.length
        ? `Normalization issues: ${normalized.errors.join('; ')}`
        : 'Fixture normalized successfully',
    });

    return {
      success: normalized.summary !== null && releaseOk && normalized.errors.length === 0,
      summary: normalized.summary,
      meta: {
        provider: 'mock',
        sourceLabel: 'fixture-json',
        observedAtUtc: observedAt,
        bookingCategory: 'SRIVANI',
        policyVersion,
        reportingTime: normalized.summary?.slottime || String(sampleFixture.slottime),
      },
      freshness: freshnessFromObservedAt(observedAt, now),
      errors: normalized.errors,
      diagnostics: [
        ...diagnostics,
        'No polling, cookies, or undocumented endpoints are used.',
        `Policy version hint: ${policyVersion}`,
      ],
      timeline,
    };
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const MOCK_SCENARIOS: QuotaScenario[] = [
  'available',
  'exhausted',
  'delayed',
  'error',
  'stale',
  'missing_fields',
  'invalid_release_time',
  'unavailable',
  'ttd_screenshot_bar',
  'policy_v2',
];