import { describe, expect, it } from 'vitest';
import { agencyNav, platformNav } from '../src/config/navigation.js';

describe('agency navigation (simplified)', () => {
  it('has five operator sections', () => {
    expect(agencyNav).toHaveLength(5);
    expect(agencyNav.map((n) => n.label)).toEqual([
      'Dashboard',
      'TTD Login',
      'Pilgrims',
      'Autofill on TTD',
      'Settings',
    ]);
  });
});

describe('platform navigation', () => {
  it('includes super-admin command center and license', () => {
    expect(platformNav.some((n) => n.to === '/admin/command-center' && n.superAdminOnly)).toBe(true);
    expect(platformNav.some((n) => n.to === '/admin/license')).toBe(true);
  });
});