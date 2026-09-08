import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectDatabase, stopInMemoryDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seedDefaultAdmin } from '../src/bootstrap/seed-admin.js';
import { seedDefaultTags } from './helpers/seed-tags.js';
import { appConfig } from '../src/config.js';

let app: Awaited<ReturnType<typeof createApp>>;
let token: string;

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

describe('questions CRUD', () => {
  let createdId: string;

  it('create note', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/questions',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: '示例笔记',
        content: '内容',
        answer: '详情',
        tags: ['tag1'],
        difficulty: 'easy',
        visibility: 'public',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBeDefined();
    createdId = body.id;
  }, 60000);

  it('list notes includes created', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/questions' });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.some((i: any) => i.id === createdId)).toBe(true);
  }, 60000);

  it('get note by id', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/questions/${createdId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(createdId);
    expect(res.json().title).toBe('示例笔记');
  }, 60000);

  it('update note', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/questions/${createdId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { title: '更新标题' },
    });
    expect(res.statusCode).toBe(200);
    const getRes = await app.inject({ method: 'GET', url: `/api/questions/${createdId}` });
    expect(getRes.json().title).toBe('更新标题');
  }, 60000);

  it('backup requires admin', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/backup/export' });
    expect(res.statusCode).toBe(401);
  }, 60000);

  it('backup export returns mongodump archive', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/backup/export',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('octet-stream');
    expect(res.headers['content-disposition']).toContain('archive.gz');
    expect(res.rawPayload.length).toBeGreaterThan(0);
  }, 120000);

  it('filter notes by creator name', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/questions?creatorName=admin' });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBeGreaterThan(0);
  }, 60000);

  it('delete note', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/questions/${createdId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  }, 60000);
});
