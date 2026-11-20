import { deriveBookingOutcome, normalizeOutcomeState, OPERATOR_EXPLANATIONS } from '@darshan-desk/reliability';

export function presentBookingAttempt(attempt) {
  const o = attempt.toObject ? attempt.toObject() : attempt;
  const state = normalizeOutcomeState(o.reliabilityState);
  const errorCode = o.errorCode || o.errorClass;
  return {
    ...o,
    outcomeState: state,
    bookingPreparationId: o.preparationId?._id?.toString() || o.preparationId?.toString() || o.preparationId,
    diagnosticEvents: o.timeline || [],
    outcome: o.outcome || deriveBookingOutcome(state),
    startedAt: o.startedAt,
    submittedAt: o.submittedAt,
    completedAt: o.completedAt,
    verifiedAt: o.verifiedAt,
    errorCode,
    operatorExplanation:
      o.errorReport?.operatorExplanation ||
      (errorCode && OPERATOR_EXPLANATIONS[errorCode]) ||
      null,
  };
}