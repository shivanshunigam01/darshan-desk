import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { Agency, Operator, TtdAccountReference } from '../src/models/index.js';
import { BookingPreparation } from '../src/models/BookingPreparation.js';
import { BookingAttempt } from '../src/models/BookingAttempt.js';
import { TtdAccountAuditLog } from '../src/models/TtdAccountAuditLog.js';
import { maskLoginIdentifier } from '../src/services/ttdAccountService.js';
import { connectTestDatabase, disconnectTestDatabase } from './testDb.js';

let app;
let dbAvailable = true;

beforeAll(async () => {
  try {
    await connectTestDatabase();
    app = createApp();
  } catch {
    dbAvailable = false;
  }
}, 120000);

afterAll(async () => {
  if (dbAvailable) await disconnectTestDatabase();
});

function skip() {
  if (!dbAvailable) {
    console.warn('Skipping TTD account tests — MongoDB unavailable');
    return true;
  }
  return false;
}

describe('TTD account manager authorization', () => {
  let agencyA;
  let agencyB;
  let opA;
  let opB;
  let adminA;
  let tokenA;
  let tokenB;
  let adminTokenA;
  let accountB;

  beforeEach(async () => {
    if (!dbAvailable) return;
    await mongoose.connection.dropDatabase();
    agencyA = await Agency.create({ name: 'A', code: `A-${Date.now()}` });
    agencyB = await Agency.create({ name: 'B', code: `B-${Date.now() + 1}` });
    opA = await Operator.create({
      agencyId: agencyA._id,
      email: `op-a-${Date.now()}@t.com`,
      passwordHash: await bcrypt.hash('pass', 10),
      displayName: 'Op A',
    });
    adminA = await Operator.create({
      agencyId: agencyA._id,
      email: `admin-a-${Date.now()}@t.com`,
      passwordHash: await bcrypt.hash('pass', 10),
      displayName: 'Admin A',
      role: 'admin',
    });
    opB = await Operator.create({
      agencyId: agencyB._id,
      email: `op-b-${Date.now()}@t.com`,
      passwordHash: await bcrypt.hash('pass', 10),
      displayName: 'Op B',
    });

    tokenA = (await request(app).post('/api/auth/login').send({ email: opA.email, password: 'pass' })).body.token;
    tokenB = (await request(app).post('/api/auth/login').send({ email: opB.email, password: 'pass' })).body.token;
    adminTokenA = (await request(app).post('/api/auth/login').send({ email: adminA.email, password: 'pass' })).body
      .token;

    accountB = await TtdAccountReference.create({
      agencyId: agencyB._id,
      label: 'Secret B',
      accountHint: '****9999',
      maskedIdentifier: '****9999',
      loginIdentifier: 'b@ttd.local',
      authorizationStatus: 'authorized',
      isAuthorized: true,
      status: 'active',
      assignedOperatorIds: [opB._id],
      ownerId: opB._id,
    });
  });

  test('rejects storing password fields on create', async () => {
    if (skip()) return;
    const res = await request(app)
      .post('/api/ttd-accounts')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({
        accountLabel: 'Test',
        loginIdentifier: 'x@y.com',
        password: 'must-not-store',
      });
    expect(res.status).toBe(400);
  });

  test('agency B account invisible to agency A operator', async () => {
    if (skip()) return;
    const res = await request(app).get(`/api/ttd-accounts/${accountB._id}`).set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(404);
  });

  test('operator only sees assigned accounts in list', async () => {
    if (skip()) return;
    await TtdAccountReference.create({
      agencyId: agencyA._id,
      label: 'Assigned',
      accountHint: '****1111',
      maskedIdentifier: '****1111',
      loginIdentifier: 'a1@t.com',
      authorizationStatus: 'authorized',
      status: 'active',
      assignedOperatorIds: [opA._id],
      ownerId: opA._id,
    });
    await TtdAccountReference.create({
      agencyId: agencyA._id,
      label: 'Other',
      accountHint: '****2222',
      maskedIdentifier: '****2222',
      loginIdentifier: 'a2@t.com',
      authorizationStatus: 'authorized',
      status: 'active',
      assignedOperatorIds: [adminA._id],
      ownerId: adminA._id,
    });

    const res = await request(app).get('/api/ttd-accounts').set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    const labels = res.body.accounts.map((a) => a.accountLabel);
    expect(labels).toContain('Assigned');
    expect(labels).not.toContain('Other');
  });

  test('admin sees all agency accounts', async () => {
    if (skip()) return;
    await TtdAccountReference.create({
      agencyId: agencyA._id,
      label: 'Only Admin Listed',
      accountHint: '****3333',
      maskedIdentifier: '****3333',
      loginIdentifier: 'a3@t.com',
      authorizationStatus: 'authorized',
      status: 'active',
      assignedOperatorIds: [adminA._id],
    });
    const res = await request(app).get('/api/ttd-accounts').set('Authorization', `Bearer ${adminTokenA}`);
    expect(res.body.accounts.some((a) => a.accountLabel === 'Only Admin Listed')).toBe(true);
  });

  test('maskLoginIdentifier masks email', () => {
    expect(maskLoginIdentifier('operator@example.com')).toMatch(/op\*\*\*@example\.com/);
  });

  test('booking stats use BookingAttempt outcomes only', async () => {
    if (skip()) return;
    const acc = await TtdAccountReference.create({
      agencyId: agencyA._id,
      label: 'Stats Acc',
      accountHint: '****4444',
      maskedIdentifier: '****4444',
      loginIdentifier: 'stats@t.com',
      authorizationStatus: 'authorized',
      status: 'active',
      assignedOperatorIds: [opA._id],
      ownerId: opA._id,
    });
    const prep = await BookingPreparation.create({
      agencyId: agencyA._id,
      operatorId: opA._id,
      ttdAccountReferenceId: acc._id,
      bookingCategory: 'CURRENT',
      donationAmount: 10000,
      pilgrimIds: [],
    });
    await BookingAttempt.create({
      agencyId: agencyA._id,
      operatorId: opA._id,
      preparationId: prep._id,
      bookingCategory: 'CURRENT',
      outcome: 'confirmed',
    });
    await BookingAttempt.create({
      agencyId: agencyA._id,
      operatorId: opA._id,
      preparationId: prep._id,
      bookingCategory: 'CURRENT',
      outcome: 'failed',
    });

    const res = await request(app).get('/api/ttd-accounts').set('Authorization', `Bearer ${tokenA}`);
    const row = res.body.accounts.find((a) => a.accountLabel === 'Stats Acc');
    expect(row.bookingsPrepared).toBe(1);
    expect(row.confirmedBookings).toBe(1);
    expect(row.failedAttempts).toBe(1);
  });

  test('consent creates audit log', async () => {
    if (skip()) return;
    const acc = await TtdAccountReference.create({
      agencyId: agencyA._id,
      label: 'Audit Acc',
      accountHint: '****5555',
      maskedIdentifier: '****5555',
      loginIdentifier: 'audit@t.com',
      authorizationStatus: 'pending',
      status: 'active',
      assignedOperatorIds: [opA._id],
      ownerId: opA._id,
    });
    const res = await request(app)
      .post(`/api/ttd-accounts/${acc._id}/consent`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ acknowledged: true });
    expect(res.status).toBe(200);
    const logs = await TtdAccountAuditLog.find({ accountId: acc._id, action: 'consent' });
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  test('admin can assign operators', async () => {
    if (skip()) return;
    const acc = await TtdAccountReference.create({
      agencyId: agencyA._id,
      label: 'Assign Acc',
      accountHint: '****6666',
      maskedIdentifier: '****6666',
      loginIdentifier: 'assign@t.com',
      authorizationStatus: 'authorized',
      status: 'active',
      assignedOperatorIds: [adminA._id],
      ownerId: adminA._id,
    });
    const res = await request(app)
      .post(`/api/ttd-accounts/${acc._id}/assign-operators`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ operatorIds: [String(opA._id), String(adminA._id)] });
    expect(res.status).toBe(200);
    const updated = await TtdAccountReference.findById(acc._id);
    expect(updated.assignedOperatorIds).toHaveLength(2);
  });
});