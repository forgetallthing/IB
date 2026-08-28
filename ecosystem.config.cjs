/**
 * PM2 部署配置
 * 用法：pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'ib-backend',
      cwd: './backend',
      script: 'dist/index.js',
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '512M',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        // 生产环境必须修改为长随机字符串
        JWT_SECRET: 'change-me-to-a-long-random-string',
        // 服务器本机 MongoDB；如用 Atlas 等云端库改为对应连接串
        MONGO_URI: 'mongodb://127.0.0.1:27017/interview_bank',
        // 首次启动自动创建的管理员账号，部署前请修改
        ADMIN_SEED_USERNAME: 'admin',
        ADMIN_SEED_PASSWORD: 'admin123456',
      },
    },
  ],
};
