import type { QuotaSummary } from './types.js';

const REQUIRED_KEYS: (keyof QuotaSummary)[] = [
  'quotaCount',
  'slottime',
  'minpersons',
  'maxpersons',
  'advanceminpersons',
  'advancemaxpersons',
  'noOfladdus',
  'minAmount',
  'advanceminAmount',
  'darshanAmount',
  'maxAmount',
  'advancemaxAmount',
  'success',
  'pending',
  'failed',
  'released',
  'quotaReleaseTime',
];

export function normalizeQuotaSummary(
  raw: Partial<QuotaSummary> & Record<string, unknown>
): { summary: QuotaSummary | null; errors: string[]; missingFields: string[] } {
  const missingFields = REQUIRED_KEYS.filter((k) => raw[k] === undefined || raw[k] === null || raw[k] === '');
  const errors: string[] = [];

  if (missingFields.length > 0) {
    errors.push(`Missing quota fields: ${missingFields.join(', ')}`);
  }

  const summary: QuotaSummary = {
    quotaCount: num(raw.quotaCount, 0),
    slottime: str(raw.slottime),
    minpersons: str(raw.minpersons),
    maxpersons: str(raw.maxpersons),
    advanceminpersons: str(raw.advanceminpersons),
    advancemaxpersons: str(raw.advancemaxpersons),
    noOfladdus: num(raw.noOfladdus, 0),
    minAmount: num(raw.minAmount, 0),
    advanceminAmount: num(raw.advanceminAmount, 0),
    darshanAmount: num(raw.darshanAmount, 0),
    maxAmount: num(raw.maxAmount, 0),
    advancemaxAmount: num(raw.advancemaxAmount, 0),
    success: num(raw.success, 0),
    pending: num(raw.pending, 0),
    failed: num(raw.failed, 0),
    released: num(raw.released, 0),
    quotaReleaseTime: str(raw.quotaReleaseTime),
  };

  return {
    summary: missingFields.length === 0 ? summary : null,
    errors,
    missingFields,
  };
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}