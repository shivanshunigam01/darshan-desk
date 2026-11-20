import { useTranslation } from 'react-i18next';
import LegacyFillWorkflow from '../features/fill/LegacyFillWorkflow';

export function ReadyToFillPage() {
  const { t } = useTranslation();
  return (
    <div className="animate-fade-in">
      <p className="mb-2 text-xs font-semibold text-stone-600">{t('fill.legacyTitle')}</p>
      <div className="legacy-fill-host rounded-xl border border-stone-200 bg-white p-1 shadow-sm">
        <LegacyFillWorkflow />
      </div>
    </div>
  );
}