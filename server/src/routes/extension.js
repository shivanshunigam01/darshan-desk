import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { BookingPreparation } from '../models/BookingPreparation.js';

const router = express.Router();

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