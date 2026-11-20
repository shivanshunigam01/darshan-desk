import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { BookingPreparation } from '../models/BookingPreparation.js';
import { ExtensionConnection } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBookingPreparation } from '../services/preparationValidation.js';
import { assertAccountUsableForPreparation } from '../services/ttdAccountService.js';
import { createAttemptFromPreparation } from '../services/reliabilityService.js';
import {
  connectExtension,
  disconnectExtension,
  getExtensionSessionSync,
  getFillPayload,
  getOperatorExtensionStatus,
  recordFillReport,
  extensionHeartbeat,
  refreshExtensionAccess,
} from '../services/extensionFillService.js';

const router = express.Router();

function agencyFilter(req) {
  return { agencyId: req.agencyId };
}

router.get('/', requireAuth, async (req, res) => {
  const list = await BookingPreparation.find(agencyFilter(req))
    .sort({ updatedAt: -1 })
    .populate('ttdAccountReferenceId', 'label accountHint')
    .populate('pilgrimIds', 'fullName age gender mobile');
  res.json({ preparations: list });
});

router.get('/:id', requireAuth, async (req, res) => {
  const prep = await BookingPreparation.findOne({ _id: req.params.id, ...agencyFilter(req) })
    .populate('ttdAccountReferenceId')
    .populate('pilgrimIds');
  if (!prep) return res.status(404).json({ error: 'Not found' });
  res.json({ preparation: prep });
});

router.post('/', requireAuth, async (req, res) => {
  const {
    ttdAccountReferenceId,
    bookingCategory,
    trustCategory,
    donationAmount,
    pilgrimIds,
    preferredDate,
  } = req.body;

  if (!ttdAccountReferenceId || !bookingCategory || donationAmount == null) {
    return res.status(400).json({ error: 'ttdAccountReferenceId, bookingCategory, and donationAmount are required' });
  }

  await assertAccountUsableForPreparation(req, ttdAccountReferenceId);

  const preparation = await BookingPreparation.create({
    agencyId: req.agencyId,
    operatorId: req.operator._id,
    ttdAccountReferenceId,
    bookingCategory,
    trustCategory: trustCategory || 'SRIVANI',
    donationAmount: Number(donationAmount),
    pilgrimIds: pilgrimIds || [],
    preferredDate: preferredDate ? new Date(preferredDate) : undefined,
    workflowStatus: 'draft',
    validationStatus: 'pending',
  });

  res.status(201).json({ preparation });
});

router.patch('/:id', requireAuth, async (req, res) => {
  const prep = await BookingPreparation.findOne({ _id: req.params.id, ...agencyFilter(req) });
  if (!prep) return res.status(404).json({ error: 'Not found' });
  if (['verified', 'cancelled'].includes(prep.workflowStatus)) {
    return res.status(400).json({ error: 'Cannot edit closed preparation' });
  }

  const allowed = [
    'ttdAccountReferenceId',
    'bookingCategory',
    'donationAmount',
    'pilgrimIds',
    'preferredDate',
    'trustCategory',
  ];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      if (key === 'ttdAccountReferenceId') {
        await assertAccountUsableForPreparation(req, req.body[key]);
        prep[key] = req.body[key];
      } else if (key === 'preferredDate') prep.preferredDate = req.body[key] ? new Date(req.body[key]) : undefined;
      else if (key === 'donationAmount') prep.donationAmount = Number(req.body[key]);
      else prep[key] = req.body[key];
    }
  }
  prep.validationStatus = 'pending';
  prep.validationErrors = [];
  if (prep.workflowStatus === 'validated') prep.workflowStatus = 'draft';
  prep.contentRevision = (prep.contentRevision || 1) + 1;
  await prep.save();
  res.json({ preparation: prep });
});

router.post('/:id/consent', requireAuth, async (req, res) => {
  const prep = await BookingPreparation.findOne({ _id: req.params.id, ...agencyFilter(req) });
  if (!prep) return res.status(404).json({ error: 'Not found' });
  const { acknowledged } = req.body;
  if (!acknowledged) {
    return res.status(400).json({
      error:
        'Consent not recorded. Operator must acknowledge that DarshanDesk does not submit legal declarations on their behalf.',
    });
  }
  prep.consentRecordedAt = new Date();
  prep.consentRecordedBy = req.operator._id;
  await prep.save();
  res.json({ preparation: prep });
});

router.post('/:id/validate', requireAuth, async (req, res) => {
  const prep = await BookingPreparation.findOne({ _id: req.params.id, ...agencyFilter(req) });
  if (!prep) return res.status(404).json({ error: 'Not found' });

  const result = await validateBookingPreparation(prep, {
    requireConsent: true,
    consentRecordedAt: prep.consentRecordedAt,
  });

  prep.validationErrors = result.errors;
  prep.validationStatus = result.passed ? 'passed' : 'failed';
  if (result.policy) prep.policyVersion = result.policy.policyVersion;
  if (result.passed) prep.workflowStatus = 'validated';
  await prep.save();

  if (result.passed) {
    await createAttemptFromPreparation({
      agencyId: req.agencyId,
      operatorId: req.operator._id,
      preparationId: prep._id,
    }).catch(() => null);
  }

  res.json({
    preparation: prep,
    checklist: buildChecklist(prep, result),
  });
});

