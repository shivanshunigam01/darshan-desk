import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Agency, Operator, Pilgrim, TtdAccountReference } from '../models/index.js';
import { BookingPreparation } from '../models/BookingPreparation.js';
import { getAgencyLicenseStatus } from '../services/agencyLicenseService.js';

const router = express.Router();

/** Extension home dashboard — agency-scoped counts (no PII). */
router.get('/home-summary', requireAuth, async (req, res) => {
  const agency = await Agency.findById(req.agencyId).select('name code licenseStatus createdAt');
  const [operatorCount, pilgrimCount, ttdAccountCount, preparationCount, validatedPreparations] = await Promise.all([
    Operator.countDocuments({ agencyId: req.agencyId, role: { $ne: 'super_admin' } }),
    Pilgrim.countDocuments({ agencyId: req.agencyId }),
    TtdAccountReference.countDocuments({ agencyId: req.agencyId, status: { $in: ['active', null] } }),
    BookingPreparation.countDocuments({ agencyId: req.agencyId }),
    BookingPreparation.countDocuments({ agencyId: req.agencyId, validationStatus: 'passed' }),
  ]);

  const createdAt = agency?.createdAt || req.operator.createdAt;
  const accountAgeDays = createdAt
    ? Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000))
    : 0;

  const license = await getAgencyLicenseStatus(req.agencyId);

  res.json({
    agencyName: agency?.name || 'Agency',
    agencyCode: agency?.code,
    licenseStatus: license?.status || agency?.licenseStatus || 'trial',
    operatorCount,
    pilgrimCount,
    ttdAccountCount,
    preparationCount,
    validatedPreparations,
    accountAgeDays,
    agencyCreatedAt: agency?.createdAt,
    yourRole: req.operator.role,
    lastLoginAt: req.operator.lastLoginAt,
  });
});

/** Latest validated preparation for extension sync (agency-scoped). */
router.get('/active-preparation', requireAuth, async (req, res) => {
  const prep = await BookingPreparation.findOne({
    agencyId: req.agencyId,
    operatorId: req.operator._id,
    validationStatus: 'passed',
  })
    .sort({ updatedAt: -1 })
    .populate('pilgrimIds', 'fullName age gender idType')
    .select(
      'validationStatus workflowStatus contentRevision updatedAt pilgrimIds donationAmount bookingCategory'
    );

  if (!prep) {
    return res.json({ active: null });
  }

  const expiresAt = prep.updatedAt
    ? new Date(new Date(prep.updatedAt).getTime() + 24 * 60 * 60 * 1000)
    : null;

  res.json({
    active: {
      preparationId: prep._id,
      selectedPilgrimIds: (prep.pilgrimIds || []).map((p) => p._id || p),
      pilgrims: prep.pilgrimIds,
      revision: prep.contentRevision,
      validationStatus: prep.validationStatus,
      workflowStatus: prep.workflowStatus,
      updatedAt: prep.updatedAt,
      expiresAt,
      bookingCategory: prep.bookingCategory,
      donationAmount: prep.donationAmount,
    },
  });
});

export default router;