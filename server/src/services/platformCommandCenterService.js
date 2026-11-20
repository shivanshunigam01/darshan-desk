import mongoose from 'mongoose';
import { Agency, Operator, TtdAccountReference, ExtensionConnection } from '../models/index.js';
import { BookingPreparation } from '../models/BookingPreparation.js';
import { BookingAttempt } from '../models/BookingAttempt.js';

const ACTIVE_WINDOW_MS = Number(process.env.PLATFORM_ACTIVE_USER_MS || 30 * 24 * 60 * 60 * 1000);

function activeSince() {
  return new Date(Date.now() - ACTIVE_WINDOW_MS);
}

function activeAgencyFilter() {
  const now = new Date();
  return {
    licenseStatus: 'active',
    $or: [{ licenseExpiresAt: null }, { licenseExpiresAt: { $gt: now } }],
  };
}

function expiredAgencyFilter() {
  const now = new Date();
  return {
    $or: [{ licenseExpiresAt: { $lte: now } }, { licenseStatus: { $in: ['revoked', 'suspended'] } }],
  };
}

function recentAuthActivityFilter(since) {
  return {
    $or: [{ lastActiveAt: { $gte: since } }, { lastLoginAt: { $gte: since } }],
  };
}

export async function getActiveOperatorIds(since = activeSince()) {
  const fromAuth = await Operator.find({
    role: { $ne: 'super_admin' },
    ...recentAuthActivityFilter(since),
  }).distinct('_id');
  const fromExt = await ExtensionConnection.find({
    lastHeartbeatAt: { $gte: since },
    status: 'connected',
    revokedAt: null,
  }).distinct('operatorId');
  const ids = new Set([...fromAuth.map(String), ...fromExt.map(String).filter(Boolean)]);
  return [...ids].map((id) => new mongoose.Types.ObjectId(id));
}

const confirmedVerifiedCond = {
  $and: [
    { $eq: ['$outcome', 'confirmed'] },
    { $in: [{ $type: '$verifiedAt' }, ['date', 'timestamp']] },
  ],
};

