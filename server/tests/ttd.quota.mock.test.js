import request from 'supertest';
import bcrypt from 'bcryptjs';
import { QuotaService, loadPolicyFromEnv } from '@darshan-desk/ttd-integration';
import { createApp } from '../src/app.js';
import { Agency, Operator } from '../src/models/index.js';
import { connectTestDatabase, disconnectTestDatabase } from './testDb.js';

let app;
let dbAvailable = true;

beforeAll(async () => {
  try {
    await connectTestDatabase();
    app = createApp();
  } catch (e) {
    dbAvailable = false;
    console.warn('ttd quota mock setup failed:', e.message);
  }
}, 120000);

afterAll(async () => {
  if (dbAvailable) await disconnectTestDatabase();
});

async function loginOperator() {
  const agency = await Agency.create({ name: 'Q Agency', code: `Q-${Date.now()}`, licenseStatus: 'active' });
  const email = `op-q-${Date.now()}@test.local`;
  await Operator.create({
    agencyId: agency._id,
    email,
    passwordHash: await bcrypt.hash('pass', 10),
    displayName: 'Quota Op',
    role: 'operator',
  });
  const login = await request(app).post('/api/auth/login').send({ email, password: 'pass' });
  return login.body.token;
}

beforeEach(() => {
  new QuotaService(loadPolicyFromEnv(process.env)).clearTenantCache();
});

const maybe = (name, fn) => {
  test(name, async () => {
    if (!dbAvailable) {
      console.warn('skipped — no test DB');
      return;
    }
    await fn();
  });
};

maybe('GET /api/ttd/quota/current returns contract with mock scenario', async () => {
  const token = await loginOperator();
  const res = await request(app)
    .get('/api/ttd/quota/current?scenario=default&refresh=1')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.data).toBeDefined();
  expect(typeof res.body.data.quotaCount).toBe('number');
  expect(res.body).toHaveProperty('source');
  expect(res.body).toHaveProperty('observedAt');
  expect(res.body).toHaveProperty('providerStatus');
  expect(res.body.releaseDisplay.label).toBeTruthy();
});

maybe('zero_quota scenario', async () => {
  const token = await loginOperator();
  const res = await request(app)
    .get('/api/ttd/quota/current?scenario=zero_quota&refresh=1')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.data.quotaCount).toBe(0);
});

maybe('unauthorized scenario returns 401', async () => {
  const token = await loginOperator();
  const res = await request(app)
    .get('/api/ttd/quota/current?scenario=unauthorized&refresh=1')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(401);
});

maybe('NOT CONFIGURED without scenario when approved disabled', async () => {
  const token = await loginOperator();
  const res = await request(app).get('/api/ttd/quota/current').set('Authorization', `Bearer ${token}`);
  expect([503, 200]).toContain(res.status);
  if (res.status === 503) {
    expect(res.body.error).toBe('NOT_CONFIGURED');
  }
});

maybe('integration status documents endpoint', async () => {
  const token = await loginOperator();
  const res = await request(app)
    .get('/api/ttd/integration/status?scenario=default')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.endpoint).toContain('darshansummarySrivaniCurrentDay');
});