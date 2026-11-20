import express from 'express';
import { MOCK_SCENARIOS } from '@darshan-desk/quota';
import { requireAuth } from '../middleware/auth.js';
import { fetchQuotaDashboard, recordManualObservation } from '../services/quotaService.js';

const router = express.Router();

const ALLOWED_PROVIDERS = ['mock', 'manual', 'approved_official'];

router.get('/dashboard', requireAuth, async (req, res) => {
  const provider = req.query.provider || 'mock';
  if (!ALLOWED_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: 'Invalid provider' });
  }

  const mockScenario = req.query.scenario;
  if (mockScenario && !MOCK_SCENARIOS.includes(mockScenario)) {
    return res.status(400).json({ error: 'Invalid mock scenario' });
  }

  try {
    const payload = await fetchQuotaDashboard({
      agencyId: req.agencyId,
      operatorId: req.operator._id,
      providerKind: provider,
      mockScenario,
      bookingCategory: req.query.bookingCategory,
    });
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Quota fetch failed' });
  }
});

router.post('/manual', requireAuth, async (req, res) => {
  const { source, raw, bookingCategory, policyVersion, observedAtUtc } = req.body;
  if (!source || !raw || typeof raw !== 'object') {
    return res.status(400).json({ error: 'source and raw observation object required' });
  }
  const observation = await recordManualObservation({
    agencyId: req.agencyId,
    operatorId: req.operator._id,
    input: { source, raw, bookingCategory, policyVersion, observedAtUtc },
  });
  res.status(201).json({ observation });
});

router.get('/scenarios', requireAuth, (_req, res) => {
  res.json({ scenarios: MOCK_SCENARIOS, providers: ALLOWED_PROVIDERS });
});

export default router;