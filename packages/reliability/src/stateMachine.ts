import {
  normalizeOutcomeState,
  OUTCOME_WORKFLOW_STATES,
  type OutcomeWorkflowState,
} from './outcomeStates.js';
import type { TransitionRequest, TransitionResult } from './types.js';

const TERMINAL_SUCCESS: OutcomeWorkflowState = 'CONFIRMED';

const FAILURE_STATES: OutcomeWorkflowState[] = [
  'QUOTA_REJECTED',
  'SESSION_EXPIRED',
  'RATE_LIMITED',
  'VALIDATION_FAILED',
  'UNKNOWN_OUTCOME',
  'FAILED',
];

const ALLOWED: Record<OutcomeWorkflowState, OutcomeWorkflowState[]> = {
  PREPARED: ['FORM_READY', 'VALIDATION_FAILED'],
  FORM_READY: ['FORM_FILLED', 'SESSION_EXPIRED', 'VALIDATION_FAILED', 'UNKNOWN_OUTCOME'],
  FORM_FILLED: ['REVIEW_REQUIRED', 'VALIDATION_FAILED'],
  REVIEW_REQUIRED: ['SUBMITTED', 'VALIDATION_FAILED'],
  SUBMITTED: [
    'PAYMENT_PENDING',
    'CONFIRMATION_PENDING',
    'QUOTA_REJECTED',
    'SESSION_EXPIRED',
    'RATE_LIMITED',
    'VALIDATION_FAILED',
    'UNKNOWN_OUTCOME',
    'FAILED',
  ],
  PAYMENT_PENDING: ['CONFIRMATION_PENDING', 'UNKNOWN_OUTCOME', 'VALIDATION_FAILED', 'FAILED'],
  CONFIRMATION_PENDING: ['CONFIRMED', 'UNKNOWN_OUTCOME', 'VALIDATION_FAILED', 'FAILED'],
  CONFIRMED: [],
  QUOTA_REJECTED: ['PREPARED'],
  SESSION_EXPIRED: ['FORM_READY', 'PREPARED'],
  RATE_LIMITED: ['REVIEW_REQUIRED', 'PREPARED'],
  VALIDATION_FAILED: ['PREPARED', 'FORM_READY'],
  UNKNOWN_OUTCOME: ['PREPARED', 'REVIEW_REQUIRED'],
  FAILED: ['PREPARED'],
};

function resolveState(raw: string): OutcomeWorkflowState {
  return normalizeOutcomeState(raw);
}

export function canTransition(req: TransitionRequest): TransitionResult {
  const from = resolveState(req.from);
  const to = resolveState(req.to);
  const { hasOfficialEvidence, serverRejected } = req;

  if (serverRejected && to === TERMINAL_SUCCESS) {
    return { allowed: false, reason: 'Cannot convert server rejection into CONFIRMED' };
  }

  if (to === TERMINAL_SUCCESS && !hasOfficialEvidence) {
    return { allowed: false, reason: 'CONFIRMED requires verified official booking reference and status' };
  }

  if (from === 'FORM_FILLED' && to === TERMINAL_SUCCESS) {
    return { allowed: false, reason: 'Form fill is not a completed booking' };
  }

  if (from === 'SUBMITTED' && to === TERMINAL_SUCCESS) {
    return { allowed: false, reason: 'Submission click is not confirmed booking — evidence required via CONFIRMATION_PENDING' };
  }

  if (from === 'PAYMENT_PENDING' && to === TERMINAL_SUCCESS) {
    return { allowed: false, reason: 'Successful payment is not automatic proof of darshan ticket — confirmation path required' };
  }

  if (FAILURE_STATES.includes(from) && to === TERMINAL_SUCCESS) {
    return { allowed: false, reason: 'Cannot move from failure/uncertain state directly to CONFIRMED' };
  }

  const allowed = ALLOWED[from] || [];
  if (!allowed.includes(to)) {
    return { allowed: false, reason: `Transition ${from} → ${to} is not allowed` };
  }

  return { allowed: true };
}

export function initialStateFromPreparation(validationPassed: boolean): OutcomeWorkflowState {
  return validationPassed ? 'FORM_READY' : 'PREPARED';
}

export function isTerminalState(state: string): boolean {
  const s = resolveState(state);
  return s === 'CONFIRMED' || s === 'QUOTA_REJECTED' || s === 'FAILED' || s === 'VALIDATION_FAILED';
}

export function listAllowedTargets(from: string): OutcomeWorkflowState[] {
  const s = resolveState(from);
  return ALLOWED[s] || [];
}

/** Validates enum registration */
export function assertWorkflowRegistry() {
  if (OUTCOME_WORKFLOW_STATES.length !== 14) {
    throw new Error('Workflow state registry drift');
  }
}