import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Agency, Operator, Pilgrim, TtdAccountReference } from './models/index.js';
import { TTDPolicySnapshot } from './models/TTDPolicySnapshot.js';
import { activatePolicyVersion } from './services/policyService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function seedDatabase() {
  let agency = await Agency.findOne({ code: 'DEMO' });
  if (!agency) {
    agency = await Agency.create({
      name: 'Demo Darshan Agency',
      code: 'DEMO',
      licenseStatus: 'active',
      licenseActivatedAt: new Date(),
    });
  } else if (!agency.licenseStatus) {
    agency.licenseStatus = 'active';
    agency.licenseActivatedAt = new Date();
    await agency.save();
  }

  let operator = await Operator.findOne({ email: 'operator@darshandesk.local' });
  if (!operator) {
    operator = await Operator.create({
      agencyId: agency._id,
      email: 'operator@darshandesk.local',
      passwordHash: await bcrypt.hash('operator123', 10),
      displayName: 'Demo Operator',
      role: 'operator',
    });
  }

  let admin = await Operator.findOne({ email: 'admin@darshandesk.local' });
  if (!admin) {
    admin = await Operator.create({
      agencyId: agency._id,
      email: 'admin@darshandesk.local',
      passwordHash: await bcrypt.hash('admin123', 10),
      displayName: 'Demo Admin',
      role: 'admin',
    });
  }

  let platformAgency = await Agency.findOne({ code: 'PLATFORM' });
  if (!platformAgency) {
    platformAgency = await Agency.create({
      name: 'DarshanDesk Platform',
      code: 'PLATFORM',
      licenseStatus: 'active',
      subscriptionPlan: 'platform',
      licenseActivatedAt: new Date(),
    });
  }

  let superAdmin = await Operator.findOne({ email: 'superadmin@darshandesk.local' });
  if (!superAdmin) {
    superAdmin = await Operator.create({
      agencyId: platformAgency._id,
      email: 'superadmin@darshandesk.local',
      passwordHash: await bcrypt.hash('SuperAdmin@2026!', 10),
      displayName: 'Platform Super Admin',
      role: 'super_admin',
    });
  } else {
    let repair = false;
    if (superAdmin.role !== 'super_admin') {
      superAdmin.role = 'super_admin';
      repair = true;
    }
    if (String(superAdmin.agencyId) !== String(platformAgency._id)) {
      superAdmin.agencyId = platformAgency._id;
      repair = true;
    }
    if (superAdmin.displayName !== 'Platform Super Admin') {
      superAdmin.displayName = 'Platform Super Admin';
      repair = true;
    }
    if (repair) await superAdmin.save();
  }

  const accountCount = await TtdAccountReference.countDocuments({ agencyId: agency._id });
  if (accountCount === 0) {
    const operators = await Operator.find({ agencyId: agency._id });
    const defaultOps = operators.map((o) => o._id);
    await TtdAccountReference.create([
      {
        agencyId: agency._id,
        label: 'Agency TTD Ref A',
        accountHint: '****4521',
        maskedIdentifier: '****4521',
        loginIdentifier: 'ref-a@agency.local',
        isAuthorized: true,
        authorizationStatus: 'authorized',
        consentRecordedAt: new Date(),
        status: 'active',
        verificationStatus: 'verified',
        ownerId: operators[0]?._id,
        assignedOperatorIds: defaultOps,
        credentialMode: 'reference_only',
      },
      {
        agencyId: agency._id,
        label: 'Agency TTD Ref B',
        accountHint: '****8834',
        maskedIdentifier: '****8834',
        loginIdentifier: 'ref-b@agency.local',
        isAuthorized: true,
        authorizationStatus: 'authorized',
        consentRecordedAt: new Date(),
        status: 'active',
        verificationStatus: 'unverified',
        ownerId: operators[0]?._id,
        assignedOperatorIds: defaultOps,
        credentialMode: 'reference_only',
      },
    ]);
  }

  const pilgrimCount = await Pilgrim.countDocuments({ agencyId: agency._id });
  if (pilgrimCount === 0) {
    await Pilgrim.create([
      {
        agencyId: agency._id,
        fullName: 'Rama Krishna',
        age: 45,
        gender: 'M',
        idType: 'Aadhaar',
        idNumber: 'XXXX-XXXX-4521',
        mobile: '9876543210',
        city: 'Tirupati',
      },
      {
        agencyId: agency._id,
        fullName: 'Lakshmi Devi',
        age: 42,
        gender: 'F',
        idType: 'Aadhaar',
        idNumber: 'XXXX-XXXX-8834',
        mobile: '9876543211',
        city: 'Chennai',
      },
      {
        agencyId: agency._id,
        fullName: 'Venkat Reddy',
        age: 38,
        gender: 'M',
        idType: 'PAN',
        idNumber: 'ABCDE1234F',
        mobile: '9876543212',
        city: 'Hyderabad',
      },
    ]);
  }

  const policyCount = await TTDPolicySnapshot.countDocuments();
  if (policyCount === 0) {
    const samplePath = path.join(__dirname, 'fixtures/ttdPolicySample.json');
    const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
    await TTDPolicySnapshot.create({ ...sample, isActive: true });
  } else {
    const active = await TTDPolicySnapshot.findOne({ isActive: true });
    if (!active) {
      const latest = await TTDPolicySnapshot.findOne().sort({ capturedAt: -1 });
      if (latest) await activatePolicyVersion(latest.policyVersion);
    }
  }

  return { agency, operator, admin };
}