import {
  buildSanitizedExport,
  canTransition,
  classifyBookingError,
  deriveBookingOutcome,
  errorStageForState,
  initialStateFromPreparation,
  isTerminalState,
  normalizeOutcomeState,
  OPERATOR_EXPLANATIONS,
  redactMessage,
  sanitizeMeta,
} from '@darshan-desk/reliability';
import { BookingAttempt } from '../models/BookingAttempt.js';
import { BookingPreparation } from '../models/BookingPreparation.js';
import { presentBookingAttempt } from './bookingAttemptPresenter.js';

function agencyFilter(agencyId) {
  return { agencyId };
}

function applyTransitionSideEffects(attempt, toState, meta) {
  const canonical = normalizeOutcomeState(toState);
  attempt.reliabilityState = canonical;
  attempt.outcome = deriveBookingOutcome(canonical);
  attempt.errorStage = errorStageForState(canonical);

  if (canonical === 'SUBMITTED' && !attempt.submittedAt) {
    attempt.submittedAt = new Date();
  }

  if (isTerminalState(canonical) || canonical === 'CONFIRMED') {
    attempt.completedAt = attempt.completedAt || new Date();
  }

  if (canonical === 'CONFIRMED' && meta?.verificationSource) {
    attempt.verificationSource = meta.verificationSource;
    attempt.verifiedAt = new Date();
    if (meta?.officialReference) {
      attempt.officialReference = String(meta.officialReference);
      attempt.officialEvidenceReference = String(meta.officialReference);
    }
  }
}

function enrichErrorReport(attempt, errorClass, reasons) {
  attempt.errorCode = errorClass || attempt.errorCode;
  attempt.errorClass = errorClass || attempt.errorClass;
  const explanation = errorClass ? OPERATOR_EXPLANATIONS[errorClass] : undefined;
  attempt.errorReport = {
    ...(attempt.errorReport || {}),
    summary: errorClass || attempt.errorReport?.summary || 'classified',
    reasons: reasons || attempt.errorReport?.reasons || [],
    operatorExplanation: explanation,
  };
}

export async function createAttemptFromPreparation({ agencyId, operatorId, preparationId }) {
  const prep = await BookingPreparation.findOne({ _id: preparationId, agencyId });
  if (!prep) {
    const err = new Error('Preparation not found');
    err.status = 404;
    throw err;
  }

  const existing = await BookingAttempt.findOne({
    preparationId,
    agencyId,
    reliabilityState: { $nin: ['CONFIRMED'] },
    outcome: { $ne: 'confirmed' },
  });
  if (existing) return presentBookingAttempt(existing);

  const state = initialStateFromPreparation(prep.validationStatus === 'passed');
  const attempt = await BookingAttempt.create({
    agencyId,
    operatorId,
    preparationId,
    bookingCategory: prep.bookingCategory,
    reliabilityState: state,
    startedAt: new Date(),
    outcome: deriveBookingOutcome(state),
    errorStage: errorStageForState(state),
    autoResubmitBlocked: true,
    timeline: [
      {
        atUtc: new Date(),
        type: 'attempt_created',
        message: `Booking attempt tracking started at ${state}`,
        toState: state,
      },
    ],
  });
  return presentBookingAttempt(attempt);
}

export async function listAttempts(agencyId, filters = {}) {
  const q = { ...agencyFilter(agencyId) };
  if (filters.state) q.reliabilityState = normalizeOutcomeState(filters.state);
  if (filters.outcome) q.outcome = filters.outcome;
  if (filters.bookingCategory) q.bookingCategory = filters.bookingCategory;
  if (filters.from || filters.to) {
    q.startedAt = {};
    if (filters.from) q.startedAt.$gte = new Date(filters.from);
    if (filters.to) q.startedAt.$lte = new Date(filters.to);
  }

  const attempts = await BookingAttempt.find(q)
    .sort({ updatedAt: -1 })
    .populate('preparationId', 'bookingCategory donationAmount validationStatus trustCategory');
  return attempts.map(presentBookingAttempt);
}

