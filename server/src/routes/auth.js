import express from 'express';
import bcrypt from 'bcryptjs';
import { Operator } from '../models/index.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { getAgencyLicenseStatus } from '../services/agencyLicenseService.js';
import { loginRateLimiter } from '../middleware/security.js';
import { loginSchema, registerSchema, validateBody } from '../validation/schemas.js';
import { registerExtensionUser } from '../services/registerService.js';

const router = express.Router();

router.post('/login', loginRateLimiter(), validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.validatedBody;
  const operator = await Operator.findOne({ email: email.toLowerCase() });
  if (!operator || !(await bcrypt.compare(password, operator.passwordHash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const now = new Date();
  operator.lastLoginAt = now;
  operator.lastActiveAt = now;
  await operator.save();
  const token = signToken(operator);
  res.json({
    token,
    operator: {
      id: operator._id,
      email: operator.email,
      displayName: operator.displayName,
      agencyId: operator.agencyId,
      role: operator.role,
    },
  });
});

router.post('/register', loginRateLimiter(), validateBody(registerSchema), async (req, res, next) => {
  try {
    const body = req.validatedBody;
    for (const key of Object.keys(req.body || {})) {
      if (/password|otp|captcha|ttdPassword|portalPassword/i.test(key) && key !== 'password') {
        return res.status(400).json({ error: `Field "${key}" is not accepted on registration` });
      }
    }
    const result = await registerExtensionUser(body);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const license = await getAgencyLicenseStatus(req.agencyId);
  res.json({
    operator: {
      id: req.operator._id,
      email: req.operator.email,
      displayName: req.operator.displayName,
      agencyId: req.operator.agencyId,
      role: req.operator.role,
    },
    license,
  });
});

export default router;