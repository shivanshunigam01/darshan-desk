const TZ = 'Asia/Kolkata';

export function formatIstDateTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}