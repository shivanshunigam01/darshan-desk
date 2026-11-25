import { assessOfficialOutcomeFromSignals, type OfficialOutcomeAssessment, type OfficialOutcomeCode } from './officialOutcome.js';
import type { OutcomeWorkflowState } from './outcomeStates.js';

/** Observed live booking-stage path (recording 2026-11-25). */
export const SRIVANI_CURRENT_DAY_BOOKING_PATH = '/dms/srivaniCurrentDayDarshanBooking';

export type BookingStageHttpBody = Record<string, unknown>;

export type BookingStageClassification = {
  endpoint: string;
  httpStatus: number;
  /** Official `error` field when present — never rewritten */
  officialError: string | null;
  /** HTTP 200 with an error field is not a successful booking */
  httpOkButRejected: boolean;
  bookingAccepted: boolean;
  workflowStatus: OutcomeWorkflowState;
  outcome: OfficialOutcomeAssessment;
  blockAutoResubmit: boolean;
  blockPaymentReady: boolean;
  blockBookingConfirmed: boolean;
};

function asRecord(body: unknown): BookingStageHttpBody | null {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) return null;
  return body as BookingStageHttpBody;
}

function readErrorField(body: BookingStageHttpBody): string | null {
  const err = body.error;
  if (typeof err === 'string' && err.trim()) return err.trim();
  const message = body.message;
  if (typeof message === 'string' && /error|exceeded|reject|fail/i.test(message)) return message.trim();
  return null;
}

/**
 * Classify DMS booking-stage HTTP responses.
 * TTD may return HTTP 200 with `{ "error": "..." }` — that is a rejection, not success.
 */
export function classifyBookingStageHttpResponse(input: {
  endpoint: string;
  httpStatus: number;
  body: unknown;
  displayedAvailableQuota?: number | null;
}): BookingStageClassification {
  const body = asRecord(input.body);
  const officialError = body ? readErrorField(body) : null;
  const httpOkButRejected = input.httpStatus >= 200 && input.httpStatus < 300 && Boolean(officialError);

  let workflowStatus: OutcomeWorkflowState = 'UNKNOWN_OUTCOME';
  let bookingAccepted = false;

  const outcome = assessOfficialOutcomeFromSignals({
    visibleText: officialError || '',
    officialMessage: officialError || undefined,
    httpStatus: input.httpStatus,
    serverRejectedBooking: httpOkButRejected,
    displayedAvailableQuota: input.displayedAvailableQuota ?? undefined,
    quotaFreshness: 'unknown',
  });

  if (httpOkButRejected && outcome.code === 'QUOTA_REJECTED') {
    workflowStatus = 'QUOTA_REJECTED';
    bookingAccepted = false;
  } else if (httpOkButRejected && outcome.code) {
    workflowStatus =
      outcome.code === 'SESSION_EXPIRED'
        ? 'SESSION_EXPIRED'
        : outcome.code === 'RATE_LIMITED'
          ? 'RATE_LIMITED'
          : outcome.code === 'ELIGIBILITY_REJECTED'
            ? 'VALIDATION_FAILED'
            : outcome.code === 'VALIDATION_FAILED'
              ? 'VALIDATION_FAILED'
              : 'FAILED';
    bookingAccepted = false;
  } else if (!httpOkButRejected && input.httpStatus >= 200 && input.httpStatus < 300 && !officialError) {
    /** Body success without explicit confirmation evidence stays uncertain — never CONFIRMED here */
    workflowStatus = 'CONFIRMATION_PENDING';
    bookingAccepted = false;
  } else if (input.httpStatus === 0 || input.httpStatus >= 500) {
    workflowStatus = 'UNKNOWN_OUTCOME';
    bookingAccepted = false;
  }

  if (outcome.code === 'CONFIRMED') {
    workflowStatus = 'CONFIRMED';
    bookingAccepted = true;
  }

  const blockPaymentReady = !bookingAccepted || Boolean(outcome.blockSuccessPromotion) || httpOkButRejected;
  const blockBookingConfirmed = !bookingAccepted || outcome.confirmationStatus !== 'confirmed';

  return {
    endpoint: input.endpoint,
    httpStatus: input.httpStatus,
    officialError,
    httpOkButRejected,
    bookingAccepted,
    workflowStatus,
    outcome,
    blockAutoResubmit: outcome.blockAutoResubmit || httpOkButRejected,
    blockPaymentReady,
    blockBookingConfirmed,
  };
}

/** Regression fixture from operator recording */
export function classifyRecordedQuotaExceededResponse(): BookingStageClassification {
  return classifyBookingStageHttpResponse({
    endpoint: SRIVANI_CURRENT_DAY_BOOKING_PATH,
    httpStatus: 200,
    body: { error: 'Cannot book as quota exceeded' },
    displayedAvailableQuota: 183,
  });
}

export function isPaymentReadyAllowed(classification: BookingStageClassification | null | undefined): boolean {
  if (!classification) return false;
  if (classification.blockPaymentReady) return false;
  if (classification.outcome.code === 'QUOTA_REJECTED') return false;
  return classification.workflowStatus === 'CONFIRMATION_PENDING' || classification.workflowStatus === 'PAYMENT_PENDING';
}

export function isBookingConfirmedAllowed(classification: BookingStageClassification | null | undefined): boolean {
  if (!classification) return false;
  if (classification.blockBookingConfirmed) return false;
  return classification.workflowStatus === 'CONFIRMED' && classification.outcome.code === 'CONFIRMED';
}

export function workflowStatusLabel(status: OutcomeWorkflowState): string {
  return status;
}

export type { OfficialOutcomeCode };