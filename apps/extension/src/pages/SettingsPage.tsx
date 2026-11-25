import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { useAuth } from '../hooks/useAuth';
import { setAppLanguage } from '../i18n';
import type { PaymentGatewayPreference } from '../services/authStorage';

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

        <label className="flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            className="accent-temple-red"
            checked={settings.bookingAssist}
            onChange={(e) => updateSettings({ bookingAssist: e.target.checked })}
          />
          {t('settings.bookingAssist')}
        </label>
        <p className="text-[10px] text-stone-500">{t('settings.bookingAssistHint')}</p>
        <p className="text-[10px] text-stone-500">{t('settings.continueMonitorHint')}</p>

        <label className="flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            className="accent-temple-red"
            checked={settings.notifyOnContinueReady}
            onChange={(e) => updateSettings({ notifyOnContinueReady: e.target.checked })}
          />
          {t('settings.notifyContinue')}
        </label>
        <p className="text-[10px] text-stone-500">{t('settings.notifyContinueHint')}</p>

        <label className="block text-xs font-medium">
          {t('settings.paymentGateway')}
          <select
            className="mt-1 h-10 w-full rounded-lg border border-stone-300 bg-white px-2 text-sm"
            value={settings.paymentGateway}
            onChange={(e) => updateSettings({ paymentGateway: e.target.value as PaymentGatewayPreference })}
            disabled={!settings.bookingAssist}
          >
            <option value="ANY">{t('settings.gatewayAny')}</option>
            <option value="ICICI">ICICI Bank</option>
            <option value="HDFC">HDFC Bank</option>
            <option value="UNION">Union Bank of India</option>
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