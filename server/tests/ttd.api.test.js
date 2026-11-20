import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

test('TTD quota current requires authentication', async () => {
  const res = await request(app).get('/api/ttd/quota/current');
  expect(res.status).toBe(401);
});

test('TTD countries requires authentication', async () => {
  const res = await request(app).get('/api/ttd/countries');
  expect(res.status).toBe(401);
});

test('TTD integration status requires authentication', async () => {
  const res = await request(app).get('/api/ttd/integration/status');
  expect(res.status).toBe(401);
});

test('TTD person-limit requires authentication', async () => {
  const res = await request(app).get('/api/ttd/donation/person-limit?amount=10000');
  expect(res.status).toBe(401);
});