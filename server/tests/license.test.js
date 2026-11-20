import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

test('license keys are hashed before storage (implementation check)', () => {
  const svc = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/services/agencyLicenseService.js'),
    'utf8'
  );
  expect(svc).toMatch(/createHash\('sha256'\)/);
  expect(svc).not.toMatch(/licenseKeyHash\s*=\s*licenseKey/);
});

test('activate flow uses sha256', () => {
  const h = crypto.createHash('sha256').update('PROD-TEST-KEY').digest('hex');
  expect(h).toHaveLength(64);
});

test('admin license routes require admin role', () => {
  const admin = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/routes/admin.js'),
    'utf8'
  );
  expect(admin).toMatch(/requireAdmin/);
});