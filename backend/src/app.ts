import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { appConfig } from './config.js';
import { registerAuthRoutes } from './modules/auth/auth.routes.js';
import { registerUserRoutes } from './modules/users/users.routes.js';
import { registerQuestionRoutes } from './modules/questions/questions.routes.js';
import { registerAiRoutes } from './modules/ai/ai.routes.js';
import { registerImportExportRoutes } from './modules/import-export/importExport.routes.js';
import { registerTagRoutes } from './modules/tags/tags.routes.js';

export async function createApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
    credentials: true,
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
  await registerImportExportRoutes(app);
  await registerTagRoutes(app);

  return app;
}
