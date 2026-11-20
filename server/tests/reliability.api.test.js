import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

test('QA dashboard requires authentication', async () => {
  const res = await request(app).get('/api/reliability/dashboard');
  expect(res.status).toBe(401);
});

test('attempt creation requires authentication', async () => {
  const res = await request(app).post('/api/reliability/attempts').send({ preparationId: 'x' });
  expect(res.status).toBe(401);
});

test('mock official signal requires authentication', async () => {
  const res = await request(app).post('/api/reliability/mock-official-signal').send({});
  expect(res.status).toBe(401);
});