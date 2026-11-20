import mongoose from 'mongoose';

const agencySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    licenseStatus: {
      type: String,
      enum: ['trial', 'active', 'revoked', 'suspended'],
      default: 'trial',
    },
    licenseKeyHash: { type: String },
    licenseKeyLast4: { type: String },
    licenseActivatedAt: { type: Date },
    licenseRevokedAt: { type: Date },
    licenseRevokeReason: { type: String },
    licenseExpiresAt: { type: Date },
    subscriptionPlan: { type: String, default: 'standard' },
  },
  { timestamps: true }
);

const operatorSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true },
    role: { type: String, enum: ['operator', 'admin', 'super_admin'], default: 'operator' },
    lastLoginAt: { type: Date },
    lastActiveAt: { type: Date },
  },
  { timestamps: true }
);

const ttdAccountReferenceSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    label: { type: String, required: true },
    accountHint: { type: String, required: true },
    isAuthorized: { type: Boolean, default: false },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator', index: true },
    createdByOperatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator' },
    loginIdentifier: { type: String },
    maskedIdentifier: { type: String },
    consentRecordedAt: { type: Date },
    consentRecordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator' },
    authorizationStatus: {
      type: String,
      enum: ['pending', 'authorized', 'revoked'],
      default: 'pending',
      index: true,
    },
    verificationStatus: {
      type: String,
      enum: ['unverified', 'verified', 'failed', 'expired'],
      default: 'unverified',
    },
    lastVerifiedAt: { type: Date },
    lastVerifiedDisplayName: { type: String },
    credentialMode: {
      type: String,
      enum: ['reference_only', 'device_vault'],
      default: 'reference_only',
    },
    lastUsedAt: { type: Date },
    status: { type: String, enum: ['active', 'disabled', 'archived'], default: 'active', index: true },
    assignedOperatorIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Operator', index: true }],
  },
  { timestamps: true }
);

ttdAccountReferenceSchema.index({ agencyId: 1, status: 1 });
ttdAccountReferenceSchema.index({ agencyId: 1, assignedOperatorIds: 1 });
ttdAccountReferenceSchema.index({ agencyId: 1, ownerId: 1 });
ttdAccountReferenceSchema.index({ agencyId: 1, label: 1 });
ttdAccountReferenceSchema.index({ agencyId: 1, loginIdentifier: 1 });

const pilgrimSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },
    fullName: { type: String, required: true },
    age: { type: Number, required: true, min: 0, max: 120 },
    gender: { type: String, enum: ['M', 'F', 'O'], required: true },
    idType: { type: String, required: true },
    idNumber: { type: String, required: true },
    mobile: { type: String, required: true },
    city: { type: String, required: true },
    dateOfBirth: { type: String },
  },
  { timestamps: true }
);

const extensionConnectionSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },
    operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator', required: true },
    preparationId: { type: mongoose.Schema.Types.ObjectId, ref: 'BookingPreparation', required: true },
    pairingToken: { type: String, required: true, unique: true },
    status: { type: String, enum: ['pending', 'connected', 'disconnected'], default: 'pending' },
    connectedAt: { type: Date },
    lastHeartbeatAt: { type: Date },
    extensionInstanceId: { type: String },
    extensionVersion: { type: String },
    secureSessionHash: { type: String },
    accessTokenHash: { type: String },
    accessTokenExpiresAt: { type: Date },
    revokedAt: { type: Date },
  },
  { timestamps: true }
);

export const Agency = mongoose.model('Agency', agencySchema);
export const Operator = mongoose.model('Operator', operatorSchema);
export const TtdAccountReference = mongoose.model('TtdAccountReference', ttdAccountReferenceSchema);
export const Pilgrim = mongoose.model('Pilgrim', pilgrimSchema);
export const ExtensionConnection = mongoose.model('ExtensionConnection', extensionConnectionSchema);