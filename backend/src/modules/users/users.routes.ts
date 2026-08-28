import { FastifyInstance } from 'fastify';
import { UserModel } from '../../models/user.model.js';
import { hashPassword } from '../../services/password.service.js';

export async function registerUserRoutes(app: FastifyInstance) {
  async function requireAdmin(request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const user = request.user as { role?: string } | null;
    if (user?.role !== 'admin') {
      return reply.status(403).send({ message: 'Forbidden' });
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
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const me = request.user as { sub?: string };
    const user = await UserModel.findById(me.sub);
    if (!user) {
      return reply.status(404).send({ message: 'Not found' });
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
      return reply.status(401).send({ message: 'Unauthorized' });
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
      return reply.status(404).send({ message: 'Not found' });
    }

    if (body.username) {
      user.username = body.username.trim();
    }

    if (body.email !== undefined) {
      user.email = body.email || null;
    }

    if (body.password) {
      if (!body.currentPassword || user.passwordHash !== hashPassword(body.currentPassword)) {
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
      return reply.status(400).send({ message: 'username and password are required' });
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
      status?: 'active' | 'disabled';
      password?: string;
    };

    const user = await UserModel.findById(params.id);
    if (!user) {
      return reply.status(404).send({ message: 'Not found' });
    }

    if (body.status) {
      user.status = body.status;
    }

    if (body.password) {
      user.passwordHash = hashPassword(body.password);
    }

    await user.save();

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
