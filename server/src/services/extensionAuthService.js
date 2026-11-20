import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
export const EXTENSION_ACCESS_TTL_SEC = Number(process.env.EXTENSION_ACCESS_TTL_SEC || 900);

export function hashAccessToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function issueExtensionAccessToken(conn, agencyId, preparationId) {
  const token = jwt.sign(
    {
      typ: 'dd-ext',
      connId: conn._id.toString(),
      agencyId: agencyId.toString(),
      preparationId: preparationId.toString(),
      extensionInstanceId: conn.extensionInstanceId,
    },
    JWT_SECRET,
    { expiresIn: EXTENSION_ACCESS_TTL_SEC }
  );
  const expiresAt = new Date(Date.now() + EXTENSION_ACCESS_TTL_SEC * 1000);
  return { accessToken: token, expiresAt, expiresInSec: EXTENSION_ACCESS_TTL_SEC };
}

export function verifyExtensionAccessToken(accessToken, conn) {
  if (!accessToken) {
    const err = new Error('Expired or missing extension access token');
    err.status = 401;
    err.code = 'EXT_ACCESS_EXPIRED';
    throw err;
  }
  if (conn.revokedAt) {
    const err = new Error('Extension access revoked');
    err.status = 403;
    err.code = 'EXT_ACCESS_REVOKED';
    throw err;
  }
  let payload;
  try {
    payload = jwt.verify(accessToken, JWT_SECRET);
  } catch {
    const err = new Error('Expired or invalid extension access token');
    err.status = 401;
    err.code = 'EXT_ACCESS_EXPIRED';
    throw err;
  }
  if (payload.typ !== 'dd-ext' || payload.connId !== conn._id.toString()) {
    const err = new Error('Extension access token mismatch');
    err.status = 403;
    throw err;
  }
  if (conn.extensionInstanceId && payload.extensionInstanceId !== conn.extensionInstanceId) {
    const err = new Error('Extension instance mismatch');
    err.status = 403;
    throw err;
  }
  if (conn.accessTokenHash) {
    const h = hashAccessToken(accessToken);
    if (h !== conn.accessTokenHash) {
      const err = new Error('Extension access token superseded — refresh or reconnect');
      err.status = 401;
      err.code = 'EXT_ACCESS_EXPIRED';
      throw err;
    }
  }
  if (conn.accessTokenExpiresAt && new Date(conn.accessTokenExpiresAt) < new Date()) {
    const err = new Error('Extension access token expired');
    err.status = 401;
    err.code = 'EXT_ACCESS_EXPIRED';
    throw err;
  }
  return payload;
}