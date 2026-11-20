import { ALL_BOOKING_STATES, type OutcomeWorkflowState } from './outcomeStates.js';

export const RELIABILITY_STATES = ALL_BOOKING_STATES;

export type ReliabilityState = (typeof ALL_BOOKING_STATES)[number];
export type { OutcomeWorkflowState };

export const ERROR_CLASSES = [
  'quota_exhausted',
  'stale_quota_observation',
  'session_expired',
  'booking_category_mismatch',
  'invalid_pilgrim_data',
  'ineligible_booking_request',
  'network_timeout',
  'rate_limit',
  'unconfirmed_transaction',
  'payment_failure',
] as const;

export type ErrorClass = (typeof ERROR_CLASSES)[number];

export interface ClassificationInput {
  reliabilityState?: ReliabilityState | string;
  officialMessage?: string;
  httpStatus?: number;
  networkTimedOut?: boolean;
  quotaCountAtObservation?: number;
  quotaFreshness?: 'fresh' | 'stale' | 'unknown';
  preparationBookingCategory?: string;
  observedBookingCategory?: string;
  pilgrimValidationErrors?: string[];
  preparationValidationFailed?: boolean;
  paymentFailed?: boolean;
  paymentPending?: boolean;
  hasOfficialConfirmationEvidence?: boolean;
  serverRejectedBooking?: boolean;
}

export interface ClassificationResult {
  errorClass: ErrorClass | null;
  suggestedState: ReliabilityState | string;
  reasons: string[];
  /** Never promote server rejection to success */
  blockSuccessPromotion: boolean;
  /** Uncertain outcomes must not auto-resubmit */
  blockAutoResubmit: boolean;
}

export interface TransitionRequest {
  from: ReliabilityState;
  to: ReliabilityState;
  hasOfficialEvidence?: boolean;
  serverRejected?: boolean;
}

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
}

export interface SanitizedDiagnostic {
  attemptId: string;
  preparationId: string;
  reliabilityState: ReliabilityState;
  errorClass: ErrorClass | null;
  timelineSummary: Array<{ atUtc: string; type: string; summary: string }>;
  quotaHint?: { count?: number; freshness?: string };
  notices: string[];
  generatedAtUtc: string;
}