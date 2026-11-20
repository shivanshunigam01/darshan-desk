import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(dir, '../src/pages/BookingPreparePage.jsx'), 'utf8');

describe('booking preparation wizard', () => {
  it('declares eight guided workflow steps', () => {
    expect(source).toContain("id: 'account'");
    expect(source).toContain("id: 'outcome'");
    expect(source).toContain('WizardProgressStepper');
    expect(source).toContain('AccountPicker');
    expect(source).toContain('PilgrimSelectCards');
    expect(source).toContain('DraftAutosaveStatus');
    expect(source).toContain('ConfirmDialog');
    const ids = source.match(/id: '/g);
    expect(ids?.length).toBe(8);
  });

  it('preserves draft, validate, and extension APIs', () => {
    expect(source).toContain('Save draft');
    expect(source).toContain('Previous');
    expect(source).toContain('Continue');
    expect(source).toContain('api.validate');
    expect(source).toContain('api.pairExtension');
    expect(source).toContain('contentRevision');
    expect(source).toContain('CAPTCHA');
  });
});