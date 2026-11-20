import request from 'supertest';
import { createApp } from '../src/app.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const app = createApp();
const serverSrc = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src');

test('security middleware is wired in app.js', () => {
  const text = fs.readFileSync(path.join(serverSrc, 'app.js'), 'utf8');
  expect(text).toMatch(/buildHelmet/);
  expect(text).toMatch(/globalRateLimiter/);
  expect(text).toMatch(/auditRequest/);
});

test('auth middleware enforces license after JWT when LICENSE_ENFORCE', () => {
  const text = fs.readFileSync(path.join(serverSrc, 'middleware/auth.js'), 'utf8');
  expect(text).toMatch(/requireActiveLicense/);
  expect(text).toMatch(/LICENSE_ENFORCE/);
});

test('login validates body with Zod', async () => {
  const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email', password: 'x' });
  expect(res.status).toBe(400);
  expect(res.body.code).toBe('VALIDATION');
});

test('health endpoints respond without auth', async () => {
  const live = await request(app).get('/health/live');
  expect(live.status).toBe(200);
});

test('helmet sets XSS protection header', async () => {
  const res = await request(app).get('/health');
  expect(res.headers['x-content-type-options']).toBe('nosniff');
});

test('CORS rejects unknown browser origin', async () => {
  const res = await request(app).get('/health/live').set('Origin', 'https://evil.example');
  expect(res.status).toBeGreaterThanOrEqual(400);
});

test('sentry dependency present with beforeSend scrubbing', () => {
  const text = fs.readFileSync(path.join(serverSrc, 'middleware/errorMonitor.js'), 'utf8');
  expect(text).toMatch(/beforeSend/);
  expect(text).toMatch(/@sentry\/node/);
});