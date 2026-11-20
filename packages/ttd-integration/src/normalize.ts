import type { QuotaSummary } from "./types.js";

const nullableString = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  return String(v);
};

const numberField = (v: unknown): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  throw new Error("invalid number");
};

/** Preserve null strings; never coerce null → 0 for counters. */
export function normalizeQuotaRaw(raw: Record<string, unknown>): QuotaSummary {
  return {
    quotaCount: numberField(raw.quotaCount),
    slottime: nullableString(raw.slottime),
    minpersons: nullableString(raw.minpersons),
    maxpersons: nullableString(raw.maxpersons),
    advanceminpersons: nullableString(raw.advanceminpersons),
    advancemaxpersons: nullableString(raw.advancemaxpersons),
    noOfladdus: numberField(raw.noOfladdus),
    minAmount: numberField(raw.minAmount),
    advanceminAmount: numberField(raw.advanceminAmount),
    darshanAmount: numberField(raw.darshanAmount),
    maxAmount: numberField(raw.maxAmount),
    advancemaxAmount: numberField(raw.advancemaxAmount),
    success: numberField(raw.success),
    pending: numberField(raw.pending),
    failed: numberField(raw.failed),
    released: numberField(raw.released),
    quotaReleaseTime: nullableString(raw.quotaReleaseTime),
  };
}