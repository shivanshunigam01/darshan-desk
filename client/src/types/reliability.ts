export type OutcomeWorkflowState =
  | 'PREPARED'
  | 'FORM_READY'
  | 'FORM_FILLED'
  | 'REVIEW_REQUIRED'
  | 'SUBMITTED'
  | 'PAYMENT_PENDING'
  | 'CONFIRMATION_PENDING'
  | 'CONFIRMED'
  | 'QUOTA_REJECTED'
  | 'RATE_LIMITED'
  | 'SESSION_EXPIRED'
  | 'VALIDATION_FAILED'
  | 'UNKNOWN_OUTCOME'
  | 'FAILED';

export type BookingOutcomeLabel = 'in_progress' | 'confirmed' | 'rejected' | 'uncertain' | 'failed';

export interface BookingAttempt {
  _id: string;
  preparationId: string | { _id: string; bookingCategory?: string };
  bookingPreparationId?: string;
  bookingCategory?: string;
  reliabilityState: string;
  outcomeState?: OutcomeWorkflowState;
  outcome: BookingOutcomeLabel;
  startedAt?: string;
  submittedAt?: string;
  completedAt?: string;
  verifiedAt?: string;
  errorCode?: string;
  errorClass?: string;
  errorStage?: string;
  officialReference?: string;
  verificationSource?: string;
  errorReport?: {
    summary?: string;
    reasons?: string[];
    officialMessage?: string;
    operatorExplanation?: string;
  };
  operatorExplanation?: string;
  autoResubmitBlocked: boolean;
  submissionAttempted: boolean;
  quotaAtObservation?: { count?: number; freshness?: string };
  diagnosticEvents?: Array<{
    _id?: string;
    atUtc: string;
    type: string;
    message: string;
    fromState?: string;
    toState?: string;
  }>;
  timeline: Array<{
    _id?: string;
    atUtc: string;
    type: string;
    message: string;
    fromState?: string;
    toState?: string;
  }>;
  updatedAt: string;
}

export interface QaDashboard {
  totalAttempts: number;
  byState: Record<string, number>;
  byError: Record<string, number>;
  byOutcome?: Record<string, number>;
  blockedAutoResubmit: number;
  notices: string[];
}

export interface AgencyPerformanceReport {
  window: { from: string | null; to: string | null };
  totals: {
    attempts: number;
    confirmed: number;
    rejected: number;
    uncertain: number;
    inProgress: number;
    confirmRate: number;
  };
  byCategory: Record<string, { total: number; confirmed: number; rejected: number }>;
  avgMsToConfirm: number | null;
  quotaRejections: number;
}