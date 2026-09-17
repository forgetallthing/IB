import { FastifyInstance } from 'fastify';
import { isValidObjectId } from 'mongoose';
import { QuestionModel } from '../../models/question.model.js';
import { SeriesModel } from '../../models/series.model.js';
import { purgeQuestionsByIds } from '../../services/questionPurge.service.js';

type Me = { sub?: string; role?: string };

async function requireAuth(request: any, reply: any) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ message: '登录已过期，请重新登录' });
  }
}

export async function registerTrashRoutes(app: FastifyInstance) {
  // 回收站列表：普通用户仅见自己删除的，admin 全部可见；按删除时间倒序
  app.get('/api/trash', async (request, reply) => {
    const rejected = await requireAuth(request, reply);
    if (rejected) return rejected;
    const me = request.user as Me;

    const query = request.query as { page?: string; limit?: string };
    // 分页口径与笔记列表一致：page 从 1 开始，limit 默认 20、上限 100
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

    const filter: Record<string, unknown> = { deletedAt: { $ne: null } };
    if (me.role !== 'admin') filter.creatorId = String(me.sub);

    const [items, total] = await Promise.all([
      QuestionModel.find(filter)
        .sort({ deletedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('title type visibility tags difficulty creatorName deletedAt updatedAt')
        .lean(),
      QuestionModel.countDocuments(filter),
    ]);

    return {
      items: (items as Array<{
        _id: unknown;
        title: string;
        type?: 'qa' | 'article' | null;
        visibility: 'public' | 'private';
        tags: string[];
        difficulty: 'easy' | 'medium' | 'hard';
        creatorName: string;
        deletedAt: Date | null;
        updatedAt: Date;
      }>).map((item) => ({
        id: String(item._id),
        title: item.title,
        type: (item.type as 'qa' | 'article') ?? 'qa',
        visibility: item.visibility,
        tags: item.tags,
        difficulty: item.difficulty,
        creatorName: item.creatorName,
        deletedAt: item.deletedAt,
        updatedAt: item.updatedAt,
      })),
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  });

  // 恢复：仅创建者或 admin；系列若已在此期间被删除则兜底解绑，避免悬挂引用
  app.post('/api/trash/:id/restore', async (request, reply) => {
    const rejected = await requireAuth(request, reply);
    if (rejected) return rejected;
    const me = request.user as Me;
    const params = request.params as { id: string };
    if (!isValidObjectId(params.id)) return reply.status(404).send({ message: '回收站中不存在该笔记' });

    const item = await QuestionModel.findOne({ _id: params.id, deletedAt: { $ne: null } });
    if (!item) return reply.status(404).send({ message: '回收站中不存在该笔记' });
    if (me.role !== 'admin' && String(item.creatorId) !== String(me.sub)) {
      return reply.status(403).send({ message: '仅创建者或管理员可以恢复该笔记' });
    }

    if (item.seriesId) {
      const seriesExists = await SeriesModel.exists({ _id: item.seriesId });
      if (!seriesExists) {
        item.set('seriesId', undefined);
        item.set('order', undefined);
      }
    }
    item.deletedAt = null;
    await item.save();
    return { ok: true };
  });

  // 清空回收站：普通用户清自己的，admin 清全部；级联清理版本与回想权重
  app.post('/api/trash/empty', async (request, reply) => {
    const rejected = await requireAuth(request, reply);
    if (rejected) return rejected;
    const me = request.user as Me;

    const filter: Record<string, unknown> = { deletedAt: { $ne: null } };
    if (me.role !== 'admin') filter.creatorId = String(me.sub);

    const rows = (await QuestionModel.find(filter).select('_id').lean()) as Array<{ _id: unknown }>;
    const cleared = await purgeQuestionsByIds(rows.map((row) => row._id));
    return { cleared };
  });
}
