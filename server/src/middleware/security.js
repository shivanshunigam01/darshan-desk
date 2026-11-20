import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { redactMessage } from '@darshan-desk/reliability';

export function buildHelmet() {
  return helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });
}

export function globalRateLimiter() {
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
  const max = Number(process.env.RATE_LIMIT_MAX || 300);
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests', code: 'RATE_LIMITED' },
    skip: (req) =>
      req.path.startsWith('/health') ||
      req.path.startsWith('/mock-booking') ||
      req.path.startsWith('/health/'),
  });
}

export function loginRateLimiter() {
  const windowMs = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
  const max = Number(process.env.LOGIN_RATE_LIMIT_MAX || 20);
  const inTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts', code: 'LOGIN_RATE_LIMITED' },
    skip: () => inTest,
  });
}

export function requestTimeoutMs() {
  return Number(process.env.REQUEST_TIMEOUT_MS || 30_000);
}

export function auditRequest(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const line = {
      at: new Date().toISOString(),
      method: req.method,
      path: redactMessage(req.originalUrl || req.url),
      status: res.statusCode,
      agencyId: req.agencyId?.toString?.(),
      operatorId: req.operator?._id?.toString?.(),
      ms: Date.now() - start,
    };
    if (process.env.AUDIT_LOG !== 'false') {
      console.log(JSON.stringify({ type: 'audit', ...line }));
    }
  });
  next();
}