export async function getCommandCenterOverview() {
  const since = activeSince();
  const now = new Date();

  const [
    totalAgencies,
    activeAgencies,
    suspendedAgencies,
    totalUsers,
    verifiedAccounts,
    linkedAccounts,
    preparedBookings,
    verifiedConfirmedBookings,
    failedAttempts,
    pendingConfirmations,
    activeSubscriptions,
    expiredSubscriptions,
    activeOperatorIds,
  ] = await Promise.all([
    Agency.countDocuments(),
    Agency.countDocuments(activeAgencyFilter()),
    Agency.countDocuments({ licenseStatus: { $in: ['suspended', 'revoked'] } }),
    Operator.countDocuments({ role: { $ne: 'super_admin' } }),
    TtdAccountReference.countDocuments({ verificationStatus: 'verified', status: { $ne: 'archived' } }),
    TtdAccountReference.countDocuments({ status: { $ne: 'archived' } }),
    BookingPreparation.countDocuments({ validationStatus: 'passed', workflowStatus: { $ne: 'cancelled' } }),
    BookingAttempt.countDocuments({
      outcome: 'confirmed',
      verifiedAt: { $exists: true, $type: 'date' },
    }),
    BookingAttempt.countDocuments({ outcome: { $in: ['failed', 'rejected'] } }),
    BookingAttempt.countDocuments({
      $or: [
        { outcome: 'uncertain' },
        { outcome: 'in_progress', submissionAttempted: true },
      ],
    }),
    Agency.countDocuments(activeAgencyFilter()),
    Agency.countDocuments(expiredAgencyFilter()),
    getActiveOperatorIds(since),
  ]);

  const activeUsers = activeOperatorIds.length;

  return {
    asOf: now.toISOString(),
    activeWindowDays: Math.round(ACTIVE_WINDOW_MS / (24 * 60 * 60 * 1000)),
    cards: {
      totalRegisteredAgencies: totalAgencies,
      activeAgencies,
      suspendedAgencies,
      totalSaasUsers: totalUsers,
      activeUsers,
      verifiedAccounts,
      totalLinkedTtdAccountReferences: linkedAccounts,
      preparedBookings,
      verifiedConfirmedBookings,
      failedBookingAttempts: failedAttempts,
      pendingConfirmations,
      activeSubscriptions,
      expiredSubscriptions,
    },
    notices: [
      'All counts are from DarshanDesk MongoDB records only.',
      'Global TTD quota success counters are never used as agency booking totals.',
      'Active users require recent authentication activity or extension heartbeat.',
    ],
  };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listAgencies({
  search = '',
  subscriptionStatus = '',
  page = 1,
  limit = 20,
} = {}) {
  const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit));
  const take = Math.min(100, Math.max(1, limit));
  const filter = {};
  if (search.trim()) {
    const rx = new RegExp(escapeRegex(search.trim()), 'i');
    filter.$or = [{ name: rx }, { code: rx }];
  }
  if (subscriptionStatus === 'active') Object.assign(filter, activeAgencyFilter());
  if (subscriptionStatus === 'suspended') filter.licenseStatus = { $in: ['suspended', 'revoked'] };
  if (subscriptionStatus === 'expired') Object.assign(filter, expiredAgencyFilter());

  const [total, agencies] = await Promise.all([
    Agency.countDocuments(filter),
    Agency.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(take).lean(),
  ]);

  const agencyIds = agencies.map((a) => a._id);
  const since = activeSince();

  const [operatorCounts, activeCounts, admins, accountCounts, prepStats, attemptStats, lastPrep, lastAttempt] =
    await Promise.all([
      Operator.aggregate([
        { $match: { agencyId: { $in: agencyIds }, role: { $ne: 'super_admin' } } },
        { $group: { _id: '$agencyId', count: { $sum: 1 } } },
      ]),
      Operator.aggregate([
        {
          $match: {
            agencyId: { $in: agencyIds },
            role: { $ne: 'super_admin' },
            ...recentAuthActivityFilter(since),
          },
        },
        { $group: { _id: '$agencyId', count: { $sum: 1 } } },
      ]),
      Operator.find({ agencyId: { $in: agencyIds }, role: 'admin' })
        .select('agencyId displayName email')
        .lean(),
      TtdAccountReference.aggregate([
        { $match: { agencyId: { $in: agencyIds }, status: { $ne: 'archived' } } },
        { $group: { _id: '$agencyId', count: { $sum: 1 } } },
      ]),
      BookingPreparation.aggregate([
        { $match: { agencyId: { $in: agencyIds }, validationStatus: 'passed' } },
        { $group: { _id: '$agencyId', count: { $sum: 1 } } },
      ]),
      BookingAttempt.aggregate([
        {
          $match: {
            agencyId: { $in: agencyIds },
            outcome: 'confirmed',
            verifiedAt: { $exists: true, $type: 'date' },
          },
        },
        { $group: { _id: '$agencyId', count: { $sum: 1 } } },
      ]),
      BookingPreparation.aggregate([
        { $match: { agencyId: { $in: agencyIds } } },
        { $group: { _id: '$agencyId', lastAt: { $max: '$updatedAt' } } },
      ]),
      BookingAttempt.aggregate([
        { $match: { agencyId: { $in: agencyIds } } },
        { $group: { _id: '$agencyId', lastAt: { $max: '$updatedAt' } } },
      ]),
    ]);

  const mapCount = (rows) => new Map(rows.map((r) => [String(r._id), r.count]));
  const mapMax = (rows) => new Map(rows.map((r) => [String(r._id), r.lastAt]));
  const adminByAgency = new Map();
  for (const a of admins) {
    if (!adminByAgency.has(String(a.agencyId))) adminByAgency.set(String(a.agencyId), a);
  }

  const rows = agencies.map((agency) => {
    const id = String(agency._id);
    const lastPrepAt = mapMax(lastPrep).get(id);
    const lastAttemptAt = mapMax(lastAttempt).get(id);
    const lastActivity = [lastPrepAt, lastAttemptAt, agency.updatedAt]
      .filter(Boolean)
      .sort((a, b) => new Date(b) - new Date(a))[0];

    let subscriptionStatusLabel = agency.licenseStatus || 'trial';
    if (agency.licenseExpiresAt && new Date(agency.licenseExpiresAt) < new Date()) {
      subscriptionStatusLabel = 'expired';
    }

    const admin = adminByAgency.get(id);
    return {
      id,
      name: agency.name,
      code: agency.code,
      administratorName: admin?.displayName || '—',
      administratorEmail: admin?.email ? maskEmail(admin.email) : '—',
      subscriptionPlan: agency.subscriptionPlan || 'standard',
      licensedOperatorCount: mapCount(operatorCounts).get(id) || 0,
      activeOperators: mapCount(activeCounts).get(id) || 0,
      linkedAccountCount: mapCount(accountCounts).get(id) || 0,
      preparedBookings: mapCount(prepStats).get(id) || 0,
      confirmedBookings: mapCount(attemptStats).get(id) || 0,
      subscriptionStatus: subscriptionStatusLabel,
      lastActivity: lastActivity ? new Date(lastActivity).toISOString() : null,
    };
  });

  return { page, limit: take, total, rows };
}

