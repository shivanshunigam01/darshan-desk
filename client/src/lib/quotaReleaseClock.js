const TZ = 'Asia/Kolkata';

/** Parse official HH:mm:ss release time against today's IST calendar. */
export function remainingUntilRelease(quotaReleaseTime, now = new Date()) {
  if (!quotaReleaseTime) return { label: 'N/A', ms: null };
  const m = String(quotaReleaseTime).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return { label: 'N/A', ms: null };
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value;
  const mo = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  const release = new Date(`${y}-${mo}-${d}T${m[1].padStart(2, '0')}:${m[2]}:${(m[3] || '00').padStart(2, '0')}+05:30`);
  const diff = release.getTime() - now.getTime();
  if (diff <= 0) return { label: 'N/A', ms: 0 };
  const sec = Math.floor(diff / 1000);
  const h = Math.floor(sec / 3600);
  const min = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const label = h > 0 ? `${h}h ${min}m ${s}s` : `${min}m ${s}s`;
  return { label, ms: diff };
}

export function formatIstClock(now = new Date()) {
  return now.toLocaleTimeString('en-IN', { timeZone: TZ, hour12: false });
}