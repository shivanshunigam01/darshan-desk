import {
  assessOfficialOutcomeFromSignals,
  classifyBookingStageHttpResponse,
  isBookingConfirmedAllowed,
  isPaymentReadyAllowed,
  parseQuotaCount,
  redactMessage,
  SRIVANI_CURRENT_DAY_BOOKING_PATH,
  type ConfirmationStatus,
  type OfficialOutcomeCode,
  type OutcomeWorkflowState,
} from '@darshan-desk/reliability';
import type { ContinueReadinessState, PageMonitorSnapshot, QuotaStatusSnapshot } from './pageMonitor.js';
import type { SrivaniPagePhase } from './liveSrivaniAssist.js';

export type { OfficialOutcomeCode, ConfirmationStatus };

export type DiagnosticTimelineEvent = {
  atUtc: string;
  bookingStage: string;
  workflowStatus: OutcomeWorkflowState | null;
  pageRoute: string;
  quotaSnapshot: QuotaStatusSnapshot;
  quotaObservedAtUtc: string;
  pilgrimCount: string | null;
  continueReadiness: Pick<
    ContinueReadinessState,
    'status' | 'readyToContinue' | 'loadingOverlay' | 'buttonEnabled' | 'blockExtensionAssist'
  >;
  sanitizedError: string | null;
  outcomeCode: OfficialOutcomeCode | null;
  confirmationStatus: ConfirmationStatus;
  bookingStageApi?: {
    endpoint: string;
    httpStatus: number;
    httpOkButRejected: boolean;
  } | null;
};

export type EnrichedPageMonitorSnapshot = PageMonitorSnapshot & PageOutcomeSnapshot;

export type PageOutcomeSnapshot = {
  outcomeCode: OfficialOutcomeCode | null;
  officialMessage: string | null;
  confirmationStatus: ConfirmationStatus;
  workflowStatus: OutcomeWorkflowState | null;
  quotaDisplayMismatch: boolean;
  blockAutoResubmit: boolean;
  blockSuccessPromotion: boolean;
  blockPaymentReady: boolean;
  blockBookingConfirmed: boolean;
  bookingStageHttp: {
    endpoint: string;
    httpStatus: number;
    httpOkButRejected: boolean;
    officialError: string | null;
  } | null;
  timeline: DiagnosticTimelineEvent[];
  diagnosticNotices: string[];
};

function readPermittedBookingStageFixture(
  doc: Document,
  displayedAvailableQuota: number | null
) {
  const raw = doc.body?.getAttribute('data-dd-booking-stage-response');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { endpoint?: string; httpStatus?: number; body?: unknown };
    return classifyBookingStageHttpResponse({
      endpoint: String(parsed.endpoint || SRIVANI_CURRENT_DAY_BOOKING_PATH),
      httpStatus: Number(parsed.httpStatus ?? 200),
      body: parsed.body ?? {},
      displayedAvailableQuota,
    });
  } catch {
    return null;
  }
}

const MAX_TIMELINE = 48;

export function stageLabelFromPhase(phase: PageMonitorSnapshot['phase']): string {
  if (phase === 'pilgrim_confirm') return 'pilgrim_details';
  if (phase === 'payment_summary') return 'payment_summary';
  if (phase === 'payment_gateway') return 'payment_gateway';
  if (phase === 'mock') return 'mock_flow';
  return 'unknown';
}

function visibleText(doc: Document): string {
  const inner = doc.body?.innerText?.slice(0, 16_000);
  if (inner && inner.trim()) return inner;
  return doc.body?.textContent?.slice(0, 16_000) || '';
}

