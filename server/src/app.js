import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import { corsOptions, trustProxyHops } from './config/env.js';
import { captureApiError } from './middleware/errorMonitor.js';
import { auditRequest, buildHelmet, globalRateLimiter, requestTimeoutMs } from './middleware/security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import policyRoutes from './routes/policy.js';
import preparationRoutes from './routes/preparations.js';
import quotaRoutes from './routes/quota.js';
import reliabilityRoutes from './routes/reliability.js';
import ttdRoutes from './routes/ttd.js';
import adminRoutes from './routes/admin.js';
import platformRoutes from './routes/platform.js';
import ttdAccountsRoutes from './routes/ttdAccounts.js';
import extensionRoutes from './routes/extension.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', trustProxyHops());
  app.use(buildHelmet());
  app.use(auditRequest);
  app.use(globalRateLimiter());
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));

  const timeoutMs = requestTimeoutMs();
  app.use((req, res, next) => {
    req.setTimeout(timeoutMs);
    res.setTimeout(timeoutMs);
    next();
  });

  const startedAt = new Date().toISOString();

  app.get('/health', (_req, res) =>
    res.json({
      ok: true,
      service: 'darshan-desk-api',
      version: process.env.APP_VERSION || '1.0.0',
      uptimeSec: Math.floor(process.uptime()),
      startedAt,
    })
  );

  app.get('/health/live', (_req, res) => res.json({ live: true }));

  app.get('/health/ready', async (_req, res) => {
    const dbState = mongoose.connection.readyState;
    const dbOk = dbState === 1;
    const ready = dbOk;
    res.status(ready ? 200 : 503).json({
      ready,
      checks: {
        mongodb: dbOk ? 'connected' : `state_${dbState}`,
      },
    });
  });

  app.use(
    '/mock-booking',
    express.static(path.join(__dirname, '../../apps/mock-booking-site'), { index: 'index.html' })
  );

  app.use('/api/auth', authRoutes);
  app.use('/api/catalog', catalogRoutes);
  app.use('/api/ttd-accounts', ttdAccountsRoutes);
  app.use('/api/policy', policyRoutes);
  app.use('/api/preparations', preparationRoutes);
  app.use('/api/quota', quotaRoutes);
  app.use('/api/reliability', reliabilityRoutes);
  app.use('/api/ttd', ttdRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/platform', platformRoutes);
  app.use('/api/extension', extensionRoutes);

  app.use((err, req, res, _next) => {
    if (err.message?.startsWith('CORS blocked')) {
      return res.status(403).json({ error: 'Origin not allowed', code: 'CORS_DENIED' });
    }
    captureApiError(err, req);
    console.error(err);
    const isProd = process.env.NODE_ENV === 'production';
    res.status(err.status || 500).json({
      error: isProd && !err.expose ? 'Server error' : err.message || 'Server error',
      code: err.code,
    });
  });

  return app;
}