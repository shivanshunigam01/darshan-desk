/**
 * Remove demo / test booking data from MongoDB.
 * Keeps agencies, operators (login), and policy snapshots for validation rules.
 * Set SEED_ON_START=false so demo pilgrims/accounts are not re-created on restart.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../server/.env') });

const URI = process.env.MONGODB_URI;
if (!URI) {
  console.error('MONGODB_URI missing in server/.env');
  process.exit(1);
}

const COLLECTIONS = [
  'bookingpreparations',
  'pilgrims',
  'ttdaccountreferences',
  'extensionconnections',
  'bookingattempts',
  'ttdaccountauditlogs',
  'manualquotaobservations',
];

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const summary = {};

  for (const name of COLLECTIONS) {
    try {
      const col = db.collection(name);
      const before = await col.countDocuments();
      const res = await col.deleteMany({});
      summary[name] = { before, deleted: res.deletedCount };
    } catch (e) {
      if (e.codeName === 'NamespaceNotFound') {
        summary[name] = { before: 0, deleted: 0, note: 'missing' };
      } else throw e;
    }
  }

  await mongoose.disconnect();

  console.log('Purge complete (agencies, operators, and policy snapshots kept):');
  console.log(JSON.stringify(summary, null, 2));
  console.log('\nTip: SEED_ON_START=false in server/.env prevents demo pilgrims/TTD refs from returning on restart.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});