import { spawn } from 'node:child_process';
import mongoose from 'mongoose';
import { FastifyInstance } from 'fastify';
import { appConfig } from '../../config.js';

const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024; // 备份内存缓冲上限
const DUMP_TIMEOUT_MS = 5 * 60 * 1000;

// 优先取当前 mongoose 连接的真实 URI：兼容本地 mongo、内存库（dev:mem）与容器内 mongo 主机名
function buildDumpUri(): string {
  const client = mongoose.connection.getClient() as unknown as { s?: { url?: string } };
  return client?.s?.url || appConfig.mongoUri;
}

// 调用 mongodump 生成整库 gzip 压缩归档（.archive.gz，含 GridFS 图片，可用 mongorestore 恢复）
function runMongodump(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const bin = process.env.MONGODUMP_PATH || 'mongodump';
    const child = spawn(bin, ['--uri', buildDumpUri(), '--archive', '--gzip'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const chunks: Buffer[] = [];
    let total = 0;
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      done(() => reject(new Error('备份超时（5 分钟）')));
    }, DUMP_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_ARCHIVE_BYTES) {
        child.kill('SIGKILL');
        done(() => reject(new Error('备份文件超过 256MB 上限')));
        return;
      }
      chunks.push(chunk);
    });

    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
      if (stderr.length > 8192) stderr = stderr.slice(-8192);
    });

    child.on('error', (err) => {
      done(() => reject(new Error(`服务器缺少 mongodump 工具：${err.message}`)));
    });

    child.on('close', (code) => {
      done(() => {
        if (code === 0) {
          resolve(Buffer.concat(chunks));
        } else {
          // stderr 可能含连接串等敏感信息，只记日志，不对客户端透传
          console.error('[Backup] mongodump failed:', stderr);
          reject(new Error(`mongodump 退出码 ${code}，详情见服务端日志`));
        }
      });
    });
  });
}

export async function registerBackupRoutes(app: FastifyInstance) {
  async function requireAdmin(request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: '登录已过期，请重新登录' });
    }

    const user = request.user as { role?: string } | null;
    if (user?.role !== 'admin') {
      return reply.status(403).send({ message: '仅管理员可执行此操作' });
    }
  }

  // 整库备份：仅管理员，返回 mongodump gzip 归档文件下载
  app.get('/api/backup/export', async (request, reply) => {
    const rejected = await requireAdmin(request, reply);
    if (rejected) return rejected;

    try {
      const archive = await runMongodump();
      const now = new Date();
      const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        '_',
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0'),
      ].join('');
      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename="interview_bank_backup_${stamp}.archive.gz"`);
      return reply.send(archive);
    } catch (error) {
      request.log.error({ err: error }, 'backup export failed');
      return reply.status(500).send({ message: error instanceof Error ? error.message : '备份导出失败' });
    }
  });
}
