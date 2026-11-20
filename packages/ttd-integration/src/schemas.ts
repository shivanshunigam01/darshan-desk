import { z } from "zod";
import { normalizeQuotaRaw } from "./normalize.js";

const nullableString = z.union([z.string(), z.null()]);

export const quotaSummarySchema = z.object({
  quotaCount: z.number(),
  slottime: nullableString,
  minpersons: nullableString,
  maxpersons: nullableString,
  advanceminpersons: nullableString,
  advancemaxpersons: nullableString,
  noOfladdus: z.number(),
  minAmount: z.number(),
  advanceminAmount: z.number(),
  darshanAmount: z.number(),
  maxAmount: z.number(),
  advancemaxAmount: z.number(),
  success: z.number(),
  pending: z.number(),
  failed: z.number(),
  released: z.number(),
  quotaReleaseTime: nullableString,
});

export const quotaRawResponseSchema = z
  .object({
    data: quotaSummarySchema.optional(),
    applicableDate: z.union([z.string(), z.null()]).optional(),
  })
  .passthrough()
  .or(quotaSummarySchema);

export const countriesSchema = z.array(
  z.object({
    countryId: z.union([z.string(), z.number()]).transform(String),
    countryName: z.string(),
    states: z
      .array(
        z.object({
          stateId: z.union([z.string(), z.number()]).transform(String),
          stateName: z.string(),
        })
      )
      .optional(),
  })
);

export const trustsSchema = z.array(
  z.object({
    trustId: z.union([z.string(), z.number()]).transform(String),
    trustName: z.string(),
    subTrusts: z
      .array(
        z.object({
          subTrustId: z.union([z.string(), z.number()]).transform(String),
          subTrustName: z.string(),
        })
      )
      .optional(),
  })
);

export const personLimitSchema = z.object({
  noOfPersons: z.number(),
  amount: z.number().optional(),
});

export const userContextSchema = z
  .object({
    userId: z.union([z.string(), z.number()]).transform(String),
    userName: z.string().optional(),
  })
  .passthrough();

export function parseQuotaSummary(raw: unknown) {
  const parsed = quotaRawResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error };
  }
  const val = parsed.data;
  const envelope = typeof val === "object" && val !== null && "data" in val ? (val as { data?: unknown; applicableDate?: string | null }) : null;
  const summary =
    envelope?.data ?? (val as z.infer<typeof quotaSummarySchema>);
  const inner = quotaSummarySchema.safeParse(summary);
  if (!inner.success) {
    try {
      const normalized = normalizeQuotaRaw(summary as Record<string, unknown>);
      return {
        ok: true as const,
        data: normalized,
        applicableDate: envelope?.applicableDate ?? null,
      };
    } catch {
      return { ok: false as const, error: inner.error };
    }
  }
  return {
    ok: true as const,
    data: inner.data,
    applicableDate: envelope?.applicableDate ?? null,
  };
}