import mongoose from 'mongoose';

let memoryServer = null;
let activeUri = null;

const EXTERNAL_URI = process.env.MONGODB_URI_STAGING || process.env.MONGODB_URI_TEST;

export async function connectTestDatabase() {
  if (mongoose.connection.readyState === 1) {
    return activeUri;
  }

  if (EXTERNAL_URI) {
    await mongoose.connect(EXTERNAL_URI, { serverSelectionTimeoutMS: 8000 });
    activeUri = EXTERNAL_URI;
    return activeUri;
  }

  try {
    const local = 'mongodb://127.0.0.1:27017/darshan-desk-test';
    await mongoose.connect(local, { serverSelectionTimeoutMS: 2000 });
    activeUri = local;
    return activeUri;
  } catch {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create({
      binary: { version: '6.0.16' },
    });
    activeUri = memoryServer.getUri('darshan-desk-test');
    await mongoose.connect(activeUri);
    return activeUri;
  }
}

export async function disconnectTestDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

export async function isMongoAvailable() {
  try {
    await connectTestDatabase();
    await disconnectTestDatabase();
    return true;
  } catch {
    return false;
  }
}