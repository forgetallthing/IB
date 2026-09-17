import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectDatabase, stopInMemoryDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seedDefaultAdmin } from '../src/bootstrap/seed-admin.js';
import { seedDefaultTags } from './helpers/seed-tags.js';
import { appConfig } from '../src/config.js';
import { QuestionVersionModel } from '../src/models/questionVersion.model.js';
import { QuizStateModel } from '../src/models/quizState.model.js';

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

async function createNote(payload: Record<string, unknown>) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/questions',
    headers: { authorization: `Bearer ${token}` },
    payload: { visibility: 'public', ...payload },
  });
  expect(res.statusCode).toBe(200);
  return res.json().id as string;
}

describe('trash (soft delete / restore / purge)', () => {
  it('soft delete hides note from list & detail, keeps it in trash', async () => {
    const id = await createNote({ title: '回收站笔记', content: '内容' });

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/questions/${id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().permanent).toBeUndefined();

    const list = await app.inject({ method: 'GET', url: '/api/questions' });
    expect(list.json().items.some((i: any) => i.id === id)).toBe(false);

    const detail = await app.inject({ method: 'GET', url: `/api/questions/${id}` });
    expect(detail.statusCode).toBe(404);

    const trash = await app.inject({
      method: 'GET',
      url: '/api/trash',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(trash.statusCode).toBe(200);
    expect(trash.json().items.some((i: any) => i.id === id)).toBe(true);
  }, 60000);

  it('restore puts note back to list', async () => {
    const id = await createNote({ title: '待恢复笔记', content: '内容' });
    await app.inject({
      method: 'DELETE',
      url: `/api/questions/${id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    const restore = await app.inject({
      method: 'POST',
      url: `/api/trash/${id}/restore`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(restore.statusCode).toBe(200);

    const list = await app.inject({ method: 'GET', url: '/api/questions' });
    expect(list.json().items.some((i: any) => i.id === id)).toBe(true);
    const trash = await app.inject({
      method: 'GET',
      url: '/api/trash',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(trash.json().items.some((i: any) => i.id === id)).toBe(false);
  }, 60000);

  it('permanent delete cascades versions and quiz state', async () => {
    const id = await createNote({ title: '彻底删除笔记', content: '内容' });
    // 先改一次内容产生一个历史版本，再点一次回想自评产生 QuizState
    await app.inject({
      method: 'PUT',
      url: `/api/questions/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { content: '内容v2' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/questions/${id}/quiz-feedback`,
      headers: { authorization: `Bearer ${token}` },
      payload: { feedback: 'known', countDraw: true },
    });

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/questions/${id}?permanent=1`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().permanent).toBe(true);

    const trash = await app.inject({
      method: 'GET',
      url: '/api/trash',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(trash.json().items.some((i: any) => i.id === id)).toBe(false);
    expect(await QuestionVersionModel.countDocuments({ questionId: id })).toBe(0);
    expect(await QuizStateModel.countDocuments({ questionId: id })).toBe(0);
  }, 60000);

  it('empty trash purges all soft-deleted notes of the user', async () => {
    // 先清空一次，保证用例之间互不残留，清空数量才可断言
    await app.inject({
      method: 'POST',
      url: '/api/trash/empty',
      headers: { authorization: `Bearer ${token}` },
    });

    const idA = await createNote({ title: '清空A', content: '内容' });
    const idB = await createNote({ title: '清空B', content: '内容' });
    for (const id of [idA, idB]) {
      await app.inject({
        method: 'DELETE',
        url: `/api/questions/${id}`,
        headers: { authorization: `Bearer ${token}` },
      });
    }

    const empty = await app.inject({
      method: 'POST',
      url: '/api/trash/empty',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().cleared).toBe(2);

    const trash = await app.inject({
      method: 'GET',
      url: '/api/trash',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(trash.json().total).toBe(0);
  }, 60000);
});

describe('question versions', () => {
  let id: string;

  it('creates a version only when content actually changes', async () => {
    id = await createNote({ title: '版本笔记', content: 'v1 内容' });

    // 无变化的重复保存不产生版本
    await app.inject({
      method: 'PUT',
      url: `/api/questions/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { title: '版本笔记' },
    });
    expect(await QuestionVersionModel.countDocuments({ questionId: id })).toBe(0);

    // 标题变化 → 快照旧内容
    await app.inject({
      method: 'PUT',
      url: `/api/questions/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { title: '版本笔记v2' },
    });
    expect(await QuestionVersionModel.countDocuments({ questionId: id })).toBe(1);
  }, 60000);

  it('lists versions and returns single version content', async () => {
    const list = await app.inject({
      method: 'GET',
      url: `/api/questions/${id}/versions`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    const items = list.json().items;
    expect(items).toHaveLength(1);
    expect(items[0].reason).toBe('edit');
    expect(items[0].title).toBe('版本笔记');

    const single = await app.inject({
      method: 'GET',
      url: `/api/questions/${id}/versions/1`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(single.statusCode).toBe(200);
    expect(single.json().title).toBe('版本笔记');
    expect(single.json().content).toBe('v1 内容');
  }, 60000);

  it('restore is non-destructive: current content saved as new version', async () => {
    await app.inject({
      method: 'PUT',
      url: `/api/questions/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { title: '版本笔记v3', content: 'v3 内容' },
    });

    const restore = await app.inject({
      method: 'POST',
      url: `/api/questions/${id}/versions/1/restore`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(restore.statusCode).toBe(200);

    const detail = await app.inject({ method: 'GET', url: `/api/questions/${id}` });
    expect(detail.json().title).toBe('版本笔记');
    expect(detail.json().content).toBe('v1 内容');

    const list = await app.inject({
      method: 'GET',
      url: `/api/questions/${id}/versions`,
      headers: { authorization: `Bearer ${token}` },
    });
    const items = list.json().items;
    expect(items).toHaveLength(3);
    // 最新的版本是恢复前捕获的当时内容（reason=restore）
    expect(items[0].reason).toBe('restore');
    expect(items[0].title).toBe('版本笔记v3');
  }, 60000);

  it('rejects invalid version number', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/questions/${id}/versions/abc`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  }, 60000);
});
