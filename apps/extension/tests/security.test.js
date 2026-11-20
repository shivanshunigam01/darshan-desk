import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestSource = fs.readFileSync(path.join(root, 'manifest.config.ts'), 'utf8');

test('manifest does not request cookie or webRequest permissions', () => {
  expect(manifestSource).not.toMatch(/cookies/);
  expect(manifestSource).not.toMatch(/webRequest/);
});

test('content scripts include mock booking and official TTD login assist hosts', () => {
  expect(manifestSource).toMatch(/mock-booking/);
  expect(manifestSource).toMatch(/tirupatibalaji\.ap\.gov\.in/);
  expect(manifestSource).not.toMatch(/ttdsevaonline/);
});

test('background API client avoids auth secret endpoints', () => {
  const api = fs.readFileSync(path.join(root, 'src/shared/api.ts'), 'utf8');
  expect(api).not.toMatch(/otp/i);
  expect(api).not.toMatch(/password/i);
  expect(api).not.toMatch(/captcha/i);
  expect(api).toMatch(/extension\/connect/);
  expect(api).toMatch(/fill-payload/);
  expect(api).toMatch(/x-extension-access-token/);
  expect(api).toMatch(/refresh-access/);
  expect(api).toMatch(/disconnect/);
});