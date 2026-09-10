import { FastifyInstance } from 'fastify';
import { Types, isValidObjectId } from 'mongoose';
import { SeriesModel } from '../../models/series.model.js';
import { QuestionModel } from '../../models/question.model.js';

type Me = { sub?: string; username?: string; role?: string };

async function requireAuth(request: any, reply: any) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ message: '登录已过期，请重新登录' });
  }
}

// 系列为创建者私有域：管理操作仅创建者或 admin
function canManage(series: { creatorId: unknown }, me: Me) {
  return me.role === 'admin' || String(series.creatorId) === String(me.sub);
}

// 与 questions 路由一致的可见性基线：未登录仅 public，登录用户 public + 自己的，admin 全部
function visibleMatch(me: Me) {
  if (me.role === 'admin') return {};
  return { $or: [{ visibility: 'public' }, { creatorId: new Types.ObjectId(String(me.sub)) }] };
}

export async function registerSeriesRoutes(app: FastifyInstance) {
  // 系列列表：自己的系列全部返回（含空系列）；他人的仅返回「含至少一篇可见文章」的
  app.get('/api/series', async (request, reply) => {
    const rejected = await requireAuth(request, reply);
    if (rejected) return rejected;
    const me = request.user as Me;

    const seriesList = await SeriesModel.find().sort({ order: 1, createdAt: -1 }).lean();
    const rows = (await QuestionModel.find({ seriesId: { $ne: null }, ...visibleMatch(me) })
      .select('seriesId')
      .lean()) as Array<{ seriesId: unknown }>;
    const countMap = new Map<string, number>();
    for (const row of rows) {
      const key = String(row.seriesId);
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }

    return seriesList
      .map((s) => ({
        id: String(s._id),
        title: s.title,
        description: s.description ?? '',
        creatorId: String(s.creatorId),
        creatorName: s.creatorName,
        canManage: canManage(s, me),
        articleCount: countMap.get(String(s._id)) ?? 0,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }))
      .filter((s) => s.canManage || s.articleCount > 0);
  });

  // 系列详情 + 有序目录（按笔记可见性过滤；order 升序 + createdAt 兜底）
  app.get('/api/series/:id', async (request, reply) => {
    const rejected = await requireAuth(request, reply);
    if (rejected) return rejected;
    const me = request.user as Me;
    const params = request.params as { id: string };
    if (!isValidObjectId(params.id)) return reply.status(404).send({ message: '系列不存在' });

    const series = await SeriesModel.findById(params.id).lean();
    if (!series) return reply.status(404).send({ message: '系列不存在' });

    const articles = (await QuestionModel.find({ seriesId: series._id, ...visibleMatch(me) })
      .sort({ order: 1, createdAt: 1 })
      .select('title visibility creatorName createdAt updatedAt')
      .lean()) as Array<{
      _id: unknown;
      title: string;
      visibility: 'public' | 'private';
      creatorName: string;
      createdAt: Date;
      updatedAt: Date;
    }>;

    return {
      id: String(series._id),
      title: series.title,
      description: series.description ?? '',
      creatorId: String(series.creatorId),
      creatorName: series.creatorName,
      canManage: canManage(series, me),
      articles: articles.map((a) => ({
        id: String(a._id),
        title: a.title,
        visibility: a.visibility,
        creatorName: a.creatorName,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
    };
  });

  app.post('/api/series', async (request, reply) => {
    const rejected = await requireAuth(request, reply);
    if (rejected) return rejected;
    const me = request.user as Me;

    const body = request.body as { title?: string; description?: string };
    if (!body.title?.trim()) {
      return reply.status(400).send({ message: '系列名称不能为空' });
    }

    // 新系列追加到目录末尾（取当前最大 order + 1）
    const last = (await SeriesModel.find().sort({ order: -1 }).limit(1).select('order').lean()) as Array<{
      order?: number;
    }>;
    const series = await SeriesModel.create({
      title: body.title.trim(),
      description: body.description ?? '',
      creatorId: me.sub,
      creatorName: me.username ?? 'unknown',
      order: (last[0]?.order ?? 0) + 1,
    });

    return { id: String(series._id), title: series.title, description: series.description ?? '' };
  });

  // 目录拖拽排序：前端提交全量新顺序，按数组下标写 order（登录即可拖动共享目录）
  app.patch('/api/series/reorder', async (request, reply) => {
    const rejected = await requireAuth(request, reply);
    if (rejected) return rejected;

    const body = request.body as { seriesIds?: string[] };
    const ids = Array.isArray(body.seriesIds) ? body.seriesIds.filter((id) => isValidObjectId(id)) : [];
    if (!ids.length) return reply.status(400).send({ message: '排序列表不能为空' });

    for (let i = 0; i < ids.length; i += 1) {
      await SeriesModel.updateOne({ _id: ids[i] }, { $set: { order: i + 1 } });
    }
    return { ok: true };
  });

  app.patch('/api/series/:id', async (request, reply) => {
    const rejected = await requireAuth(request, reply);
    if (rejected) return rejected;
    const me = request.user as Me;
    const params = request.params as { id: string };

    const series = await SeriesModel.findById(params.id);
    if (!series) return reply.status(404).send({ message: '系列不存在' });
    if (!canManage(series, me)) return reply.status(403).send({ message: '仅系列创建者或管理员可管理该系列' });

    const body = request.body as { title?: string; description?: string };
    if (body.title !== undefined) {
      if (!body.title.trim()) return reply.status(400).send({ message: '系列名称不能为空' });
      series.title = body.title.trim();
    }
    if (body.description !== undefined) series.description = body.description;
    await series.save();
    return { ok: true };
  });

  // 删除系列 = 解绑：成员文章的 seriesId/order 置空，文章本身不删除
  app.delete('/api/series/:id', async (request, reply) => {
    const rejected = await requireAuth(request, reply);
    if (rejected) return rejected;
    const me = request.user as Me;
    const params = request.params as { id: string };

    const series = await SeriesModel.findById(params.id);
    if (!series) return reply.status(404).send({ message: '系列不存在' });
    if (!canManage(series, me)) return reply.status(403).send({ message: '仅系列创建者或管理员可管理该系列' });

    const result = await QuestionModel.updateMany(
      { seriesId: series._id },
      { $set: { seriesId: null, order: null } },
    );
    await series.deleteOne();
    return { ok: true, unbound: result.modifiedCount ?? 0 };
  });

  // 批量添加文章：仅文章类型、创建者本人（admin 不限）、未加入其他系列；追加到目录末尾
  app.post('/api/series/:id/articles', async (request, reply) => {
    const rejected = await requireAuth(request, reply);
    if (rejected) return rejected;
    const me = request.user as Me;
    const params = request.params as { id: string };

    const series = await SeriesModel.findById(params.id);
    if (!series) return reply.status(404).send({ message: '系列不存在' });
    if (!canManage(series, me)) return reply.status(403).send({ message: '仅系列创建者或管理员可管理该系列' });

    const body = request.body as { questionIds?: string[] };
    const ids = Array.isArray(body.questionIds) ? body.questionIds.filter((id) => isValidObjectId(id)) : [];
    if (!ids.length) return reply.status(400).send({ message: '请选择要添加的文章' });

    const questions = await QuestionModel.find({ _id: { $in: ids } });
    if (questions.length !== ids.length) {
      return reply.status(400).send({ message: '部分笔记不存在' });
    }
    for (const q of questions) {
      if (q.type !== 'article') {
        return reply.status(400).send({ message: `「${q.title}」不是文章类型，无法加入系列` });
      }
      if (me.role !== 'admin' && String(q.creatorId) !== String(me.sub)) {
        return reply.status(403).send({ message: `「${q.title}」不是你创建的笔记` });
      }
      if (q.seriesId && String(q.seriesId) !== String(series._id)) {
        return reply.status(400).send({ message: `「${q.title}」已加入其他系列` });
      }
    }

    // 序号接续现有最大 order，保证追加到末尾
    const last = (await QuestionModel.find({ seriesId: series._id })
      .sort({ order: -1 })
      .limit(1)
      .select('order')
      .lean()) as Array<{ order?: number }>;
    let nextOrder = (last[0]?.order ?? 0) + 1;
    for (const id of ids) {
      await QuestionModel.updateOne({ _id: id }, { $set: { seriesId: series._id, order: nextOrder } });
      nextOrder += 1;
    }
    return { ok: true, added: ids.length };
  });

  // 移出单篇：seriesId/order 置空，文章本身不删除
  app.delete('/api/series/:id/articles/:questionId', async (request, reply) => {
    const rejected = await requireAuth(request, reply);
    if (rejected) return rejected;
    const me = request.user as Me;
    const params = request.params as { id: string; questionId: string };

    const series = await SeriesModel.findById(params.id);
    if (!series) return reply.status(404).send({ message: '系列不存在' });
    if (!canManage(series, me)) return reply.status(403).send({ message: '仅系列创建者或管理员可管理该系列' });

    const q = await QuestionModel.findById(params.questionId);
    if (!q || String(q.seriesId ?? '') !== String(series._id)) {
      return reply.status(404).send({ message: '该笔记不在此系列中' });
    }
    await QuestionModel.updateOne({ _id: q._id }, { $set: { seriesId: null, order: null } });
    return { ok: true };
  });

  // 拖拽排序：前端提交全量新顺序，校验与当前成员集合一致后按下标写 order
  app.patch('/api/series/:id/reorder', async (request, reply) => {
    const rejected = await requireAuth(request, reply);
    if (rejected) return rejected;
    const me = request.user as Me;
    const params = request.params as { id: string };

    const series = await SeriesModel.findById(params.id);
    if (!series) return reply.status(404).send({ message: '系列不存在' });
    if (!canManage(series, me)) return reply.status(403).send({ message: '仅系列创建者或管理员可管理该系列' });

    const body = request.body as { questionIds?: string[] };
    const ids = Array.isArray(body.questionIds) ? body.questionIds : [];
    // 与目录列表一致：只对请求者可见的成员做集合校验，避免「管理员把他人私有文章入系后，成员永远无法排序」
    const members = (await QuestionModel.find({ seriesId: series._id, ...visibleMatch(me) })
      .select('_id')
      .lean()) as Array<{ _id: unknown }>;
    const memberIds = members.map((m) => String(m._id));
    const isSameSet =
      memberIds.length === ids.length &&
      new Set(ids).size === ids.length &&
      memberIds.every((id) => ids.includes(id));
    if (!isSameSet) {
      return reply.status(400).send({ message: '排序列表与系列文章不一致，请刷新后重试' });
    }

    for (let i = 0; i < ids.length; i += 1) {
      await QuestionModel.updateOne({ _id: ids[i] }, { $set: { order: i + 1 } });
    }
    return { ok: true };
  });
}
