import { JSDOM } from 'jsdom';
import {
  buildFillPlan,
  detectCaptchaRequired,
  executeFillPlan,
  mapPilgrimRowsById,
  normalizePilgrims,
  orderPilgrimsBySelection,
  verifyFillResults,
} from '../dist/index.js';

const pilgrimBlock = (i, id = '') => `
<div data-pilgrim-index="${i}" data-dd-pilgrim-id="${id}">
  <input data-dd-field="pilgrim-${i}-fullName" />
  <input data-dd-field="pilgrim-${i}-dateOfBirth" type="date" />
  <input data-dd-field="pilgrim-${i}-age" type="number" />
  <select data-dd-field="pilgrim-${i}-gender">
    <option value="">Select</option>
    <option value="M">Male</option>
    <option value="F">Female</option>
    <option value="T">Transgender</option>
  </select>
  <select data-dd-field="pilgrim-${i}-idType">
    <option value="">Select</option>
    <option value="Aadhaar">Aadhaar Card</option>
    <option value="Passport">Passport</option>
  </select>
  <input data-dd-field="pilgrim-${i}-idNumber" />
  <input data-dd-field="pilgrim-${i}-mobile" />
  <input data-dd-field="pilgrim-${i}-city" />
</div>`;

function bootDom(html) {
  const dom = new JSDOM(html, { url: 'http://localhost:4000/mock-booking/' });
  const { window } = dom;
  const doc = window.document;
  global.HTMLElement = window.HTMLElement;
  global.HTMLInputElement = window.HTMLInputElement;
  global.HTMLSelectElement = window.HTMLSelectElement;
  global.HTMLTextAreaElement = window.HTMLTextAreaElement;
  window.Element.prototype.getBoundingClientRect = function () {
    return { width: 120, height: 24, top: 0, left: 0, right: 120, bottom: 24, x: 0, y: 0, toJSON() { return {}; } };
  };
  return doc;
}

const pilgrimTemplate = (overrides = {}) => ({
  fullName: 'Ananya Devi',
  age: 32,
  gender: 'F',
  idType: 'Aadhaar',
  idNumber: 'XXXX1234',
  mobile: '9876543210',
  city: 'Tirupati',
  dateOfBirth: '1993-06-15',
  ...overrides,
});

test('end-to-end fill against mock TTD-style DOM', () => {
  const doc = bootDom(`<html><body data-dd-mapping="mock-srivani-v1">
      ${pilgrimBlock(0, 'p1')}
      <input data-dd-field="donation-amount" type="number" />
      <input type="radio" data-dd-field="booking-category" value="CURRENT" checked />
      <input data-dd-field="preferred-date" type="date" />
      <input data-dd-field="legal-consent" type="checkbox" />
    </body></html>`);

  const data = {
    preparationId: 'prep-e2e',
    mappingProfileId: 'mock-srivani-v1',
    contentRevision: 2,
    pilgrims: normalizePilgrims([{ _id: 'p1', ...pilgrimTemplate() }]),
    permittedScalars: { donationAmount: 10000, bookingCategory: 'CURRENT', preferredDate: '2026-12-01' },
    rowMappings: [{ pilgrimId: 'p1', rowIndex: 0 }],
  };

  const rowMap = mapPilgrimRowsById(doc, ['p1']);
  const plan = buildFillPlan(data, ['p1'], { includeScalars: true, rowIndexByPilgrimId: rowMap });
  const results = executeFillPlan(doc, plan, { allowOverwrite: false, duplicateSessionKey: 'prep-e2e' });
  const validation = verifyFillResults(plan, results);

  expect(validation.ok).toBe(true);
  expect(doc.querySelector('[data-dd-field="pilgrim-0-fullName"]').value).toBe('Ananya Devi');
  expect(doc.querySelector('[data-dd-field="pilgrim-0-gender"]').value).toBe('F');
  expect(doc.querySelector('[data-dd-field="donation-amount"]').value).toBe('10000');
  expect(doc.querySelector('[data-dd-field="legal-consent"]').checked).toBe(false);
});

test.each([1, 2, 3, 4])('fills %i pilgrim rows in stable id order', (count) => {
  const ids = Array.from({ length: count }, (_, i) => `p${i + 1}`);
  const html = ids.map((id, i) => pilgrimBlock(i, id)).join('');
  const doc = bootDom(`<html><body data-dd-mapping="mock-srivani-v1">${html}</body></html>`);
  const pilgrims = normalizePilgrims(
    ids.map((id, i) => ({ _id: id, ...pilgrimTemplate({ fullName: `Pilgrim ${i + 1}` }) }))
  );
  const data = { preparationId: 'prep-multi', mappingProfileId: 'mock-srivani-v1', pilgrims, permittedScalars: {} };
  const ordered = orderPilgrimsBySelection(data, [...ids].reverse());
  expect(ordered[0].id).toBe(`p${count}`);
  const plan = buildFillPlan(data, ids, { includeScalars: false, rowIndexByPilgrimId: mapPilgrimRowsById(doc, ids) });
  const validation = verifyFillResults(plan, executeFillPlan(doc, plan, { allowOverwrite: true, duplicateSessionKey: `m-${count}` }));
  expect(validation.ok).toBe(true);
});

