import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';

function formatParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-IN', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });
  return fmt.format(date);
}

export function LiveClock() {
  const { t } = useTranslation();
  const { settings } = useAuth();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs" aria-live="polite">
      <div className="font-semibold text-stone-800">{t('clock.label')}</div>
      <div className="mt-1 font-mono text-[11px] text-stone-700">{formatParts(now, settings.defaultTimezone)}</div>
      <p className="mt-1 text-[10px] text-stone-500">{t('clock.hint')}</p>
    </div>
  );
}