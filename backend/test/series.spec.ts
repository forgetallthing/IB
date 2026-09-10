import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectDatabase, stopInMemoryDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seedDefaultAdmin } from '../src/bootstrap/seed-admin.js';
import { seedDefaultTags } from './helpers/seed-tags.js';
import { appConfig } from '../src/config.js';

let app: Awaited<ReturnType<typeof createApp>>;
let adminToken: string;
let memberToken: string;
let seriesId: string;
let articleId: string;
let qaId: string;
let adminSeriesId: string;

async function login(username: string, password: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  });
  return res.json().token as string;
}

beforeAll(async () => {
  process.env.DEV_USE_INMEMORY = '1';
  await connectDatabase();
  await seedDefaultAdmin();
  await seedDefaultTags();
  app = await createApp();
  await app.ready();

  adminToken = await login(appConfig.adminSeedUsername, appConfig.adminSeedPassword);

  // 创建一个普通成员账号用于权限隔离测试
  await app.inject({
    method: 'POST',
    url: '/api/users',
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { username: 'series_member', password: 'member123456', role: 'member' },
  });
  memberToken = await login('series_member', 'member123456');
}, 60000);

afterAll(async () => {
  await stopInMemoryDatabase();
  if (app) {
    await app.close();
  }
}, 60000);

describe('series routes', () => {
  it('member creates series', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/series',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { title: 'Vue3 源码系列', description: '循序渐进读源码' },
    });
    expect(res.statusCode).toBe(200);
    seriesId = res.json().id;
    expect(res.json().title).toBe('Vue3 源码系列');
  }, 60000);

  it('lists own empty series', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/series',
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json();
    const mine = items.find((s: { id: string }) => s.id === seriesId);
    expect(mine).toBeTruthy();
    expect(mine.canManage).toBe(true);
    expect(mine.articleCount).toBe(0);
  }, 60000);

  it('create article and qa questions; type filter works', async () => {
    const create = async (title: string, type: 'qa' | 'article') =>
      app.inject({
        method: 'POST',
        url: '/api/questions',
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { title, content: `# ${title}`, type },
      });
    articleId = (await create('组合式 API 剖析', 'article')).json().id;
    qaId = (await create('什么是响应式原理', 'qa')).json().id;

    const articles = await app.inject({
      method: 'GET',
      url: '/api/questions?type=article',
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(articles.json().items.map((i: { id: string }) => i.id)).toContain(articleId);

    const qas = await app.inject({
      method: 'GET',
      url: '/api/questions?type=qa',
      headers: { authorization: `Bearer ${memberToken}` },
    });
    const qaIds = qas.json().items.map((i: { id: string }) => i.id);
    expect(qaIds).toContain(qaId);
    expect(qaIds).not.toContain(articleId);
  }, 60000);

  it('rejects adding qa-type question to series', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/series/${seriesId}/articles`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { questionIds: [qaId] },
    });
    expect(res.statusCode).toBe(400);
  }, 60000);

  it('adds articles and returns ordered catalog', async () => {
    const second = await app.inject({
      method: 'POST',
      url: '/api/questions',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { title: 'ref 与 reactive', content: '正文', type: 'article' },
    });
    const secondId = second.json().id;

    const add = await app.inject({
      method: 'POST',
      url: `/api/series/${seriesId}/articles`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { questionIds: [articleId, secondId] },
    });
    expect(add.statusCode).toBe(200);
    expect(add.json().added).toBe(2);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/series/${seriesId}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(detail.statusCode).toBe(200);
    const catalog = detail.json().articles.map((a: { id: string }) => a.id);
    expect(catalog).toEqual([articleId, secondId]);
  }, 60000);

  it('reorders catalog', async () => {
    const detail = await app.inject({
      method: 'GET',
      url: `/api/series/${seriesId}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    const ids = detail.json().articles.map((a: { id: string }) => a.id);
    const reordered = [...ids].reverse();

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/series/${seriesId}/reorder`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { questionIds: reordered },
    });
    expect(res.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: `/api/series/${seriesId}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(after.json().articles.map((a: { id: string }) => a.id)).toEqual(reordered);
  }, 60000);

  it('question detail returns series info', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/questions/${articleId}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().type).toBe('article');
    expect(res.json().series).toEqual({ id: seriesId, title: 'Vue3 源码系列' });
  }, 60000);

  it('rejects adding an article already in another series', async () => {
    const other = await app.inject({
      method: 'POST',
      url: '/api/series',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { title: '另一个系列' },
    });
    const otherId = other.json().id;
    const res = await app.inject({
      method: 'POST',
      url: `/api/series/${otherId}/articles`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { questionIds: [articleId] },
    });
    expect(res.statusCode).toBe(400);
    await app.inject({
      method: 'DELETE',
      url: `/api/series/${otherId}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
  }, 60000);

  it('switching type back to qa unbinds the series', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/questions/${articleId}`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { type: 'qa' },
    });
    expect(res.statusCode).toBe(200);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/questions/${articleId}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(detail.json().type).toBe('qa');
    expect(detail.json().series).toBeUndefined();

    const catalog = await app.inject({
      method: 'GET',
      url: `/api/series/${seriesId}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(catalog.json().articles.map((a: { id: string }) => a.id)).not.toContain(articleId);
  }, 60000);

  it('member cannot manage others series', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/series',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { title: '管理员系列' },
    });
    adminSeriesId = created.json().id;

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/series/${adminSeriesId}`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { title: '篡改' },
    });
    expect(patch.statusCode).toBe(403);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/series/${adminSeriesId}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(del.statusCode).toBe(403);
  }, 60000);

  it('deleting series unbinds articles but keeps them', async () => {
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/series/${seriesId}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().unbound).toBeGreaterThan(0);

    const gone = await app.inject({
      method: 'GET',
      url: `/api/series/${seriesId}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(gone.statusCode).toBe(404);

    const stillThere = await app.inject({
      method: 'GET',
      url: `/api/questions/${qaId}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(stillThere.statusCode).toBe(200);
  }, 60000);

  it('daily recall pool excludes articles', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/questions/random',
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().type).toBe('qa');
  }, 60000);

  it('reorders series list and requires auth', async () => {
    // 未登录拒绝
    const anon = await app.inject({
      method: 'PATCH',
      url: '/api/series/reorder',
      payload: { seriesIds: [] },
    });
    expect(anon.statusCode).toBe(401);

    // 建两个系列拿到 id
    const a = await app.inject({
      method: 'POST',
      url: '/api/series',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { title: '排序系列A' },
    });
    const b = await app.inject({
      method: 'POST',
      url: '/api/series',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { title: '排序系列B' },
    });
    const idA = a.json().id as string;
    const idB = b.json().id as string;

    // 按新顺序提交：B 在前 A 在后
    const reorder = await app.inject({
      method: 'PATCH',
      url: '/api/series/reorder',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { seriesIds: [idB, idA] },
    });
    expect(reorder.statusCode).toBe(200);

    // 列表按 order 升序返回，B 在 A 前
    const list = await app.inject({
      method: 'GET',
      url: '/api/series',
      headers: { authorization: `Bearer ${memberToken}` },
    });
    const titles = list.json().map((s: { title: string }) => s.title);
    expect(titles.indexOf('排序系列B')).toBeLessThan(titles.indexOf('排序系列A'));
  }, 60000);
});