export async function listAccountReferences({
  search = '',
  agencyId = '',
  verificationStatus = '',
  page = 1,
  limit = 25,
} = {}) {
  const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit));
  const take = Math.min(100, Math.max(1, limit));
  const filter = { status: { $ne: 'archived' } };
  if (agencyId && mongoose.isValidObjectId(agencyId)) filter.agencyId = agencyId;
  if (verificationStatus) filter.verificationStatus = verificationStatus;
  if (search.trim()) {
    const rx = new RegExp(escapeRegex(search.trim()), 'i');
    filter.$or = [{ label: rx }, { accountHint: rx }, { maskedIdentifier: rx }];
  }

  const [total, accounts] = await Promise.all([
    TtdAccountReference.countDocuments(filter),
    TtdAccountReference.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(take).populate('agencyId', 'name code').lean(),
  ]);

  const accountIds = accounts.map((a) => a._id);

  const attemptStats = await BookingAttempt.aggregate([
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
        attempts: { $sum: 1 },
        confirmed: { $sum: { $cond: [confirmedVerifiedCond, 1, 0] } },
        failures: { $sum: { $cond: [{ $in: ['$outcome', ['failed', 'rejected']] }, 1, 0] } },
        lastAt: { $max: '$updatedAt' },
      },
    },
  ]);

  const statsMap = new Map(attemptStats.map((r) => [String(r._id), r]));

  const rows = accounts.map((acct) => {
    const id = String(acct._id);
    const stats = statsMap.get(id) || { attempts: 0, confirmed: 0, failures: 0 };
    const masked = acct.maskedIdentifier || acct.accountHint || '****';
    const verifiedName =
      acct.verificationStatus === 'verified' && acct.authorizationStatus === 'authorized'
        ? acct.lastVerifiedDisplayName || acct.label
        : undefined;
    return {
      id,
      agencyName: acct.agencyId?.name || '—',
      agencyCode: acct.agencyId?.code,
      maskedAccountIdentifier: masked,
      label: acct.label,
      verifiedAccountName: verifiedName,
      verificationStatus: acct.verificationStatus,
      authorizationStatus: acct.authorizationStatus,
      bookingAttempts: stats.attempts,
      confirmedBookings: stats.confirmed,
      failures: stats.failures,
      lastActivity: stats.lastAt ? new Date(stats.lastAt).toISOString() : acct.lastUsedAt?.toISOString?.() || acct.updatedAt?.toISOString?.(),
    };
  });

  return { page, limit: take, total, rows };
}

