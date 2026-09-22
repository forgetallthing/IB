import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { appConfig } from './config.js';
import { UserModel } from './models/user.model.js';
import { registerAuthRoutes } from './modules/auth/auth.routes.js';
import { registerUserRoutes } from './modules/users/users.routes.js';
import { registerQuestionRoutes } from './modules/questions/questions.routes.js';
import { registerAiRoutes } from './modules/ai/ai.routes.js';
import { registerBackupRoutes } from './modules/backup/backup.routes.js';
import { registerTagRoutes } from './modules/tags/tags.routes.js';
import { registerSeriesRoutes } from './modules/series/series.routes.js';
import { registerImageRoutes } from './modules/images/images.routes.js';
import { registerTrashRoutes } from './modules/trash/trash.routes.js';
import { registerVoiceRoutes } from './modules/voice/voice.routes.js';

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

  // 登录态统一复核：token 暂不设过期时间（产品决定），因此每次携带 Bearer token 的请求
  // 都回查数据库中的最新 status 与 role——禁用/降权立即生效，杜绝「禁用后旧 token 永久可用」。
  // 未携带 token 的请求直接放行，由各路由自行决定游客行为；无效 token 同样交由各路由处理
  // （公开接口按游客兜底过滤，受保护路由返回 401）。
  app.addHook('preHandler', async (request, reply) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return;
    try {
      await request.jwtVerify();
    } catch {
      return;
    }
    const claims = request.user as { sub?: string; role?: string; username?: string };
    if (!claims.sub) return;
    const user = await UserModel.findById(claims.sub).select('username role status').lean();
    if (!user || user.status !== 'active') {
      return reply.status(401).send({ message: '账号已被禁用或不存在，请联系管理员' });
    }
    // 以数据库中的最新值覆盖 token 内固化 claims，防止降权/改名后旧 token 继续生效
    request.user = { ...claims, role: user.role, username: user.username };
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
  await registerSeriesRoutes(app);
  await registerImageRoutes(app);
  await registerTrashRoutes(app);
  await registerVoiceRoutes(app);

  return app;
}
