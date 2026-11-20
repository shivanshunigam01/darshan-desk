const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Parse HH:mm:ss or hh:mm AM/PM release time for remaining-time estimates (same calendar day, IST). */
export function parseReleaseTimeOnDate(
  quotaReleaseTime: string,
  referenceUtc: Date
): { valid: boolean; releaseUtc?: Date; error?: string } {
  const trimmed = quotaReleaseTime.trim();
  if (!trimmed) return { valid: false, error: 'Empty release time' };

  const istNow = new Date(referenceUtc.getTime() + IST_OFFSET_MS);
  const y = istNow.getUTCFullYear();
  const m = istNow.getUTCMonth();
  const d = istNow.getUTCDate();

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  const ampm = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (ampm) {
    hours = parseInt(ampm[1], 10);
    minutes = parseInt(ampm[2], 10);
    seconds = ampm[3] ? parseInt(ampm[3], 10) : 0;
    const pm = ampm[4].toUpperCase() === 'PM';
    if (hours === 12) hours = pm ? 12 : 0;
    else if (pm) hours += 12;
  } else {
    const hms = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!hms) return { valid: false, error: `Invalid release time format: ${quotaReleaseTime}` };
    hours = parseInt(hms[1], 10);
    minutes = parseInt(hms[2], 10);
    seconds = hms[3] ? parseInt(hms[3], 10) : 0;
  }

  if (hours > 23 || minutes > 59 || seconds > 59) {
    return { valid: false, error: `Invalid release time components: ${quotaReleaseTime}` };
  }

  const releaseIstAsUtcFields = Date.UTC(y, m, d, hours, minutes, seconds);
  const releaseUtc = new Date(releaseIstAsUtcFields - IST_OFFSET_MS);
  return { valid: true, releaseUtc };
}

export function remainingMsUntilRelease(quotaReleaseTime: string, nowUtc: Date): number | null {
  const parsed = parseReleaseTimeOnDate(quotaReleaseTime, nowUtc);
  if (!parsed.valid || !parsed.releaseUtc) return null;
  return parsed.releaseUtc.getTime() - nowUtc.getTime();
}

export function formatUtcAsIst(isoUtc: string | Date): string {
  const d = typeof isoUtc === 'string' ? new Date(isoUtc) : isoUtc;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(d);
}

export function freshnessFromObservedAt(observedAtUtc: string, nowUtc: Date, staleAfterMs = 5 * 60 * 1000) {
  const age = nowUtc.getTime() - new Date(observedAtUtc).getTime();
  if (!Number.isFinite(age) || age < 0) return 'unknown' as const;
  return age > staleAfterMs ? ('stale' as const) : ('fresh' as const);
}