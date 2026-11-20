import mongoose from 'mongoose';
import { BookingAttempt } from '../models/BookingAttempt.js';
import { BookingPreparation } from '../models/BookingPreparation.js';
import { Operator, TtdAccountReference } from '../models/index.js';
import { TtdAccountAuditLog } from '../models/TtdAccountAuditLog.js';

const FORBIDDEN_BODY_KEYS = /password|otp|captcha|cookie|session/i;

export function maskLoginIdentifier(identifier) {
  if (!identifier) return '—';
  const s = String(identifier).trim();
  if (s.includes('@')) {
    const [user, domain] = s.split('@');
    const u = user.length <= 2 ? '*' : `${user.slice(0, 2)}***`;
    return `${u}@${domain}`;
  }
  if (s.length <= 4) return '****';
  return `****${s.slice(-4)}`;
}

async function auditLog(req, action, accountId, extra = {}) {
  const row = {
    type: 'ttd_account_audit',
    at: new Date().toISOString(),
    action,
    accountId: accountId?.toString?.(),
    agencyId: req.agencyId?.toString?.(),
    operatorId: req.operator?._id?.toString?.(),
    role: req.operator?.role,
    ...extra,
  };
  console.log(JSON.stringify(row));
  if (req.agencyId && req.operator?._id && accountId) {
    await TtdAccountAuditLog.create({
      agencyId: req.agencyId,
      accountId,
      operatorId: req.operator._id,
      role: req.operator.role,
      action,
      meta: extra,
    }).catch(() => {});
  }
}

export async function listAgencyOperatorsForAssignment(req) {
  if (!isAdmin(req)) {
    const err = new Error('Admin role required');
    err.status = 403;
    throw err;
  }
  const operators = await Operator.find({ agencyId: req.agencyId, role: { $ne: 'super_admin' } })
    .select('displayName email role')
    .sort({ displayName: 1 })
    .lean();
  return operators.map((o) => ({
    _id: o._id,
    displayName: o.displayName,
    email: o.email,
    role: o.role,
  }));
}

export function stripForbiddenCredentialFields(body) {
  const out = { ...body };
  for (const key of Object.keys(out)) {
    if (FORBIDDEN_BODY_KEYS.test(key)) delete out[key];
  }
  return out;
}

function isAdmin(req) {
  return req.operator?.role === 'admin';
}

export async function listTtdAccounts(req, { q, status, operatorId } = {}) {
  const and = [];
  if (!isAdmin(req)) {
    and.push({
      $or: [{ assignedOperatorIds: req.operator._id }, { ownerId: req.operator._id }],
    });
  }
  if (q) {
    and.push({
      $or: [
        { label: new RegExp(q, 'i') },
        { loginIdentifier: new RegExp(q, 'i') },
        { lastVerifiedDisplayName: new RegExp(q, 'i') },
      ],
    });
  }
  const filter = { agencyId: req.agencyId };
  if (status) filter.status = status;
  else filter.status = { $ne: 'archived' };
  if (operatorId && isAdmin(req)) {
    filter.assignedOperatorIds = new mongoose.Types.ObjectId(operatorId);
  }
  if (and.length) filter.$and = and;

  const accounts = await TtdAccountReference.find(filter).sort({ label: 1 }).lean();
  const ids = accounts.map((a) => a._id);
  const statsMap = await buildAccountStats(req.agencyId, ids);
  const operatorMap = await loadOperatorLabels(req.agencyId, accounts);

  return accounts.map((a) => presentAccountRow(a, statsMap.get(String(a._id)), operatorMap));
}

/** Booking wizard dropdown — active + authorized + operator may use */
export async function listTtdAccountsForBooking(req) {
  const filter = {
    agencyId: req.agencyId,
    status: { $in: ['active', null] },
    $or: [
      { authorizationStatus: 'authorized' },
      { isAuthorized: true, authorizationStatus: 'pending' },
    ],
  };
  if (!isAdmin(req)) {
    filter.$and = [
      {
        $or: [{ assignedOperatorIds: req.operator._id }, { ownerId: req.operator._id }, { assignedOperatorIds: { $size: 0 } }],
      },
    ];
  }
  const accounts = await TtdAccountReference.find(filter).sort({ label: 1 });
  return accounts.map(presentAccountPublic);
}

