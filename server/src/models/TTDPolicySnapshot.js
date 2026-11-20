import mongoose from 'mongoose';

const ttdPolicySnapshotSchema = new mongoose.Schema(
  {
    source: { type: String, required: true },
    capturedAt: { type: Date, required: true },
    minimumDonation: { type: Number, required: true, min: 0 },
    maximumDonation: { type: Number, required: true, min: 0 },
    maximumCurrentPilgrims: { type: Number, required: true, min: 1 },
    maximumAdvancePilgrims: { type: Number, required: true, min: 1 },
    releaseTime: { type: String, required: true },
    reportingTime: { type: String, required: true },
    policyVersion: { type: String, required: true, unique: true },
    trustCategories: { type: [String], default: ['SRIVANI'] },
    bookingCategories: { type: [String], default: ['CURRENT', 'ADVANCE'] },
    isActive: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ttdPolicySnapshotSchema.index({ isActive: 1, capturedAt: -1 });

export const TTDPolicySnapshot = mongoose.model('TTDPolicySnapshot', ttdPolicySnapshotSchema);