import mongoose from 'mongoose';

const ttdAccountAuditLogSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'TtdAccountReference', required: true, index: true },
    operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator', required: true },
    role: { type: String },
    action: { type: String, required: true, index: true },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

ttdAccountAuditLogSchema.index({ agencyId: 1, createdAt: -1 });
ttdAccountAuditLogSchema.index({ accountId: 1, createdAt: -1 });

export const TtdAccountAuditLog = mongoose.model('TtdAccountAuditLog', ttdAccountAuditLogSchema);