import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';

function formatHeaderTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

function formatHeaderDate(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(date);
}

export function LiveClock() {
  const { t } = useTranslation();
  const { settings } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const tz = settings.defaultTimezone;

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="shrink-0 text-right leading-tight" aria-live="polite" title={t('clock.hint')}>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-stone-400">{t('clock.label')}</p>
      <p className="font-mono text-sm font-bold tabular-nums text-white">{formatHeaderTime(now, tz)}</p>
      <p className="text-[9px] text-stone-400">{formatHeaderDate(now, tz)}</p>
    </div>
  );
}