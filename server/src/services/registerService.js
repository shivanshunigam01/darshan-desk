import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { Agency, Operator, Pilgrim, TtdAccountReference } from '../models/index.js';
import { BookingPreparation } from '../models/BookingPreparation.js';
import { ExtensionConnection } from '../models/index.js';
import { signToken } from '../middleware/auth.js';
import { maskLoginIdentifier } from './ttdAccountService.js';
import { validateBookingPreparation } from './preparationValidation.js';

function agencyCodeFromName(name) {
  const slug = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${slug || 'agency'}-${suffix}`;
}

function mapGender(g) {
  const v = String(g).trim().toUpperCase();
  if (v === 'MALE' || v === 'M') return 'M';
  if (v === 'FEMALE' || v === 'F') return 'F';
  if (v === 'TRANSGENDER' || v === 'T' || v === 'O') return 'O';
  return null;
}

export function registrationEnabled() {
  const flag = process.env.EXTENSION_SELF_REGISTRATION;
  if (flag === 'false') return false;
  return true;
}

/**
 * Self-service agency + admin operator + optional onboarding payload for extension-first signup.
 * TTD portal passwords are never accepted or stored.
 */
export async function registerExtensionUser(payload) {
  if (!registrationEnabled()) {
    const err = new Error('Registration is disabled on this server');
    err.status = 403;
    throw err;
  }

  const {
    agencyName,
    displayName,
    email,
    password,
    ttdAccount,
    donationAmount,
    bookingCategory = 'CURRENT',
    pilgrims = [],
    consentAcknowledged = false,
  } = payload;

  const existing = await Operator.findOne({ email: String(email).toLowerCase() });
  if (existing) {
    const err = new Error('An account with this email already exists');
    err.status = 409;
    throw err;
  }

  const agency = await Agency.create({
    name: agencyName.trim(),
    code: agencyCodeFromName(agencyName),
    licenseStatus: 'trial',
  });

  const passwordHash = await bcrypt.hash(password, 12);
  const operator = await Operator.create({
    agencyId: agency._id,
    email: String(email).toLowerCase().trim(),
    passwordHash,
    displayName: displayName.trim(),
    role: 'admin',
    lastLoginAt: new Date(),
    lastActiveAt: new Date(),
  });

  const token = signToken(operator);
  const out = {
    token,
    operator: {
      id: operator._id,
      email: operator.email,
      displayName: operator.displayName,
      agencyId: operator.agencyId,
      role: operator.role,
    },
    agency: { id: agency._id, name: agency.name, code: agency.code },
    onboarding: null,
  };

  const wantsOnboard =
    ttdAccount?.loginIdentifier &&
    ttdAccount?.accountLabel &&
    donationAmount != null &&
    Array.isArray(pilgrims) &&
    pilgrims.length > 0;

  if (!wantsOnboard) {
    return out;
  }

  const req = { agencyId: agency._id, operator };

  const account = await TtdAccountReference.create({
    agencyId: agency._id,
    label: ttdAccount.accountLabel.trim(),
    loginIdentifier: String(ttdAccount.loginIdentifier).trim(),
    maskedIdentifier: maskLoginIdentifier(ttdAccount.loginIdentifier),
    accountHint: maskLoginIdentifier(ttdAccount.loginIdentifier),
    ownerId: operator._id,
    createdByOperatorId: operator._id,
    assignedOperatorIds: [operator._id],
    authorizationStatus: 'authorized',
    isAuthorized: true,
    consentRecordedAt: new Date(),
    consentRecordedBy: operator._id,
    credentialMode: 'reference_only',
    status: 'active',
    verificationStatus: 'unverified',
  });

  const pilgrimDocs = [];
  for (const row of pilgrims) {
    const gender = mapGender(row.gender);
    if (!gender) {
      const err = new Error(`Invalid gender for pilgrim: ${row.fullName}`);
      err.status = 400;
      throw err;
    }
    pilgrimDocs.push(
      await Pilgrim.create({
        agencyId: agency._id,
        fullName: String(row.fullName).trim(),
        age: Number(row.age),
        gender,
        idType: row.idType,
        idNumber: String(row.idNumber).trim(),
        mobile: String(row.mobile || '9000000000').trim(),
        city: String(row.city || 'Tirupati').trim(),
      })
    );
  }

  const preparation = await BookingPreparation.create({
    agencyId: agency._id,
    operatorId: operator._id,
    ttdAccountReferenceId: account._id,
    bookingCategory,
    trustCategory: 'SRIVANI',
    donationAmount: Number(donationAmount),
    pilgrimIds: pilgrimDocs.map((p) => p._id),
    workflowStatus: 'draft',
    validationStatus: 'pending',
  });

  if (consentAcknowledged) {
    preparation.consentRecordedAt = new Date();
    preparation.consentRecordedBy = operator._id;
    await preparation.save();
  }

  const validation = await validateBookingPreparation(preparation, {
    requireConsent: true,
    consentRecordedAt: preparation.consentRecordedAt,
  });

  preparation.validationErrors = validation.errors;
  preparation.validationStatus = validation.passed ? 'passed' : 'failed';
  if (validation.passed) {
    preparation.workflowStatus = 'validated';
  }
  await preparation.save();

  let pairingToken;
  let connectHint;
  if (validation.passed) {
    pairingToken = uuidv4();
    await ExtensionConnection.create({
      agencyId: agency._id,
      operatorId: operator._id,
      preparationId: preparation._id,
      pairingToken,
      status: 'pending',
    });
    preparation.extensionSessionId = pairingToken;
    preparation.workflowStatus = 'extension_connected';
    await preparation.save();
    connectHint = 'Use Sync & Fill in the extension — pairing token was issued automatically.';
  } else {
    connectHint =
      'Account created — fix validation issues in Preparation, then validate and connect for autofill.';
  }

  out.onboarding = {
    ttdAccountId: account._id,
    pilgrimIds: pilgrimDocs.map((p) => p._id),
    preparationId: preparation._id,
    validationStatus: preparation.validationStatus,
    validationErrors: validation.errors,
    pairingToken: pairingToken || null,
    connectHint,
  };

  return out;
}