import express from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import {
  activateAgencyLicense,
  getAgencyLicenseStatus,
  revokeAgencyLicense,
} from '../services/agencyLicenseService.js';

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get('/license', async (req, res) => {
  const status = await getAgencyLicenseStatus(req.agencyId);
  res.json({ license: status });
});

router.post('/license/activate', async (req, res) => {
  const { licenseKey, expiresAt, mode } = req.body;
  const result = await activateAgencyLicense(req.agencyId, licenseKey, { expiresAt, mode });
  res.json({ license: result });
});

router.post('/license/revoke', async (req, res) => {
  const result = await revokeAgencyLicense(req.agencyId, req.body?.reason);
  res.json({ license: result });
});

export default router;