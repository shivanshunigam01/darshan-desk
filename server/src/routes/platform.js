import express from 'express';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { recordPlatformAdminAccess } from '../services/platformAuditService.js';
import {
  agenciesToCsv,
  accountsToCsv,
  getCommandCenterOverview,
  getPlatformBookingAnalytics,
  listAccountReferences,
  listAgencies,
} from '../services/platformCommandCenterService.js';

const router = express.Router();

router.use(requireAuth, requireSuperAdmin);

router.use((req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode < 400) {
      recordPlatformAdminAccess({
        operatorId: req.operator._id,
        path: req.originalUrl,
        action: req.method === 'GET' ? 'read' : req.method.toLowerCase(),
      });
    }
  });
  next();
});

router.get('/command-center/overview', async (_req, res) => {
  res.json(await getCommandCenterOverview());
});

router.get('/command-center/agencies', async (req, res) => {
  const { search, subscriptionStatus, page, limit } = req.query;
  res.json(
    await listAgencies({
      search: String(search || ''),
      subscriptionStatus: String(subscriptionStatus || ''),
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    })
  );
});

router.get('/command-center/agencies/export.csv', async (req, res) => {
  const { search, subscriptionStatus } = req.query;
  const { rows } = await listAgencies({
    search: String(search || ''),
    subscriptionStatus: String(subscriptionStatus || ''),
    page: 1,
    limit: 5000,
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="agencies-report.csv"');
  res.send(agenciesToCsv(rows));
});

router.get('/command-center/account-references', async (req, res) => {
  const { search, agencyId, verificationStatus, page, limit } = req.query;
  res.json(
    await listAccountReferences({
      search: String(search || ''),
      agencyId: String(agencyId || ''),
      verificationStatus: String(verificationStatus || ''),
      page: Number(page) || 1,
      limit: Number(limit) || 25,
    })
  );
});

router.get('/command-center/account-references/export.csv', async (req, res) => {
  const { search, agencyId, verificationStatus } = req.query;
  const { rows } = await listAccountReferences({
    search: String(search || ''),
    agencyId: String(agencyId || ''),
    verificationStatus: String(verificationStatus || ''),
    page: 1,
    limit: 5000,
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="account-references-report.csv"');
  res.send(accountsToCsv(rows));
});

router.get('/command-center/analytics', async (req, res) => {
  const { from, to, agencyId } = req.query;
  res.json(
    await getPlatformBookingAnalytics({
      from: from ? String(from) : undefined,
      to: to ? String(to) : undefined,
      agencyId: agencyId ? String(agencyId) : undefined,
    })
  );
});

export default router;