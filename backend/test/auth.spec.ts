import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectDatabase, stopInMemoryDatabase } from '../src/db.js';
import { appConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { seedDefaultAdmin } from '../src/bootstrap/seed-admin.js';

let app: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  process.env.DEV_USE_INMEMORY = '1';
  await connectDatabase();
  await seedDefaultAdmin();
  app = await createApp();
  await app.ready();
}, 60000);

afterAll(async () => {
  await stopInMemoryDatabase();
  if (app) {
    await app.close();
  }
}, 60000);

describe('auth', () => {
  it('login with default admin works', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: appConfig.adminSeedUsername, password: appConfig.adminSeedPassword },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeDefined();
    expect(body.user).toBeDefined();
    expect(body.user.username).toBe(appConfig.adminSeedUsername);
  }, 60000);
});
