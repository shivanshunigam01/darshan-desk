import { validateAgainstPolicy } from '../src/services/validationRules.js';

const policy = {
  minimumDonation: 10000,
  maximumDonation: 500000,
  maximumCurrentPilgrims: 4,
  maximumAdvancePilgrims: 9,
  releaseTime: '11:03:00',
  reportingTime: '04:00 PM',
  policyVersion: 'test-v1',
};

const pilgrim = {
  _id: '1',
  fullName: 'Test',
  age: 40,
  gender: 'M',
  idType: 'Aadhaar',
  idNumber: 'X',
  mobile: '9',
  city: 'Tirupati',
};

test('rejects donation below official minimum', () => {
  const result = validateAgainstPolicy(
    {
      trustCategory: 'SRIVANI',
      bookingCategory: 'CURRENT',
      donationAmount: 5000,
      pilgrimIds: ['1'],
    },
    policy,
    [pilgrim]
  );
  expect(result.passed).toBe(false);
  expect(result.errors.some((e) => /10[, ]?000/.test(e))).toBe(true);
});

test('enforces current pilgrim maximum of 4', () => {
  const result = validateAgainstPolicy(
    {
      trustCategory: 'SRIVANI',
      bookingCategory: 'CURRENT',
      donationAmount: 10000,
      pilgrimIds: ['1', '2', '3', '4', '5'],
    },
    policy,
    [pilgrim, pilgrim, pilgrim, pilgrim, pilgrim]
  );
  expect(result.passed).toBe(false);
  expect(result.errors.some((e) => e.includes('4'))).toBe(true);
});

test('passes valid current booking with consent', () => {
  const result = validateAgainstPolicy(
    {
      trustCategory: 'SRIVANI',
      bookingCategory: 'CURRENT',
      donationAmount: 15000,
      pilgrimIds: ['1'],
    },
    policy,
    [pilgrim],
    { requireConsent: true, consentRecordedAt: new Date() }
  );
  expect(result.passed).toBe(true);
});