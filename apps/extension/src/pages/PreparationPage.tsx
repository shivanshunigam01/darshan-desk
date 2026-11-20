import { useTranslation } from 'react-i18next';
import { Alert } from '../components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

export function PreparationPage() {
  const { t } = useTranslation();
  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle>{t('nav.preparation')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Alert>{t('placeholder.coming')}</Alert>
      </CardContent>
    </Card>
  );
}