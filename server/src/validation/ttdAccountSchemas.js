import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const createTtdAccountSchema = z
  .object({
    accountLabel: z.string().min(1).max(120),
    loginIdentifier: z.string().min(3).max(200),
    ownerId: objectId.optional(),
    maskedIdentifier: z.string().max(80).optional(),
    assignedOperatorIds: z.array(objectId).optional(),
  })
  .strict();

export const updateTtdAccountSchema = z
  .object({
    accountLabel: z.string().min(1).max(120).optional(),
    loginIdentifier: z.string().min(3).max(200).optional(),
    ownerId: objectId.optional(),
    maskedIdentifier: z.string().max(80).optional(),
  })
  .strict();

export const consentSchema = z.object({ acknowledged: z.literal(true) });

export const assignOperatorsSchema = z.object({
  operatorIds: z.array(z.coerce.string().regex(/^[a-f\d]{24}$/i, 'Invalid operator id')).max(50),
});

export const verificationSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  verificationStatus: z.enum(['verified', 'failed', 'expired', 'unverified']),
});

export function rejectForbiddenCredentialKeys(body) {
  for (const key of Object.keys(body || {})) {
    if (/password|otp|captcha|cookie|session/i.test(key)) {
      const err = new Error(`Field "${key}" is not allowed on account references`);
      err.status = 400;
      throw err;
    }
  }
}