test('passport id type maps to dropdown label', () => {
  const doc = bootDom(`<html><body data-dd-mapping="mock-srivani-v1">${pilgrimBlock(0, 'px')}</body></html>`);
  const data = {
    preparationId: 'prep-passport',
    mappingProfileId: 'mock-srivani-v1',
    pilgrims: normalizePilgrims([{ _id: 'px', ...pilgrimTemplate({ idType: 'Passport', idNumber: 'Z99999' }) }]),
    permittedScalars: {},
  };
  const plan = buildFillPlan(data, ['px'], { rowIndexByPilgrimId: mapPilgrimRowsById(doc, ['px']) });
  const results = executeFillPlan(doc, plan, { allowOverwrite: true, duplicateSessionKey: 'passport' });
  expect(results.find((r) => r.key.endsWith('idType')).status).toBe('verified');
});

test('unknown gender option fails clearly', () => {
  const doc = bootDom(`<html><body data-dd-mapping="mock-srivani-v1">
    <select data-dd-field="pilgrim-0-gender"><option value="M">Male</option></select>
  </body></html>`);
  const data = {
    preparationId: 'prep-g',
    mappingProfileId: 'mock-srivani-v1',
    pilgrims: normalizePilgrims([{ _id: 'g1', ...pilgrimTemplate({ gender: 'F' }) }]),
    permittedScalars: {},
  };
  const plan = buildFillPlan(data, ['g1']);
  const genderResult = executeFillPlan(doc, plan, { allowOverwrite: true, duplicateSessionKey: 'g' }).find((r) =>
    r.key.endsWith('gender')
  );
  expect(genderResult.status).toBe('dropdown_unknown_option');
});

test('detects CAPTCHA fixture', () => {
  const doc = bootDom(
    `<html><body><div data-dd-captcha style="display:block;width:100px;height:20px">captcha</div></body></html>`
  );
  expect(detectCaptchaRequired(doc)).toBe(true);
});

test('duplicate pilgrim names fill distinct stable row ids', () => {
  const ids = ['dup-a', 'dup-b'];
  const html = ids.map((id, i) => pilgrimBlock(i, id)).join('');
  const doc = bootDom(`<html><body data-dd-mapping="mock-srivani-v1">${html}</body></html>`);
  const pilgrims = normalizePilgrims(
    ids.map((id) => ({ _id: id, ...pilgrimTemplate({ fullName: 'Same Legal Name' }) }))
  );
  const data = { preparationId: 'prep-dup', mappingProfileId: 'mock-srivani-v1', pilgrims, permittedScalars: {} };
  const plan = buildFillPlan(data, ids, { rowIndexByPilgrimId: mapPilgrimRowsById(doc, ids) });
  const validation = verifyFillResults(
    plan,
    executeFillPlan(doc, plan, { allowOverwrite: true, duplicateSessionKey: 'dup-names' })
  );
  expect(validation.ok).toBe(true);
  expect(doc.querySelector('[data-dd-field="pilgrim-0-fullName"]').value).toBe('Same Legal Name');
  expect(doc.querySelector('[data-dd-field="pilgrim-1-fullName"]').value).toBe('Same Legal Name');
});

test('missing passport option fails for passport profile', () => {
  const doc = bootDom(`<html><body data-dd-mapping="mock-srivani-v1">
    <select data-dd-field="pilgrim-0-idType"><option value="Aadhaar">Aadhaar Card</option></select>
  </body></html>`);
  const data = {
    preparationId: 'prep-missing-passport',
    mappingProfileId: 'mock-srivani-v1',
    pilgrims: normalizePilgrims([{ _id: 'p1', ...pilgrimTemplate({ idType: 'Passport' }) }]),
    permittedScalars: {},
  };
  const plan = buildFillPlan(data, ['p1']);
  const idType = executeFillPlan(doc, plan, { allowOverwrite: true, duplicateSessionKey: 'no-passport' }).find((r) =>
    r.key.endsWith('idType')
  );
  expect(idType.status).toBe('dropdown_unknown_option');
});

test('updated profile name wins after revision reload', () => {
  const doc = bootDom(`<html><body data-dd-mapping="mock-srivani-v1">${pilgrimBlock(0, 'rev1')}</body></html>`);
  const mkData = (name, revision) => ({
    preparationId: 'prep-rev',
    mappingProfileId: 'mock-srivani-v1',
    contentRevision: revision,
    pilgrims: normalizePilgrims([{ _id: 'rev1', ...pilgrimTemplate({ fullName: name }) }]),
    permittedScalars: {},
  });
  const fillOnce = (data) => {
    const plan = buildFillPlan(data, ['rev1'], { rowIndexByPilgrimId: mapPilgrimRowsById(doc, ['rev1']) });
    return executeFillPlan(doc, plan, { allowOverwrite: true, duplicateSessionKey: `rev-${data.contentRevision}` });
  };
  fillOnce(mkData('Old Name', 1));
  doc.documentElement.removeAttribute('data-dd-session');
  const validation = verifyFillResults(
    buildFillPlan(mkData('New Name', 2), ['rev1'], { rowIndexByPilgrimId: mapPilgrimRowsById(doc, ['rev1']) }),
    fillOnce(mkData('New Name', 2))
  );
  expect(validation.ok).toBe(true);
  expect(doc.querySelector('[data-dd-field="pilgrim-0-fullName"]').value).toBe('New Name');
});

test('unsupported page mapping rejects fill plan build', () => {
  expect(() => buildFillPlan({ preparationId: 'x', mappingProfileId: 'unknown-live', pilgrims: [], permittedScalars: {} }, [])).toThrow(
    /Unknown mapping profile/
  );
});