import jwt from 'jsonwebtoken';
import { Operator } from '../models/index.js';
import { isLicenseEnforced, requireActiveLicense } from './agencyLicense.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

export function signToken(operator) {
  return jwt.sign(
    { sub: operator._id.toString(), agencyId: operator.agencyId.toString(), role: operator.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const operator = await Operator.findById(payload.sub);
    if (!operator) return res.status(401).json({ error: 'Invalid session' });
    req.operator = operator;
    req.agencyId = operator.agencyId;

    const url = req.originalUrl || '';
    if (operator.role === 'super_admin') {
      return next();
    }

    await touchOperatorActivity(operator);

    if (
      req._skipLicense ||
      !isLicenseEnforced() ||
      url.startsWith('/api/admin/license')
    ) {
      return next();
    }
    return requireActiveLicense(req, res, next);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** JWT + subscription license (when LICENSE_ENFORCE=true) */
export const requireOperator = [requireAuth];

export async function requireAdmin(req, res, next) {
  if (!['admin', 'super_admin'].includes(req.operator?.role)) {
    return res.status(403).json({ error: 'Admin role required' });
  }
  next();
}

export async function requireSuperAdmin(req, res, next) {
  if (req.operator?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin role required', code: 'SUPER_ADMIN_REQUIRED' });
  }
  next();
}

const ACTIVITY_TOUCH_MS = Number(process.env.OPERATOR_ACTIVITY_TOUCH_MS || 15 * 60 * 1000);

async function touchOperatorActivity(operator) {
  const now = Date.now();
  const last = operator.lastActiveAt ? new Date(operator.lastActiveAt).getTime() : 0;
  if (now - last < ACTIVITY_TOUCH_MS) return;
  operator.lastActiveAt = new Date();
  await Operator.updateOne({ _id: operator._id }, { $set: { lastActiveAt: operator.lastActiveAt } }).catch(() => null);
}