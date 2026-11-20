import mongoose from 'mongoose';

const platformAuditSchema = new mongoose.Schema(
  {
    operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator', required: true, index: true },
    action: { type: String, required: true },
    path: { type: String, required: true },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: { createdAt: 'at', updatedAt: false } }
);

export const PlatformAuditLog = mongoose.models.PlatformAuditLog || mongoose.model('PlatformAuditLog', platformAuditSchema);

export async function recordPlatformAdminAccess({ operatorId, path, action = 'read', meta }) {
  await PlatformAuditLog.create({ operatorId, path, action, meta }).catch(() => null);
  if (process.env.AUDIT_LOG !== 'false') {
    console.log(
      JSON.stringify({
        type: 'platform_admin',
        operatorId: operatorId?.toString?.(),
        path,
        action,
        at: new Date().toISOString(),
      })
    );
  }
}