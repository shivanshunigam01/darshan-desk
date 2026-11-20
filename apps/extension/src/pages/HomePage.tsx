import { useTranslation } from 'react-i18next';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { useAuth } from '../hooks/useAuth';

export function HomePage() {
  const { t } = useTranslation();
  const { auth } = useAuth();

  return (
    <div className="animate-fade-in space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>{t('home.welcome')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-stone-600">
          <p>{t('home.subtitle')}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">{auth?.operator.role}</Badge>
            <Badge variant={auth?.license?.status === 'active' ? 'success' : 'warn'}>
              {t('home.license')}: {auth?.license?.status || 'unknown'}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}