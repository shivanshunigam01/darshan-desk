import mongoose from 'mongoose';

export const BOOKING_CATEGORIES = ['CURRENT', 'ADVANCE'];
export const TRUST_CATEGORIES = ['SRIVANI'];
export const VALIDATION_STATUSES = ['pending', 'passed', 'failed'];
export const WORKFLOW_STATUSES = [
  'draft',
  'validated',
  'extension_connected',
  'awaiting_official',
  'submitted_pending_verification',
  'verified',
  'cancelled',
];

const bookingPreparationSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },
    operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator', required: true },
    ttdAccountReferenceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TtdAccountReference',
      required: true,
    },
    bookingCategory: { type: String, enum: BOOKING_CATEGORIES, required: true },
    trustCategory: { type: String, enum: TRUST_CATEGORIES, default: 'SRIVANI' },
    donationAmount: { type: Number, required: true, min: 0 },
    pilgrimIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Pilgrim' }],
    preferredDate: { type: Date },
    validationStatus: { type: String, enum: VALIDATION_STATUSES, default: 'pending' },
    workflowStatus: { type: String, enum: WORKFLOW_STATUSES, default: 'draft' },
    policyVersion: { type: String },
    validationErrors: [{ type: String }],
    consentRecordedAt: { type: Date },
    consentRecordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator' },
    extensionSessionId: { type: String },
    contentRevision: { type: Number, default: 1, min: 1 },
    extensionSnapshotRevision: { type: Number, default: 0 },
    officialOutcome: {
      evidenceType: { type: String, enum: ['receipt', 'confirmation_number', 'screenshot_hash', 'other'] },
      evidenceReference: { type: String },
      recordedAt: { type: Date },
      recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator' },
      note: { type: String },
    },
  },
  { timestamps: true }
);

bookingPreparationSchema.index({ agencyId: 1, operatorId: 1, createdAt: -1 });

export const BookingPreparation = mongoose.model('BookingPreparation', bookingPreparationSchema);