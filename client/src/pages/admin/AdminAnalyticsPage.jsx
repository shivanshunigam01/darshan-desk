import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../api';
import { Alert } from '../../components/ui/alert.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.jsx';

export default function AdminAnalyticsPage() {
  const { token } = useAuth();
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    api
      .qaAgencyPerformance(token)
      .then((r) => setReport(r.report))
      .catch((e) => setError(e.message));
  }, [token]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-navy">Booking analytics</h1>
      <p className="text-sm text-slate-600">From {`/api/reliability/reports/agency-performance`} for your agency only.</p>
      {error && <Alert tone="error">{error}</Alert>}
      <Card>
        <CardHeader>
          <CardTitle>Performance summary</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {!report ? (
            <p className="text-slate-600">Loading…</p>
          ) : (
            <pre className="overflow-x-auto rounded bg-slate-50 p-3 text-xs">{JSON.stringify(report, null, 2)}</pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}