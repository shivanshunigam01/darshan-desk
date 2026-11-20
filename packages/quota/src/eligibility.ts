import type { QuotaSummary } from './types.js';

export interface DonationEligibility {
  eligible: boolean;
  reasons: string[];
  minDonationCurrent: number;
  minDonationAdvance: number;
}

export function computeDonationEligibility(
  summary: QuotaSummary | null,
  bookingCategory: 'CURRENT' | 'ADVANCE' = 'CURRENT'
): DonationEligibility {
  if (!summary) {
    return {
      eligible: false,
      reasons: ['Quota summary unavailable'],
      minDonationCurrent: 0,
      minDonationAdvance: 0,
    };
  }

  const reasons: string[] = [];
  const minCurrent = summary.minAmount;
  const minAdvance = summary.advanceminAmount;

  if (summary.quotaCount <= 0) {
    reasons.push('No quota available (quotaCount is zero)');
  }

  const minForCategory = bookingCategory === 'CURRENT' ? minCurrent : minAdvance;
  if (minForCategory <= 0) {
    reasons.push('Minimum donation amount not configured in observed data');
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    minDonationCurrent: minCurrent,
    minDonationAdvance: minAdvance,
  };
}