export async function getPlatformBookingAnalytics({ from, to, agencyId } = {}) {
  const match = {};
  if (from || to) {
    match.startedAt = {};
    if (from) match.startedAt.$gte = new Date(from);
    if (to) match.startedAt.$lte = new Date(to);
  }
  if (agencyId && mongoose.isValidObjectId(agencyId)) {
    match.agencyId = new mongoose.Types.ObjectId(agencyId);
  }

  const [
    totalRow,
    perAgencyAgg,
    dateTrendAgg,
    categoryAgg,
    errorAgg,
    unconfirmedAgg,
    appFailureAgg,
    perAccountAgg,
  ] = await Promise.all([
    BookingAttempt.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          attempts: { $sum: 1 },
          confirmed: { $sum: { $cond: [confirmedVerifiedCond, 1, 0] } },
        },
      },
    ]),
    BookingAttempt.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$agencyId',
          attempts: { $sum: 1 },
          confirmed: { $sum: { $cond: [confirmedVerifiedCond, 1, 0] } },
        },
      },
      { $sort: { confirmed: -1 } },
    ]),
    BookingAttempt.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } },
          attempts: { $sum: 1 },
          confirmed: { $sum: { $cond: [confirmedVerifiedCond, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    BookingAttempt.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ['$bookingCategory', 'UNKNOWN'] },
          total: { $sum: 1 },
          confirmed: { $sum: { $cond: [confirmedVerifiedCond, 1, 0] } },
        },
      },
    ]),
    BookingAttempt.aggregate([
      { $match: { ...match, $or: [{ errorCode: { $ne: null } }, { errorClass: { $ne: null } }] } },
      {
        $group: {
          _id: { $ifNull: ['$errorCode', '$errorClass'] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]),
    BookingAttempt.aggregate([
      {
        $match: {
          ...match,
          $or: [{ outcome: 'uncertain' }, { outcome: 'in_progress', submissionAttempted: true }],
        },
      },
      { $group: { _id: '$outcome', count: { $sum: 1 } } },
    ]),
    BookingAttempt.aggregate([
      {
        $match: {
          ...match,
          $or: [{ errorStage: 'application' }, { errorCode: 'APPLICATION_ERROR' }, { errorClass: 'APPLICATION_ERROR' }],
        },
      },
      {
        $group: {
          _id: { $ifNull: ['$errorCode', { $ifNull: ['$errorClass', 'APPLICATION'] }] },
          count: { $sum: 1 },
        },
      },
    ]),
    BookingAttempt.aggregate([
      { $match: match },
      {
        $lookup: {
          from: 'bookingpreparations',
          localField: 'preparationId',
          foreignField: '_id',
          as: 'prep',
        },
      },
      { $unwind: '$prep' },
      { $match: { 'prep.ttdAccountReferenceId': { $ne: null } } },
      {
        $group: {
          _id: '$prep.ttdAccountReferenceId',
          attempts: { $sum: 1 },
          confirmed: { $sum: { $cond: [confirmedVerifiedCond, 1, 0] } },
        },
      },
      { $sort: { confirmed: -1 } },
      { $limit: 50 },
    ]),
  ]);

  const totals = totalRow[0] || { attempts: 0, confirmed: 0 };
  const byCategory = { CURRENT: { total: 0, confirmed: 0 }, ADVANCE: { total: 0, confirmed: 0 }, UNKNOWN: { total: 0, confirmed: 0 } };
  for (const row of categoryAgg) {
    const key = byCategory[row._id] ? row._id : 'UNKNOWN';
    byCategory[key].total += row.total;
    byCategory[key].confirmed += row.confirmed;
  }

  const errorCategories = Object.fromEntries(errorAgg.map((r) => [r._id, r.count]));
  const unconfirmedOutcomes = { uncertain: 0, in_progress: 0 };
  for (const row of unconfirmedAgg) {
    if (row._id === 'uncertain') unconfirmedOutcomes.uncertain = row.count;
    if (row._id === 'in_progress') unconfirmedOutcomes.in_progress = row.count;
  }
  const applicationFailures = Object.fromEntries(appFailureAgg.map((r) => [r._id, r.count]));

  const agencyIds = perAgencyAgg.map((r) => r._id).filter(Boolean);
  const agencyNames = await Agency.find({ _id: { $in: agencyIds } })
    .select('name code')
    .lean();
  const nameMap = new Map(agencyNames.map((x) => [String(x._id), x]));

  const perAgencyConfirmed = perAgencyAgg.map((r) => ({
    agencyId: String(r._id),
    agencyName: nameMap.get(String(r._id))?.name || String(r._id),
    confirmed: r.confirmed,
    attempts: r.attempts,
  }));

  const dateTrend = dateTrendAgg
    .filter((r) => r._id)
    .map((r) => ({ date: r._id, attempts: r.attempts, confirmed: r.confirmed }));

  const accountIds = perAccountAgg.map((r) => r._id);
  const accountDocs = await TtdAccountReference.find({ _id: { $in: accountIds } })
    .select('label maskedIdentifier accountHint agencyId')
    .populate('agencyId', 'name')
    .lean();
  const accountMap = new Map(accountDocs.map((a) => [String(a._id), a]));

  const perAccountConfirmed = perAccountAgg.map((r) => {
    const acc = accountMap.get(String(r._id));
    return {
      accountId: String(r._id),
      agencyName: acc?.agencyId?.name,
      label: acc?.label,
      maskedIdentifier: acc?.maskedIdentifier || acc?.accountHint,
      confirmed: r.confirmed,
      attempts: r.attempts,
    };
  });

  return {
    window: { from: from || null, to: to || null, agencyId: agencyId || null },
    totals: { attempts: totals.attempts, confirmed: totals.confirmed },
    perAgencyConfirmed,
    perAccountConfirmed,
    dateTrend,
    byCategory,
    errorCategories,
    unconfirmedOutcomes,
    applicationFailures,
    disclaimer: 'Metrics reflect DarshanDesk booking attempts only — not official TTD global success counters.',
  };
}

