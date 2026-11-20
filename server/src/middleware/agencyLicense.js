import { Agency } from '../models/index.js';

export function isLicenseEnforced() {
  return process.env.LICENSE_ENFORCE === 'true';
}

export function skipLicenseEnforcement(req, _res, next) {
  req._skipLicense = true;
  next();
}

export async function assertAgencyLicense(agencyId) {
  if (!isLicenseEnforced()) return;
  if (!agencyId) {
    const err = new Error('Agency context required');
    err.status = 403;
    err.code = 'LICENSE_UNKNOWN';
    throw err;
  }
  const agency = await Agency.findById(agencyId).select('licenseStatus licenseExpiresAt');
  if (!agency) {
    const err = new Error('Agency not found');
    err.status = 403;
    err.code = 'LICENSE_UNKNOWN';
    throw err;
  }
  denyUnlessActive(agency);
}

export function licenseDenialForAgency(agency) {
  if (!agency) return { status: 403, code: 'LICENSE_UNKNOWN', message: 'Agency not found' };
  try {
    denyUnlessActive(agency);
    return null;
  } catch (e) {
    return { status: e.status || 403, code: e.code, message: e.message };
  }
}

function denyUnlessActive(agency) {
  if (agency.licenseStatus === 'revoked') {
    const err = new Error('Agency license revoked — contact DarshanDesk support');
    err.status = 403;
    err.code = 'LICENSE_REVOKED';
    throw err;
  }
  if (agency.licenseStatus === 'suspended') {
    const err = new Error('Agency subscription suspended');
    err.status = 403;
    err.code = 'LICENSE_SUSPENDED';
    throw err;
  }
  if (agency.licenseExpiresAt && new Date(agency.licenseExpiresAt) < new Date()) {
    const err = new Error('Agency license expired');
    err.status = 403;
    err.code = 'LICENSE_EXPIRED';
    throw err;
  }
  if (agency.licenseStatus !== 'active' && agency.licenseStatus !== 'trial') {
    const err = new Error('Agency license not active');
    err.status = 403;
    err.code = 'LICENSE_INACTIVE';
    throw err;
  }
}

export async function requireActiveLicense(req, res, next) {
  if (!isLicenseEnforced() || req._skipLicense) return next();
  if (!req.agencyId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const agency = await Agency.findById(req.agencyId).select('licenseStatus licenseExpiresAt');
  if (!agency) {
    return res.status(403).json({ error: 'Agency not found', code: 'LICENSE_UNKNOWN' });
  }

  try {
    denyUnlessActive(agency);
  } catch (e) {
    return res.status(e.status || 403).json({ error: e.message, code: e.code });
  }
  next();
}