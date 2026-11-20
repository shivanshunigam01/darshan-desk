import { jest } from '@jest/globals';

const findById = jest.fn();

jest.unstable_mockModule('../src/models/index.js', () => ({
  Agency: { findById },
  Operator: {},
}));

const { licenseDenialForAgency, requireActiveLicense, isLicenseEnforced } = await import(
  '../src/middleware/agencyLicense.js'
);

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('licenseDenialForAgency', () => {
  const prev = process.env.LICENSE_ENFORCE;
  beforeAll(() => {
    process.env.LICENSE_ENFORCE = 'true';
  });
  afterAll(() => {
    process.env.LICENSE_ENFORCE = prev;
  });

  test('active license allows', () => {
    expect(licenseDenialForAgency({ licenseStatus: 'active' })).toBeNull();
  });

  test('trial license allows', () => {
    expect(licenseDenialForAgency({ licenseStatus: 'trial' })).toBeNull();
  });

  test('revoked -> 403 LICENSE_REVOKED', () => {
    const d = licenseDenialForAgency({ licenseStatus: 'revoked' });
    expect(d.code).toBe('LICENSE_REVOKED');
    expect(d.status).toBe(403);
  });

  test('suspended -> 403 LICENSE_SUSPENDED', () => {
    const d = licenseDenialForAgency({ licenseStatus: 'suspended' });
    expect(d.code).toBe('LICENSE_SUSPENDED');
  });

  test('expired -> 403 LICENSE_EXPIRED', () => {
    const past = new Date(Date.now() - 1000);
    const d = licenseDenialForAgency({ licenseStatus: 'active', licenseExpiresAt: past });
    expect(d.code).toBe('LICENSE_EXPIRED');
  });

  test('unknown agency -> LICENSE_UNKNOWN', () => {
    const d = licenseDenialForAgency(null);
    expect(d.code).toBe('LICENSE_UNKNOWN');
  });
});

describe('requireActiveLicense middleware', () => {
  const prev = process.env.LICENSE_ENFORCE;

  beforeEach(() => {
    process.env.LICENSE_ENFORCE = 'true';
    findById.mockReset();
  });

  afterAll(() => {
    process.env.LICENSE_ENFORCE = prev;
  });

  test('skips when LICENSE_ENFORCE not true', async () => {
    process.env.LICENSE_ENFORCE = 'false';
    const next = jest.fn();
    await requireActiveLicense({ agencyId: 'x' }, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('responds 403 when agency revoked', async () => {
    findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ licenseStatus: 'revoked' }),
    });
    const res = mockRes();
    const next = jest.fn();
    await requireActiveLicense({ agencyId: '507f1f77bcf86cd799439011' }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'LICENSE_REVOKED' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next when agency active', async () => {
    findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ licenseStatus: 'active', licenseExpiresAt: null }),
    });
    const next = jest.fn();
    await requireActiveLicense({ agencyId: '507f1f77bcf86cd799439011' }, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });
});

test('isLicenseEnforced reads env flag', () => {
  const before = process.env.LICENSE_ENFORCE;
  process.env.LICENSE_ENFORCE = 'true';
  expect(isLicenseEnforced()).toBe(true);
  process.env.LICENSE_ENFORCE = before;
});