function maskEmail(email) {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  const visible = user.slice(0, 2);
  return `${visible}***@${domain}`;
}

function csvCell(value) {
  const s = String(value ?? '');
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(headers, rows, pick) {
  const lines = rows.map((r) => pick(r).map(csvCell).join(','));
  return [headers.map(csvCell).join(','), ...lines].join('\n');
}

export function agenciesToCsv(rows) {
  return rowsToCsv(
    [
      'Agency',
      'Code',
      'Administrator',
      'Plan',
      'Licensed operators',
      'Active operators',
      'Linked accounts',
      'Prepared bookings',
      'Confirmed bookings',
      'Subscription status',
      'Last activity',
    ],
    rows,
    (r) => [
      r.name,
      r.code,
      r.administratorName,
      r.subscriptionPlan,
      r.licensedOperatorCount,
      r.activeOperators,
      r.linkedAccountCount,
      r.preparedBookings,
      r.confirmedBookings,
      r.subscriptionStatus,
      r.lastActivity || '',
    ]
  );
}

export function accountsToCsv(rows) {
  return rowsToCsv(
    [
      'Agency',
      'Masked identifier',
      'Label',
      'Verified name',
      'Verification',
      'Attempts',
      'Confirmed',
      'Failures',
      'Last activity',
    ],
    rows,
    (r) => [
      r.agencyName,
      r.maskedAccountIdentifier,
      r.label,
      r.verifiedAccountName || '',
      r.verificationStatus,
      r.bookingAttempts,
      r.confirmedBookings,
      r.failures,
      r.lastActivity || '',
    ]
  );
}