export async function getTtdAccount(req, accountId) {
  const access = { _id: accountId, agencyId: req.agencyId };
  if (!isAdmin(req)) {
    access.$or = [{ assignedOperatorIds: req.operator._id }, { ownerId: req.operator._id }];
  }
  const account = await TtdAccountReference.findOne(access);
  if (!account) {
    const err = new Error('TTD account reference not found');
    err.status = 404;
    throw err;
  }
  const stats = (await buildAccountStats(req.agencyId, [account._id])).get(String(account._id));
  return presentAccountDetail(account, stats);
}

export async function createTtdAccount(req, body) {
  const clean = stripForbiddenCredentialFields(body);
  const { accountLabel, loginIdentifier, ownerId, maskedIdentifier } = clean;
  if (!accountLabel || !loginIdentifier) {
    const err = new Error('accountLabel and loginIdentifier are required');
    err.status = 400;
    throw err;
  }

  const account = await TtdAccountReference.create({
    agencyId: req.agencyId,
    label: accountLabel,
    loginIdentifier: String(loginIdentifier).trim(),
    maskedIdentifier: maskedIdentifier || maskLoginIdentifier(loginIdentifier),
    accountHint: maskedIdentifier || maskLoginIdentifier(loginIdentifier),
    ownerId: ownerId || req.operator._id,
    createdByOperatorId: req.operator._id,
    assignedOperatorIds: clean.assignedOperatorIds?.length
      ? clean.assignedOperatorIds
      : [req.operator._id],
    authorizationStatus: 'pending',
    verificationStatus: 'unverified',
    credentialMode: 'reference_only',
    status: 'active',
    isAuthorized: false,
  });

  await auditLog(req, 'create', account._id);
  return presentAccountDetail(account, null);
}

export async function updateTtdAccount(req, accountId, body) {
  const clean = stripForbiddenCredentialFields(body);
  const account = await assertAccountWritable(req, accountId);
  if (clean.accountLabel) account.label = clean.accountLabel;
  if (clean.loginIdentifier) {
    account.loginIdentifier = clean.loginIdentifier;
    if (!clean.maskedIdentifier) account.maskedIdentifier = maskLoginIdentifier(clean.loginIdentifier);
    account.accountHint = account.maskedIdentifier;
  }
  if (clean.maskedIdentifier) {
    account.maskedIdentifier = clean.maskedIdentifier;
    account.accountHint = clean.maskedIdentifier;
  }
  if (clean.ownerId && isAdmin(req)) account.ownerId = clean.ownerId;
  await account.save();
  await auditLog(req, 'update', account._id);
  return getTtdAccount(req, accountId);
}

export async function recordTtdAccountConsent(req, accountId, { acknowledged }) {
  if (!acknowledged) {
    const err = new Error('Consent acknowledgment required');
    err.status = 400;
    throw err;
  }
  const account = await assertAccountWritable(req, accountId);
  account.consentRecordedAt = new Date();
  account.consentRecordedBy = req.operator._id;
  account.authorizationStatus = 'authorized';
  account.isAuthorized = account.status === 'active';
  await account.save();
  await auditLog(req, 'consent', account._id);
  return getTtdAccount(req, accountId);
}

export async function assignTtdAccountOperators(req, accountId, operatorIds) {
  if (!isAdmin(req)) {
    const err = new Error('Admin role required to assign operators');
    err.status = 403;
    throw err;
  }
  const account = await assertAccountWritable(req, accountId, true);
  const unique = [...new Set((operatorIds || []).map(String))];
  const valid = await Operator.countDocuments({
    _id: { $in: unique },
    agencyId: req.agencyId,
  });
  if (valid !== unique.length) {
    const err = new Error('One or more operators are not in this agency');
    err.status = 400;
    throw err;
  }
  account.assignedOperatorIds = unique;
  await account.save();
  await auditLog(req, 'assign_operators', account._id, { count: unique.length });
  return getTtdAccount(req, accountId);
}

