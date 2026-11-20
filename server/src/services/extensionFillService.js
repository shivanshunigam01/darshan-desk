import crypto from 'crypto';
import { auditPreparedPayload, normalizePilgrims } from '@darshan-desk/fill-engine';
import { BookingPreparation } from '../models/BookingPreparation.js';
import { Agency, ExtensionConnection, Pilgrim, TtdAccountReference } from '../models/index.js';
import {
  EXTENSION_ACCESS_TTL_SEC,
  hashAccessToken,
  issueExtensionAccessToken,
  verifyExtensionAccessToken,
} from './extensionAuthService.js';
import { assertAgencyLicense } from '../middleware/agencyLicense.js';
import { sanitizeExtensionFillReport } from '../utils/maskSensitive.js';

const PAIRING_TTL_MS = 30 * 60 * 1000;

export async function connectExtension({ pairingToken, extensionInstanceId, extensionVersion }) {
  if (!pairingToken || !extensionInstanceId) {
    const err = new Error('pairingToken and extensionInstanceId are required');
    err.status = 400;
    throw err;
  }
  if (!/^[a-f0-9-]{36}$/i.test(pairingToken)) {
    const err = new Error('Invalid pairing token format');
    err.status = 400;
    throw err;
  }

  const conn = await ExtensionConnection.findOne({ pairingToken });
  if (!conn) {
    const err = new Error('Unknown or expired pairing token');
    err.status = 404;
    err.code = 'PAIRING_UNKNOWN';
    throw err;
  }

  if (conn.revokedAt) {
    const err = new Error('Pairing revoked — generate a new token from DarshanDesk');
    err.status = 410;
    err.code = 'EXT_ACCESS_REVOKED';
    throw err;
  }

  if (conn.createdAt && Date.now() - new Date(conn.createdAt).getTime() > PAIRING_TTL_MS) {
    const err = new Error('Pairing token expired — generate a new token from DarshanDesk');
    err.status = 410;
    err.code = 'PAIRING_EXPIRED';
    throw err;
  }

  conn.status = 'connected';
  conn.connectedAt = conn.connectedAt || new Date();
  conn.lastHeartbeatAt = new Date();
  conn.extensionInstanceId = extensionInstanceId;
  conn.extensionVersion = extensionVersion || 'unknown';
  conn.secureSessionHash = crypto.createHash('sha256').update(`${pairingToken}:${extensionInstanceId}`).digest('hex');

  const prep = await BookingPreparation.findById(conn.preparationId);
  if (!prep || prep.validationStatus !== 'passed') {
    const err = new Error('Preparation is not validated');
    err.status = 403;
    throw err;
  }

  await assertAgencyLicense(prep.agencyId);

  const agency = await Agency.findById(prep.agencyId);
  const account = await TtdAccountReference.findById(prep.ttdAccountReferenceId);
  const operator = await import('../models/index.js').then((m) =>
    m.Operator.findById(prep.operatorId).select('displayName email')
  );
  const { accessToken, expiresAt, expiresInSec } = issueExtensionAccessToken(conn, prep.agencyId, prep._id);
  conn.accessTokenHash = hashAccessToken(accessToken);
  conn.accessTokenExpiresAt = expiresAt;
  await conn.save();

  return {
    ok: true,
    event: 'EXTENSION_PAIR_SUCCESS',
    preparationId: prep._id.toString(),
    agencyName: agency?.name || 'Agency',
    operatorName: operator?.displayName || operator?.email,
    ttdAccountLabel: account?.label || account?.accountHint || 'TTD account',
    bookingCategory: prep.bookingCategory,
    pilgrimCount: prep.pilgrimIds?.length || 0,
    donationAmount: prep.donationAmount,
    validationStatus: prep.validationStatus,
    workflowStatus: prep.workflowStatus,
    contentRevision: prep.contentRevision || 1,
    updatedAt: prep.updatedAt?.toISOString?.() || new Date().toISOString(),
    mappingProfileId: 'live-srivani-current-v1',
    accessToken,
    accessTokenExpiresAt: expiresAt.toISOString(),
    accessTokenExpiresInSec: expiresInSec,
    allowedAssistFields: ['pilgrimProfiles', 'donationAmount', 'bookingCategory', 'preferredDate'],
    disclaimer:
      'Permitted fields only. No passwords, OTP, CAPTCHA, tokens, declarations, booking submit, or payment automation.',
  };
}

