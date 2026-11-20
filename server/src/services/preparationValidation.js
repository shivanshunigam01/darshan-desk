import { Pilgrim } from '../models/index.js';
import { getActivePolicy } from './policyService.js';
import { validateAgainstPolicy } from './validationRules.js';

export async function validateBookingPreparation(preparation, options = {}) {
  const { requireConsent = false, consentRecordedAt } = options;
  const policy = await getActivePolicy();
  const pilgrimIds = preparation.pilgrimIds || [];
  const pilgrims = pilgrimIds.length
    ? await Pilgrim.find({
        _id: { $in: pilgrimIds },
        agencyId: preparation.agencyId,
      })
    : [];

  return validateAgainstPolicy(preparation, policy, pilgrims, { requireConsent, consentRecordedAt });
}