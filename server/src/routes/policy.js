import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TTDPolicySnapshot } from '../models/TTDPolicySnapshot.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { activatePolicyVersion, getActivePolicy } from '../services/policyService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

router.get('/active', requireAuth, async (_req, res) => {
  const policy = await getActivePolicy();
  if (!policy) return res.status(404).json({ error: 'No policy configured' });
  res.json({ policy });
});

router.get('/ui-reference', requireAuth, async (_req, res) => {
  const refPath = path.join(__dirname, '../fixtures/ttdOfficialUiReference.json');
  const reference = JSON.parse(fs.readFileSync(refPath, 'utf8'));
  const policy = await getActivePolicy();
  res.json({ reference, activePolicyVersion: policy?.policyVersion || null });
});

router.get('/', requireAuth, requireAdmin, async (_req, res) => {
  const policies = await TTDPolicySnapshot.find().sort({ capturedAt: -1 });
  res.json({ policies });
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const body = req.body;
  const required = [
    'source',
    'minimumDonation',
    'maximumDonation',
    'maximumCurrentPilgrims',
    'maximumAdvancePilgrims',
    'releaseTime',
    'reportingTime',
    'policyVersion',
  ];
  for (const key of required) {
    if (body[key] === undefined || body[key] === null || body[key] === '') {
      return res.status(400).json({ error: `Missing field: ${key}` });
    }
  }
  if (body.minimumDonation > body.maximumDonation) {
    return res.status(400).json({ error: 'minimumDonation cannot exceed maximumDonation' });
  }
  try {
    const policy = await TTDPolicySnapshot.create({
      ...body,
      capturedAt: body.capturedAt ? new Date(body.capturedAt) : new Date(),
      isActive: Boolean(body.isActive),
    });
    if (body.isActive) await activatePolicyVersion(policy.policyVersion);
    res.status(201).json({ policy });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'policyVersion already exists' });
    throw e;
  }
});

router.post('/:policyVersion/activate', requireAuth, requireAdmin, async (req, res) => {
  const policy = await activatePolicyVersion(req.params.policyVersion);
  res.json({ policy });
});

router.post('/seed-sample', requireAuth, requireAdmin, async (_req, res) => {
  const samplePath = path.join(__dirname, '../fixtures/ttdPolicySample.json');
  const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
  let policy = await TTDPolicySnapshot.findOne({ policyVersion: sample.policyVersion });
  if (!policy) {
    policy = await TTDPolicySnapshot.create({ ...sample, isActive: true });
  } else {
    await activatePolicyVersion(sample.policyVersion);
    policy = await TTDPolicySnapshot.findOne({ policyVersion: sample.policyVersion });
  }
  res.json({ policy, note: 'Sample fixture values — replace with current official data.' });
});

export default router;