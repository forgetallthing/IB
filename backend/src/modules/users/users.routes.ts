import { FastifyInstance } from 'fastify';
import { Types } from 'mongoose';
import { UserModel } from '../../models/user.model.js';
import { QuestionModel } from '../../models/question.model.js';
import { QuizStateModel, autoLevelByDrawCount } from '../../models/quizState.model.js';
import { QuizLogModel } from '../../models/quizLog.model.js';
import { hashPassword, verifyPassword } from '../../services/password.service.js';

export async function registerUserRoutes(app: FastifyInstance) {
  async function requireAdmin(request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: '登录已过期，请重新登录' });
    }

    const user = request.user as { role?: string } | null;
    if (user?.role !== 'admin') {
      return reply.status(403).send({ message: '仅管理员可执行此操作' });
    }
  }

  app.get('/api/users', async (request, reply) => {
    const rejected = await requireAdmin(request, reply);
    if (rejected) return rejected;

    const users = await UserModel.find().sort({ createdAt: -1 }).lean();
    return (users as Array<{
      _id: unknown;
      username: string;
      email?: string | null;
      role: 'admin' | 'member';
      status: 'active' | 'disabled';
      createdAt: Date;
      updatedAt: Date;
    }>).map((user) => ({
      id: String(user._id),
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));
  });

  app.get('/api/users/me', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: '登录已过期，请重新登录' });
    }

    const me = request.user as { sub?: string };
    const user = await UserModel.findById(me.sub);
    if (!user) {
      return reply.status(404).send({ message: '用户不存在' });
    }

    return {
      id: String(user._id),
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
    };
  });

  app.patch('/api/users/me', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: '登录已过期，请重新登录' });
    }

    const me = request.user as { sub?: string };
    const body = request.body as {
      username?: string;
      email?: string;
      password?: string;
      currentPassword?: string;
    };

    const user = await UserModel.findById(me.sub);
    if (!user) {
      return reply.status(404).send({ message: '用户不存在' });
    }

    if (body.username) {
      user.username = body.username.trim();
    }

    if (body.email !== undefined) {
      user.email = body.email || null;
    }

    if (body.password) {
      if (!body.currentPassword || !verifyPassword(body.currentPassword, user.passwordHash)) {
        return reply.status(400).send({ message: '当前密码不正确' });
      }
      user.passwordHash = hashPassword(body.password);
    }

    try {
      await user.save();
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 11000) {
        return reply.status(409).send({ message: '用户名或邮箱已被占用' });
      }
      throw error;
    }

    return {
      id: String(user._id),
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
    };
  });

  // 每日回想筛选偏好：登录用户的筛选条件持久化到后台，进入页面时恢复
  const QUIZ_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

  app.get('/api/users/me/quiz-prefs', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: '登录已过期，请重新登录' });
    }

    const me = request.user as { sub?: string };
    const user = await UserModel.findById(me.sub).lean();
    if (!user) {
      return reply.status(404).send({ message: '用户不存在' });
    }

    const prefs = (user as { quizPrefs?: { difficulty?: string[]; tags?: string[] } }).quizPrefs;
    return { difficulty: prefs?.difficulty ?? [], tags: prefs?.tags ?? [] };
  });

  app.put('/api/users/me/quiz-prefs', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: '登录已过期，请重新登录' });
    }

    const me = request.user as { sub?: string };
    const body = request.body as { difficulty?: unknown; tags?: unknown };

    // 过滤非法值：难度仅允许枚举值，标签最多 20 个
    const difficulty = Array.isArray(body.difficulty)
      ? body.difficulty.filter(
          (item): item is (typeof QUIZ_DIFFICULTIES)[number] =>
            typeof item === 'string' && (QUIZ_DIFFICULTIES as readonly string[]).includes(item),
        )
      : [];
    const tags = Array.isArray(body.tags)
      ? body.tags
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 20)
      : [];

    const user = await UserModel.findById(me.sub);
    if (!user) {
      return reply.status(404).send({ message: '用户不存在' });
    }

    user.quizPrefs = { difficulty: [...difficulty], tags: [...tags] };
    await user.save();
    return { difficulty: [...difficulty], tags: [...tags] };
  });

  // 清除当前用户的每日回想权重（出现次数与手动档位），不影响笔记本身
  app.delete('/api/users/me/quiz-state', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: '登录已过期，请重新登录' });
    }

    const me = request.user as { sub?: string };
    const result = await QuizStateModel.deleteMany({ userId: me.sub });
    return { cleared: result.deletedCount ?? 0 };
  });

  // 学习主页聚合数据：我的笔记概览 + 今日回想 + 最近回想记录（统计明细见 quiz-stats 接口）
  app.get('/api/users/me/dashboard', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: '登录已过期，请重新登录' });
    }

    const me = request.user as { sub?: string };
    const userIdObj = new Types.ObjectId(me.sub);
    const creatorId = String(me.sub);

    // UTC+8 的"今日"起点
    const now = new Date();
    const todayKey = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const todayStartUtcMs = Date.parse(`${todayKey}T00:00:00+08:00`);

    const [noteTotal, publicCount, privateCount, todayReviews, difficultyRows, tagRows, recentLogs] = await Promise.all([
      QuestionModel.countDocuments({ creatorId }),
      QuestionModel.countDocuments({ creatorId, visibility: 'public' }),
      QuestionModel.countDocuments({ creatorId, visibility: 'private' }),
      QuizLogModel.countDocuments({ userId: userIdObj, action: 'review', createdAt: { $gte: new Date(todayStartUtcMs) } }),
      // 我的笔记难度分布（aggregate 不会自动做类型转换，必须用 ObjectId 匹配）
      QuestionModel.aggregate<{ _id: string | null; count: number }>([
        { $match: { creatorId: userIdObj } },
        { $group: { _id: '$difficulty', count: { $sum: 1 } } },
      ]),
      // 我最常写的标签 Top 6
      QuestionModel.aggregate<{ _id: string; count: number }>([
        { $match: { creatorId: userIdObj } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 6 },
      ]),
      QuizLogModel.aggregate<{
        _id: unknown;
        questionId: unknown;
        feedback: string | null;
        createdAt: Date;
        title?: string | null;
      }>([
        { $match: { userId: userIdObj, action: 'review' } },
        { $sort: { createdAt: -1 } },
        { $limit: 8 },
        {
          $lookup: {
            from: 'questions',
            localField: 'questionId',
            foreignField: '_id',
            as: 'question',
          },
        },
        { $addFields: { title: { $first: '$question.title' } } },
        { $project: { questionId: 1, feedback: 1, createdAt: 1, title: 1 } },
      ]),
    ]);

    return {
      noteTotal,
      publicCount,
      privateCount,
      todayReviews,
      difficultyDist: {
        easy: difficultyRows.find((row) => row._id === 'easy')?.count ?? 0,
        medium: difficultyRows.find((row) => row._id === 'medium')?.count ?? 0,
        hard: difficultyRows.find((row) => row._id === 'hard')?.count ?? 0,
      },
      topTags: tagRows.map((row) => ({ tag: row._id, count: row.count })),
      recent: recentLogs
        .filter((log) => typeof log.title === 'string')
        .map((log) => ({
          questionId: String(log.questionId),
          title: log.title as string,
          feedback: log.feedback ?? null,
          createdAt: log.createdAt,
        })),
    };
  });

  // 学习统计：累计回想/自评分布、连续打卡、最近 105 天打卡热力图、档位分布、薄弱标签
  // 日期分组统一使用 UTC+8（用户群固定国内）
  app.get('/api/users/me/quiz-stats', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: '登录已过期，请重新登录' });
    }

    const me = request.user as { sub?: string; role?: string };
    const userIdObj = new Types.ObjectId(me.sub);
    const fmtDate = (d: Date) => new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const since = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000);

    const [calendar, feedbacks, weakRows, states, visibleCount] = await Promise.all([
      // 打卡热力图：最近 365 天每天的回想（点击「显示详情」）次数
      QuizLogModel.aggregate<{ date: string; count: number }>([
        { $match: { userId: userIdObj, action: 'draw', createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+08:00' } },
            count: { $sum: 1 },
          },
        },
        { $project: { _id: 0, date: '$_id', count: 1 } },
        { $sort: { date: 1 } },
      ]),
      // 自评反馈分布（全部时间）
      QuizLogModel.aggregate<{ _id: string | null; count: number }>([
        { $match: { userId: userIdObj, action: 'review' } },
        { $group: { _id: '$feedback', count: { $sum: 1 } } },
      ]),
      // 薄弱标签：自评日志 join 笔记标签，没记住/模糊占比越高越薄弱
      QuizLogModel.aggregate<{ tag: string; total: number; known: number; fuzzy: number; forgot: number }>([
        { $match: { userId: userIdObj, action: 'review' } },
        { $lookup: { from: 'questions', localField: 'questionId', foreignField: '_id', as: 'question' } },
        { $addFields: { question: { $first: '$question' } } },
        { $unwind: { path: '$question.tags', preserveNullAndEmptyArrays: false } },
        {
          $group: {
            _id: '$question.tags',
            total: { $sum: 1 },
            known: { $sum: { $cond: [{ $eq: ['$feedback', 'known'] }, 1, 0] } },
            fuzzy: { $sum: { $cond: [{ $eq: ['$feedback', 'fuzzy'] }, 1, 0] } },
            forgot: { $sum: { $cond: [{ $eq: ['$feedback', 'forgot'] }, 1, 0] } },
          },
        },
        { $project: { _id: 0, tag: '$_id', total: 1, known: 1, fuzzy: 1, forgot: 1 } },
      ]),
      // 当前推送频率分布（完全掌握 + 按出现次数的自动档位）
      QuizStateModel.find({ userId: userIdObj }).select('drawCount mastered').lean(),
      // 可见题目总数（用于"未出现"计数）
      QuestionModel.countDocuments(
        me.role === 'admin'
          ? {}
          : { $or: [{ visibility: 'public' }, { creatorId: String(me.sub) }] },
      ),
    ]);

    const feedbackOf = (name: string) => feedbacks.find((item) => item._id === name)?.count ?? 0;
    const reviewTotal = feedbacks.reduce((sum, item) => sum + item.count, 0);
    const drawTotal = await QuizLogModel.countDocuments({ userId: userIdObj, action: 'draw' });

    // 连续打卡：今天未回想不打断连续，从昨天往前数
    const activeDays = new Set(calendar.map((item) => item.date));
    const cursor = new Date();
    if (!activeDays.has(fmtDate(cursor))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (activeDays.has(fmtDate(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    const levelDist = [0, 1, 2, 3, 4].map((level) => ({ level, count: 0 }));
    for (const state of states) {
      const level = state.mastered === true ? 0 : autoLevelByDrawCount(state.drawCount ?? 0);
      const bucket = levelDist[level];
      if (bucket) bucket.count += 1;
    }
    const unseen = Math.max(0, visibleCount - states.length);

    const weakTags = weakRows
      .filter((row) => row.total >= 2)
      .map((row) => ({ ...row, score: (row.forgot + 0.5 * row.fuzzy) / row.total }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return {
      drawTotal,
      reviewTotal,
      knownCount: feedbackOf('known'),
      fuzzyCount: feedbackOf('fuzzy'),
      forgotCount: feedbackOf('forgot'),
      masteredCount: feedbackOf('mastered'),
      streak,
      calendar,
      levelDist,
      unseen,
      weakTags,
    };
  });

  app.post('/api/users', async (request, reply) => {
    const rejected = await requireAdmin(request, reply);
    if (rejected) return rejected;

    const body = request.body as {
      username?: string;
      email?: string;
      password?: string;
      role?: 'admin' | 'member';
    };

    if (!body.username || !body.password) {
      return reply.status(400).send({ message: '用户名和密码为必填项' });
    }

    const user = await UserModel.create({
      username: body.username,
      email: body.email,
      passwordHash: hashPassword(body.password),
      role: body.role ?? 'member',
      status: 'active',
    });

    return {
      id: String(user._id),
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  });

  app.patch('/api/users/:id', async (request, reply) => {
    const rejected = await requireAdmin(request, reply);
    if (rejected) return rejected;

    const params = request.params as { id: string };
    const body = request.body as {
      username?: string;
      email?: string;
      role?: 'admin' | 'member';
      status?: 'active' | 'disabled';
      password?: string;
    };

    const user = await UserModel.findById(params.id);
    if (!user) {
      return reply.status(404).send({ message: '用户不存在' });
    }

    const me = request.user as { sub?: string };
    if (String(user._id) === me.sub && (body.role || body.status)) {
      return reply.status(400).send({ message: '不能修改自己的角色或状态' });
    }

    if (body.username) {
      user.username = body.username.trim();
    }

    if (body.email !== undefined) {
      user.email = body.email || null;
    }

    if (body.role) {
      user.role = body.role;
    }

    if (body.status) {
      user.status = body.status;
    }

    if (body.password) {
      user.passwordHash = hashPassword(body.password);
    }

    try {
      await user.save();
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 11000) {
        return reply.status(409).send({ message: '用户名或邮箱已被占用' });
      }
      throw error;
    }

    return {
      id: String(user._id),
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  });
}
