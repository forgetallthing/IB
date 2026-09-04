import { FastifyInstance } from 'fastify';
import { Types, isValidObjectId } from 'mongoose';
import { QuestionModel } from '../../models/question.model.js';
import { QuizStateModel, levelWeight, autoLevelByDrawCount } from '../../models/quizState.model.js';
import { QuizLogModel } from '../../models/quizLog.model.js';

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

  // 随机抽题：与列表接口相同的可见性基线；excludeId 供"再来一篇"避开当前题。
  // 权重规则：登录用户按 出现次数 自动降权（次数越多权重越低、没出现过的优先），
  // 自评反馈直接调整出现次数；「完全掌握」通过自评设置，不再推送。
  // 注意：抽题本身不计数；点击对照回忆自评选项才算一次完整回想（quiz-feedback 中记录回想日志，反馈本身继续调整出现次数）。
  app.get('/api/questions/random', async (request, reply) => {
    let me: { sub?: string; role?: string } | null = null;
    try {
      await request.jwtVerify();
      me = request.user as { sub?: string; role?: string };
    } catch {
      // 游客
    }

    const query = request.query as {
      excludeId?: string;
      difficulty?: string | string[];
      tags?: string | string[];
    };

    const match: Record<string, unknown> =
      !me
        ? { visibility: 'public' }
        : me.role === 'admin'
          ? {}
          : { $or: [{ visibility: 'public' }, { creatorId: String(me.sub) }] };

    // 筛选条件（与列表接口相同的 $in 语义：任一匹配）
    if (query.difficulty) {
      const difficulties = Array.isArray(query.difficulty) ? query.difficulty : [query.difficulty];
      if (difficulties.length) match.difficulty = { $in: difficulties };
    }
    if (query.tags) {
      const tags = Array.isArray(query.tags) ? query.tags : [query.tags];
      if (tags.length) match.tags = { $in: tags };
    }

    const excludeId =
      typeof query.excludeId === 'string' && isValidObjectId(query.excludeId) ? query.excludeId : '';

    type Candidate = { id: string; drawCount: number; mastered: boolean };
    let candidates: Candidate[] = [];

    if (me) {
      // 登录用户：join 自身的回想状态计算权重
      const userIdObj = new Types.ObjectId(me.sub);
      const rows = await QuestionModel.aggregate<{
        _id: unknown;
        drawCount?: number;
        mastered?: boolean;
      }>([
        { $match: match },
        {
          $lookup: {
            from: 'quizstates',
            let: { qid: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $and: [{ $eq: ['$questionId', '$$qid'] }, { $eq: ['$userId', userIdObj] }] },
                },
              },
              { $project: { drawCount: 1, mastered: 1 } },
            ],
            as: 'state',
          },
        },
        { $addFields: { state: { $first: '$state' } } },
        {
          $project: {
            _id: 1,
            drawCount: { $ifNull: ['$state.drawCount', 0] },
            mastered: '$state.mastered',
          },
        },
      ]);

      candidates = rows.map((row) => ({
        id: String(row._id),
        drawCount: row.drawCount ?? 0,
        mastered: row.mastered === true,
      }));
    } else {
      // 游客：没有个人权重，全部按"优先推荐"等概率抽取
      const rows = await QuestionModel.find(match).select('_id').lean();
      candidates = (rows as Array<{ _id: unknown }>).map((row) => ({
        id: String(row._id),
        drawCount: 0,
        mastered: false,
      }));
    }

    // 完全掌握不进入候选；"再来一篇"时避开当前题，仅剩一篇可推时允许重复
    let pool = candidates.filter((candidate) => !candidate.mastered);
    const withoutExcluded = excludeId ? pool.filter((candidate) => candidate.id !== excludeId) : pool;
    if (withoutExcluded.length) pool = withoutExcluded;

    if (!pool.length) {
      const allMastered = candidates.length > 0 && candidates.every((candidate) => candidate.mastered);
      return reply.status(404).send({
        message: allMastered
          ? '可见的笔记都已标记为完全掌握，可到设置页清除回想权重'
          : '暂无可回想的内容',
      });
    }

    // 按出现次数映射的权重随机抽取（加权轮盘）
    const totalWeight = pool.reduce((sum, candidate) => sum + levelWeight(autoLevelByDrawCount(candidate.drawCount)), 0);
    const first = pool[0];
    if (!first) return reply.status(404).send({ message: '暂无可回想的内容' });
    let picked = first;
    if (totalWeight > 0) {
      let roll = Math.random() * totalWeight;
      for (const candidate of pool) {
        roll -= levelWeight(autoLevelByDrawCount(candidate.drawCount));
        if (roll < 0) {
          picked = candidate;
          break;
        }
      }
    }

    const item = await QuestionModel.findById(picked.id).lean();
    if (!item) return reply.status(404).send({ message: '暂无可回想的内容' });

    return {
      id: String(item._id),
      title: item.title,
      content: item.content,
      tags: (item.tags as string[]) ?? [],
      difficulty: item.difficulty as 'easy' | 'medium' | 'hard',
      creatorName: item.creatorName as string,
      visibility: item.visibility as 'public' | 'private',
      drawCount: picked.drawCount,
      mastered: picked.mastered,
    };
  });

  // 回想自评反馈：直接调整推送权重——没记住清零回优先推荐、模糊+1、记住了+2、完全掌握不再推送。
  // countDraw：本次回想是否计入回想日志（前端保证每篇抽到的笔记只在首次反馈时传 true）
  app.post('/api/questions/:id/quiz-feedback', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: '登录已过期，请重新登录' });
    }

    const params = request.params as { id: string };
    const body = request.body as { feedback?: string; countDraw?: boolean };
    const feedback = body.feedback;
    if (feedback !== 'known' && feedback !== 'fuzzy' && feedback !== 'forgot' && feedback !== 'mastered') {
      return reply.status(400).send({ message: '反馈类型不合法' });
    }
    if (!isValidObjectId(params.id)) {
      return reply.status(400).send({ message: '笔记不存在' });
    }

    const me = request.user as { sub?: string };
    const userIdObj = new Types.ObjectId(me.sub);
    const filter = { userId: userIdObj, questionId: params.id };

    const update: Record<string, unknown> = {};
    if (feedback === 'forgot') {
      // 没记住：出现次数清零，回到优先推荐
      update.$set = { drawCount: 0, mastered: false };
    } else if (feedback === 'fuzzy') {
      update.$inc = { drawCount: 1 };
      update.$set = { mastered: false };
    } else if (feedback === 'known') {
      update.$inc = { drawCount: 2 };
      update.$set = { mastered: false };
    } else {
      // 完全掌握：不再推送
      update.$set = { mastered: true };
    }

    const newState = await QuizStateModel.findOneAndUpdate(filter, update, { upsert: true, new: true }).lean();
    await QuizLogModel.create({ userId: userIdObj, questionId: params.id, action: 'review', feedback });
    // 点击对照回忆选项才算一次完整回想：记录回想日志供热力图/累计回想/连续打卡统计使用
    if (body.countDraw === true) {
      await QuizLogModel.create({ userId: userIdObj, questionId: params.id, action: 'draw' });
    }

    return {
      drawCount: newState?.drawCount ?? 0,
      mastered: newState?.mastered === true,
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
