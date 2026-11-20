import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import LegacyFillWorkflow from '../features/fill/LegacyFillWorkflow';

export function ReadyToFillPage() {
  const { t } = useTranslation();
  return (
    <div className="animate-fade-in pb-2">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-temple-red text-white shadow-md">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h2 className="dd-page-title text-base leading-tight">{t('fill.title')}</h2>
          <p className="text-[10px] text-stone-500">{t('fill.subtitle')}</p>
        </div>
      </div>
      <LegacyFillWorkflow />
    </div>
  );
}