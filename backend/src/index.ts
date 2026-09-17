import { appConfig } from './config.js';
import { connectDatabase } from './db.js';
import { createApp } from './app.js';
import { seedDefaultAdmin } from './bootstrap/seed-admin.js';
import { startTrashCleanupJob } from './services/trashCleanup.service.js';

async function main() {
  await connectDatabase();
  await seedDefaultAdmin();

  const app = await createApp();
  // 回收站自动清理：启动时先补跑一次过期清理，之后每 24 小时一次
  startTrashCleanupJob((msg) => app.log.info(msg));
  await app.listen({ port: appConfig.port, host: '0.0.0.0' });
}

void main();