export async function recordVerificationStatus(req, accountId, { displayName, verificationStatus }) {
  const account = await assertAccountWritable(req, accountId);
  if (!['verified', 'failed', 'expired', 'unverified'].includes(verificationStatus)) {
    const err = new Error('Invalid verificationStatus');
    err.status = 400;
    throw err;
  }
  account.verificationStatus = verificationStatus;
  account.lastVerifiedAt = new Date();
  if (displayName) account.lastVerifiedDisplayName = displayName;
  await account.save();
  await auditLog(req, 'verification_recorded', account._id, { verificationStatus });
  return getTtdAccount(req, accountId);
}

export async function setTtdAccountStatus(req, accountId, status) {
  if (!['active', 'disabled', 'archived'].includes(status)) {
    const err = new Error('Invalid status');
    err.status = 400;
    throw err;
  }
  const account = await assertAccountWritable(req, accountId, status === 'archived');
  account.status = status;
  account.isAuthorized = status === 'active' && account.authorizationStatus === 'authorized';
  await account.save();
  await auditLog(req, `status_${status}`, account._id);
  return getTtdAccount(req, accountId);
}

export async function assertAccountUsableForPreparation(req, accountId) {
  const account = await TtdAccountReference.findOne({
    _id: accountId,
    agencyId: req.agencyId,
    status: { $in: ['active', null] },
    $or: [{ authorizationStatus: 'authorized' }, { isAuthorized: true }],
  });
  if (!account) {
    const err = new Error('TTD account not available');
    err.status = 400;
    throw err;
  }
  if (!isAdmin(req)) {
    const allowed =
      account.assignedOperatorIds?.some((id) => id.equals(req.operator._id)) ||
      account.ownerId?.equals(req.operator._id);
    if (!allowed) {
      const err = new Error('TTD account not assigned to you');
      err.status = 403;
      throw err;
    }
  }
  account.lastUsedAt = new Date();
  await account.save();
  return account;
}

async function assertAccountWritable(req, accountId, adminOnly = false) {
  if (adminOnly && !isAdmin(req)) {
    const err = new Error('Admin role required');
    err.status = 403;
    throw err;
  }
  const access = { _id: accountId, agencyId: req.agencyId };
  if (!isAdmin(req)) {
    access.$or = [{ assignedOperatorIds: req.operator._id }, { ownerId: req.operator._id }];
  }
  const account = await TtdAccountReference.findOne(access);
  if (!account) {
    const err = new Error('TTD account reference not found');
    err.status = 404;
    throw err;
  }
  return account;
}

