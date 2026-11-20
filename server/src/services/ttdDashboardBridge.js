/** Map TTD contract quota envelope to legacy dashboard cards (additive bridge). */
export function bridgeQuotaToDashboard(quotaEnvelope, integrationStatus) {
  const q = quotaEnvelope;
  const meta = quotaEnvelope.meta || {};
  const stale = Boolean(meta.stale);
  const observedAtUtc = meta.observedAt || new Date().toISOString();

  return {
    success: true,
    summary: {
      quotaCount: q.quotaCount,
      slottime: q.slottime,
      minpersons: q.minpersons,
      maxpersons: q.maxpersons,
      advanceminpersons: q.advanceminpersons,
      advancemaxpersons: q.advancemaxpersons,
      noOfladdus: q.noOfladdus,
      minAmount: q.minAmount,
      advanceminAmount: q.advanceminAmount,
      darshanAmount: q.darshanAmount,
      maxAmount: q.maxAmount,
      advancemaxAmount: q.advancemaxAmount,
      success: q.success,
      pending: q.pending,
      failed: q.failed,
      released: q.released,
      quotaReleaseTime: q.quotaReleaseTime,
    },
    meta: {
      provider: `ttd_${integrationStatus.mode}`,
      sourceLabel: meta.source || 'ttd',
      observedAtUtc,
      bookingCategory: 'SRIVANI',
      reportingTime: q.slottime,
    },
    freshness: stale ? 'stale' : 'fresh',
    errors: [],
    diagnostics: [
      `TTD adapter mode: ${integrationStatus.mode}`,
      integrationStatus.message || '',
      meta.staleReason ? `Stale: ${meta.staleReason}` : 'Data within refresh policy',
      'Displayed quota does not guarantee successful ticket issuance.',
      `Failed (${q.failed}) counts are failed booking attempts, not released inventory.`,
    ].filter(Boolean),
    timeline: [
      {
        id: 'ttd-fetch',
        atUtc: observedAtUtc,
        level: stale ? 'warn' : 'info',
        message: `Quota snapshot via ${meta.source || 'ttd'}`,
      },
    ],
    display: {
      dataSource: `TTD contract adapter (${integrationStatus.mode}) — ${integrationStatus.baseUrl}`,
      lastUpdatedUtc: observedAtUtc,
      lastUpdatedIst: integrationStatus.observedAtIst || observedAtUtc,
      freshness: stale ? 'stale' : 'fresh',
      availabilityNotice:
        q.quotaCount > 0
          ? 'Positive availability reported — not a booking guarantee.'
          : 'Zero availability reported for current snapshot.',
    },
    cards: {
      bookingCategory: 'SRIVANI',
      quotaReleaseTime: q.quotaReleaseTime,
      remainingTimeMs: null,
      remainingTimeLabel: integrationStatus.releaseDisplay?.label || (q.quotaReleaseTime ? `Release ${q.quotaReleaseTime}` : '—'),
      availableQuota: q.quotaCount,
      successfulBookings: q.success,
      pendingPayments: q.pending,
      failedBookings: q.failed,
      totalReleasedQuota: q.released,
      reportingTime: q.slottime,
      donationEligibility: {
        eligible: q.quotaCount > 0,
        reasons: q.quotaCount > 0 ? [] : ['No quota reported in current snapshot'],
        minDonationCurrent: q.minAmount,
        minDonationAdvance: q.advanceminAmount,
      },
      pilgrimLimits: {
        min: q.minpersons ?? '—',
        max: q.maxpersons ?? '—',
        advanceMin: q.advanceminpersons ?? '—',
        advanceMax: q.advancemaxpersons ?? '—',
      },
      integration: {
        providerReady: integrationStatus.providerReady,
        enabled: integrationStatus.enabled,
        lastSuccessfulUpdate: integrationStatus.lastSuccessfulUpdate,
        mode: integrationStatus.mode,
      },
    },
    ttdMeta: meta,
  };
}