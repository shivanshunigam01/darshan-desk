import { maskIdNumber, sanitizeExtensionFillReport } from '../src/utils/maskSensitive.js';

test('maskIdNumber keeps last four only', () => {
  expect(maskIdNumber('123456789012')).toBe('********9012');
  expect(maskIdNumber('ab')).toBe('****');
});

test('sanitizeExtensionFillReport redacts id number fields', () => {
  const safe = sanitizeExtensionFillReport({
    results: [{ key: 'p0_idNumber', expected: '123456789012', actual: '123456789012', status: 'verified' }],
  });
  expect(safe.results[0].expected).not.toBe('123456789012');
  expect(safe.results[0].expected.endsWith('9012')).toBe(true);
});