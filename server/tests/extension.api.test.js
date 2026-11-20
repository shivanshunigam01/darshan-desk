import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

test('extension connect rejects missing body', async () => {
  const res = await request(app).post('/api/preparations/extension/connect').send({});
  expect(res.status).toBe(400);
});

test('fill-payload requires pairing headers', async () => {
  const res = await request(app).get('/api/preparations/extension/fill-payload');
  expect(res.status).toBe(401);
});

test('fill-report requires pairing headers', async () => {
  const res = await request(app).post('/api/preparations/extension/fill-report').send({});
  expect(res.status).toBe(401);
});