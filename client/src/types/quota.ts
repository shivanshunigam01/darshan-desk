export interface QuotaSummary {
  quotaCount: number;
  slottime: string | null;
  minpersons: string | null;
  maxpersons: string | null;
  advanceminpersons: string | null;
  advancemaxpersons: string | null;
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
  quotaReleaseTime: string | null;
}

export type FreshnessStatus = 'fresh' | 'stale' | 'unknown';

export interface QuotaDashboardResponse {
  success: boolean;
  summary: QuotaSummary | null;
  meta: {
    provider: string;
    sourceLabel: string;
    observedAtUtc: string;
    policyVersion?: string;
    bookingCategory?: string;
    reportingTime?: string;
  };
  freshness: FreshnessStatus;
  errors: string[];
  diagnostics: string[];
  timeline: Array<{ id: string; atUtc: string; level: string; message: string }>;
  display: {
    dataSource: string;
    lastUpdatedUtc: string;
    lastUpdatedIst: string;
    freshness: FreshnessStatus;
    availabilityNotice: string;
  };
  cards: {
    bookingCategory: string;
    quotaReleaseTime: string;
    remainingTimeMs: number | null;
    remainingTimeLabel: string;
    availableQuota: number | null;
    successfulBookings: number | null;
    pendingPayments: number | null;
    failedBookings: number | null;
    totalReleasedQuota?: number | null;
    reportingTime: string;
    pilgrimLimits?: {
      min: string;
      max: string;
      advanceMin: string;
      advanceMax: string;
    };
    integration?: {
      providerReady: boolean;
      enabled: boolean;
      lastSuccessfulUpdate?: string;
      mode: string;
    };
    donationEligibility: {
      eligible: boolean;
      reasons: string[];
      minDonationCurrent: number;
      minDonationAdvance: number;
    };
  };
}

export interface SrivaniQuotaPayload {
  data: QuotaSummary;
  source: string;
  observedAt: string;
  lastSuccessfulUpdate?: string;
  isStale: boolean;
  staleReason?: string;
  providerStatus: string;
  applicableDate?: string | null;
  releaseDisplay?: { label: string; detail?: string };
  observedAtIst?: string;
  integration: {
    mode: string;
    enabled: boolean;
    baseUrl: string;
    providerReady: boolean;
    providerStatus?: string;
    lastSuccessfulUpdate?: string;
    message?: string;
    endpoint?: string;
  };
  dashboard: QuotaDashboardResponse;
}

export type TtdQuotaResponse = SrivaniQuotaPayload;