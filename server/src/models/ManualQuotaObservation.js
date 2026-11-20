import mongoose from 'mongoose';

const manualQuotaObservationSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator', required: true },
    bookingCategory: { type: String, default: 'SRIVANI' },
    source: { type: String, required: true },
    policyVersion: { type: String },
    observedAtUtc: { type: Date, required: true },
    raw: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

manualQuotaObservationSchema.index({ agencyId: 1, observedAtUtc: -1 });

export const ManualQuotaObservation = mongoose.model('ManualQuotaObservation', manualQuotaObservationSchema);