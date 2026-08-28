import mongoose from 'mongoose';
import { appConfig } from './config.js';

let _memoryServer: any = null;

export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // Development helper: use an in-memory MongoDB when DEV_USE_INMEMORY=1
  if (process.env.DEV_USE_INMEMORY === '1') {
    // lazy import to avoid adding dependency in production
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    _memoryServer = await MongoMemoryServer.create();
    const uri = _memoryServer.getUri();
    await mongoose.connect(uri);
    return mongoose.connection;
  }

  await mongoose.connect(appConfig.mongoUri);
  return mongoose.connection;
}

export async function stopInMemoryDatabase() {
  if (_memoryServer) {
    await mongoose.disconnect();
    await _memoryServer.stop();
    _memoryServer = null;
  }
}
