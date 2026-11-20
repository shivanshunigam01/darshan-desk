import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api';
import type { SrivaniQuotaPayload } from '../types/quota';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { AgencyContextBar } from '../components/dashboard/AgencyContextBar.jsx';
import { Card, CardDescription, CardHeader } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { NativeSelect } from '../components/ui/native-select.jsx';
import SrivaniQuotaMonitor from '../components/quota/SrivaniQuotaMonitor';
import QuotaMetaBar from '../components/quota/QuotaMetaBar';

const DEV_SCENARIOS = [
  'default',
  'zero_quota',
  'nullable_fields',
  'release_time_change',
  'unauthorized',
  'rate_limited',
  'stale_cache',
  'timeout',
  'not_configured',
];

export default function QuotaDashboardPage() {
  const { token, operator, license } = useAuth();
  const [scenario, setScenario] = useState('');
  const [payload, setPayload] = useState<SrivaniQuotaPayload | null>(null);
  const [integration, setIntegration] = useState<SrivaniQuotaPayload['integration'] | null>(null);
  const [accounts, setAccounts] = useState<{ _id?: string; id?: string; label?: string }[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (manual = false) => {
      if (!token) return;
      if (manual) setRefreshing(true);
      else setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (manual) params.set('refresh', '1');
        if (scenario) params.set('scenario', scenario);
        const statusParams = scenario ? `scenario=${scenario}` : '';
        const [quotaRes, statusRes, accRes] = await Promise.all([
          api.ttdQuotaCurrent(token, params.toString()) as Promise<SrivaniQuotaPayload>,
          api.ttdIntegrationStatus(token, statusParams),
          api.ttdAccounts(token),
        ]);
        setPayload(quotaRes);
        setIntegration(statusRes as SrivaniQuotaPayload['integration']);
        setAccounts(accRes.accounts || []);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load quota';
        setError(msg);
        try {
          const statusRes = await api.ttdIntegrationStatus(token, scenario ? `scenario=${scenario}` : '');
          setIntegration(statusRes as SrivaniQuotaPayload['integration']);
        } catch {
          /* keep prior integration */
        }
        if (!scenario) setPayload(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, scenario]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const dashboard = payload?.dashboard;

  return (
    <div className="space-y-6 dd-enter">
      <PageHeader
        title="SRIVANI operations console"
        description="Full-fidelity quota monitor with provider status, stale labeling, and preserved null semantics."
        actions={
          <Link to="/">
            <Button variant="secondary">Back to command center</Button>
          </Link>
        }
      />

      <AgencyContextBar
        operator={operator}
        license={license}
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onAccountChange={setSelectedAccountId}
      />

      <SrivaniQuotaMonitor
        payload={payload}
        loading={loading}
        error={error}
        onRefresh={() => load(true)}
        refreshing={refreshing}
        integrationFallback={integration ?? undefined}
        showHeader={false}
      />

      <Card className="border-dashed border-[var(--dd-border)] bg-[var(--dd-bg)]">
        <CardHeader>
          <CardDescription>Developer mock scenario (QA only — server MockProvider)</CardDescription>
          <NativeSelect
            className="max-w-md"
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            aria-label="Mock scenario"
          >
            <option value="">Production / NOT CONFIGURED</option>
            {DEV_SCENARIOS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
        </CardHeader>
      </Card>

      {dashboard && (
        <QuotaMetaBar display={dashboard.display} success={dashboard.success} errors={dashboard.errors} />
      )}

      {dashboard?.diagnostics?.length > 0 && (
        <Card>
          <CardHeader>
            <CardDescription>Diagnostics</CardDescription>
            <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--dd-text-muted)]">
              {dashboard.diagnostics.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}