export async function getAttempt(agencyId, attemptId) {
  const attempt = await BookingAttempt.findOne({ _id: attemptId, ...agencyFilter(agencyId) }).populate(
    'preparationId'
  );
  if (!attempt) {
    const err = new Error('Attempt not found');
    err.status = 404;
    throw err;
  }
  return presentBookingAttempt(attempt);
}

export async function transitionAttempt({
  agencyId,
  attemptId,
  toState,
  message,
  meta,
  hasOfficialEvidence,
  serverRejected,
  submissionAttempted,
}) {
  const attempt = await BookingAttempt.findOne({ _id: attemptId, ...agencyFilter(agencyId) });
  if (!attempt) {
    const err = new Error('Attempt not found');
    err.status = 404;
    throw err;
  }

  const target = normalizeOutcomeState(toState);
  const check = canTransition({
    from: attempt.reliabilityState,
    to: target,
    hasOfficialEvidence,
    serverRejected,
  });

  if (!check.allowed) {
    const err = new Error(check.reason || 'Transition not allowed');
    err.status = 409;
    throw err;
  }

  if (submissionAttempted) {
    if (attempt.duplicateSubmissionGuard && attempt.submissionAttempted) {
      const err = new Error('Duplicate submission blocked — uncertain outcomes must not auto-resubmit');
      err.status = 409;
      throw err;
    }
    attempt.submissionAttempted = true;
  }

  const from = normalizeOutcomeState(attempt.reliabilityState);
  applyTransitionSideEffects(attempt, target, meta);

  attempt.timeline.push({
    atUtc: new Date(),
    type: 'state_transition',
    message: redactMessage(message || `${from} → ${target}`),
    meta: sanitizeMeta(meta),
    fromState: from,
    toState: target,
  });

  await attempt.save();
  return presentBookingAttempt(attempt);
}

export async function recordOfficialReference({
  agencyId,
  attemptId,
  officialReference,
  verificationSource,
  officialStatus,
  note,
}) {
  if (!officialReference) {
    const err = new Error('officialReference required');
    err.status = 400;
    throw err;
  }
  const attempt = await BookingAttempt.findOne({ _id: attemptId, ...agencyFilter(agencyId) });
  if (!attempt) {
    const err = new Error('Attempt not found');
    err.status = 404;
    throw err;
  }

  const meta = {
    officialReference,
    verificationSource: verificationSource || 'operator_manual',
    officialStatus,
    note,
  };

  if (officialStatus === 'confirmed') {
    return transitionAttempt({
      agencyId,
      attemptId,
      toState: 'CONFIRMED',
      hasOfficialEvidence: true,
      message: `Official reference recorded: ${officialReference}`,
      meta,
    });
  }

  attempt.officialReference = officialReference;
  attempt.verificationSource = verificationSource || 'operator_manual';
  attempt.timeline.push({
    atUtc: new Date(),
    type: 'official_reference_recorded',
    message: redactMessage(note || `Reference ${officialReference} recorded — not promoted to CONFIRMED without verification`),
    meta: sanitizeMeta(meta),
  });
  await attempt.save();
  return presentBookingAttempt(attempt);
}

