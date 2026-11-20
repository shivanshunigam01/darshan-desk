import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(256),
});

const pilgrimRegisterRow = z.object({
  fullName: z.string().min(2).max(120),
  age: z.coerce.number().int().min(0).max(120),
  gender: z.string().min(1).max(32),
  idType: z.enum(['Aadhaar Card', 'Passport', 'PAN', 'Other']),
  idNumber: z.string().min(4).max(64),
  mobile: z.string().min(10).max(15).optional(),
  city: z.string().min(1).max(80).optional(),
});

export const registerSchema = z.object({
  agencyName: z.string().min(2).max(120),
  displayName: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(256),
  consentAcknowledged: z.literal(true),
  donationAmount: z.coerce.number().min(1000).optional(),
  bookingCategory: z.enum(['CURRENT', 'ADVANCE']).optional(),
  ttdAccount: z
    .object({
      accountLabel: z.string().min(1).max(120),
      loginIdentifier: z.string().min(3).max(200),
    })
    .optional(),
  pilgrims: z.array(pilgrimRegisterRow).max(4).optional(),
});

export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i);

export function validateBody(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    req.validatedBody = parsed.data;
    next();
  };
}