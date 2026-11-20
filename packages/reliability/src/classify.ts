import { normalizeOutcomeState } from './outcomeStates.js';
import type { ClassificationInput, ClassificationResult, ErrorClass } from './types.js';
import type { OutcomeWorkflowState } from './outcomeStates.js';

const QUOTA_EXCEEDED_PATTERNS = [/quota exceeded/i, /cannot book as quota exceeded/i, /no quota/i, /slots not available/i];

export function classifyBookingError(input: ClassificationInput): ClassificationResult {
  const reasons: string[] = [];
  let errorClass: ErrorClass | null = null;
  let suggestedState: OutcomeWorkflowState = input.reliabilityState
    ? normalizeOutcomeState(input.reliabilityState)
    : 'UNKNOWN_OUTCOME';

  if (input.networkTimedOut || input.httpStatus === 408 || input.httpStatus === 504) {
    errorClass = 'network_timeout';
    suggestedState = 'UNKNOWN_OUTCOME';
    reasons.push('Network timeout — not assumed to mean payment/booking failed');
  } else if (input.httpStatus === 429) {
    errorClass = 'rate_limit';
    suggestedState = 'RATE_LIMITED';
    reasons.push('HTTP 429 — rate limit (no bypass attempted)');
  } else if (input.officialMessage && /session expired|login again/i.test(input.officialMessage)) {
    errorClass = 'session_expired';
    suggestedState = 'SESSION_EXPIRED';
    reasons.push('Official session expired message');
  } else if (
    input.serverRejectedBooking ||
    (input.officialMessage && QUOTA_EXCEEDED_PATTERNS.some((re) => re.test(input.officialMessage!)))
  ) {
    errorClass = 'quota_exhausted';
    suggestedState = 'QUOTA_REJECTED';
    reasons.push('Genuine server-side quota rejection — not treated as success');
    if (
      input.quotaCountAtObservation != null &&
      input.quotaCountAtObservation > 0 &&
      (input.quotaFreshness === 'stale' || input.quotaFreshness === 'unknown')
    ) {
      reasons.push('Earlier dashboard showed positive quota — observation may have been stale');
    }
  } else if (
    input.quotaFreshness === 'stale' &&
    input.quotaCountAtObservation != null &&
    input.quotaCountAtObservation > 0
  ) {
    errorClass = 'stale_quota_observation';
    suggestedState = 'VALIDATION_FAILED';
    reasons.push('Quota display was positive but data freshness is stale');
  } else if (
    input.preparationBookingCategory &&
    input.observedBookingCategory &&
    input.preparationBookingCategory !== input.observedBookingCategory
  ) {
    errorClass = 'booking_category_mismatch';
    suggestedState = 'VALIDATION_FAILED';
    reasons.push('Booking category mismatch between preparation and official form');
  } else if (input.pilgrimValidationErrors?.length) {
    errorClass = 'invalid_pilgrim_data';
    suggestedState = 'VALIDATION_FAILED';
    reasons.push('Pilgrim profile validation failed');
  } else if (input.preparationValidationFailed) {
    errorClass = 'ineligible_booking_request';
    suggestedState = 'VALIDATION_FAILED';
    reasons.push('Preparation did not pass eligibility validation');
  } else if (input.paymentFailed) {
    errorClass = 'payment_failure';
    suggestedState = 'PAYMENT_PENDING';
    reasons.push('Payment step failed — not confirmed');
  } else if (input.paymentPending && !input.hasOfficialConfirmationEvidence) {
    errorClass = 'unconfirmed_transaction';
    suggestedState = 'CONFIRMATION_PENDING';
    reasons.push('Payment or booking outcome not confirmed with official evidence');
  }

  const blockSuccessPromotion = Boolean(
    input.serverRejectedBooking ||
      errorClass === 'quota_exhausted' ||
      errorClass === 'payment_failure' ||
      errorClass === 'unconfirmed_transaction' ||
      suggestedState === 'QUOTA_REJECTED' ||
      suggestedState === 'UNKNOWN_OUTCOME'
  );

  const blockAutoResubmit = Boolean(
    errorClass != null ||
      blockSuccessPromotion ||
      suggestedState === 'RATE_LIMITED' ||
      suggestedState === 'UNKNOWN_OUTCOME' ||
      suggestedState === 'SESSION_EXPIRED' ||
      suggestedState === 'VALIDATION_FAILED'
  );

  if (!errorClass && suggestedState === 'UNKNOWN_OUTCOME') {
    reasons.push('Outcome could not be classified with available signals');
  }

  return {
    errorClass,
    suggestedState,
    reasons,
    blockSuccessPromotion,
    blockAutoResubmit,
  };
}

/** Reference scenario: positive quota UI then official "Cannot book as quota exceeded". */
export function classifyQuotaDisplayMismatch(input: {
  displayedQuotaCount: number;
  quotaFreshness: 'fresh' | 'stale' | 'unknown';
  officialMessage: string;
}): ClassificationResult {
  return classifyBookingError({
    quotaCountAtObservation: input.displayedQuotaCount,
    quotaFreshness: input.quotaFreshness,
    officialMessage: input.officialMessage,
    serverRejectedBooking: QUOTA_EXCEEDED_PATTERNS.some((re) => re.test(input.officialMessage)),
    reliabilityState: 'SUBMITTED',
  });
}