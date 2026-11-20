import jwt from 'jsonwebtoken';
import {
  issueExtensionAccessToken,
  verifyExtensionAccessToken,
  hashAccessToken,
} from '../src/services/extensionAuthService.js';

const secret = 'test-secret';
process.env.JWT_SECRET = secret;

test('issues and verifies short-lived extension access token', () => {
  const conn = {
    _id: { toString: () => 'conn1' },
    extensionInstanceId: 'inst-abc',
    accessTokenHash: undefined,
    accessTokenExpiresAt: undefined,
    revokedAt: undefined,
  };
  const { accessToken, expiresAt } = issueExtensionAccessToken(conn, 'agency1', 'prep1');
  conn.accessTokenHash = hashAccessToken(accessToken);
  conn.accessTokenExpiresAt = expiresAt;
  const payload = verifyExtensionAccessToken(accessToken, conn);
  expect(payload.preparationId).toBe('prep1');
  expect(payload.agencyId).toBe('agency1');
});

test('rejects revoked extension access', () => {
  const conn = {
    _id: { toString: () => 'conn1' },
    extensionInstanceId: 'inst-abc',
    revokedAt: new Date(),
  };
  const token = jwt.sign({ typ: 'dd-ext', connId: 'conn1' }, secret, { expiresIn: '5m' });
  expect(() => verifyExtensionAccessToken(token, conn)).toThrow(/revoked/i);
});

test('rejects superseded token hash', () => {
  const conn = {
    _id: { toString: () => 'conn1' },
    extensionInstanceId: 'inst-abc',
    accessTokenHash: undefined,
    accessTokenExpiresAt: undefined,
    revokedAt: undefined,
  };
  const { accessToken, expiresAt } = issueExtensionAccessToken(conn, 'agency1', 'prep1');
  conn.accessTokenHash = hashAccessToken('rotated-token');
  conn.accessTokenExpiresAt = expiresAt;
  expect(() => verifyExtensionAccessToken(accessToken, conn)).toThrow(/superseded/i);
});