export function assessPageOutcome(doc: Document, monitor: PageMonitorSnapshot): PageOutcomeSnapshot {
  const text = visibleText(doc);
  const displayedAvailableQuota = parseQuotaCount(monitor.quota.availableQuota);
  const stageHttp = readPermittedBookingStageFixture(doc, displayedAvailableQuota);

  const assessment = assessOfficialOutcomeFromSignals({
    visibleText: text,
    officialMessage: stageHttp?.officialError || undefined,
    serverRejectedBooking: stageHttp?.httpOkButRejected,
    displayedAvailableQuota,
    paymentPendingCount: parseQuotaCount(monitor.quota.paymentPending),
    quotaFreshness: 'unknown',
    httpStatus: stageHttp?.httpStatus,
  });

  const mergedCode = stageHttp?.outcome.code || assessment.code;
  const mergedMessage = stageHttp?.officialError || assessment.officialMessage;
  const workflowStatus = stageHttp?.workflowStatus ?? null;
  const blockPaymentReady = stageHttp ? !isPaymentReadyAllowed(stageHttp) : mergedCode === 'QUOTA_REJECTED';
  const blockBookingConfirmed = stageHttp ? !isBookingConfirmedAllowed(stageHttp) : mergedCode !== 'CONFIRMED';

  const notices = [
    'Displayed available quota does not guarantee allocation on TTD.',
    'Form fill success is not booking confirmation.',
  ];
  if (assessment.quotaDisplayMismatch) {
    notices.push(
      'Official page showed positive available quota earlier but returned a quota rejection — treat dashboard/monitor counts as observational only.'
    );
  }
  if (assessment.blockSuccessPromotion || stageHttp?.httpOkButRejected) {
    notices.push('Extension will not report booking success for this page state.');
  }
  if (stageHttp?.httpOkButRejected) {
    notices.push('HTTP 200 with an official error field is treated as rejection — not payment ready or confirmed.');
  }

  return {
    outcomeCode: mergedCode,
    officialMessage: mergedMessage ? redactMessage(mergedMessage) : null,
    confirmationStatus: stageHttp?.outcome.confirmationStatus || assessment.confirmationStatus,
    workflowStatus,
    quotaDisplayMismatch: assessment.quotaDisplayMismatch || Boolean(stageHttp?.httpOkButRejected && displayedAvailableQuota),
    blockAutoResubmit: stageHttp?.blockAutoResubmit ?? assessment.blockAutoResubmit,
    blockSuccessPromotion:
      stageHttp?.outcome.blockSuccessPromotion ?? assessment.blockSuccessPromotion ?? blockBookingConfirmed,
    blockPaymentReady,
    blockBookingConfirmed,
    bookingStageHttp: stageHttp
      ? {
          endpoint: stageHttp.endpoint,
          httpStatus: stageHttp.httpStatus,
          httpOkButRejected: stageHttp.httpOkButRejected,
          officialError: stageHttp.officialError,
        }
      : null,
    timeline: [],
    diagnosticNotices: notices,
  };
}

export function buildDiagnosticEvent(
  doc: Document,
  monitor: PageMonitorSnapshot,
  outcome: Pick<
    PageOutcomeSnapshot,
    'outcomeCode' | 'confirmationStatus' | 'officialMessage' | 'workflowStatus' | 'bookingStageHttp'
  >
): DiagnosticTimelineEvent {
  return {
    atUtc: monitor.observedAtUtc,
    bookingStage: stageLabelFromPhase(monitor.phase),
    workflowStatus: outcome.workflowStatus ?? null,
    pageRoute: monitor.pageUrl,
    quotaSnapshot: { ...monitor.quota },
    quotaObservedAtUtc: monitor.observedAtUtc,
    pilgrimCount: monitor.payment.pilgrimCount,
    continueReadiness: {
      status: monitor.continue.status,
      readyToContinue: monitor.continue.readyToContinue,
      loadingOverlay: monitor.continue.loadingOverlay,
      buttonEnabled: monitor.continue.buttonEnabled,
      blockExtensionAssist: monitor.continue.blockExtensionAssist,
    },
    sanitizedError: outcome.officialMessage,
    outcomeCode: outcome.outcomeCode,
    confirmationStatus: outcome.confirmationStatus,
    bookingStageApi: outcome.bookingStageHttp
      ? {
          endpoint: outcome.bookingStageHttp.endpoint,
          httpStatus: outcome.bookingStageHttp.httpStatus,
          httpOkButRejected: outcome.bookingStageHttp.httpOkButRejected,
        }
      : null,
  };
}

export function appendTimelineEvent(
  timeline: DiagnosticTimelineEvent[],
  event: DiagnosticTimelineEvent
): DiagnosticTimelineEvent[] {
  const last = timeline[timeline.length - 1];
  if (
    last &&
    last.outcomeCode === event.outcomeCode &&
    last.continueReadiness.status === event.continueReadiness.status &&
    last.bookingStage === event.bookingStage &&
    last.sanitizedError === event.sanitizedError
  ) {
    return timeline;
  }
  const next = [...timeline, event];
  if (next.length > MAX_TIMELINE) return next.slice(next.length - MAX_TIMELINE);
  return next;
}

export function mergeMonitorWithOutcome(
  doc: Document,
  base: PageMonitorSnapshot,
  priorTimeline: DiagnosticTimelineEvent[] = []
): EnrichedPageMonitorSnapshot {
  const partial = assessPageOutcome(doc, base);
  const event = buildDiagnosticEvent(doc, base, partial);
  const timeline = appendTimelineEvent(priorTimeline, event);

  return {
    ...base,
    ...partial,
    timeline,
  };
}