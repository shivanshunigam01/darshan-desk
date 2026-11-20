import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getTtdCountries,
  getTtdIntegrationStatus,
  getTtdPersonLimit,
  getTtdQuotaCurrent,
  getTtdTrusts,
  ttdErrorResponse,
} from '../services/ttdIntegrationService.js';
import { buildSrivaniQuotaPayload } from '../services/srivaniQuotaPresenter.js';
import { TtdProviderError } from '@darshan-desk/ttd-integration';

const router = express.Router();

const MOCK_SCENARIOS = [
  'default',
  'zero_quota',
  'missing_fields',
  'invalid_json',
  'timeout',
  'unauthorized',
  'rate_limited',
  'stale_cache',
  'not_configured',
  'nullable_fields',
  'release_time_change',
];

function scenarioFromQuery(query) {
  const s = query.scenario || query.mockScenario;
  if (!s) return undefined;
  if (!MOCK_SCENARIOS.includes(s)) {
    throw new TtdProviderError('VALIDATION', 'Invalid mock scenario.');
  }
  return s;
}

router.get('/countries', requireAuth, async (req, res) => {
  try {
    const scenario = scenarioFromQuery(req.query);
    const payload = await getTtdCountries(req.agencyId, scenario);
    res.json(payload);
  } catch (e) {
    ttdErrorResponse(res, e);
  }
});

router.get('/trusts', requireAuth, async (req, res) => {
  try {
    const scenario = scenarioFromQuery(req.query);
    const payload = await getTtdTrusts(req.agencyId, scenario);
    res.json(payload);
  } catch (e) {
    ttdErrorResponse(res, e);
  }
});

router.get('/quota/current', requireAuth, async (req, res) => {
  try {
    const scenario = scenarioFromQuery(req.query);
    const force = req.query.refresh === '1' || req.query.force === 'true';
    const quota = await getTtdQuotaCurrent(req.agencyId, { force, mockScenario: scenario });
    const status = getTtdIntegrationStatus(scenario);
    const payload = buildSrivaniQuotaPayload(quota, status);
    res.json(payload);
  } catch (e) {
    ttdErrorResponse(res, e);
  }
});

router.get('/donation/person-limit', requireAuth, async (req, res) => {
  try {
    const scenario = scenarioFromQuery(req.query);
    const payload = await getTtdPersonLimit(req.agencyId, req.query.amount, scenario);
    res.json(payload);
  } catch (e) {
    ttdErrorResponse(res, e);
  }
});

router.get('/integration/status', requireAuth, async (req, res) => {
  try {
    const scenario = scenarioFromQuery(req.query);
    res.json(getTtdIntegrationStatus(scenario));
  } catch (e) {
    ttdErrorResponse(res, e);
  }
});

router.get('/mock-scenarios', requireAuth, (_req, res) => {
  res.json({ scenarios: MOCK_SCENARIOS });
});

export default router;