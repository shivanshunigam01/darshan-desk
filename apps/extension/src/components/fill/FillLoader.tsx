import { useTranslation } from 'react-i18next';

export function FillLoader({ label, step }: { label: string; step?: 1 | 2 | 3 }) {
  const { t } = useTranslation();
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-white/92 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <div className="text-center px-4">
        <div className="relative mx-auto mb-3 h-11 w-11">
          <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-red-100 border-t-temple-red" />
          <div className="absolute inset-[6px] animate-pulse rounded-full bg-temple-blush" />
        </div>
        {step != null && (
          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-temple-red">
            Step {step} of 3
          </p>
        )}
        <p className="text-sm font-bold text-temple-black">{label}</p>
        <p className="mt-1 text-[10px] text-stone-500">{t('fill.overlayHint')}</p>
      </div>
    </div>
  );
}