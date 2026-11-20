/** Normalized quota summary — `failed` is booking failures, not released inventory. */
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

export type TtdResponseMeta = {
  source: "mock" | "approved" | "cache";
  observedAt: string;
  stale?: boolean;
  staleReason?: string;
  applicableDate?: string | null;
};

export type Envelope<T> = T & { meta: TtdResponseMeta };

export type CountryDetail = {
  countryId: string;
  countryName: string;
  states?: { stateId: string; stateName: string }[];
};

export type TrustDetail = {
  trustId: string;
  trustName: string;
  subTrusts?: { subTrustId: string; subTrustName: string }[];
};

export type PersonLimitResult = {
  amount: number;
  noOfPersons: number;
};

/** Sanitized account summary — no Aadhaar/PAN in API responses. */
export type AuthorizedAccountSummary = {
  userId: string;
  displayName: string;
  agencyLabel?: string;
};

export type ProviderStatus =
  | "READY"
  | "NOT_CONFIGURED"
  | "MOCK_DEV"
  | "DEGRADED"
  | "RATE_LIMITED";

export type IntegrationStatus = {
  mode: "mock" | "approved" | "none";
  enabled: boolean;
  baseUrl: string;
  lastSuccessfulUpdate?: string;
  providerReady: boolean;
  providerStatus: ProviderStatus;
  message?: string;
  endpoint?: string;
};

export type TtdProviderErrorCode =
  | "NOT_CONFIGURED"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "VALIDATION"
  | "TIMEOUT"
  | "INVALID_JSON";

export class TtdProviderError extends Error {
  constructor(
    public readonly code: TtdProviderErrorCode,
    message: string,
    public readonly retryAfterMs?: number,
    public readonly status?: number
  ) {
    super(message);
    this.name = "TtdProviderError";
  }
}

export const SRIVANI_QUOTA_PATH = "/dms/darshansummarySrivaniCurrentDay";