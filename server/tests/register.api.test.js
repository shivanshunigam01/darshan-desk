import request from 'supertest';
import { createApp } from '../src/app.js';
import { TTDPolicySnapshot } from '../src/models/TTDPolicySnapshot.js';
import { connectTestDatabase, disconnectTestDatabase } from './testDb.js';

let app;

beforeAll(async () => {
  await connectTestDatabase();
  app = createApp();
  await TTDPolicySnapshot.deleteMany({});
  await TTDPolicySnapshot.create({
    policyVersion: 'test-v1',
    isActive: true,
    minimumDonation: 10000,
    maximumDonation: 1000000,
    maximumCurrentPilgrims: 4,
    maximumAdvancePilgrims: 4,
    releaseTime: '09:00',
    reportingTime: '06:00',
  });
}, 60_000);

afterAll(async () => {
  await disconnectTestDatabase();
});

test('registers agency and operator', async () => {
  const res = await request(app).post('/api/auth/register').send({
    agencyName: 'Test Agency',
    displayName: 'Operator One',
    email: `new-op-${Date.now()}@example.com`,
    password: 'Password123!',
    consentAcknowledged: true,
  });
  expect(res.status).toBe(201);
  expect(res.body.token).toBeTruthy();
  expect(res.body.operator.email).toContain('@example.com');
});

test('registers with onboarding and issues pairing when policy validates', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      agencyName: 'Onboard Agency',
      displayName: 'Onboard Op',
      email: `onboard-${Date.now()}@example.com`,
      password: 'Password123!',
      consentAcknowledged: true,
      donationAmount: 20000,
      bookingCategory: 'CURRENT',
      ttdAccount: { accountLabel: 'Main TTD', loginIdentifier: 'user@example.com' },
      pilgrims: [
        {
          fullName: 'Test Pilgrim',
          age: 30,
          gender: 'Male',
          idType: 'Aadhaar Card',
          idNumber: '123456789012',
        },
        {
          fullName: 'Second Pilgrim',
          age: 28,
          gender: 'Female',
          idType: 'Passport',
          idNumber: 'K1234567',
        },
      ],
    });
  expect(res.status).toBe(201);
  expect(res.body.onboarding).toBeTruthy();
  expect(res.body.onboarding.validationStatus).toBe('passed');
  expect(res.body.onboarding.pairingToken).toMatch(/^[a-f0-9-]{36}$/i);
});