import { describe, it, expect, afterAll, vi } from 'vitest';

// 生产环境启动校验：占位符/弱 JWT_SECRET 必须拒绝启动，强密钥正常通过
describe('JWT_SECRET 生产环境启动校验', () => {
  afterAll(() => {
    // 恢复环境，避免影响同 worker 内其他测试文件
    process.env.NODE_ENV = 'test';
    delete process.env.JWT_SECRET;
  });

  it('占位符密钥拒绝启动', async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'replace-me';
    await expect(import('../src/config.js')).rejects.toThrow(/JWT_SECRET/);
  });

  it('过短密钥拒绝启动', async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'short-secret';
    await expect(import('../src/config.js')).rejects.toThrow(/JWT_SECRET/);
  });

  it('强随机密钥正常启动', async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(32);
    await expect(import('../src/config.js')).resolves.toBeDefined();
  });
});
