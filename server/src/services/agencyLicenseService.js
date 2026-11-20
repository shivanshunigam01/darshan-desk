import crypto from 'crypto';
import { Agency } from '../models/index.js';

function hashLicenseKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex');
}

export async function activateAgencyLicense(agencyId, licenseKey, { expiresAt, mode = 'active' } = {}) {
  if (!licenseKey || licenseKey.length < 8) {
    const err = new Error('licenseKey must be at least 8 characters');
    err.status = 400;
    throw err;
  }
  const agency = await Agency.findById(agencyId);
  if (!agency) {
    const err = new Error('Agency not found');
    err.status = 404;
    throw err;
  }

  agency.licenseStatus = mode === 'trial' ? 'trial' : 'active';
  agency.licenseKeyHash = hashLicenseKey(licenseKey);
  agency.licenseKeyLast4 = String(licenseKey).slice(-4);
  agency.licenseActivatedAt = new Date();
  agency.licenseRevokedAt = undefined;
  agency.licenseExpiresAt = expiresAt ? new Date(expiresAt) : undefined;
  await agency.save();

  return {
    agencyId: agency._id.toString(),
    licenseStatus: agency.licenseStatus,
    licenseKeyLast4: agency.licenseKeyLast4,
    licenseExpiresAt: agency.licenseExpiresAt,
    licenseActivatedAt: agency.licenseActivatedAt,
  };
}

export async function revokeAgencyLicense(agencyId, reason) {
  const agency = await Agency.findById(agencyId);
  if (!agency) {
    const err = new Error('Agency not found');
    err.status = 404;
    throw err;
  }
  agency.licenseStatus = 'revoked';
  agency.licenseRevokedAt = new Date();
  agency.licenseRevokeReason = reason || 'Revoked by administrator';
  await agency.save();
  return {
    agencyId: agency._id.toString(),
    licenseStatus: agency.licenseStatus,
    licenseRevokedAt: agency.licenseRevokedAt,
  };
}

export async function getAgencyLicenseStatus(agencyId) {
  const agency = await Agency.findById(agencyId).select(
    'licenseStatus licenseExpiresAt licenseActivatedAt licenseRevokedAt licenseKeyLast4'
  );
  if (!agency) return null;
  return {
    licenseStatus: agency.licenseStatus || 'unknown',
    licenseExpiresAt: agency.licenseExpiresAt,
    licenseActivatedAt: agency.licenseActivatedAt,
    licenseRevokedAt: agency.licenseRevokedAt,
    licenseKeyLast4: agency.licenseKeyLast4,
    enforced: process.env.LICENSE_ENFORCE === 'true',
  };
}