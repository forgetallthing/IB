import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectDatabase, stopInMemoryDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seedDefaultAdmin } from '../src/bootstrap/seed-admin.js';
import { seedDefaultTags } from '../src/bootstrap/seed-tags.js';
import { appConfig } from '../src/config.js';

let app: Awaited<ReturnType<typeof createApp>>;
let token: string;
let tagId: string;

beforeAll(async () => {
  process.env.DEV_USE_INMEMORY = '1';
  await connectDatabase();
  await seedDefaultAdmin();
  await seedDefaultTags();
  app = await createApp();
  await app.ready();

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: appConfig.adminSeedUsername, password: appConfig.adminSeedPassword },
  });
  token = res.json().token;
}, 60000);

afterAll(async () => {
  await stopInMemoryDatabase();
  if (app) {
    await app.close();
  }
}, 60000);

describe('tags routes', () => {
  it('list tags', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tags', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  }, 60000);

  it('create tag', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tags',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: '测试标签', color: '#abcdef', description: '自动测试' },
    });
    expect(res.statusCode).toBe(200);
    tagId = res.json().id;
  }, 60000);

  it('update tag', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/tags/${tagId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { active: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().active).toBe(false);
  }, 60000);

  it('delete tag', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/tags/${tagId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  }, 60000);
});
