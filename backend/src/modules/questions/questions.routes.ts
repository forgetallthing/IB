import { FastifyInstance } from 'fastify';
import { QuestionModel } from '../../models/question.model.js';

export async function registerQuestionRoutes(app: FastifyInstance) {
  app.get('/api/questions', async (request) => {
    const query = request.query as {
      q?: string;
      tags?: string | string[];
      difficulty?: 'easy' | 'medium' | 'hard' | Array<'easy' | 'medium' | 'hard'>;
      creatorId?: string;
      creatorName?: string;
      visibility?: 'public' | 'private' | Array<'public' | 'private'>;
      page?: string;
      limit?: string;
    };

    // 可见性基线：未登录仅 public；登录的普通用户可见 public + 自己创建的；管理员全部可见
    let me: { sub?: string; role?: string } | null = null;
    try {
      await request.jwtVerify();
      me = request.user as { sub?: string; role?: string };
    } catch {
      // 游客
    }

    const requested = query.visibility
      ? Array.isArray(query.visibility)
        ? query.visibility
        : [query.visibility]
      : null;

    let visibilityClause: Record<string, unknown> | null = null;
    if (!me) {
      visibilityClause = { visibility: 'public' };
    } else if (me.role !== 'admin') {
      // 与显式筛选取交集：public 直接可见，private 仅限自己创建的
      if (requested) {
        const clauses: Record<string, unknown>[] = [];
        if (requested.includes('public')) clauses.push({ visibility: 'public' });
        if (requested.includes('private')) clauses.push({ visibility: 'private', creatorId: String(me.sub) });
        visibilityClause = clauses.length ? { $or: clauses } : { _id: { $exists: false } };
      } else {
        visibilityClause = { $or: [{ visibility: 'public' }, { creatorId: String(me.sub) }] };
      }
    } else if (requested) {
      visibilityClause = { visibility: { $in: requested } };
    }

    const filter: Record<string, unknown> = {};
    if (visibilityClause) {
      // 用 $and 承载可见性条件，避免与搜索的 $or 冲突
      filter.$and = [visibilityClause];
    }
    if (query.q) {
      filter.$or = [
        { title: { $regex: query.q, $options: 'i' } },
        { content: { $regex: query.q, $options: 'i' } },
      ];
    }
    if (query.difficulty) {
      const difficulties = Array.isArray(query.difficulty) ? query.difficulty : [query.difficulty];
      filter.difficulty = { $in: difficulties };
    }
    if (query.creatorId) {
      filter.creatorId = query.creatorId;
    }
    if (query.creatorName) {
      filter.creatorName = { $regex: query.creatorName, $options: 'i' };
    }
    if (query.tags) {
      filter.tags = Array.isArray(query.tags) ? { $in: query.tags } : { $in: [query.tags] };
    }

    // 分页：page 从 1 开始，limit 默认 20、上限 100
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

    const [items, total] = await Promise.all([
      QuestionModel.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      QuestionModel.countDocuments(filter),
    ]);
    return {
      items: (items as Array<{
        _id: unknown;
        title: string;
        content: string;
        answer?: string;
        tags: string[];
        difficulty: 'easy' | 'medium' | 'hard';
        creatorId: unknown;
        creatorName: string;
        visibility: 'public' | 'private';
        source?: string | null;
        aiSummary?: string | null;
        aiSuggestedTags?: string[] | null;
        aiSuggestedDifficulty?: 'easy' | 'medium' | 'hard' | null;
        createdAt: Date;
        updatedAt: Date;
      }>).map((item) => ({
        id: String(item._id),
        title: item.title,
        content: item.content,
        answer: item.answer ?? '',
        tags: item.tags,
        difficulty: item.difficulty,
        creatorId: String(item.creatorId),
        creatorName: item.creatorName,
        visibility: item.visibility,
        source: item.source ?? undefined,
        aiSummary: item.aiSummary ?? undefined,
        aiSuggestedTags: item.aiSuggestedTags ?? undefined,
        aiSuggestedDifficulty: item.aiSuggestedDifficulty ?? undefined,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  });

  app.post('/api/questions', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: '登录已过期，请重新登录' });
    }

    const body = request.body as {
      title?: string;
      content?: string;
      tags?: string[];
      difficulty?: 'easy' | 'medium' | 'hard';
      creatorId?: string;
      creatorName?: string;
      visibility?: 'public' | 'private';
      source?: string;
      aiSummary?: string;
      aiSuggestedTags?: string[];
      aiSuggestedDifficulty?: 'easy' | 'medium' | 'hard';
    };

    if (!body.title || !body.content) {
      return reply.status(400).send({ message: '标题和内容不能为空' });
    }

    const user = request.user as { sub?: string; username?: string; role?: string } | null;

    const question = await QuestionModel.create({
      title: body.title,
      content: body.content,
      answer: '',
      tags: body.tags ?? [],
      difficulty: body.difficulty ?? 'medium',
      creatorId: body.creatorId ?? (user?.sub ? user.sub : null),
      creatorName: body.creatorName ?? (user?.username ? user.username : 'unknown'),
      visibility: body.visibility ?? 'public',
      source: body.source,
      aiSummary: body.aiSummary,
      aiSuggestedTags: body.aiSuggestedTags ?? [],
      aiSuggestedDifficulty: body.aiSuggestedDifficulty,
    });

    return { id: String(question._id) };
  });

  app.get('/api/questions/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const item = await QuestionModel.findById(params.id).lean();
    if (!item) return reply.status(404).send({ message: '笔记不存在' });

    // 与列表接口相同的可见性基线：私有笔记仅创建者和管理员可读
    let me: { sub?: string; role?: string } | null = null;
    try {
      await request.jwtVerify();
      me = request.user as { sub?: string; role?: string };
    } catch {
      // 游客
    }
    if (item.visibility === 'private' && me?.role !== 'admin' && String(item.creatorId) !== String(me?.sub)) {
      return reply.status(403).send({ message: '仅创建者或管理员可以查看该笔记' });
    }

    return {
      id: String(item._id),
      title: item.title,
      content: item.content,
      answer: item.answer ?? '',
      tags: item.tags,
      difficulty: item.difficulty,
      creatorId: String(item.creatorId),
      creatorName: item.creatorName,
      visibility: item.visibility,
      source: item.source ?? undefined,
      aiSummary: item.aiSummary ?? undefined,
      aiSuggestedTags: item.aiSuggestedTags ?? undefined,
      aiSuggestedDifficulty: item.aiSuggestedDifficulty ?? undefined,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  });

  app.put('/api/questions/:id', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: '登录已过期，请重新登录' });
    }

    const params = request.params as { id: string };
    const body = request.body as Partial<{
      title: string;
      content: string;
      tags: string[];
      difficulty: 'easy' | 'medium' | 'hard';
      visibility: 'public' | 'private';
    }>;

    const existing = await QuestionModel.findById(params.id);
    if (!existing) return reply.status(404).send({ message: '笔记不存在' });

    const user = request.user as { sub?: string; username?: string; role?: string } | null;
    // 仅管理员或创建者可维护
    if (user?.role !== 'admin' && String(existing.creatorId) !== String(user?.sub)) {
      return reply.status(403).send({ message: '仅创建者或管理员可以维护该笔记' });
    }

    if (body.title !== undefined) existing.title = body.title;
    if (body.content !== undefined) existing.content = body.content;
    if (body.tags !== undefined) existing.tags = body.tags;
    if (body.difficulty !== undefined) existing.difficulty = body.difficulty;
    if (body.visibility !== undefined) existing.visibility = body.visibility;

    await existing.save();
    return { ok: true };
  });

  app.delete('/api/questions/:id', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: '登录已过期，请重新登录' });
    }

    const params = request.params as { id: string };
    const existing = await QuestionModel.findById(params.id);
    if (!existing) return reply.status(404).send({ message: '笔记不存在' });

    const user = request.user as { sub?: string; role?: string } | null;
    if (user?.role !== 'admin' && String(existing.creatorId) !== String(user?.sub)) {
      return reply.status(403).send({ message: '仅创建者或管理员可以维护该笔记' });
    }

    await existing.deleteOne();
    return { ok: true };
  });
}
