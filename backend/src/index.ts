import { appConfig } from './config.js';
import { connectDatabase } from './db.js';
import { createApp } from './app.js';
import { seedDefaultAdmin } from './bootstrap/seed-admin.js';
import { seedDefaultTags } from './bootstrap/seed-tags.js';

async function main() {
  await connectDatabase();
  await seedDefaultAdmin();
  await seedDefaultTags();

  const app = await createApp();
  await app.listen({ port: appConfig.port, host: '0.0.0.0' });
}

void main();
