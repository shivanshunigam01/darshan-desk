import type { QuotaDashboardResponse } from '../../types/quota';
import { Badge } from '../ui/badge.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.jsx';
import { Alert } from '../ui/alert.jsx';

type Props = {
  display: QuotaDashboardResponse['display'];
  success: boolean;
  errors: string[];
};

export default function QuotaMetaBar({ display, success, errors }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Official data lineage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Alert tone="warning">{display.availabilityNotice}</Alert>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-slate-700">
          <span>
            <strong>Data source:</strong> {display.dataSource}
          </span>
          <span>
            <strong>Last updated (IST):</strong> {display.lastUpdatedIst}
          </span>
          <span>
            <strong>UTC:</strong> {display.lastUpdatedUtc}
          </span>
          <span className="flex items-center gap-2">
            <strong>Freshness:</strong>
            <Badge tone={display.freshness === 'fresh' ? 'success' : 'warning'}>{display.freshness}</Badge>
          </span>
          <span className="flex items-center gap-2">
            <strong>Fetch:</strong>
            <Badge tone={success ? 'success' : 'danger'}>{success ? 'OK' : 'Error'}</Badge>
          </span>
        </div>
        {errors.length > 0 && (
          <Alert tone="error" title="Errors">
            {errors.join(' · ')}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}