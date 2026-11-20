import { useTranslation } from 'react-i18next';
import { Alert } from '../components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

export function PilgrimsPage() {
  const { t } = useTranslation();
  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle>{t('nav.pilgrims')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Alert>{t('placeholder.coming')}</Alert>
      </CardContent>
    </Card>
  );
}