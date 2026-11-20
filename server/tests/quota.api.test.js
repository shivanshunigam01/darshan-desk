import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

test('quota dashboard requires authentication', async () => {
  const res = await request(app).get('/api/quota/dashboard');
  expect(res.status).toBe(401);
});

test('quota scenarios requires authentication', async () => {
  const res = await request(app).get('/api/quota/scenarios');
  expect(res.status).toBe(401);
});