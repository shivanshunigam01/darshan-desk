import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  classifyAndApply,
  createAttemptFromPreparation,
  exportDiagnostic,
  getAgencyPerformanceReport,
  getAttempt,
  getQaDashboard,
  listAttempts,
  recordFillQuality,
  recordOfficialReference,
  transitionAttempt,
} from '../services/reliabilityService.js';

const router = express.Router();

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.get('/dashboard', requireAuth, asyncRoute(async (req, res) => {
  const dashboard = await getQaDashboard(req.agencyId);
  res.json({ dashboard });
}));

router.get('/attempts', requireAuth, asyncRoute(async (req, res) => {
  const attempts = await listAttempts(req.agencyId, {
    state: req.query.state,
    outcome: req.query.outcome,
    bookingCategory: req.query.bookingCategory,
    from: req.query.from,
    to: req.query.to,
  });
  res.json({ attempts });
}));

router.post('/attempts', requireAuth, asyncRoute(async (req, res) => {
  const { preparationId } = req.body;
  if (!preparationId) return res.status(400).json({ error: 'preparationId required' });
  const attempt = await createAttemptFromPreparation({
    agencyId: req.agencyId,
    operatorId: req.operator._id,
    preparationId,
  });
  res.status(201).json({ attempt });
}));

router.get('/attempts/:id', requireAuth, asyncRoute(async (req, res) => {
  const attempt = await getAttempt(req.agencyId, req.params.id);
  res.json({ attempt });
}));

router.post('/attempts/:id/transition', requireAuth, asyncRoute(async (req, res) => {
  const attempt = await transitionAttempt({
    agencyId: req.agencyId,
    attemptId: req.params.id,
    ...req.body,
  });
  res.json({ attempt });
}));

router.post('/attempts/:id/classify', requireAuth, asyncRoute(async (req, res) => {
  const result = await classifyAndApply({
    agencyId: req.agencyId,
    attemptId: req.params.id,
    signals: req.body,
  });
  res.json(result);
}));

router.post('/attempts/:id/official-reference', requireAuth, asyncRoute(async (req, res) => {
  const attempt = await recordOfficialReference({
    agencyId: req.agencyId,
    attemptId: req.params.id,
    ...req.body,
  });
  res.json({ attempt });
}));

router.get('/reports/agency-performance', requireAuth, asyncRoute(async (req, res) => {
  const report = await getAgencyPerformanceReport(req.agencyId, {
    from: req.query.from,
    to: req.query.to,
  });
  res.json({ report });
}));

router.post('/attempts/:id/fill-report', requireAuth, asyncRoute(async (req, res) => {
  const attempt = await recordFillQuality({
    agencyId: req.agencyId,
    attemptId: req.params.id,
    fillReport: req.body,
  });
  res.json({ attempt });
}));

router.get('/attempts/:id/diagnostic-export', requireAuth, asyncRoute(async (req, res) => {
  const attempt = await getAttempt(req.agencyId, req.params.id);
  const diagnostic = exportDiagnostic(attempt);
  res.json({ diagnostic });
}));

/** Mock official environment only — operator records signal; never auto-resubmits */
router.post('/mock-official-signal', requireAuth, asyncRoute(async (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MOCK_SIGNALS !== 'true') {
    return res.status(403).json({ error: 'Mock signals disabled in production' });
  }
  const { attemptId, officialMessage, serverRejectedBooking, quotaCountAtObservation, quotaFreshness } = req.body;
  if (!attemptId) return res.status(400).json({ error: 'attemptId required' });

  const result = await classifyAndApply({
    agencyId: req.agencyId,
    attemptId,
    signals: {
      officialMessage,
      serverRejectedBooking: Boolean(serverRejectedBooking),
      quotaCountAtObservation,
      quotaFreshness,
    },
  });

  res.json({
    ...result,
    notice: 'Signal recorded for QA — no automatic resubmission initiated',
  });
}));

export default router;