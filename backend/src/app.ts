import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { appConfig } from './config.js';
import { registerAuthRoutes } from './modules/auth/auth.routes.js';
import { registerUserRoutes } from './modules/users/users.routes.js';
import { registerQuestionRoutes } from './modules/questions/questions.routes.js';
import { registerAiRoutes } from './modules/ai/ai.routes.js';
import { registerBackupRoutes } from './modules/backup/backup.routes.js';
import { registerTagRoutes } from './modules/tags/tags.routes.js';
import { registerImageRoutes } from './modules/images/images.routes.js';

export async function createApp() {
  const app = Fastify({
    logger: true,
    bodyLimit: 25 * 1024 * 1024,
    // nginx 反代下按 X-Forwarded-For 取真实客户端 IP，保证限流按 IP 隔离而非共享 nginx IP
    trustProxy: true,
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
    // 默认仅 GET/HEAD/POST，PATCH/DELETE（改资料、排序、删除等）会被浏览器拦截
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // 仅对显式配置 rateLimit 的路由生效（登录等敏感接口），不影响普通接口
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => ({
      statusCode: 429,
      message: '尝试次数过多，请稍后再试',
    }),
  });

  await app.register(jwt, {
    secret: appConfig.jwtSecret,
  });

  app.get('/api/health', async () => ({
    ok: true,
    service: 'interview-question-bank-api',
  }));

  await registerAuthRoutes(app);
  await registerUserRoutes(app);
  await registerQuestionRoutes(app);
  await registerAiRoutes(app);
  await registerBackupRoutes(app);
  await registerTagRoutes(app);
  await registerImageRoutes(app);

  return app;
}
