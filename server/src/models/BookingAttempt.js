import mongoose from 'mongoose';
import { ALL_BOOKING_STATES, ERROR_CLASSES } from '@darshan-desk/reliability';

const diagnosticEventSchema = new mongoose.Schema(
  {
    atUtc: { type: Date, required: true },
    type: { type: String, required: true },
    message: { type: String, required: true },
    meta: { type: mongoose.Schema.Types.Mixed },
    fromState: { type: String },
    toState: { type: String },
  },
  { _id: true }
);

const OUTCOME_LABELS = ['in_progress', 'confirmed', 'rejected', 'uncertain', 'failed'];

const bookingAttemptSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator', required: true },
    preparationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BookingPreparation',
      required: true,
      index: true,
    },
    bookingCategory: { type: String, index: true },
    reliabilityState: { type: String, enum: ALL_BOOKING_STATES, default: 'PREPARED', index: true },
    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date },
    completedAt: { type: Date },
    outcome: { type: String, enum: OUTCOME_LABELS, default: 'in_progress', index: true },
    errorCode: { type: String, enum: ERROR_CLASSES },
    errorClass: { type: String, enum: ERROR_CLASSES },
    errorStage: { type: String },
    errorReport: {
      summary: String,
      reasons: [String],
      officialMessage: String,
      operatorExplanation: String,
    },
    officialReference: { type: String },
    officialEvidenceReference: { type: String },
    verificationSource: {
      type: String,
      enum: ['operator_manual', 'official_screenshot', 'official_sms', 'official_email', 'mock_qa', 'other'],
    },
    verifiedAt: { type: Date },
    quotaAtObservation: {
      count: Number,
      freshness: String,
      observedAtUtc: Date,
    },
    submissionAttempted: { type: Boolean, default: false },
    autoResubmitBlocked: { type: Boolean, default: true },
    duplicateSubmissionGuard: { type: Boolean, default: true },
    timeline: [diagnosticEventSchema],
  },
  { timestamps: true }
);

bookingAttemptSchema.index({ agencyId: 1, updatedAt: -1 });
bookingAttemptSchema.index({ agencyId: 1, reliabilityState: 1 });
bookingAttemptSchema.index({ agencyId: 1, outcome: 1 });

export const BookingAttempt = mongoose.model('BookingAttempt', bookingAttemptSchema);