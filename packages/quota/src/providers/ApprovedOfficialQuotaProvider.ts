import type { QuotaDataProvider, QuotaFetchContext, QuotaFetchResult } from '../types.js';

/**
 * Placeholder for a future TTD integration approved in writing.
 * Disabled by default — does not call undocumented endpoints or replay cookies.
 */
export class ApprovedOfficialQuotaProvider implements QuotaDataProvider {
  readonly kind = 'approved_official' as const;
  readonly label = 'Approved official integration (disabled)';

  private enabled: boolean;
  private readonly maxRequestsPerMinute = 2;

  constructor(options?: { enabled?: boolean }) {
    this.enabled = Boolean(options?.enabled);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async fetchQuota(_context: QuotaFetchContext): Promise<QuotaFetchResult> {
    const now = new Date().toISOString();
    if (!this.enabled) {
      return {
        success: false,
        summary: null,
        meta: {
          provider: 'approved_official',
          sourceLabel: 'not-configured',
          observedAtUtc: now,
        },
        freshness: 'unknown',
        errors: [
          'Approved official provider is disabled. Enable only after written TTD permission and documented integration requirements.',
        ],
        diagnostics: [
          'No polling of protected endpoints.',
          'No session cookie replay.',
          `When enabled, respect rate limit cap of ${this.maxRequestsPerMinute} requests/minute (sequential only).`,
        ],
        timeline: [
          {
            id: 'official-disabled',
            atUtc: now,
            level: 'warn',
            message: 'Official provider not enabled',
          },
        ],
      };
    }

    return {
      success: false,
      summary: null,
      meta: {
        provider: 'approved_official',
        sourceLabel: 'pending-implementation',
        observedAtUtc: now,
      },
      freshness: 'unknown',
      errors: ['Official adapter not implemented — awaiting integration specification'],
      diagnostics: ['Implement connector per approved TTD documentation only.'],
      timeline: [
        {
          id: 'official-stub',
          atUtc: now,
          level: 'info',
          message: 'Enabled flag set but connector stub only',
        },
      ],
    };
  }
}