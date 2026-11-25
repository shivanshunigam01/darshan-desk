import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Radio } from 'lucide-react';
import type { EnrichedPageMonitorSnapshot } from '@darshan-desk/fill-engine';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import type { ProtocolResponse } from '../shared/protocol';

function sendMessage<T>(msg: { type: string }): Promise<ProtocolResponse & { snapshot?: EnrichedPageMonitorSnapshot }> {
  return chrome.runtime.sendMessage(msg);
}

function Stat({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-lg border border-red-50 bg-white px-2 py-1.5">
      <p className="text-[9px] font-bold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="truncate text-sm font-semibold text-temple-black">{value?.trim() || '—'}</p>
    </div>
  );
}

export function BookingMonitorPage() {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<EnrichedPageMonitorSnapshot | null>(null);
  const [error, setError] = useState('');
  const [polling, setPolling] = useState(true);

  const refresh = useCallback(async () => {
    setError('');
    try {
      const r = await sendMessage({ type: 'GET_PAGE_MONITOR' });
      if (!r.ok) throw new Error(r.error || 'Monitor unavailable');
      setSnapshot(r.snapshot ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('monitor.loadError'));
    }
  }, [t]);

  useEffect(() => {
    void refresh();
    if (!polling) return;
    const id = window.setInterval(() => void refresh(), 2000);
    return () => clearInterval(id);
  }, [refresh, polling]);

  const cont = snapshot?.continue;
  const statusVariant =
    cont?.status === 'ready_to_continue'
      ? 'success'
      : cont?.status === 'error'
        ? 'danger'
        : cont?.status === 'navigating_loading'
          ? 'warn'
          : 'default';

  return (
    <div className="animate-fade-in space-y-3 pb-2">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-temple-red" />
        <div>
          <h2 className="dd-page-title text-base">{t('monitor.title')}</h2>
          <p className="text-[10px] text-stone-500">{t('monitor.subtitle')}</p>
        </div>
      </div>

      <Card className="border-temple-red/30 bg-gradient-to-br from-white to-temple-blush">
        <CardContent className="space-y-2 pt-3 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">{t('monitor.statusTitle')}</p>
          <p className="text-base font-bold text-temple-black">{cont?.statusLabel || '—'}</p>
          <motionCountdown quota={snapshot?.quota} t={t} />
          <motionBadgeRow cont={cont} snapshot={snapshot} t={t} statusVariant={statusVariant} />
          {cont?.blockExtensionAssist && (
            <Alert>{t('monitor.blockedAssist')}</Alert>
          )}
          {snapshot?.workflowStatus && (
            <p className="text-[10px] font-medium text-stone-600">Workflow: {snapshot.workflowStatus}</p>
          )}
          {snapshot?.bookingStageHttp?.httpOkButRejected && (
            <p className="text-[10px] text-amber-900">
              Booking API: HTTP {snapshot.bookingStageHttp.httpStatus} with official error (not success)
            </p>
          )}
          {snapshot?.outcomeCode && (
            <p className="text-xs font-semibold text-temple-black">
              Official outcome: {snapshot.outcomeCode}
              {snapshot.officialMessage ? ` — ${snapshot.officialMessage}` : ''}
            </p>
          )}
          {snapshot?.blockBookingConfirmed && snapshot.outcomeCode !== 'CONFIRMED' && (
            <p className="text-[10px] text-stone-600">Booking not confirmed — navigation or HTTP 200 alone is insufficient.</p>
          )}
          {snapshot?.quotaDisplayMismatch && (
            <Alert>{t('monitor.quotaMismatch')}</Alert>
          )}
          {snapshot?.diagnosticNotices?.length ? (
            <ul className="list-disc pl-4 text-[10px] text-stone-600">
              {snapshot.diagnosticNotices.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
          {snapshot?.timeline?.length ? (
            <details className="text-[10px] text-stone-600">
              <summary className="cursor-pointer font-semibold">Diagnostic timeline ({snapshot.timeline.length})</summary>
              <ol className="mt-1 max-h-24 list-decimal overflow-y-auto pl-4">
                {snapshot.timeline.slice(-8).map((ev) => (
                  <li key={`${ev.atUtc}-${ev.bookingStage}-${ev.outcomeCode}`}>
                    {new Date(ev.atUtc).toLocaleTimeString()} · {ev.bookingStage}
                    {ev.outcomeCode ? ` · ${ev.outcomeCode}` : ''}
                    {ev.sanitizedError ? ` · ${ev.sanitizedError}` : ''}
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
          {cont?.disabledReason && cont.status === 'waiting_for_continue' && (
            <p className="text-[10px] text-stone-600">
              {t('monitor.buttonEnabled')}: {t('common.no')} ({cont.disabledReason})
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-temple-red">{t('monitor.quotaBar')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <Stat label={t('monitor.quotaRelease')} value={snapshot?.quota.quotaReleaseTime} />
          <Stat label={t('monitor.systemTime')} value={snapshot?.quota.systemTime} />
          <Stat label={t('monitor.remainingTime')} value={snapshot?.quota.remainingTime} />
          <Stat label={t('monitor.availableQuota')} value={snapshot?.quota.availableQuota} />
          <Stat label={t('monitor.reportingTime')} value={snapshot?.quota.reportingTime} />
          <Stat label={t('monitor.paymentPending')} value={snapshot?.quota.paymentPending} />
          <Stat label={t('monitor.successCount')} value={snapshot?.quota.successCount} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-temple-red">{t('monitor.continueState')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-xs text-stone-700">
          <p>
            {t('monitor.buttonPresent')}: {cont?.buttonPresent ? t('common.yes') : t('common.no')}
          </p>
          <p>
            {t('monitor.buttonEnabled')}: {cont?.buttonEnabled ? t('common.yes') : t('common.no')}
          </p>
          <p className="truncate text-[10px] text-stone-500">{cont?.buttonLabel}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-temple-red">{t('monitor.paymentSummary')}</CardTitle>
        </CardHeader>
        {!snapshot?.payment?.summaryVisible && (
          <p className="px-4 pb-2 text-[10px] text-stone-500">—</p>
        )}
        <CardContent className="grid grid-cols-2 gap-2">
          <Stat label={t('monitor.donation')} value={snapshot?.payment.donationAmount} />
          <Stat label={t('monitor.darshan')} value={snapshot?.payment.darshanAmount} />
          <Stat label={t('monitor.total')} value={snapshot?.payment.totalPayable} />
          <Stat label={t('monitor.pilgrims')} value={snapshot?.payment.pilgrimCount} />
        </CardContent>
        {snapshot?.payment.gatewayOptions?.length ? (
          <p className="px-4 pb-3 text-[10px] text-stone-600">
            {t('monitor.gateways')}: {snapshot.payment.gatewayOptions.join(', ')}
          </p>
        ) : null}
      </Card>

      {error && <Alert variant="destructive">{error}</Alert>}

      <RemoteClockHint observedAt={snapshot?.observedAtUtc} />

      <motionUiFooter polling={polling} onTogglePolling={() => setPolling((v) => !v)} onRefresh={() => void refresh()} />
    </div>
  );
}

function motionCountdown({
  quota,
  t,
}: {
  quota?: EnrichedPageMonitorSnapshot['quota'];
  t: (k: string) => string;
}) {
  if (!quota?.remainingTime) return null;
  return (
    <p className="text-sm font-semibold text-temple-red">
      {t('monitor.remainingTime')}: {quota.remainingTime}
    </p>
  );
}

function motionBadgeRow({
  cont,
  snapshot,
  t,
  statusVariant,
}: {
  cont?: EnrichedPageMonitorSnapshot['continue'];
  snapshot: EnrichedPageMonitorSnapshot | null;
  t: (k: string) => string;
  statusVariant: 'success' | 'warn' | 'default' | 'danger';
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant={snapshot?.supported ? 'success' : 'warn'}>
        {snapshot?.supported ? t('monitor.supportedPage') : t('monitor.unsupportedPage')}
      </Badge>
      {cont?.readyToContinue && (
        <Badge variant="success">
          <Radio className="mr-1 inline h-3 w-3" />
          {t('monitor.readyContinue')}
        </Badge>
      )}
      {cont?.status === 'waiting_for_continue' && (
        <Badge variant="warn">{t('monitor.waitingContinue')}</Badge>
      )}
      {cont?.loadingOverlay && <Badge variant={statusVariant === 'warn' ? 'warn' : 'default'}>{t('monitor.loading')}</Badge>}
    </div>
  );
}

function RemoteClockHint({ observedAt }: { observedAt?: string }) {
  const { t } = useTranslation();
  if (!observedAt) return null;
  return <p className="text-[10px] text-stone-500">{t('monitor.observedAt', { time: new Date(observedAt).toLocaleTimeString() })}</p>;
}

function motionUiFooter({
  polling,
  onTogglePolling,
  onRefresh,
}: {
  polling: boolean;
  onTogglePolling: () => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button size="sm" variant="secondary" onClick={onRefresh}>
        {t('monitor.refresh')}
      </Button>
      <Button size="sm" variant="secondary" onClick={onTogglePolling}>
        {polling ? t('monitor.pausePoll') : t('monitor.resumePoll')}
      </Button>
    </div>
  );
}