import { BookingPreparation } from '../models/BookingPreparation.js';

export async function bumpPreparationRevision(preparationId, agencyId) {
  const prep = await BookingPreparation.findOneAndUpdate(
    { _id: preparationId, agencyId },
  { $inc: { contentRevision: 1 } },
    { new: true }
  );
  return prep?.contentRevision;
}

export async function bumpPreparationsUsingPilgrim(pilgrimId, agencyId) {
  await BookingPreparation.updateMany(
    { agencyId, pilgrimIds: pilgrimId },
    { $inc: { contentRevision: 1 } }
  );
}