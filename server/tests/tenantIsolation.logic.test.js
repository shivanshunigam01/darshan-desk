import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const serverSrc = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src');

const TENANT_SCOPED_ROUTES = [
  'routes/preparations.js',
  'routes/catalog.js',
  'routes/reliability.js',
  'routes/quota.js',
  'routes/ttd.js',
];

test('tenant-scoped routes reference agencyId from auth context', () => {
  for (const rel of TENANT_SCOPED_ROUTES) {
    const text = fs.readFileSync(path.join(serverSrc, rel), 'utf8');
    expect(text).toMatch(/req\.agencyId/);
    expect(text).toMatch(/requireAuth/);
  }
});

test('reliability service filters by agencyId', () => {
  const text = fs.readFileSync(path.join(serverSrc, 'services/reliabilityService.js'), 'utf8');
  expect(text).toMatch(/agencyFilter/);
  expect(text).toMatch(/agencyId/);
});

test('requireAuth chains subscription license enforcement', () => {
  const text = fs.readFileSync(path.join(serverSrc, 'middleware/auth.js'), 'utf8');
  expect(text).toMatch(/requireActiveLicense/);
  expect(text).toMatch(/\/api\/admin\/license/);
});

test('extension connect checks agency license server-side', () => {
  const text = fs.readFileSync(path.join(serverSrc, 'services/extensionFillService.js'), 'utf8');
  expect(text).toMatch(/assertAgencyLicense/);
});