export async function classifyAndApply({ agencyId, attemptId, signals }) {
  const attempt = await BookingAttempt.findOne({ _id: attemptId, ...agencyFilter(agencyId) });
  if (!attempt) {
    const err = new Error('Attempt not found');
    err.status = 404;
    throw err;
  }

  const classification = classifyBookingError({
    ...signals,
    reliabilityState: attempt.reliabilityState,
    quotaCountAtObservation: signals.quotaCountAtObservation ?? attempt.quotaAtObservation?.count,
    quotaFreshness: signals.quotaFreshness ?? attempt.quotaAtObservation?.freshness,
  });

  enrichErrorReport(attempt, classification.errorClass, classification.reasons);
  if (classification.blockAutoResubmit) attempt.autoResubmitBlocked = true;

  if (signals.officialMessage) {
    attempt.errorReport.officialMessage = redactMessage(signals.officialMessage);
  }

  if (signals.quotaCountAtObservation != null) {
    attempt.quotaAtObservation = {
      count: signals.quotaCountAtObservation,
      freshness: signals.quotaFreshness || 'unknown',
      observedAtUtc: new Date(),
    };
  }

  const target = normalizeOutcomeState(classification.suggestedState);
  if (target !== normalizeOutcomeState(attempt.reliabilityState)) {
    const check = canTransition({
      from: attempt.reliabilityState,
      to: target,
      serverRejected: signals.serverRejectedBooking || classification.blockSuccessPromotion,
      hasOfficialEvidence: false,
    });
    if (check.allowed) {
      const from = normalizeOutcomeState(attempt.reliabilityState);
      applyTransitionSideEffects(attempt, target, {});
      attempt.timeline.push({
        atUtc: new Date(),
        type: 'error_classification',
        message: redactMessage(
          `Classified: ${classification.errorClass || 'none'} — ${classification.reasons.join('; ')}`
        ),
        fromState: from,
        toState: target,
        meta: sanitizeMeta({ errorClass: classification.errorClass }),
      });
    } else {
      attempt.timeline.push({
        atUtc: new Date(),
        type: 'error_classification_blocked',
        message: `Classification suggested ${target} but transition blocked: ${check.reason}`,
        meta: sanitizeMeta({ errorClass: classification.errorClass }),
      });
    }
  }

  await attempt.save();
  return { attempt: presentBookingAttempt(attempt), classification };
}

export async function recordFillQuality({ agencyId, attemptId, fillReport }) {
  const attempt = await BookingAttempt.findOne({ _id: attemptId, ...agencyFilter(agencyId) });
  if (!attempt) {
    const err = new Error('Attempt not found');
    err.status = 404;
    throw err;
  }

  const results = fillReport?.results || [];
  const verified = results.filter((r) => r.status === 'verified').length;
  const failed = results.filter((r) => ['validation_failed', 'missing_element'].includes(r.status)).length;

  attempt.timeline.push({
    atUtc: new Date(),
    type: 'form_fill_report',
    message: `Extension fill: ${verified} verified, ${failed} issues — not a completed booking`,
    meta: sanitizeMeta({ verified, failed, total: results.length }),
  });

  if (verified > 0 && failed === 0) {
    const to = 'FORM_FILLED';
    const check = canTransition({ from: attempt.reliabilityState, to });
    if (check.allowed) {
      const from = normalizeOutcomeState(attempt.reliabilityState);
      applyTransitionSideEffects(attempt, to, {});
      attempt.timeline.push({
        atUtc: new Date(),
        type: 'state_transition',
        message: 'Permitted fields filled — operator review required before submission',
        fromState: from,
        toState: to,
      });
      const reviewCheck = canTransition({ from: attempt.reliabilityState, to: 'REVIEW_REQUIRED' });
      if (reviewCheck.allowed) {
        applyTransitionSideEffects(attempt, 'REVIEW_REQUIRED', {});
        attempt.timeline.push({
          atUtc: new Date(),
          type: 'state_transition',
          message: 'Review required — submission is operator-controlled',
          toState: 'REVIEW_REQUIRED',
        });
      }
    }
  } else if (failed > 0) {
    enrichErrorReport(attempt, 'invalid_pilgrim_data', ['Form assist reported field-level validation issues']);
    const check = canTransition({ from: attempt.reliabilityState, to: 'VALIDATION_FAILED' });
    if (check.allowed) {
      applyTransitionSideEffects(attempt, 'VALIDATION_FAILED', {});
    }
  }

  await attempt.save();
  return presentBookingAttempt(attempt);
}

