import { auditPreparedPayload, buildFillPlan, validateValue, normalizePilgrims } from '../dist/index.js';

const sampleData = {
  preparationId: 'prep1',
  mappingProfileId: 'mock-srivani-v1',
  pilgrims: normalizePilgrims([
    {
      _id: 'a',
      fullName: 'Rama Krishna',
      age: 45,
      gender: 'M',
      idType: 'Aadhaar',
      idNumber: 'XXXX4521',
      mobile: '9876543210',
      city: 'Tirupati',
    },
  ]),
  permittedScalars: {
    donationAmount: 10000,
    bookingCategory: 'CURRENT',
    preferredDate: '2026-12-01',
  },
};

test('builds fill plan for selected pilgrims', () => {
  const plan = buildFillPlan(sampleData, ['a']);
  expect(plan.length).toBeGreaterThan(5);
  expect(plan.some((p) => p.definition.key === 'p0_fullName' && p.value === 'Rama Krishna')).toBe(true);
  expect(plan.some((p) => p.definition.key === 'donationAmount')).toBe(true);
});

test('does not include legal consent field values', () => {
  const plan = buildFillPlan(sampleData, ['a']);
  expect(plan.every((p) => p.definition.sourceProfileField !== '_skip')).toBe(true);
});

test('validates mobile pattern', () => {
  expect(validateValue('9876543210', { pattern: '^[0-9]{10}$' })).toBeNull();
  expect(validateValue('12', { pattern: '^[0-9]{10}$' })).toBeTruthy();
});

test('audits prepared payload donation minimum', () => {
  const audit = auditPreparedPayload({ ...sampleData, permittedScalars: { donationAmount: 5000, bookingCategory: 'CURRENT' } });
  expect(audit.ok).toBe(false);
});

test('rejects unknown mapping profile', () => {
  expect(buildFillPlan({ ...sampleData, mappingProfileId: 'live-srivani-current-v1' }, ['a'])).toEqual([]);
});