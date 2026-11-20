import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const policy = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/fixtures/ttdPolicySample.json'), 'utf8'));
const uiRef = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/fixtures/ttdOfficialUiReference.json'), 'utf8'));
const sample = uiRef.quotaStatusBar.sampleFixtureMapping;

test('policy fixture matches TTD screenshot sample values', () => {
  expect(policy.minimumDonation).toBe(10000);
  expect(policy.maximumCurrentPilgrims).toBe(4);
  expect(policy.maximumAdvancePilgrims).toBe(9);
  expect(policy.reportingTime).toBe('04:00 PM');
  expect(policy.releaseTime).toBe('11:03:00');
});

test('UI reference mapping stays aligned with policy fixture', () => {
  expect(sample.minimumDonation).toBe(policy.minimumDonation);
  expect(sample.maximumCurrentPilgrims).toBe(policy.maximumCurrentPilgrims);
  expect(sample.quotaReleaseTime).toBe(policy.releaseTime);
  expect(sample.reportingTime).toBe(policy.reportingTime);
});