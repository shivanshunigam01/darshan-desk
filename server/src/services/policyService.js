import { TTDPolicySnapshot } from '../models/TTDPolicySnapshot.js';

export async function getActivePolicy() {
  const active = await TTDPolicySnapshot.findOne({ isActive: true }).sort({ capturedAt: -1 });
  if (active) return active;
  return TTDPolicySnapshot.findOne().sort({ capturedAt: -1 });
}

export async function activatePolicyVersion(policyVersion) {
  const snapshot = await TTDPolicySnapshot.findOne({ policyVersion });
  if (!snapshot) {
    const err = new Error('Policy version not found');
    err.status = 404;
    throw err;
  }
  await TTDPolicySnapshot.updateMany({ isActive: true }, { isActive: false });
  snapshot.isActive = true;
  await snapshot.save();
  return snapshot;
}