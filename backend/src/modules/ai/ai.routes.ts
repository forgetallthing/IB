import { FastifyInstance } from 'fastify';

export async function registerAiRoutes(app: FastifyInstance) {
  app.post('/api/ai/analyze', async (request) => {
    const body = request.body as { title?: string; content?: string; answer?: string };
    const content = `${body.title ?? ''} ${body.content ?? ''}`.trim();

    return {
      summary: content ? content.slice(0, 60) : '',
      suggestedTags: body.title ? [body.title.slice(0, 12)] : [],
      suggestedDifficulty: 'medium',
    };
  });
}
