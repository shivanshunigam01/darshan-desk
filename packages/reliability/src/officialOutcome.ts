import { classifyBookingError, classifyQuotaDisplayMismatch } from './classify.js';
import type { ClassificationInput, ClassificationResult } from './types.js';
import type { OutcomeWorkflowState } from './outcomeStates.js';

/** Operator-visible booking outcome codes (do not conflate with form-fill success). */
export const OFFICIAL_OUTCOME_CODES = [
  'QUOTA_REJECTED',
  'ELIGIBILITY_REJECTED',
  'SESSION_EXPIRED',
  'VALIDATION_FAILED',
  'RATE_LIMITED',
  'PAYMENT_PENDING',
  'NETWORK_ERROR',
  'UNKNOWN_OUTCOME',
  'CONFIRMED',
] as const;

export type OfficialOutcomeCode = (typeof OFFICIAL_OUTCOME_CODES)[number];

export type ConfirmationStatus = 'none' | 'pending' | 'rejected' | 'confirmed';

export type OfficialOutcomeAssessment = {
  code: OfficialOutcomeCode | null;
  /** Sanitized excerpt of official visible text — never rewritten */
  officialMessage: string | null;
  confirmationStatus: ConfirmationStatus;
  blockAutoResubmit: boolean;
  blockSuccessPromotion: boolean;
  /** Displayed quota does not imply allocation */
  quotaDisplayMismatch: boolean;
  reasons: string[];
};

const QUOTA_REJECT_RE =
  /cannot\s*book\s*as\s*quota\s*exceeded|quota\s*exceeded|no\s*quota|slots?\s*not\s*available/i;
const SESSION_RE = /session\s*expired|please\s*login\s*again|log\s*in\s*again/i;
const RATE_RE = /too\s*many\s*requests|rate\s*limit|http\s*429/i;
const ELIGIBILITY_RE = /not\s*eligible|ineligible|do\s*not\s*qualify|restriction/i;
const VALIDATION_RE = /invalid|validation\s*failed|mandatory\s*field/i;
const PAYMENT_PENDING_RE = /payment\s*pending|awaiting\s*payment/i;
const CONFIRMED_RE =
  /booking\s*confirmed|successfully\s*booked|transaction\s*successful|payment\s*successful/i;
const NETWORK_RE = /network\s*error|connection\s*(timed\s*out|failed)|unable\s*to\s*reach/i;

export function mapClassificationToOutcome(
  result: ClassificationResult,
  officialMessage: string | null
): OfficialOutcomeAssessment {
  const msg = officialMessage;
  let code: OfficialOutcomeCode | null = null;
  let confirmationStatus: ConfirmationStatus = 'none';

  const state = result.suggestedState as OutcomeWorkflowState;
  if (state === 'CONFIRMED' || result.errorClass === null && CONFIRMED_RE.test(msg || '')) {
    code = 'CONFIRMED';
    confirmationStatus = 'confirmed';
  } else if (state === 'QUOTA_REJECTED' || result.errorClass === 'quota_exhausted') {
    code = 'QUOTA_REJECTED';
    confirmationStatus = 'rejected';
  } else if (result.errorClass === 'ineligible_booking_request' || ELIGIBILITY_RE.test(msg || '')) {
    code = 'ELIGIBILITY_REJECTED';
    confirmationStatus = 'rejected';
  } else if (state === 'SESSION_EXPIRED' || result.errorClass === 'session_expired') {
    code = 'SESSION_EXPIRED';
    confirmationStatus = 'rejected';
  } else if (state === 'VALIDATION_FAILED' || result.errorClass === 'invalid_pilgrim_data') {
    code = 'VALIDATION_FAILED';
    confirmationStatus = 'rejected';
  } else if (state === 'RATE_LIMITED' || result.errorClass === 'rate_limit') {
    code = 'RATE_LIMITED';
    confirmationStatus = 'rejected';
  } else if (state === 'PAYMENT_PENDING' || result.errorClass === 'unconfirmed_transaction') {
    code = 'PAYMENT_PENDING';
    confirmationStatus = 'pending';
  } else if (result.errorClass === 'network_timeout') {
    code = 'NETWORK_ERROR';
    confirmationStatus = 'none';
  } else if (msg && (QUOTA_REJECT_RE.test(msg) || SESSION_RE.test(msg) || RATE_RE.test(msg))) {
    code = QUOTA_REJECT_RE.test(msg)
      ? 'QUOTA_REJECTED'
      : SESSION_RE.test(msg)
        ? 'SESSION_EXPIRED'
        : 'RATE_LIMITED';
    confirmationStatus = 'rejected';
  } else if (msg && CONFIRMED_RE.test(msg)) {
    code = 'CONFIRMED';
    confirmationStatus = 'confirmed';
  } else if (msg) {
    code = 'UNKNOWN_OUTCOME';
    confirmationStatus = 'pending';
  }

  const quotaDisplayMismatch = Boolean(
    code === 'QUOTA_REJECTED' &&
      result.reasons.some((r) => r.includes('stale') || r.includes('Earlier dashboard'))
  );

  return {
    code,
    officialMessage: msg,
    confirmationStatus,
    blockAutoResubmit: result.blockAutoResubmit,
    blockSuccessPromotion: result.blockSuccessPromotion,
    quotaDisplayMismatch,
    reasons: [...result.reasons],
  };
}

