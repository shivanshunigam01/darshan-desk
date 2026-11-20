import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(256),
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