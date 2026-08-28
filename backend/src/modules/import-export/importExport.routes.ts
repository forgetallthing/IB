import { FastifyInstance } from 'fastify';
import { QuestionModel } from '../../models/question.model.js';

export async function registerImportExportRoutes(app: FastifyInstance) {
  app.get('/api/questions/export', async () => {
    const items = await QuestionModel.find().sort({ updatedAt: -1 }).lean();
    return {
      format: 'json',
      items,
    };
  });

  app.post('/api/questions/import', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const user = request.user as { sub?: string; username?: string } | null;

    const body = request.body as { items?: Array<Record<string, unknown>> };
    if (!Array.isArray(body.items)) {
      return reply.status(400).send({ message: 'items must be an array' });
    }

    const imported: string[] = [];
    for (const item of body.items) {
      if (!item.title || !item.content) continue;

      const created = await QuestionModel.create({
        title: String(item.title),
        content: String(item.content),
        answer: typeof item.answer === 'string' ? String(item.answer) : '',
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
        difficulty: item.difficulty === 'easy' || item.difficulty === 'hard' ? item.difficulty : 'medium',
        creatorId: item.creatorId ?? user?.sub ?? undefined,
        creatorName: String(item.creatorName ?? user?.username ?? 'system'),
        visibility: item.visibility === 'private' ? 'private' : 'public',
        source: typeof item.source === 'string' ? item.source : undefined,
        aiSummary: typeof item.aiSummary === 'string' ? item.aiSummary : undefined,
        aiSuggestedTags: Array.isArray(item.aiSuggestedTags) ? item.aiSuggestedTags.map(String) : [],
        aiSuggestedDifficulty: item.aiSuggestedDifficulty === 'easy' || item.aiSuggestedDifficulty === 'hard' ? item.aiSuggestedDifficulty : undefined,
      });

      imported.push(String(created._id));
    }

    return { ok: true, importedIds: imported };
  });
}