router.post('/:id/extension/pair', requireAuth, async (req, res) => {
  const prep = await BookingPreparation.findOne({ _id: req.params.id, ...agencyFilter(req) });
  if (!prep) return res.status(404).json({ error: 'Not found' });
  if (prep.validationStatus !== 'passed') {
    return res.status(400).json({ error: 'Run validation successfully before connecting the extension' });
  }

  const pairingToken = uuidv4();
  const connection = await ExtensionConnection.create({
    agencyId: req.agencyId,
    operatorId: req.operator._id,
    preparationId: prep._id,
    pairingToken,
    status: 'pending',
  });

  prep.extensionSessionId = connection._id.toString();
  prep.workflowStatus = 'extension_connected';
  await prep.save();

  res.json({
    pairingToken,
    connectionId: connection._id,
    preparationId: prep._id,
    allowedAssistFields: ['donationAmount', 'pilgrimNames', 'preferredDate', 'bookingCategory'],
    disclaimer:
      'Extension may only assist with permitted data entry. Operator must complete declarations, authentication, and payment on the official TTD site.',
  });
});

function extensionHeaders(req) {
  return {
    pairingToken: req.headers['x-pairing-token'] || req.body?.pairingToken,
    extensionInstanceId: req.headers['x-extension-instance-id'] || req.body?.extensionInstanceId,
    accessToken: req.headers['x-extension-access-token'] || req.body?.accessToken,
  };
}

router.post('/extension/heartbeat', async (req, res, next) => {
  try {
    const h = extensionHeaders(req);
    const out = await extensionHeartbeat(h.pairingToken, h.extensionInstanceId, h.accessToken);
    res.json({ ok: true, ...out });
  } catch (e) {
    next(e);
  }
});

router.post('/extension/refresh-access', async (req, res, next) => {
  try {
    const h = extensionHeaders(req);
    const out = await refreshExtensionAccess(h.pairingToken, h.extensionInstanceId, h.accessToken);
    res.json(out);
  } catch (e) {
    next(e);
  }
});

router.post('/extension/disconnect', async (req, res, next) => {
  try {
    const h = extensionHeaders(req);
    const out = await disconnectExtension(h.pairingToken, h.extensionInstanceId, h.accessToken);
    res.json(out);
  } catch (e) {
    next(e);
  }
});

router.get('/extension/session-sync', async (req, res, next) => {
  try {
    const h = extensionHeaders(req);
    const out = await getExtensionSessionSync(h.pairingToken, h.extensionInstanceId, h.accessToken);
    res.json(out);
  } catch (e) {
    next(e);
  }
});

router.get('/:id/extension/status', requireAuth, async (req, res) => {
  const prep = await BookingPreparation.findOne({ _id: req.params.id, ...agencyFilter(req) });
  if (!prep) return res.status(404).json({ error: 'Not found' });
  const status = await getOperatorExtensionStatus(prep._id, req.agencyId);
  res.json({ preparationId: prep._id, ...status });
});

router.post('/extension/connect', async (req, res, next) => {
  try {
    const result = await connectExtension(req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/extension/fill-payload', async (req, res, next) => {
  try {
    const h = extensionHeaders(req);
    const selected = req.query.pilgrimIds ? String(req.query.pilgrimIds).split(',') : [];
    const payload = await getFillPayload(h.pairingToken, h.extensionInstanceId, h.accessToken, selected);
    res.json(payload);
  } catch (e) {
    next(e);
  }
});

router.post('/extension/fill-report', async (req, res, next) => {
  try {
    const h = extensionHeaders(req);
    const out = await recordFillReport(h.pairingToken, h.extensionInstanceId, h.accessToken, req.body);
    res.json(out);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/official-awaiting', requireAuth, async (req, res) => {
  const prep = await BookingPreparation.findOne({ _id: req.params.id, ...agencyFilter(req) });
  if (!prep) return res.status(404).json({ error: 'Not found' });
  prep.workflowStatus = 'awaiting_official';
  await prep.save();
  res.json({ preparation: prep });
});

router.post('/:id/record-outcome', requireAuth, async (req, res) => {
  const prep = await BookingPreparation.findOne({ _id: req.params.id, ...agencyFilter(req) });
  if (!prep) return res.status(404).json({ error: 'Not found' });

  const { evidenceType, evidenceReference, note } = req.body;
  if (!evidenceType || !evidenceReference) {
    return res.status(400).json({
      error: 'Official evidence (type and reference) is required. Do not mark complete without proof.',
    });
  }

  prep.officialOutcome = {
    evidenceType,
    evidenceReference,
    recordedAt: new Date(),
    recordedBy: req.operator._id,
    note: note || '',
  };
  prep.workflowStatus = 'verified';
  await prep.save();
  res.json({ preparation: prep });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const prep = await BookingPreparation.findOneAndDelete({ _id: req.params.id, ...agencyFilter(req) });
  if (!prep) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

function buildChecklist(prep, validationResult) {
  return [
    { id: 'policy', label: 'Compared against active TTD policy snapshot', done: Boolean(validationResult.policy) },
    { id: 'donation', label: 'Donation meets official minimum/maximum', done: !validationResult.errors.some((e) => e.includes('Donation')) },
    { id: 'pilgrims', label: 'Pilgrim count within category limit', done: !validationResult.errors.some((e) => e.includes('pilgrim') || e.includes('Pilgrim')) },
    { id: 'profiles', label: 'All pilgrim profiles complete', done: !validationResult.errors.some((e) => e.includes('incomplete')) },
    { id: 'consent', label: 'Operator consent recorded', done: Boolean(prep.consentRecordedAt) },
    { id: 'declarations', label: 'Legal declarations (official site only — not auto-accepted)', done: false, operatorAction: true },
    { id: 'payment', label: 'Payment confirmed on official TTD site', done: false, operatorAction: true },
  ];
}

export default router;