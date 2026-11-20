import { normalizeQuotaSummary } from '../normalize.js';
import { freshnessFromObservedAt } from '../time.js';
import type {
  ManualQuotaObservationInput,
  QuotaDataProvider,
  QuotaFetchContext,
  QuotaFetchResult,
  QuotaSummary,
  QuotaTimelineEvent,
} from '../types.js';

export type StoredManualObservation = ManualQuotaObservationInput & {
  id: string;
  agencyId: string;
  operatorId: string;
  observedAtUtc: string;
};

export interface ManualObservationStore {
  getLatestForAgency(agencyId: string): Promise<StoredManualObservation | null>;
  getById(id: string, agencyId: string): Promise<StoredManualObservation | null>;
}

export class ManualQuotaProvider implements QuotaDataProvider {
  readonly kind = 'manual' as const;
  readonly label = 'Operator manual observation';

  constructor(private readonly store: ManualObservationStore) {}

  async fetchQuota(context: QuotaFetchContext): Promise<QuotaFetchResult> {
    const now = context.nowUtc ? new Date(context.nowUtc) : new Date();
    const timeline: QuotaTimelineEvent[] = [];
    const diagnostics = [
      'Data recorded by operator from visible official website information.',
      'Availability is not guaranteed.',
    ];

    const obs = context.manualObservationId
      ? await this.store.getById(context.manualObservationId, context.agencyId)
      : await this.store.getLatestForAgency(context.agencyId);

    if (!obs) {
      timeline.push({
        id: 'manual-none',
        atUtc: now.toISOString(),
        level: 'warn',
        message: 'No manual observation on file for this agency',
      });
      return {
        success: false,
        summary: null,
        meta: {
          provider: 'manual',
          sourceLabel: 'operator-entry',
          observedAtUtc: now.toISOString(),
        },
        freshness: 'unknown',
        errors: ['No manual quota observation recorded yet'],
        diagnostics,
        timeline,
      };
    }

    timeline.push({
      id: 'manual-loaded',
      atUtc: now.toISOString(),
      level: 'info',
      message: `Loaded observation ${obs.id} from source: ${obs.source}`,
    });

    const normalized = normalizeQuotaSummary(obs.raw as Partial<QuotaSummary> & Record<string, unknown>);

    return {
      success: normalized.summary !== null,
      summary: normalized.summary,
      meta: {
        provider: 'manual',
        sourceLabel: obs.source,
        observedAtUtc: obs.observedAtUtc,
        policyVersion: obs.policyVersion,
        bookingCategory: obs.bookingCategory,
        reportingTime: normalized.summary?.slottime,
      },
      freshness: freshnessFromObservedAt(obs.observedAtUtc, now),
      errors: normalized.errors,
      diagnostics: [...diagnostics, `Recorded by operator ${obs.operatorId}`],
      timeline,
    };
  }
}