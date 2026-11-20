import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { shouldSeedOnStart, isProduction } from './config/env.js';
import { captureMonitoringEvent, initErrorMonitoring } from './middleware/errorMonitor.js';
import { seedDatabase } from './seed.js';

dotenv.config();

const PORT = Number(process.env.PORT) || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/darshan-desk';

let server;

async function main() {
  await initErrorMonitoring();
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS || 10_000),
    });
  } catch (e) {
    captureMonitoringEvent('database_connectivity_failure', { message: e.message });
    throw e;
  }

  if (shouldSeedOnStart()) {
    await seedDatabase();
  } else if (isProduction()) {
    console.log('Production mode — demo seed skipped (set SEED_ON_START=true to override)');
  }

  const app = createApp();
  server = app.listen(PORT, () => {
    console.log(`DarshanDesk API listening on port ${PORT} (env=${process.env.NODE_ENV || 'development'})`);
  });
}

function shutdown(signal) {
  console.log(`${signal} received — closing HTTP server and MongoDB`);
  if (!server) process.exit(0);
  server.close(async () => {
    await mongoose.connection.close(false);
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection', reason);
  if (isProduction()) process.exit(1);
});