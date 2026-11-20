import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const dashboard = readFileSync(join(dir, '../src/pages/DashboardPage.jsx'), 'utf8');
const quotaPage = readFileSync(join(dir, '../src/pages/QuotaDashboardPage.tsx'), 'utf8');

describe('Agency command center UI', () => {
  it('dashboard uses live APIs and command center sections', () => {
    expect(dashboard).toContain('Step 3: Autofill');
    expect(dashboard).toContain('extensionActivePreparation');
    expect(dashboard).toContain('Official booking flow');
  });

  it('quota monitor page wires premium layout', () => {
    expect(quotaPage).toContain('SRIVANI operations console');
    expect(quotaPage).toContain('SrivaniQuotaMonitor');
    expect(quotaPage).toContain('showHeader={false}');
  });
});