async function buildAccountStats(agencyId, accountIds) {
  const map = new Map();
  if (!accountIds.length) return map;

  const agencyOid = new mongoose.Types.ObjectId(String(agencyId));

  const prepAgg = await BookingPreparation.aggregate([
    { $match: { agencyId: agencyOid, ttdAccountReferenceId: { $in: accountIds } } },
    {
      $group: {
        _id: '$ttdAccountReferenceId',
        bookingsPrepared: { $sum: 1 },
        lastBookingDate: { $max: '$updatedAt' },
      },
    },
  ]);

  const attemptAgg = await BookingAttempt.aggregate([
    { $match: { agencyId: agencyOid } },
    {
      $lookup: {
        from: 'bookingpreparations',
        localField: 'preparationId',
        foreignField: '_id',
        as: 'prep',
      },
    },
    { $unwind: '$prep' },
    { $match: { 'prep.ttdAccountReferenceId': { $in: accountIds } } },
    {
      $group: {
        _id: '$prep.ttdAccountReferenceId',
        confirmedBookings: {
          $sum: { $cond: [{ $eq: ['$outcome', 'confirmed'] }, 1, 0] },
        },
        failedAttempts: {
          $sum: { $cond: [{ $eq: ['$outcome', 'failed'] }, 1, 0] },
        },
      },
    },
  ]);

  const attemptByAccount = new Map(attemptAgg.map((r) => [String(r._id), r]));

  for (const row of prepAgg) {
    const key = String(row._id);
    const att = attemptByAccount.get(key);
    map.set(key, {
      bookingsPrepared: row.bookingsPrepared,
      lastBookingDate: row.lastBookingDate,
      confirmedBookings: att?.confirmedBookings ?? 0,
      failedAttempts: att?.failedAttempts ?? 0,
    });
  }

  for (const row of attemptAgg) {
    const key = String(row._id);
    if (!map.has(key)) {
      map.set(key, {
        bookingsPrepared: 0,
        lastBookingDate: null,
        confirmedBookings: row.confirmedBookings,
        failedAttempts: row.failedAttempts,
      });
    }
  }

  for (const id of accountIds) {
    const key = String(id);
    if (!map.has(key)) {
      map.set(key, {
        bookingsPrepared: 0,
        confirmedBookings: 0,
        failedAttempts: 0,
        lastBookingDate: null,
      });
    }
  }
  return map;
}

async function loadOperatorLabels(agencyId, accounts) {
  const ids = new Set();
  for (const a of accounts) {
    for (const oid of a.assignedOperatorIds || []) ids.add(String(oid));
    if (a.ownerId) ids.add(String(a.ownerId));
  }
  const operators = await Operator.find({ agencyId, _id: { $in: [...ids] } }).select('displayName email');
  const map = new Map();
  for (const o of operators) map.set(String(o._id), o.displayName || o.email);
  return map;
}

function presentAccountPublic(a) {
  return {
    _id: a._id,
    label: a.label,
    accountHint: a.maskedIdentifier || a.accountHint,
  };
}

function presentAccountRow(a, stats, operatorMap) {
  const assignees = (a.assignedOperatorIds || []).map((id) => operatorMap.get(String(id))).filter(Boolean);
  return {
    _id: a._id,
    accountLabel: a.label,
    maskedLogin: a.maskedIdentifier || a.accountHint,
    verifiedDisplayName: a.lastVerifiedDisplayName || null,
    verificationStatus: a.verificationStatus || 'unverified',
    authorizationStatus: a.authorizationStatus || 'pending',
    lastVerifiedAt: a.lastVerifiedAt,
    bookingsPrepared: stats?.bookingsPrepared ?? 0,
    confirmedBookings: stats?.confirmedBookings ?? 0,
    failedAttempts: stats?.failedAttempts ?? 0,
    lastBookingDate: stats?.lastBookingDate,
    assignedOperators: assignees,
    assignedOperatorIds: (a.assignedOperatorIds || []).map((id) => String(id)),
    primaryAssignedOperator: assignees[0] || operatorMap.get(String(a.ownerId)) || null,
    status: a.status || 'active',
    credentialMode: a.credentialMode || 'reference_only',
  };
}

function presentAccountDetail(account, stats) {
  return {
    account: {
      _id: account._id,
      accountLabel: account.label,
      loginIdentifier: account.loginIdentifier,
      maskedIdentifier: account.maskedIdentifier || account.accountHint,
      ownerId: account.ownerId,
      consentRecordedAt: account.consentRecordedAt,
      authorizationStatus: account.authorizationStatus,
      verificationStatus: account.verificationStatus,
      lastVerifiedAt: account.lastVerifiedAt,
      lastVerifiedDisplayName: account.lastVerifiedDisplayName,
      credentialMode: account.credentialMode,
      lastUsedAt: account.lastUsedAt,
      status: account.status,
      assignedOperatorIds: account.assignedOperatorIds,
      isAuthorized: account.isAuthorized,
      stats: stats || null,
    },
  };
}