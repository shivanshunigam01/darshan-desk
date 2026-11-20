import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const monitor = readFileSync(join(dir, '../src/components/quota/SrivaniQuotaMonitor.tsx'), 'utf8');

describe('SrivaniQuotaMonitor', () => {
  it('renders all required metric titles', () => {
    const required = [
      'Available quota',
      'Successful bookings',
      'Payment pending',
      'Failed bookings',
      'Total released',
      'Quota release time',
      'Darshan slot time',
      'Donation minimum',
      'Current-day pilgrim limit',
      'Advance pilgrim limit',
      'Data freshness',
      'Provider connection',
    ];
    for (const title of required) {
      expect(monitor).toContain(title);
    }
  });

  it('includes skeleton and stale messaging', () => {
    expect(monitor).toContain('SkeletonGrid');
    expect(monitor).toContain('Stale snapshot');
    expect(monitor).toContain('NOT CONFIGURED');
    expect(monitor).toContain('QuotaOutcomeChart');
    expect(monitor).toContain('dd-kpi-stagger');
  });
});