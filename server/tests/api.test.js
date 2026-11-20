import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { Agency, Operator, Pilgrim, TtdAccountReference } from '../src/models/index.js';
import { TTDPolicySnapshot } from '../src/models/TTDPolicySnapshot.js';
import { connectTestDatabase, disconnectTestDatabase } from './testDb.js';

let app;
let token;
let agencyId;
let accountId;
let pilgrimIds;
let dbAvailable = true;

beforeAll(async () => {
  try {
    await connectTestDatabase();
    app = createApp();
  } catch {
    dbAvailable = false;
  }
}, 15000);

afterAll(async () => {
  if (dbAvailable) await disconnectTestDatabase();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  const agency = await Agency.create({ name: 'Test', code: 'T' });
  agencyId = agency._id;
  const operator = await Operator.create({
    agencyId,
    email: 'op@test.com',
    passwordHash: await bcrypt.hash('pass', 10),
    displayName: 'Op',
  });
  const login = await request(app).post('/api/auth/login').send({ email: 'op@test.com', password: 'pass' });
  token = login.body.token;

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

  const account = await TtdAccountReference.create({
    agencyId,
    label: 'Ref',
    accountHint: '****1111',
    isAuthorized: true,
  });
  accountId = account._id;

  const p = await Pilgrim.create({
    agencyId,
    fullName: 'Test Pilgrim',
    age: 35,
    gender: 'M',
    idType: 'Aadhaar',
    idNumber: '1',
    mobile: '999',
    city: 'Tirupati',
  });
  pilgrimIds = [p._id.toString()];
});

test('CRUD preparation workflow', async () => {
  if (!dbAvailable) {
    console.warn('Skipping API integration test — MongoDB unavailable');
    return;
  }
  const create = await request(app)
    .post('/api/preparations')
    .set('Authorization', `Bearer ${token}`)
    .send({
      ttdAccountReferenceId: accountId,
      bookingCategory: 'CURRENT',
      donationAmount: 10000,
      pilgrimIds,
    });
  expect(create.status).toBe(201);
  const id = create.body.preparation._id;

  let validate = await request(app).post(`/api/preparations/${id}/validate`).set('Authorization', `Bearer ${token}`);
  expect(validate.status).toBe(200);
  expect(validate.body.preparation.validationStatus).toBe('failed');

  await request(app)
    .post(`/api/preparations/${id}/consent`)
    .set('Authorization', `Bearer ${token}`)
    .send({ acknowledged: true });

  validate = await request(app).post(`/api/preparations/${id}/validate`).set('Authorization', `Bearer ${token}`);
  expect(validate.body.preparation.validationStatus).toBe('passed');

  const pair = await request(app)
    .post(`/api/preparations/${id}/extension/pair`)
    .set('Authorization', `Bearer ${token}`);
  expect(pair.status).toBe(200);
  expect(pair.body.pairingToken).toBeTruthy();

  const outcome = await request(app)
    .post(`/api/preparations/${id}/record-outcome`)
    .set('Authorization', `Bearer ${token}`)
    .send({ evidenceType: 'confirmation_number', evidenceReference: 'TTD-CONF-123' });
  expect(outcome.status).toBe(200);
  expect(outcome.body.preparation.workflowStatus).toBe('verified');
});