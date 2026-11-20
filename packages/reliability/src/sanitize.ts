import type { ErrorClass, ReliabilityState, SanitizedDiagnostic } from './types.js';

const SENSITIVE_KEY = /password|otp|captcha|token|cookie|authorization|idnumber|mobile|aadhaar|pan/i;

export interface RawTimelineEvent {
  atUtc: string | Date;
  type: string;
  message: string;
  meta?: Record<string, unknown>;
}

export function sanitizeTimeline(events: RawTimelineEvent[]): SanitizedDiagnostic['timelineSummary'] {
  return events.map((e) => ({
    atUtc: typeof e.atUtc === 'string' ? e.atUtc : e.atUtc.toISOString(),
    type: e.type,
    summary: redactMessage(e.message),
  }));
}

export function redactMessage(message: string): string {
  return message
    .replace(/\b\d{10}\b/g, '[MOBILE_REDACTED]')
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, '[PAN_REDACTED]')
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[ID_REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}

export function sanitizeMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE_KEY.test(k)) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'string') {
      out[k] = redactMessage(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function buildSanitizedExport(input: {
  attemptId: string;
  preparationId: string;
  reliabilityState: ReliabilityState;
  errorClass: ErrorClass | null;
  events: RawTimelineEvent[];
  quotaHint?: { count?: number; freshness?: string };
}): SanitizedDiagnostic {
  return {
    attemptId: input.attemptId,
    preparationId: input.preparationId,
    reliabilityState: input.reliabilityState,
    errorClass: input.errorClass,
    timelineSummary: sanitizeTimeline(input.events),
    quotaHint: input.quotaHint,
    notices: [
      'Diagnostic export is sanitized — no OTP, tokens, or full ID numbers.',
      'DarshanDesk does not guarantee TTD ticket allocation.',
      'Uncertain bookings are not auto-resubmitted.',
    ],
    generatedAtUtc: new Date().toISOString(),
  };
}