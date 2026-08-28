export const appConfig = {
  port: Number(process.env.PORT ?? 3000),
  mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/interview_bank',
  jwtSecret: process.env.JWT_SECRET ?? 'replace-me',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? '',
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
  adminSeedUsername: process.env.ADMIN_SEED_USERNAME ?? 'admin',
  adminSeedPassword: process.env.ADMIN_SEED_PASSWORD ?? 'admin123456',
  adminSeedEmail: process.env.ADMIN_SEED_EMAIL ?? 'admin@example.com',
};
