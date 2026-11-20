/**
 * Ensures MongoDB indexes from Mongoose schemas are synced (run against Atlas from EC2).
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: 'server/.env' });

const models = [
  () => import('../server/src/models/BookingAttempt.js'),
  () => import('../server/src/models/BookingPreparation.js'),
  () => import('../server/src/models/TtdAccountAuditLog.js'),
  () => import('../server/src/models/index.js'),
];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI required');
  await mongoose.connect(uri);
  for (const load of models) {
    await load();
  }
  const names = mongoose.modelNames();
  for (const name of names) {
    await mongoose.model(name).createIndexes();
    console.log('Indexes synced:', name);
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});