import express from 'express';
import { Pilgrim } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { listTtdAccountsForBooking } from '../services/ttdAccountService.js';
import { bumpPreparationsUsingPilgrim } from '../services/preparationRevisionService.js';

const router = express.Router();

router.get('/ttd-accounts', requireAuth, async (req, res) => {
  const accounts = await listTtdAccountsForBooking(req);
  res.json({ accounts });
});

router.get('/pilgrims', requireAuth, async (req, res) => {
  const pilgrims = await Pilgrim.find({ agencyId: req.agencyId }).sort({ fullName: 1 });
  res.json({ pilgrims });
});

router.post('/pilgrims', requireAuth, async (req, res) => {
  const pilgrim = await Pilgrim.create({ ...req.body, agencyId: req.agencyId });
  res.status(201).json({ pilgrim });
});

router.patch('/pilgrims/:id', requireAuth, async (req, res) => {
  const pilgrim = await Pilgrim.findOneAndUpdate(
    { _id: req.params.id, agencyId: req.agencyId },
    req.body,
    { new: true, runValidators: true }
  );
  if (!pilgrim) return res.status(404).json({ error: 'Not found' });
  await bumpPreparationsUsingPilgrim(pilgrim._id, req.agencyId);
  res.json({ pilgrim });
});

router.delete('/pilgrims/:id', requireAuth, async (req, res) => {
  const pilgrim = await Pilgrim.findOneAndDelete({ _id: req.params.id, agencyId: req.agencyId });
  if (!pilgrim) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;