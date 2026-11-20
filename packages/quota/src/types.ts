export type QuotaProviderKind = 'mock' | 'manual' | 'approved_official';

export type FreshnessStatus = 'fresh' | 'stale' | 'unknown';

export type QuotaScenario =
  | 'available'
  | 'exhausted'
  | 'delayed'
  | 'error'
  | 'stale'
  | 'missing_fields'
  | 'invalid_release_time'
  | 'unavailable'
  | 'ttd_screenshot_bar'
  | 'policy_v2';

/** Normalized quota summary aligned with supplied TTD-style response fields. */
export interface QuotaSummary {
  quotaCount: number;
  slottime: string;
  minpersons: string;
  maxpersons: string;
  advanceminpersons: string;
  advancemaxpersons: string;
  noOfladdus: number;
  minAmount: number;
  advanceminAmount: number;
  darshanAmount: number;
  maxAmount: number;
  advancemaxAmount: number;
  success: number;
  pending: number;
  failed: number;
  released: number;
  quotaReleaseTime: string;
}

export interface QuotaFetchMeta {
  provider: QuotaProviderKind;
  sourceLabel: string;
  observedAtUtc: string;
  policyVersion?: string;
  bookingCategory?: string;
  reportingTime?: string;
}

export interface QuotaFetchResult {
  success: boolean;
  summary: QuotaSummary | null;
  meta: QuotaFetchMeta;
  freshness: FreshnessStatus;
  errors: string[];
  diagnostics: string[];
  timeline: QuotaTimelineEvent[];
}

export interface QuotaTimelineEvent {
  id: string;
  atUtc: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface QuotaDataProvider {
  readonly kind: QuotaProviderKind;
  readonly label: string;
  fetchQuota(context: QuotaFetchContext): Promise<QuotaFetchResult>;
}

export interface QuotaFetchContext {
  agencyId: string;
  operatorId: string;
  /** Mock scenario selector — ignored by non-mock providers */
  mockScenario?: QuotaScenario;
  /** ISO timestamp considered "now" for tests */
  nowUtc?: string;
  manualObservationId?: string;
}

export interface ManualQuotaObservationInput {
  bookingCategory: string;
  source: string;
  observedAtUtc?: string;
  policyVersion?: string;
  raw: Partial<QuotaSummary> & Record<string, unknown>;
}