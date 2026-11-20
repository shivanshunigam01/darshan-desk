import {
  ApprovedOfficialQuotaProvider,
  ManualQuotaProvider,
  MockQuotaProvider,
  computeDonationEligibility,
  formatUtcAsIst,
  remainingMsUntilRelease,
} from '@darshan-desk/quota';
import { ManualQuotaObservation } from '../models/ManualQuotaObservation.js';

const mockProvider = new MockQuotaProvider();
const officialProvider = new ApprovedOfficialQuotaProvider({
  enabled: process.env.TTD_OFFICIAL_QUOTA_ENABLED === 'true',
});

const manualStore = {
  async getLatestForAgency(agencyId) {
    const doc = await ManualQuotaObservation.findOne({ agencyId }).sort({ observedAtUtc: -1 });
    return doc ? mapObservation(doc) : null;
  },
  async getById(id, agencyId) {
    const doc = await ManualQuotaObservation.findOne({ _id: id, agencyId });
    return doc ? mapObservation(doc) : null;
  },
};

const manualProvider = new ManualQuotaProvider(manualStore);

/** Single in-flight fetch per agency — no concurrent quota requests. */
const inFlight = new Map();

function mapObservation(doc) {
  return {
    id: doc._id.toString(),
    agencyId: doc.agencyId.toString(),
    operatorId: doc.operatorId.toString(),
    bookingCategory: doc.bookingCategory,
    source: doc.source,
    policyVersion: doc.policyVersion,
    observedAtUtc: doc.observedAtUtc.toISOString(),
    raw: doc.raw,
  };
}

export function getQuotaProvider(kind) {
  if (kind === 'manual') return manualProvider;
  if (kind === 'approved_official') return officialProvider;
  return mockProvider;
}

export async function fetchQuotaDashboard({ agencyId, operatorId, providerKind, mockScenario, bookingCategory }) {
  const key = `${agencyId}:${providerKind}`;
  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const provider = getQuotaProvider(providerKind);
  const now = new Date();

  const promise = provider
    .fetchQuota({
      agencyId: String(agencyId),
      operatorId: String(operatorId),
      mockScenario,
    })
    .then((result) => {
      const summary = result.summary;
      const category = bookingCategory || result.meta.bookingCategory || 'CURRENT';
      const eligibility = computeDonationEligibility(summary, category === 'ADVANCE' ? 'ADVANCE' : 'CURRENT');
      const remainingMs = summary ? remainingMsUntilRelease(summary.quotaReleaseTime, now) : null;

      return {
        ...result,
        display: {
          dataSource: `${provider.label} (${result.meta.sourceLabel})`,
          lastUpdatedUtc: result.meta.observedAtUtc,
          lastUpdatedIst: formatUtcAsIst(result.meta.observedAtUtc),
          freshness: result.freshness,
          availabilityNotice: 'Availability is not guaranteed — confirm on the official TTD website.',
        },
        cards: {
          bookingCategory: category,
          quotaReleaseTime: summary?.quotaReleaseTime ?? '—',
          remainingTimeMs: remainingMs,
          remainingTimeLabel: formatRemaining(remainingMs),
          availableQuota: summary?.quotaCount ?? null,
          successfulBookings: summary?.success ?? null,
          pendingPayments: summary?.pending ?? null,
          failedBookings: summary?.failed ?? null,
          reportingTime: result.meta.reportingTime ?? summary?.slottime ?? '—',
          donationEligibility: eligibility,
        },
      };
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

export async function recordManualObservation({ agencyId, operatorId, input }) {
  const observedAt = input.observedAtUtc ? new Date(input.observedAtUtc) : new Date();
  const doc = await ManualQuotaObservation.create({
    agencyId,
    operatorId,
    bookingCategory: input.bookingCategory || 'SRIVANI',
    source: input.source,
    policyVersion: input.policyVersion,
    observedAtUtc: observedAt,
    raw: input.raw,
  });
  return mapObservation(doc);
}

function formatRemaining(ms) {
  if (ms === null) return 'Unknown';
  if (ms <= 0) return 'Release window passed (IST)';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}h ${m}m ${s}s`;
}