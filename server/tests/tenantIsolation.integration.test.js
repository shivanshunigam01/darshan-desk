import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { Agency, Operator, Pilgrim, TtdAccountReference } from '../src/models/index.js';
import { BookingPreparation } from '../src/models/BookingPreparation.js';
import { BookingAttempt } from '../src/models/BookingAttempt.js';
import { connectTestDatabase, disconnectTestDatabase } from './testDb.js';

let app;
let dbAvailable = true;

beforeAll(async () => {
  try {
    await connectTestDatabase();
    app = createApp();
  } catch (e) {
    dbAvailable = false;
    console.warn('tenant isolation setup failed:', e.message);
  }
}, 120000);

afterAll(async () => {
  if (dbAvailable) await disconnectTestDatabase();
});

async function agencyWithToken(code) {
  const agency = await Agency.create({ name: code, code, licenseStatus: 'trial' });
  const email = `${code}@tenant.test`;
  const operator = await Operator.create({
    agencyId: agency._id,
    email,
    passwordHash: await bcrypt.hash('pass', 10),
    displayName: code,
  });
  const login = await request(app).post('/api/auth/login').send({ email, password: 'pass' });
  return { agency, token: login.body.token };
}

function skipIfNoDb() {
  if (!dbAvailable) {
    console.warn('Skipping tenant isolation integration — MongoDB unavailable');
    return true;
  }
  return false;
}

describe('MongoDB tenant isolation (two agencies)', () => {
  let tokenA;
  let tokenB;
  let pilgrimB;
  let prepB;
  let accountB;
  let attemptB;

  beforeEach(async () => {
    if (!dbAvailable) return;
    await mongoose.connection.dropDatabase();
    const a = await agencyWithToken(`AG-A-${Date.now()}`);
    const b = await agencyWithToken(`AG-B-${Date.now() + 1}`);
    tokenA = a.token;
    tokenB = b.token;

    accountB = await TtdAccountReference.create({
      agencyId: b.agency._id,
      label: 'B Account',
      accountHint: '****2222',
      isAuthorized: true,
    });

    pilgrimB = await Pilgrim.create({
      agencyId: b.agency._id,
      fullName: 'Pilgrim B',
      age: 40,
      gender: 'F',
      idType: 'Aadhaar',
      idNumber: '2',
      mobile: '888',
      city: 'B',
    });

    const operatorB = await Operator.findOne({ agencyId: b.agency._id });
    prepB = await BookingPreparation.create({
      agencyId: b.agency._id,
      operatorId: operatorB._id,
      ttdAccountReferenceId: accountB._id,
      bookingCategory: 'CURRENT',
      donationAmount: 10000,
      pilgrimIds: [pilgrimB._id],
      validationStatus: 'pending',
    });

    attemptB = await BookingAttempt.create({
      agencyId: b.agency._id,
      operatorId: operatorB._id,
      preparationId: prepB._id,
      reliabilityState: 'PREPARED',
    });
  });

  test('Agency A cannot read Agency B pilgrims via ID', async () => {
    if (skipIfNoDb()) return;
    const res = await request(app)
      .patch(`/api/catalog/pilgrims/${pilgrimB._id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ city: 'Hacked' });
    expect(res.status).toBe(404);
    const still = await Pilgrim.findById(pilgrimB._id);
    expect(still.city).toBe('B');
  });

  test('Agency A cannot list Agency B TTD accounts in catalog', async () => {
    if (skipIfNoDb()) return;
    const res = await request(app).get('/api/catalog/ttd-accounts').set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    const ids = res.body.accounts.map((x) => x._id);
    expect(ids).not.toContain(accountB._id.toString());
  });

  test('Agency A cannot read Agency B preparation', async () => {
    if (skipIfNoDb()) return;
    const res = await request(app)
      .get(`/api/preparations/${prepB._id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(404);
  });

  test('Agency A cannot patch Agency B preparation', async () => {
    if (skipIfNoDb()) return;
    const res = await request(app)
      .patch(`/api/preparations/${prepB._id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ donationAmount: 1 });
    expect(res.status).toBe(404);
  });

  test('Agency A cannot read Agency B booking attempt', async () => {
    if (skipIfNoDb()) return;
    const res = await request(app)
      .get(`/api/reliability/attempts/${attemptB._id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(404);
  });

  test('Agency B retains access to its own records', async () => {
    if (skipIfNoDb()) return;
    const pilgrims = await request(app).get('/api/catalog/pilgrims').set('Authorization', `Bearer ${tokenB}`);
    expect(pilgrims.status).toBe(200);
    expect(pilgrims.body.pilgrims.some((p) => p._id === pilgrimB._id.toString())).toBe(true);

    const prep = await request(app).get(`/api/preparations/${prepB._id}`).set('Authorization', `Bearer ${tokenB}`);
    expect(prep.status).toBe(200);
  });
});