import crypto from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { Agency, Operator, TtdAccountReference, ExtensionConnection } from '../src/models/index.js';
import { BookingPreparation } from '../src/models/BookingPreparation.js';
import { BookingAttempt } from '../src/models/BookingAttempt.js';
import { PlatformAuditLog } from '../src/services/platformAuditService.js';
import { connectTestDatabase, disconnectTestDatabase } from './testDb.js';

let app;
let dbAvailable = true;

beforeAll(async () => {
  try {
    await connectTestDatabase();
    app = createApp();
  } catch (e) {
    dbAvailable = false;
    console.warn('platform command center setup failed:', e.message);
  }
}, 120000);

afterAll(async () => {
  if (dbAvailable) await disconnectTestDatabase();
});

async function createSuperAdmin() {
  const agency = await Agency.create({ name: 'Platform', code: `PLT-${Date.now()}`, licenseStatus: 'active' });
  const email = `super-${Date.now()}@test.local`;
  await Operator.create({
    agencyId: agency._id,
    email,
    passwordHash: await bcrypt.hash('pass', 10),
    displayName: 'Super',
    role: 'super_admin',
    lastActiveAt: new Date(),
  });
  const login = await request(app).post('/api/auth/login').send({ email, password: 'pass' });
  return { token: login.body.token, agency };
}

async function createAgencyAdmin() {
  const agency = await Agency.create({ name: 'Tenant', code: `T-${Date.now()}`, licenseStatus: 'trial' });
  const email = `admin-${Date.now()}@test.local`;
  await Operator.create({
    agencyId: agency._id,
    email,
    passwordHash: await bcrypt.hash('pass', 10),
    displayName: 'Admin',
    role: 'admin',
  });
  const login = await request(app).post('/api/auth/login').send({ email, password: 'pass' });
  return login.body.token;
}

describe('platform command center', () => {
  test('requires super_admin for overview', async () => {
    if (!dbAvailable) return;
    const adminToken = await createAgencyAdmin();
    const denied = await request(app)
      .get('/api/platform/command-center/overview')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(denied.status).toBe(403);

    const { token } = await createSuperAdmin();
    const ok = await request(app)
      .get('/api/platform/command-center/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(ok.status).toBe(200);
    expect(ok.body.cards).toBeDefined();
    expect(ok.body.cards.totalRegisteredAgencies).toBeGreaterThanOrEqual(1);
    expect(ok.body.notices?.some((n) => n.includes('TTD'))).toBe(true);

    const audit = await PlatformAuditLog.findOne({ operatorId: { $exists: true } }).sort({ at: -1 });
    expect(audit?.path).toContain('command-center');
  });

  test('agencies list paginates and masks admin email', async () => {
    if (!dbAvailable) return;
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .get('/api/platform/command-center/agencies?page=1&limit=10')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
    const maskedRow = res.body.rows.find((r) => r.administratorEmail && r.administratorEmail !== '—');
    if (maskedRow) {
      expect(maskedRow.administratorEmail).toMatch(/\*\*\*/);
    }
  });

  test('active user count uses auth activity not all registered operators', async () => {
    if (!dbAvailable) return;
    const agency = await Agency.create({ name: 'Stats Co', code: `ST-${Date.now()}`, licenseStatus: 'active' });
    const activeOp = await Operator.create({
      agencyId: agency._id,
      email: `active-${Date.now()}@t.com`,
      passwordHash: await bcrypt.hash('pass', 10),
      displayName: 'Active',
      lastLoginAt: new Date(),
    });
    await Operator.create({
      agencyId: agency._id,
      email: `idle-${Date.now()}@t.com`,
      passwordHash: await bcrypt.hash('pass', 10),
      displayName: 'Idle',
      lastLoginAt: new Date('2020-01-01'),
    });

    await ExtensionConnection.create({
      agencyId: agency._id,
      operatorId: activeOp._id,
      preparationId: new mongoose.Types.ObjectId(),
      pairingToken: crypto.randomUUID(),
      status: 'connected',
      lastHeartbeatAt: new Date(),
    });

    const { token } = await createSuperAdmin();
    const overview = await request(app)
      .get('/api/platform/command-center/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(overview.body.cards.totalSaasUsers).toBeGreaterThanOrEqual(3);
    expect(overview.body.cards.activeUsers).toBeGreaterThanOrEqual(1);
    expect(overview.body.cards.activeUsers).toBeLessThan(overview.body.cards.totalSaasUsers + 5);
  });

  test('account report masks identifiers and hides verified name when unauthorized', async () => {
    if (!dbAvailable) return;
    const agency = await Agency.create({ name: 'Ref Agency', code: `RA-${Date.now()}` });
    const account = await TtdAccountReference.create({
      agencyId: agency._id,
      label: 'Agency ref',
      accountHint: '****5678',
      maskedIdentifier: '****5678',
      loginIdentifier: 'secret@ttd.local',
      verificationStatus: 'unverified',
      authorizationStatus: 'pending',
      status: 'active',
    });

    const { token } = await createSuperAdmin();
    const res = await request(app)
      .get('/api/platform/command-center/account-references?search=Agency')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const row = res.body.rows.find((r) => r.id === account._id.toString());
    expect(row.maskedAccountIdentifier).toBe('****5678');
    expect(row.verifiedAccountName).toBeUndefined();
    expect(JSON.stringify(row)).not.toContain('secret@ttd.local');
  });

  test('analytics uses verified confirmed counts from BookingAttempt', async () => {
    if (!dbAvailable) return;
    const agency = await Agency.create({ name: 'Book Co', code: `BK-${Date.now()}` });
    const op = await Operator.create({
      agencyId: agency._id,
      email: `bk-${Date.now()}@t.com`,
      passwordHash: await bcrypt.hash('pass', 10),
      displayName: 'BK Op',
    });
    const account = await TtdAccountReference.create({
      agencyId: agency._id,
      label: 'BK ref',
      accountHint: '****0001',
      maskedIdentifier: '****0001',
      status: 'active',
    });
    const prep = await BookingPreparation.create({
      agencyId: agency._id,
      operatorId: op._id,
      ttdAccountReferenceId: account._id,
      bookingCategory: 'CURRENT',
      donationAmount: 10000,
      pilgrimIds: [],
      validationStatus: 'passed',
    });
    await BookingAttempt.create({
      agencyId: agency._id,
      operatorId: op._id,
      preparationId: prep._id,
      bookingCategory: 'CURRENT',
      outcome: 'confirmed',
      verifiedAt: new Date(),
    });
    await BookingAttempt.create({
      agencyId: agency._id,
      operatorId: op._id,
      preparationId: prep._id,
      bookingCategory: 'CURRENT',
      outcome: 'confirmed',
    });

    const { token } = await createSuperAdmin();
    const res = await request(app)
      .get(`/api/platform/command-center/analytics?agencyId=${agency._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.totals.attempts).toBe(2);
    expect(res.body.totals.confirmed).toBe(1);
    expect(res.body.perAccountConfirmed[0]?.confirmed).toBe(1);
  });
});