import { redactMessage } from '@darshan-desk/reliability';

let Sentry = null;
let initialized = false;

const SENSITIVE_KEY = /password|otp|captcha|token|authorization|cookie|aadhaar|pan|idnumber|id_number|mobile/i;

function scrubObject(obj, depth = 0) {
  if (depth > 6 || obj == null) return obj;
  if (typeof obj === 'string') return redactMessage(obj);
  if (Array.isArray(obj)) return obj.map((v) => scrubObject(v, depth + 1));
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : scrubObject(v, depth + 1);
    }
    return out;
  }
  return obj;
}

export async function initErrorMonitoring() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || initialized) return;
  try {
    const mod = await import('@sentry/node');
    Sentry = mod;
    mod.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
      beforeSend(event) {
        if (event.request?.data) {
          event.request.data = scrubObject(event.request.data);
        }
        if (event.extra) event.extra = scrubObject(event.extra);
        if (event.message) event.message = redactMessage(String(event.message));
        return event;
      },
    });
    initialized = true;
  } catch (e) {
    console.warn('@sentry/node init failed:', e.message);
  }
}

export function captureMonitoringEvent(type, detail = {}) {
  captureMessage(`[${type}] ${detail.message || type}`, 'warning', detail);
}

export function captureApiError(err, req) {
  if (!Sentry || !initialized) return;
  Sentry.captureException(err, {
    extra: scrubObject({
      path: req?.originalUrl,
      method: req?.method,
      agencyId: req?.agencyId?.toString?.(),
      code: err?.code,
    }),
  });
}

export function captureMessage(message, level = 'warning', extra = {}) {
  if (!Sentry || !initialized) return;
  Sentry.captureMessage(redactMessage(message), { level, extra: scrubObject(extra) });
}