import { FastifyInstance } from 'fastify';
import { isValidObjectId } from 'mongoose';
import { saveImage, getImage } from '../../services/imageStore.service.js';

// 单张图片上限 10MB（base64 后约 13.3MB，低于全局 bodyLimit）
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function registerImageRoutes(app: FastifyInstance) {
  // 上传图片：前端以 base64 JSON 提交，写入 MongoDB GridFS，返回引用地址 /api/images/:id
  app.post('/api/images', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: '登录已过期，请重新登录' });
    }

    const body = request.body as { data?: string; filename?: string; contentType?: string };
    const raw = typeof body.data === 'string' ? body.data : '';
    // 兼容带 data:image/...;base64, 前缀的情况（客户端已去掉，这里兜底）
    const base64 = raw.replace(/^data:[^;]+;base64,/, '');
    if (!base64) {
      return reply.status(400).send({ message: '缺少图片数据' });
    }

    const contentType = typeof body.contentType === 'string' && body.contentType.startsWith('image/')
      ? body.contentType
      : 'image/png';

    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64, 'base64');
    } catch {
      return reply.status(400).send({ message: '图片数据不合法' });
    }
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
      return reply.status(400).send({ message: '图片大小需在 10MB 以内' });
    }

    const filename = (body.filename ?? 'image.png').replace(/[^\w.-]/g, '_') || 'image.png';
    const saved = await saveImage(buffer, filename, contentType);

    return { id: saved.id, url: `/api/images/${saved.id}` };
  });

  // 读取图片：公开访问，供 Markdown <img> 直接引用；不可变内容做一年强缓存
  app.get('/api/images/:id', async (request, reply) => {
    const params = request.params as { id: string };
    if (!isValidObjectId(params.id)) {
      return reply.status(404).send({ message: '图片不存在' });
    }

    const image = await getImage(params.id);
    if (!image) return reply.status(404).send({ message: '图片不存在' });

    reply.header('Content-Type', image.contentType);
    reply.header('Content-Length', String(image.length));
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.send(image.stream);
  });
}