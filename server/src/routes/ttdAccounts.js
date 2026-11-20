import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  assignTtdAccountOperators,
  createTtdAccount,
  getTtdAccount,
  listAgencyOperatorsForAssignment,
  listTtdAccounts,
  recordTtdAccountConsent,
  recordVerificationStatus,
  setTtdAccountStatus,
  updateTtdAccount,
} from '../services/ttdAccountService.js';
import {
  assignOperatorsSchema,
  consentSchema,
  createTtdAccountSchema,
  rejectForbiddenCredentialKeys,
  updateTtdAccountSchema,
  verificationSchema,
} from '../validation/ttdAccountSchemas.js';

const router = express.Router();

router.use(requireAuth);

function parse(schema, body) {
  const r = schema.safeParse(body);
  if (!r.success) {
    const err = new Error(r.error.issues.map((i) => i.message).join('; '));
    err.status = 400;
    throw err;
  }
  return r.data;
}

router.get('/operators/list', async (req, res, next) => {
  try {
    res.json({ operators: await listAgencyOperatorsForAssignment(req) });
  } catch (e) {
    next(e);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const rows = await listTtdAccounts(req, {
      q: req.query.q,
      status: req.query.status,
      operatorId: req.query.operatorId,
    });
    res.json({ accounts: rows });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    rejectForbiddenCredentialKeys(req.body);
    const body = parse(createTtdAccountSchema, req.body);
    const out = await createTtdAccount(req, body);
    res.status(201).json(out);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    res.json(await getTtdAccount(req, req.params.id));
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    rejectForbiddenCredentialKeys(req.body);
    const body = parse(updateTtdAccountSchema, req.body);
    res.json(await updateTtdAccount(req, req.params.id, body));
  } catch (e) {
    next(e);
  }
});

router.post('/:id/consent', async (req, res, next) => {
  try {
    const body = parse(consentSchema, req.body);
    res.json(await recordTtdAccountConsent(req, req.params.id, body));
  } catch (e) {
    next(e);
  }
});

router.post('/:id/assign-operators', async (req, res, next) => {
  try {
    const { operatorIds } = parse(assignOperatorsSchema, req.body);
    res.json(await assignTtdAccountOperators(req, req.params.id, operatorIds));
  } catch (e) {
    next(e);
  }
});

router.post('/:id/verification', async (req, res, next) => {
  try {
    const body = parse(verificationSchema, req.body);
    res.json(await recordVerificationStatus(req, req.params.id, body));
  } catch (e) {
    next(e);
  }
});

router.post('/:id/archive', async (req, res, next) => {
  try {
    res.json(await setTtdAccountStatus(req, req.params.id, 'archived'));
  } catch (e) {
    next(e);
  }
});

router.post('/:id/disable', async (req, res, next) => {
  try {
    res.json(await setTtdAccountStatus(req, req.params.id, 'disabled'));
  } catch (e) {
    next(e);
  }
});

router.post('/:id/activate', async (req, res, next) => {
  try {
    res.json(await setTtdAccountStatus(req, req.params.id, 'active'));
  } catch (e) {
    next(e);
  }
});

export default router;