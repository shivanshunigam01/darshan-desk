/** Versioned SRIVANI donation policy hints — update when TTD rules change. */
export const SRIVANI_POLICY_V1 = {
  version: 'srivani-policy-v1',
  minDonationInr: 10_000,
  pilgrimsPer10kInr: 1,
  maxPilgrimsCurrentBooking: 4,
  disclaimer: 'Illustrative rules from portal samples; validate against live eligibility before booking.',
} as const;