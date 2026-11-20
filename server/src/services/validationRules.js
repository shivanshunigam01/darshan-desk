export function validateAgainstPolicy(preparation, policy, pilgrims, options = {}) {
  const { requireConsent = false, consentRecordedAt } = options;
  const errors = [];

  if (!policy) {
    errors.push('No TTD policy snapshot is configured. Import or activate an official policy.');
    return { passed: false, errors, policy: null };
  }

  if (preparation.trustCategory !== 'SRIVANI') {
    errors.push('Only SRIVANI trust category is supported in this module.');
  }

  if (preparation.donationAmount < policy.minimumDonation) {
    errors.push(
      `Donation must be at least ₹${policy.minimumDonation.toLocaleString('en-IN')} per current official policy (${policy.policyVersion}).`
    );
  }
  if (preparation.donationAmount > policy.maximumDonation) {
    errors.push(
      `Donation must not exceed ₹${policy.maximumDonation.toLocaleString('en-IN')} per current official policy.`
    );
  }

  const maxPilgrims =
    preparation.bookingCategory === 'CURRENT'
      ? policy.maximumCurrentPilgrims
      : policy.maximumAdvancePilgrims;

  const pilgrimIds = preparation.pilgrimIds || [];
  if (pilgrimIds.length === 0) {
    errors.push('Select at least one saved pilgrim.');
  }
  if (pilgrimIds.length > maxPilgrims) {
    errors.push(
      `${preparation.bookingCategory} bookings allow at most ${maxPilgrims} pilgrims (policy ${policy.policyVersion}).`
    );
  }

  if (preparation.bookingCategory === 'ADVANCE' && !preparation.preferredDate) {
    errors.push('Advance booking requires a preferred date.');
  }

  if (pilgrims.length !== pilgrimIds.length) {
    errors.push('One or more pilgrims are invalid or belong to another agency.');
  }

  for (const p of pilgrims) {
    const complete = Boolean(
      p.fullName && p.age != null && p.gender && p.idType && p.idNumber && p.mobile && p.city
    );
    if (!complete) {
      errors.push(`Pilgrim profile incomplete: ${p.fullName || p._id}`);
    }
  }

  if (requireConsent && !consentRecordedAt) {
    errors.push('Operator consent must be recorded before validation can pass.');
  }

  return {
    passed: errors.length === 0,
    errors,
    policy,
    reportingTime: policy.reportingTime,
    releaseTime: policy.releaseTime,
  };
}