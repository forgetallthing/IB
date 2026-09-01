import { FastifyInstance } from 'fastify';
import { TagModel } from '../../models/tag.model.js';

export async function registerTagRoutes(app: FastifyInstance) {
  async function requireAuth(request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: '登录已过期，请重新登录' });
    }
  }

  async function requireAdmin(request: any, reply: any) {
    const rejected = await requireAuth(request, reply);
    if (rejected) return rejected;

    const user = request.user as { role?: string } | null;
    if (user?.role !== 'admin') {
      return reply.status(403).send({ message: '仅管理员可执行此操作' });
    }
  }

  app.get('/api/tags', async (request, reply) => {
    const rejected = await requireAuth(request, reply);
    if (rejected) return rejected;

    const tags = await TagModel.find().sort({ displayOrder: 1, createdAt: -1 }).lean();
    return tags.map((tag) => ({
      id: String(tag._id),
      name: tag.name,
      color: tag.color,
      description: tag.description,
      active: tag.active,
      displayOrder: tag.displayOrder,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
    }));
  });

  app.post('/api/tags', async (request, reply) => {
    const rejected = await requireAdmin(request, reply);
    if (rejected) return rejected;

    const body = request.body as {
      name?: string;
      color?: string;
      description?: string;
      displayOrder?: number;
    };

    if (!body.name?.trim()) {
      return reply.status(400).send({ message: '标签名称不能为空' });
    }

    const tag = await TagModel.create({
      name: body.name.trim(),
      color: body.color ?? '#f3eee8',
      description: body.description ?? '',
      displayOrder: body.displayOrder ?? 0,
      active: true,
    });

    return {
      id: String(tag._id),
      name: tag.name,
      color: tag.color,
      description: tag.description,
      active: tag.active,
      displayOrder: tag.displayOrder,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
    };
  });

  app.patch('/api/tags/:id', async (request, reply) => {
    const rejected = await requireAdmin(request, reply);
    if (rejected) return rejected;

    const params = request.params as { id: string };
    const body = request.body as {
      name?: string;
      color?: string;
      description?: string;
      active?: boolean;
      displayOrder?: number;
    };

    const tag = await TagModel.findById(params.id);
    if (!tag) {
      return reply.status(404).send({ message: '标签不存在' });
    }

    if (body.name !== undefined) tag.name = body.name.trim();
    if (body.color !== undefined) tag.color = body.color;
    if (body.description !== undefined) tag.description = body.description;
    if (body.active !== undefined) tag.active = body.active;
    if (body.displayOrder !== undefined) tag.displayOrder = body.displayOrder;

    await tag.save();

    return {
      id: String(tag._id),
      name: tag.name,
      color: tag.color,
      description: tag.description,
      active: tag.active,
      displayOrder: tag.displayOrder,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
    };
  });

  app.delete('/api/tags/:id', async (request, reply) => {
    const rejected = await requireAdmin(request, reply);
    if (rejected) return rejected;

    const params = request.params as { id: string };
    const result = await TagModel.findByIdAndDelete(params.id);
    if (!result) {
      return reply.status(404).send({ message: '标签不存在' });
    }

    return { ok: true };
  });
}