export function assessOfficialOutcomeFromSignals(input: {
  visibleText: string;
  /** Explicit official error (e.g. JSON `error` field surfaced to diagnostics) */
  officialMessage?: string;
  httpStatus?: number;
  networkTimedOut?: boolean;
  displayedAvailableQuota?: number | null;
  paymentPendingCount?: number | null;
  quotaFreshness?: 'fresh' | 'stale' | 'unknown';
  serverRejectedBooking?: boolean;
}): OfficialOutcomeAssessment {
  const text = input.visibleText || '';
  const officialMessage = input.officialMessage?.trim() || extractOfficialErrorLine(text);

  let serverRejected = Boolean(input.serverRejectedBooking) || QUOTA_REJECT_RE.test(text);
  if (officialMessage && QUOTA_REJECT_RE.test(officialMessage)) serverRejected = true;

  const paymentPending = PAYMENT_PENDING_RE.test(text) || (input.paymentPendingCount != null && input.paymentPendingCount > 0);
  const paymentFailed = /payment\s*failed|transaction\s*declined/i.test(text);
  const hasConfirmation = CONFIRMED_RE.test(text) && !QUOTA_REJECT_RE.test(text);

  const classificationInput: ClassificationInput = {
    officialMessage: officialMessage || undefined,
    serverRejectedBooking: serverRejected,
    httpStatus: input.httpStatus,
    networkTimedOut: input.networkTimedOut,
    quotaCountAtObservation: input.displayedAvailableQuota ?? undefined,
    quotaFreshness: input.quotaFreshness ?? 'unknown',
    paymentPending,
    paymentFailed,
    hasOfficialConfirmationEvidence: hasConfirmation,
    preparationValidationFailed: ELIGIBILITY_RE.test(text),
    pilgrimValidationErrors: VALIDATION_RE.test(text) ? ['official_validation_message'] : undefined,
  };

  let result: ClassificationResult;
  if (
    officialMessage &&
    QUOTA_REJECT_RE.test(officialMessage) &&
    input.displayedAvailableQuota != null &&
    input.displayedAvailableQuota > 0
  ) {
    result = classifyQuotaDisplayMismatch({
      displayedQuotaCount: input.displayedAvailableQuota,
      quotaFreshness: input.quotaFreshness ?? 'unknown',
      officialMessage,
    });
  } else {
    result = classifyBookingError(classificationInput);
  }

  if (!result.errorClass && NETWORK_RE.test(text)) {
    result = {
      ...result,
      errorClass: 'network_timeout',
      suggestedState: 'UNKNOWN_OUTCOME',
      reasons: [...result.reasons, 'Visible network error on official page'],
      blockAutoResubmit: true,
      blockSuccessPromotion: true,
    };
  }

  if (!result.errorClass && ELIGIBILITY_RE.test(text)) {
    result = {
      ...result,
      errorClass: 'ineligible_booking_request',
      suggestedState: 'VALIDATION_FAILED',
      reasons: [...result.reasons, 'Eligibility restriction on official page'],
      blockAutoResubmit: true,
      blockSuccessPromotion: true,
    };
  }

  let assessment = mapClassificationToOutcome(result, officialMessage ? officialMessage : null);

  if (!assessment.code && officialMessage && QUOTA_REJECT_RE.test(officialMessage)) {
    assessment = {
      ...assessment,
      code: 'QUOTA_REJECTED',
      confirmationStatus: 'rejected',
      blockAutoResubmit: true,
      blockSuccessPromotion: true,
    };
  }

  if (!assessment.code && paymentPending && !serverRejected) {
    return {
      ...assessment,
      code: 'PAYMENT_PENDING',
      confirmationStatus: 'pending',
      blockAutoResubmit: true,
      blockSuccessPromotion: true,
      reasons: [...assessment.reasons, 'Payment pending — not confirmed booking'],
    };
  }

  if (!assessment.code && CONFIRMED_RE.test(text) && !QUOTA_REJECT_RE.test(text)) {
    return {
      ...assessment,
      code: 'CONFIRMED',
      confirmationStatus: 'confirmed',
      blockAutoResubmit: false,
      blockSuccessPromotion: false,
      reasons: [...assessment.reasons, 'Explicit official confirmation copy detected'],
    };
  }

  return assessment;
}

/** Take the first high-signal official error line without altering wording. */
export function extractOfficialErrorLine(visibleText: string): string | null {
  const lines = visibleText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (
      QUOTA_REJECT_RE.test(line) ||
      SESSION_RE.test(line) ||
      RATE_RE.test(line) ||
      ELIGIBILITY_RE.test(line) ||
      VALIDATION_RE.test(line) ||
      NETWORK_RE.test(line)
    ) {
      return line.slice(0, 240);
    }
  }
  return null;
}

export function parseQuotaCount(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}