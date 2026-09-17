import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 轻量 .env 加载（无依赖）：本地开发读取 backend/.env；容器/服务器由环境变量注入。
// 只在变量未定义时写入，不覆盖已注入的值；文件不存在则跳过。
const envPath = join(dirname(fileURLToPath(import.meta.url)), '../.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    const key = match?.[1];
    if (!key) continue;
    const value = (match?.[2] ?? '').replace(/^['"]|['"]$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export const appConfig = {
  port: Number(process.env.PORT ?? 3000),
  mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/interview_bank',
  jwtSecret: process.env.JWT_SECRET ?? 'replace-me',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? '',
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
  adminSeedUsername: process.env.ADMIN_SEED_USERNAME ?? 'admin',
  adminSeedPassword: process.env.ADMIN_SEED_PASSWORD ?? 'admin123456',
  adminSeedEmail: process.env.ADMIN_SEED_EMAIL ?? 'admin@example.com',
  // 微信小程序登录（未配置时微信登录接口返回 501，账号密码登录不受影响）
  wechatAppId: process.env.WECHAT_APPID ?? '',
  wechatSecret: process.env.WECHAT_SECRET ?? '',
  // Coze 智能体 API（未配置时 AI 分析接口返回 501）
  cozeApiToken: process.env.COZE_API_TOKEN ?? '',
  cozeBotId: process.env.COZE_BOT_ID ?? '',
  cozeApiBase: process.env.COZE_API_BASE ?? 'https://api.coze.cn',
};

// 生产环境启动校验：JWT_SECRET 必须显式配置且不得使用占位符/弱值，防止默认密钥上生产
const JWT_SECRET_PLACEHOLDERS = new Set([
  'replace-me',
  'please-change-me',
  'please-change-me-to-a-long-random-string',
]);
if (process.env.NODE_ENV === 'production') {
  if (!appConfig.jwtSecret.trim() || JWT_SECRET_PLACEHOLDERS.has(appConfig.jwtSecret)) {
    throw new Error('[config] 生产环境禁止使用默认 JWT_SECRET，请在环境变量中设置强随机值（如 openssl rand -hex 32 生成）');
  }
  if (appConfig.jwtSecret.length < 16) {
    throw new Error('[config] JWT_SECRET 过短（至少 16 个字符），请更换为强随机值（如 openssl rand -hex 32 生成）');
  }
}
