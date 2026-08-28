import { FastifyInstance } from 'fastify';
import { UserModel } from '../../models/user.model.js';
import { hashPassword } from '../../services/password.service.js';

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (request, reply) => {
    const body = request.body as { username?: string; password?: string };
    if (!body.username || !body.password) {
      return reply.status(400).send({ message: 'username and password are required' });
    }

    const user = await UserModel.findOne({ username: body.username, status: 'active' }).exec();
    if (!user || user.passwordHash !== hashPassword(body.password)) {
      return reply.status(401).send({ message: 'Invalid credentials' });
    }

    const token = await reply.jwtSign({ sub: String(user._id), role: user.role, username: user.username });
    await UserModel.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

    return {
      token,
      user: {
        id: String(user._id),
        username: user.username,
        role: user.role,
      },
    };
  });

  app.get('/api/auth/me', async (request, reply) => {
    try {
      await request.jwtVerify();
      return { user: request.user };
    } catch {
      return reply.status(401).send({ message: 'Unauthorized' });
    }
  });
}
