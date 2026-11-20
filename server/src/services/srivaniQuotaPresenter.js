import { bridgeQuotaToDashboard } from './ttdDashboardBridge.js';

const TZ = 'Asia/Kolkata';

function formatObservedAt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** HH:mm:ss or h:mm AM → display without inventing a calendar date */
export function formatReportedReleaseTime(quotaReleaseTime, applicableDate) {
  if (!quotaReleaseTime) return { label: '—', detail: 'No official release time in current snapshot.' };
  const t = quotaReleaseTime.trim();
  let timeLabel = t;
  const m24 = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m24) {
    const h = Number(m24[1]);
    const min = m24[2];
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    timeLabel = `${h12}:${min} ${ampm}`;
  }
  if (applicableDate) {
    return {
      label: `${applicableDate} ${timeLabel}`,
      detail: 'Official date supplied with release schedule.',
    };
  }
  return {
    label: `Reported release time: ${timeLabel}`,
    detail: 'Time-only field — not labeled as a future session date.',
  };
}

export function buildSrivaniQuotaPayload(quotaEnvelope, integrationStatus) {
  const meta = quotaEnvelope.meta || {};
  const { meta: _m, ...dataFields } = quotaEnvelope;
  const release = formatReportedReleaseTime(dataFields.quotaReleaseTime, meta.applicableDate);

  const providerStatus =
    integrationStatus.providerStatus ||
    (integrationStatus.providerReady ? 'READY' : 'NOT_CONFIGURED');

  const dashboard = bridgeQuotaToDashboard(quotaEnvelope, {
    ...integrationStatus,
    releaseDisplay: release,
    observedAtIst: formatObservedAt(meta.observedAt),
  });

  return {
    data: dataFields,
    source: meta.source,
    observedAt: meta.observedAt,
    lastSuccessfulUpdate: integrationStatus.lastSuccessfulUpdate || meta.observedAt,
    isStale: Boolean(meta.stale),
    staleReason: meta.staleReason,
    providerStatus,
    applicableDate: meta.applicableDate ?? null,
    releaseDisplay: release,
    observedAtIst: formatObservedAt(meta.observedAt),
    integration: integrationStatus,
    dashboard,
  };
}