import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { Agency, Operator } from '../src/models/index.js';
import { connectTestDatabase, disconnectTestDatabase } from './testDb.js';

let app;
let dbAvailable = true;
const prevEnforce = process.env.LICENSE_ENFORCE;

beforeAll(async () => {
  process.env.LICENSE_ENFORCE = 'true';
  try {
    await connectTestDatabase();
    app = createApp();
  } catch (e) {
    dbAvailable = false;
    console.warn('license enforcement setup failed:', e.message);
  }
}, 120000);

afterAll(async () => {
  process.env.LICENSE_ENFORCE = prevEnforce;
  if (dbAvailable) await disconnectTestDatabase();
});

async function seedOperator(agencyPatch = {}) {
  await mongoose.connection.dropDatabase();
  const agency = await Agency.create({
    name: 'License QA',
    code: `LIC-${Date.now()}`,
    licenseStatus: 'active',
    ...agencyPatch,
  });
  const passwordHash = await bcrypt.hash('pass', 10);
  const operator = await Operator.create({
    agencyId: agency._id,
    email: `op-${Date.now()}@test.com`,
    passwordHash,
    displayName: 'Op',
    role: 'operator',
  });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: operator.email, password: 'pass' });
  return { agency, operator, token: login.body.token };
}

async function seedAdmin(agencyPatch = {}) {
  const base = await seedOperator(agencyPatch);
  await Operator.findByIdAndUpdate(base.operator._id, { role: 'admin' });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: base.operator.email, password: 'pass' });
  return { ...base, adminToken: login.body.token };
}

function skipIfNoDb() {
  if (!dbAvailable) {
    console.warn('Skipping license enforcement test — MongoDB unavailable');
    return true;
  }
  return false;
}

describe('LICENSE_ENFORCE=true operator APIs', () => {
  test('active trial license allows catalog access', async () => {
    if (skipIfNoDb()) return;
    const { token } = await seedOperator({ licenseStatus: 'trial' });
    const res = await request(app).get('/api/catalog/pilgrims').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('revoked license returns 403', async () => {
    if (skipIfNoDb()) return;
    const { token } = await seedOperator({ licenseStatus: 'revoked' });
    const res = await request(app).get('/api/catalog/pilgrims').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('LICENSE_REVOKED');
  });

  test('suspended agency returns 403', async () => {
    if (skipIfNoDb()) return;
    const { token } = await seedOperator({ licenseStatus: 'suspended' });
    const res = await request(app).get('/api/catalog/pilgrims').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('LICENSE_SUSPENDED');
  });

  test('expired license returns 403', async () => {
    if (skipIfNoDb()) return;
    const past = new Date(Date.now() - 86_400_000);
    const { token } = await seedOperator({ licenseStatus: 'active', licenseExpiresAt: past });
    const res = await request(app).get('/api/catalog/pilgrims').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('LICENSE_EXPIRED');
  });

  test('invalid/inactive license status returns 403', async () => {
    if (skipIfNoDb()) return;
    const agency = await Agency.create({ name: 'X', code: `X-${Date.now()}`, licenseStatus: 'trial' });
    await Agency.collection.updateOne({ _id: agency._id }, { $set: { licenseStatus: 'pending_payment' } });
    const operator = await Operator.create({
      agencyId: agency._id,
      email: `bad-${Date.now()}@test.com`,
      passwordHash: await bcrypt.hash('pass', 10),
      displayName: 'Bad',
    });
    const login = await request(app).post('/api/auth/login').send({ email: operator.email, password: 'pass' });
    const res = await request(app)
      .get('/api/catalog/pilgrims')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('LICENSE_INACTIVE');
  });

  test('admin license activate exempt while revoked', async () => {
    if (skipIfNoDb()) return;
    const { adminToken } = await seedAdmin({ licenseStatus: 'revoked' });
    const res = await request(app)
      .post('/api/admin/license/activate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ licenseKey: 'PROD-TEST-KEY-001', mode: 'production' });
    expect(res.status).toBe(200);
    expect(res.body.license?.licenseStatus).toMatch(/active|trial/);
  });

  test('login remains public when license revoked', async () => {
    if (skipIfNoDb()) return;
    const { operator } = await seedOperator({ licenseStatus: 'revoked' });
    const res = await request(app).post('/api/auth/login').send({ email: operator.email, password: 'pass' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  test('health endpoints stay public', async () => {
    if (skipIfNoDb()) return;
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
  });
});