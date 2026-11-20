import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { useAuth } from '../hooks/useAuth';
import { setAppLanguage } from '../i18n';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { settings, updateSettings, signOut } = useAuth();

  useEffect(() => {
    void setAppLanguage(settings.language);
  }, [settings.language]);

  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle>{t('nav.settings')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="block text-xs font-medium">
          {t('settings.language')}
          <select
            className="mt-1 h-10 w-full rounded-lg border border-stone-300 bg-white px-2 text-sm"
            value={settings.language}
            onChange={(e) => updateSettings({ language: e.target.value as 'en' | 'hi' | 'te' })}
          >
            <option value="en">English</option>
            <option value="hi">हिंदी</option>
            <option value="te">తెలుగు</option>
          </select>
        </label>
        <p className="text-[10px] text-stone-500">Language: {i18n.language}</p>
        <Button variant="destructive" className="w-full" onClick={() => signOut()}>
          {t('settings.logout')}
        </Button>
      </CardContent>
    </Card>
  );
}