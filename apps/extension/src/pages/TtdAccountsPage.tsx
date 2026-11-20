import { useTranslation } from 'react-i18next';
import { Alert } from '../components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

export function TtdAccountsPage() {
  const { t } = useTranslation();
  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle>{t('nav.accounts')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Alert>{t('placeholder.coming')}</Alert>
      </CardContent>
    </Card>
  );
}