export async function extensionHeartbeat(pairingToken, extensionInstanceId, accessToken) {
  const conn = await assertSecureConnection(pairingToken, extensionInstanceId, accessToken);
  return {
    event: 'SESSION_STATUS_CHANGED',
    status: 'active',
    lastHeartbeatAt: conn.lastHeartbeatAt,
    accessTokenExpiresAt: conn.accessTokenExpiresAt,
  };
}

export async function refreshExtensionAccess(pairingToken, extensionInstanceId, accessToken) {
  const conn = await assertSecureConnection(pairingToken, extensionInstanceId, accessToken);
  const prep = await BookingPreparation.findById(conn.preparationId);
  const { accessToken: newToken, expiresAt, expiresInSec } = issueExtensionAccessToken(conn, prep.agencyId, prep._id);
  conn.accessTokenHash = hashAccessToken(newToken);
  conn.accessTokenExpiresAt = expiresAt;
  conn.lastHeartbeatAt = new Date();
  await conn.save();
  return {
    event: 'SESSION_STATUS_CHANGED',
    status: 'refreshed',
    accessToken: newToken,
    accessTokenExpiresAt: expiresAt.toISOString(),
    accessTokenExpiresInSec: expiresInSec,
  };
}

export async function disconnectExtension(pairingToken, extensionInstanceId, accessToken) {
  const conn = await assertSecureConnection(pairingToken, extensionInstanceId, accessToken, { allowExpiredAccess: true });
  conn.status = 'disconnected';
  conn.revokedAt = new Date();
  conn.accessTokenHash = undefined;
  conn.accessTokenExpiresAt = undefined;
  await conn.save();
  return { event: 'DISCONNECT', ok: true };
}

export async function getExtensionSessionSync(pairingToken, extensionInstanceId, accessToken) {
  const conn = await assertSecureConnection(pairingToken, extensionInstanceId, accessToken);
  const prep = await BookingPreparation.findById(conn.preparationId)
    .populate('ttdAccountReferenceId', 'label accountHint')
    .populate('pilgrimIds', 'fullName');
  const agency = await Agency.findById(prep.agencyId);
  const operator = await import('../models/index.js').then((m) =>
    m.Operator.findById(prep.operatorId).select('displayName email')
  );
  return {
    event: 'PREPARATION_SYNC',
    preparationId: prep._id.toString(),
    agencyId: prep.agencyId.toString(),
    agencyName: agency?.name,
    operatorName: operator?.displayName || operator?.email,
    ttdAccountReferenceId: prep.ttdAccountReferenceId?._id?.toString() || prep.ttdAccountReferenceId?.toString(),
    ttdAccountLabel: prep.ttdAccountReferenceId?.label,
    bookingCategory: prep.bookingCategory,
    donationAmount: prep.donationAmount,
    validationStatus: prep.validationStatus,
    contentRevision: prep.contentRevision || 1,
    updatedAt: prep.updatedAt?.toISOString?.() || new Date().toISOString(),
    workflowStatus: prep.workflowStatus,
    pilgrims: (prep.pilgrimIds || []).map((p) => ({ id: p._id.toString(), fullName: p.fullName })),
    pilgrimCount: prep.pilgrimIds?.length || 0,
    lastHeartbeatAt: conn.lastHeartbeatAt,
    accessTokenExpiresAt: conn.accessTokenExpiresAt,
  };
}

