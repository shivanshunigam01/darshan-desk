import mongoose from 'mongoose';
import { Agency, Pilgrim } from '../src/models/index.js';
import { TTDPolicySnapshot } from '../src/models/TTDPolicySnapshot.js';
import { validateBookingPreparation } from '../src/services/preparationValidation.js';
import { connectTestDatabase, disconnectTestDatabase } from './testDb.js';

beforeAll(async () => {
  await connectTestDatabase();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

let dbAvailable = true;

beforeEach(async () => {
  if (mongoose.connection.readyState !== 1) {
    dbAvailable = false;
    return;
  }
  await mongoose.connection.dropDatabase();
  await TTDPolicySnapshot.create({
    source: 'test',
    capturedAt: new Date(),
    minimumDonation: 10000,
    maximumDonation: 500000,
    maximumCurrentPilgrims: 4,
    maximumAdvancePilgrims: 9,
    releaseTime: '11:03:00',
    reportingTime: '04:00 PM',
    policyVersion: 'test-v1',
    isActive: true,
  });
});

test('rejects donation below official minimum', async () => {
  if (!dbAvailable) return;
  const agency = await Agency.create({ name: 'A', code: 'A1' });
  const prep = {
    agencyId: agency._id,
    trustCategory: 'SRIVANI',
    bookingCategory: 'CURRENT',
    donationAmount: 5000,
    pilgrimIds: [],
  };
  const result = await validateBookingPreparation(prep);
  expect(result.passed).toBe(false);
  expect(result.errors.some((e) => e.includes('10000'))).toBe(true);
});

test('enforces current pilgrim maximum of 4', async () => {
  if (!dbAvailable) return;
  const agency = await Agency.create({ name: 'A', code: 'A2' });
  const pilgrims = await Pilgrim.create(
    [1, 2, 3, 4, 5].map((i) => ({
      agencyId: agency._id,
      fullName: `P${i}`,
      age: 30,
      gender: 'M',
      idType: 'Aadhaar',
      idNumber: `ID${i}`,
      mobile: '9000000000',
      city: 'X',
    }))
  );
  const prep = {
    agencyId: agency._id,
    trustCategory: 'SRIVANI',
    bookingCategory: 'CURRENT',
    donationAmount: 10000,
    pilgrimIds: pilgrims.map((p) => p._id),
  };
  const result = await validateBookingPreparation(prep);
  expect(result.passed).toBe(false);
  expect(result.errors.some((e) => e.includes('4'))).toBe(true);
});

test('passes valid current booking with consent', async () => {
  if (!dbAvailable) return;
  const agency = await Agency.create({ name: 'A', code: 'A3' });
  const pilgrims = await Pilgrim.create({
    agencyId: agency._id,
    fullName: 'Valid Pilgrim',
    age: 40,
    gender: 'F',
    idType: 'Aadhaar',
    idNumber: 'X',
    mobile: '9111111111',
    city: 'Tirupati',
  });
  const prep = {
    agencyId: agency._id,
    trustCategory: 'SRIVANI',
    bookingCategory: 'CURRENT',
    donationAmount: 15000,
    pilgrimIds: [pilgrims._id],
  };
  const result = await validateBookingPreparation(prep, {
    requireConsent: true,
    consentRecordedAt: new Date(),
  });
  expect(result.passed).toBe(true);
  expect(result.policy.policyVersion).toBe('test-v1');
});