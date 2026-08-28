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
    };

    const filter: Record<string, unknown> = {};
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
    if (query.visibility) {
      const visibilities = Array.isArray(query.visibility) ? query.visibility : [query.visibility];
      filter.visibility = { $in: visibilities };
    }
    if (query.tags) {
      filter.tags = Array.isArray(query.tags) ? { $in: query.tags } : { $in: [query.tags] };
    }

    const items = await QuestionModel.find(filter).sort({ updatedAt: -1 }).lean();
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
      total: items.length,
    };
  });

  app.post('/api/questions', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: 'Unauthorized' });
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
      return reply.status(400).send({ message: 'missing required fields' });
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
    if (!item) return reply.status(404).send({ message: 'Not found' });

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
      return reply.status(401).send({ message: 'Unauthorized' });
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
    if (!existing) return reply.status(404).send({ message: 'Not found' });

    const user = request.user as { sub?: string; username?: string; role?: string } | null;
    // only admin or owner
    if (user?.role !== 'admin' && String(existing.creatorId) !== String(user?.sub)) {
      return reply.status(403).send({ message: 'Forbidden' });
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
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const params = request.params as { id: string };
    const existing = await QuestionModel.findById(params.id);
    if (!existing) return reply.status(404).send({ message: 'Not found' });

    const user = request.user as { sub?: string; role?: string } | null;
    if (user?.role !== 'admin' && String(existing.creatorId) !== String(user?.sub)) {
      return reply.status(403).send({ message: 'Forbidden' });
    }

    await existing.deleteOne();
    return { ok: true };
  });
}