export async function getFillPayload(pairingToken, extensionInstanceId, accessToken, selectedPilgrimIds) {
  const conn = await assertSecureConnection(pairingToken, extensionInstanceId, accessToken);
  const prep = await BookingPreparation.findById(conn.preparationId);
  if (!prep) {
    const err = new Error('Preparation not found');
    err.status = 404;
    throw err;
  }
  if (prep.validationStatus !== 'passed') {
    const err = new Error('Preparation is not validated — complete validation in the dashboard');
    err.status = 403;
    err.code = 'VALIDATION';
    throw err;
  }

  const pilgrimObjectIds = selectedPilgrimIds?.length ? selectedPilgrimIds : prep.pilgrimIds.map((id) => id.toString());
  const pilgrims = await Pilgrim.find({ _id: { $in: pilgrimObjectIds }, agencyId: prep.agencyId });
  if (pilgrims.length !== pilgrimObjectIds.length) {
    const err = new Error('Invalid pilgrim selection for this preparation');
    err.status = 400;
    err.code = 'INCORRECT_GROUP';
    throw err;
  }

  const orderedIds = pilgrimObjectIds;
  const pilgrimDocsById = new Map(pilgrims.map((p) => [p._id.toString(), p]));
  const orderedPilgrims = orderedIds.map((id) => pilgrimDocsById.get(id)).filter(Boolean);

  const normalized = normalizePilgrims(
    orderedPilgrims.map((p) => ({
      _id: p._id.toString(),
      fullName: p.fullName,
      age: p.age,
      gender: p.gender,
      idType: p.idType,
      idNumber: p.idNumber,
      mobile: p.mobile,
      city: p.city,
      dateOfBirth: p.dateOfBirth,
    }))
  );

  const rowMappings = orderedIds.map((pilgrimId, rowIndex) => ({ pilgrimId, rowIndex }));
  const payload = {
    preparationId: prep._id.toString(),
    agencyId: prep.agencyId.toString(),
    ttdAccountReferenceId: prep.ttdAccountReferenceId?.toString(),
    mappingProfileId: 'live-srivani-current-v1',
    contentRevision: prep.contentRevision || 1,
    updatedAt: prep.updatedAt?.toISOString?.() || new Date().toISOString(),
    validationStatus: prep.validationStatus,
    pilgrims: normalized,
    permittedScalars: {
      donationAmount: prep.donationAmount,
      bookingCategory: prep.bookingCategory,
      preferredDate: prep.preferredDate ? prep.preferredDate.toISOString().slice(0, 10) : undefined,
    },
    selectedPilgrimIds: orderedIds,
    rowMappings,
    securityNotice:
      'Payload excludes authentication material. Use only on operator-approved pages with verified selectors.',
  };

  await BookingPreparation.updateOne(
    { _id: prep._id },
    { $set: { extensionSnapshotRevision: payload.contentRevision } }
  );

  const fieldAudit = auditPreparedPayload(payload);
  return { ...payload, fieldAudit };
}

export async function recordFillReport(pairingToken, extensionInstanceId, accessToken, report) {
  const conn = await assertSecureConnection(pairingToken, extensionInstanceId, accessToken);
  const prep = await BookingPreparation.findById(conn.preparationId);
  const safeReport = sanitizeExtensionFillReport(report);
  if (prep) {
    const { ingestExtensionFillReport } = await import('./reliabilityService.js');
    await ingestExtensionFillReport({
      agencyId: prep.agencyId,
      preparationId: prep._id,
      fillReport: safeReport,
    }).catch(() => null);
  }
  return { ok: true, event: 'FORM_FILL_RESULT', receivedAt: new Date().toISOString(), resultCount: report?.results?.length ?? 0 };
}

export async function getOperatorExtensionStatus(preparationId, agencyId) {
  const conn = await ExtensionConnection.findOne({ preparationId, agencyId }).sort({ createdAt: -1 });
  if (!conn) return { connected: false };
  return {
    connected: conn.status === 'connected' && !conn.revokedAt,
    status: conn.status,
    lastHeartbeatAt: conn.lastHeartbeatAt,
    extensionVersion: conn.extensionVersion,
    revoked: Boolean(conn.revokedAt),
    accessExpiresAt: conn.accessTokenExpiresAt,
  };
}

async function assertSecureConnection(pairingToken, extensionInstanceId, accessToken, opts = {}) {
  if (!pairingToken || !extensionInstanceId) {
    const err = new Error('Missing pairing credentials');
    err.status = 401;
    throw err;
  }
  const conn = await ExtensionConnection.findOne({ pairingToken });
  if (!conn || conn.status !== 'connected') {
    const err = new Error('Extension session not connected');
    err.status = 401;
    throw err;
  }
  if (conn.revokedAt) {
    const err = new Error('Extension access revoked');
    err.status = 403;
    err.code = 'EXT_ACCESS_REVOKED';
    throw err;
  }
  const expected = crypto.createHash('sha256').update(`${pairingToken}:${extensionInstanceId}`).digest('hex');
  if (conn.secureSessionHash && conn.secureSessionHash !== expected) {
    const err = new Error('Extension instance mismatch');
    err.status = 403;
    throw err;
  }
  if (conn.extensionInstanceId && conn.extensionInstanceId !== extensionInstanceId) {
    const err = new Error('Extension instance mismatch');
    err.status = 403;
    throw err;
  }
  try {
    verifyExtensionAccessToken(accessToken, conn);
  } catch (e) {
    if (!opts.allowExpiredAccess) throw e;
  }
  conn.lastHeartbeatAt = new Date();
  await conn.save();
  return conn;
}