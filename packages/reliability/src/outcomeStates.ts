/** Operator-facing workflow states (production booking outcome tracking). */
export const OUTCOME_WORKFLOW_STATES = [
  'PREPARED',
  'FORM_READY',
  'FORM_FILLED',
  'REVIEW_REQUIRED',
  'SUBMITTED',
  'PAYMENT_PENDING',
  'CONFIRMATION_PENDING',
  'CONFIRMED',
  'QUOTA_REJECTED',
  'RATE_LIMITED',
  'SESSION_EXPIRED',
  'VALIDATION_FAILED',
  'UNKNOWN_OUTCOME',
  'FAILED',
] as const;

export type OutcomeWorkflowState = (typeof OUTCOME_WORKFLOW_STATES)[number];

/** Legacy reliability states still accepted in storage/API during migration. */
export const LEGACY_RELIABILITY_STATES = [
  'FORM_VALIDATED',
  'OFFICIAL_LOGIN_REQUIRED',
  'OFFICIAL_FORM_READY',
  'USER_REVIEW_REQUIRED',
  'SUBMISSION_IN_PROGRESS',
  'VALIDATION_ERROR',
  'NETWORK_ERROR',
] as const;

export type LegacyReliabilityState = (typeof LEGACY_RELIABILITY_STATES)[number];

export const ALL_BOOKING_STATES = [...OUTCOME_WORKFLOW_STATES, ...LEGACY_RELIABILITY_STATES] as const;

export type BookingWorkflowState = (typeof ALL_BOOKING_STATES)[number];

export const LEGACY_STATE_MAP: Record<string, OutcomeWorkflowState> = {
  FORM_VALIDATED: 'FORM_READY',
  OFFICIAL_LOGIN_REQUIRED: 'FORM_READY',
  OFFICIAL_FORM_READY: 'FORM_READY',
  USER_REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  SUBMISSION_IN_PROGRESS: 'SUBMITTED',
  VALIDATION_ERROR: 'VALIDATION_FAILED',
  NETWORK_ERROR: 'UNKNOWN_OUTCOME',
};

export function normalizeOutcomeState(state: string): OutcomeWorkflowState {
  if (OUTCOME_WORKFLOW_STATES.includes(state as OutcomeWorkflowState)) {
    return state as OutcomeWorkflowState;
  }
  return LEGACY_STATE_MAP[state] || 'UNKNOWN_OUTCOME';
}

export function allWorkflowStates(): OutcomeWorkflowState[] {
  return [...OUTCOME_WORKFLOW_STATES];
}

export type BookingOutcomeLabel = 'in_progress' | 'confirmed' | 'rejected' | 'uncertain' | 'failed';

export function deriveBookingOutcome(state: string): BookingOutcomeLabel {
  const s = normalizeOutcomeState(state);
  if (s === 'CONFIRMED') return 'confirmed';
  if (s === 'QUOTA_REJECTED') return 'rejected';
  if (['VALIDATION_FAILED', 'FAILED', 'SESSION_EXPIRED'].includes(s)) return 'failed';
  if (['UNKNOWN_OUTCOME', 'RATE_LIMITED', 'PAYMENT_PENDING', 'CONFIRMATION_PENDING'].includes(s)) return 'uncertain';
  return 'in_progress';
}

export const TERMINAL_STATES: OutcomeWorkflowState[] = [
  'CONFIRMED',
  'QUOTA_REJECTED',
  'FAILED',
  'VALIDATION_FAILED',
];

export const OPERATOR_EXPLANATIONS: Record<string, string> = {
  quota_exhausted:
    'The official site rejected the booking (quota). This is not converted into success — stale dashboard quota may have misled availability.',
  stale_quota_observation:
    'Quota looked available earlier but the observation was stale. Wait for a fresh quota read before retrying manually.',
  session_expired: 'Official login session expired. Re-authenticate on the TTD portal — DarshanDesk does not replay sessions.',
  booking_category_mismatch: 'Selected booking category does not match the official form. Fix the preparation and review again.',
  invalid_pilgrim_data: 'Pilgrim profiles are incomplete or invalid for the official form.',
  ineligible_booking_request: 'Preparation validation did not pass eligibility rules.',
  network_timeout:
    'Network or page timeout — this does not prove payment or booking failed. Verify outcome on the official site before acting.',
  rate_limit: 'Official rate limit encountered. Do not attempt automated retries or evasion.',
  unconfirmed_transaction:
    'Payment or booking may be pending. A verified official reference is required before marking confirmed.',
  payment_failure: 'Payment step reported failure — not marked as confirmed darshan ticket.',
};

export function errorStageForState(state: OutcomeWorkflowState): string {
  const map: Partial<Record<OutcomeWorkflowState, string>> = {
    PREPARED: 'preparation',
    FORM_READY: 'official_portal',
    FORM_FILLED: 'form_assist',
    REVIEW_REQUIRED: 'operator_review',
    SUBMITTED: 'submission',
    PAYMENT_PENDING: 'payment',
    CONFIRMATION_PENDING: 'confirmation',
    CONFIRMED: 'verified',
    QUOTA_REJECTED: 'submission',
    RATE_LIMITED: 'submission',
    SESSION_EXPIRED: 'authentication',
    VALIDATION_FAILED: 'validation',
    UNKNOWN_OUTCOME: 'unknown',
    FAILED: 'terminal_failure',
  };
  return map[state] || 'unknown';
}