export async function getQaDashboard(agencyId) {
  const attempts = await BookingAttempt.find(agencyFilter(agencyId));
  const byState = {};
  const byError = {};
  const byOutcome = {};
  for (const a of attempts) {
    const s = normalizeOutcomeState(a.reliabilityState);
    byState[s] = (byState[s] || 0) + 1;
    const code = a.errorCode || a.errorClass;
    if (code) byError[code] = (byError[code] || 0) + 1;
    byOutcome[a.outcome] = (byOutcome[a.outcome] || 0) + 1;
  }
  return {
    totalAttempts: attempts.length,
    byState,
    byError,
    byOutcome,
    blockedAutoResubmit: attempts.filter((a) => a.autoResubmitBlocked).length,
    duplicateSubmissionBlocked: attempts.filter((a) => a.submissionAttempted).length,
    notices: [
      'Filling the form is not a completed booking.',
      'Submission click is not confirmed booking.',
      'Payment success is not automatic darshan confirmation.',
      'Genuine quota rejection is preserved — never bypassed.',
      'Timeouts do not imply failed transactions.',
    ],
  };
}

export async function getAgencyPerformanceReport(agencyId, { from, to } = {}) {
  const q = { ...agencyFilter(agencyId) };
  if (from || to) {
    q.startedAt = {};
    if (from) q.startedAt.$gte = new Date(from);
    if (to) q.startedAt.$lte = new Date(to);
  }
  const attempts = await BookingAttempt.find(q);
  const confirmed = attempts.filter((a) => a.outcome === 'confirmed');
  const rejected = attempts.filter((a) => a.outcome === 'rejected');
  const uncertain = attempts.filter((a) => a.outcome === 'uncertain');
  const inProgress = attempts.filter((a) => a.outcome === 'in_progress');

  const byCategory = {};
  for (const a of attempts) {
    const cat = a.bookingCategory || 'UNKNOWN';
    byCategory[cat] = byCategory[cat] || { total: 0, confirmed: 0, rejected: 0 };
    byCategory[cat].total += 1;
    if (a.outcome === 'confirmed') byCategory[cat].confirmed += 1;
    if (a.outcome === 'rejected') byCategory[cat].rejected += 1;
  }

  const durations = confirmed
    .filter((a) => a.startedAt && a.verifiedAt)
    .map((a) => new Date(a.verifiedAt).getTime() - new Date(a.startedAt).getTime());
  const avgMsToConfirm =
    durations.length > 0 ? Math.round(durations.reduce((s, x) => s + x, 0) / durations.length) : null;

  return {
    window: { from: from || null, to: to || null },
    totals: {
      attempts: attempts.length,
      confirmed: confirmed.length,
      rejected: rejected.length,
      uncertain: uncertain.length,
      inProgress: inProgress.length,
      confirmRate: attempts.length ? Number((confirmed.length / attempts.length).toFixed(3)) : 0,
    },
    byCategory,
    avgMsToConfirm,
    quotaRejections: rejected.filter((a) => normalizeOutcomeState(a.reliabilityState) === 'QUOTA_REJECTED').length,
  };
}

export function exportDiagnostic(attempt) {
  const raw = attempt.toObject ? attempt.toObject() : attempt;
  return buildSanitizedExport({
    attemptId: raw._id.toString(),
    preparationId: raw.preparationId._id?.toString() || String(raw.preparationId),
    reliabilityState: normalizeOutcomeState(raw.reliabilityState),
    errorClass: raw.errorCode || raw.errorClass,
    events: (raw.timeline || []).map((e) => ({
      atUtc: e.atUtc,
      type: e.type,
      message: e.message,
    })),
    quotaHint: raw.quotaAtObservation
      ? { count: raw.quotaAtObservation.count, freshness: raw.quotaAtObservation.freshness }
      : undefined,
    outcome: raw.outcome,
    officialReference: raw.officialReference ? '[REFERENCE_ON_FILE]' : undefined,
  });
}

/** Link extension fill report to open attempt for preparation */
export async function ingestExtensionFillReport({ agencyId, preparationId, fillReport }) {
  const attempt = await BookingAttempt.findOne({
    agencyId,
    preparationId,
    outcome: { $nin: ['confirmed', 'rejected'] },
  }).sort({ updatedAt: -1 });
  if (!attempt) return null;
  return recordFillQuality({ agencyId, attemptId: attempt._id, fillReport });
}