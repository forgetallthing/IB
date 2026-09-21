import { FastifyInstance, FastifyReply } from 'fastify';

/**
 * 语音转写流中转：
 * - 小程序「录音」tab 用微信同声传译插件实时识别，把片段 POST 到这里；
 * - Web 端「每日回想」页面通过 SSE（GET）订阅，接收同一账号的转写片段，
 *   实时写入作答编辑器。
 * 服务器只做按 userId 的内存路由，不落库、不做历史缓存；Web 端不在线即丢弃。
 */

interface VoiceBody {
  text?: string;
  isFinal?: boolean;
  /** true 时不转发，仅探测该账号的 Web 端是否在线 */
  probe?: boolean;
}

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  // 让 nginx 等代理不缓冲 SSE 帧
  'X-Accel-Buffering': 'no',
};

export async function registerVoiceRoutes(app: FastifyInstance) {
  // userId → 该用户在 Web 端打开的每日回想 SSE 连接（多标签页支持）
  const streams = new Map<string, Set<FastifyReply>>();

  function onlineCount(userId: string): number {
    return streams.get(userId)?.size ?? 0;
  }

  function sendToUser(userId: string, data: unknown): number {
    const set = streams.get(userId);
    if (!set || set.size === 0) return 0;
    const frame = `data: ${JSON.stringify(data)}\n\n`;
    let delivered = 0;
    for (const reply of set) {
      try {
        reply.raw.write(frame);
        delivered += 1;
      } catch {
        // 写失败的连接由其 close 事件自行清理
      }
    }
    return delivered;
  }

  // Web 端每日回想订阅（SSE）。EventSource 无法携带 Authorization 头，token 走 query。
  app.get('/api/voice/stream', async (request, reply) => {
    const token = String((request.query as { token?: string }).token ?? '');
    let userId: string;
    try {
      const payload = app.jwt.verify<{ sub?: string }>(token);
      userId = String(payload.sub ?? '');
    } catch {
      return reply.status(401).send({ message: '登录已过期，请重新登录' });
    }
    if (!userId) {
      return reply.status(401).send({ message: '登录已过期，请重新登录' });
    }

    // 劫持响应，改由本路由直接写 SSE 帧
    reply.hijack();
    reply.raw.writeHead(200, SSE_HEADERS);
    reply.raw.write(': connected\n\n');

    const set = streams.get(userId) ?? new Set<FastifyReply>();
    set.add(reply);
    streams.set(userId, set);

    // 心跳注释帧，防止 nginx / 浏览器空闲超时断开
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(': ping\n\n');
      } catch {
        // 连接已坏，等待 close 事件清理
      }
    }, 25_000);

    const cleanup = () => {
      clearInterval(heartbeat);
      set.delete(reply);
      if (set.size === 0) streams.delete(userId);
    };
    request.raw.on('close', cleanup);
  });

  // 小程序推送转写片段。同传插件 partial 回调约每秒 1 次，限流给足裕量。
  app.post(
    '/api/voice/stream',
    { config: { rateLimit: { max: 150, timeWindow: '1 minute' } } },
    async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({ message: '登录已过期，请重新登录' });
      }
      const userId = String((request.user as { sub?: string }).sub ?? '');
      const body = (request.body ?? {}) as VoiceBody;

      if (body.probe) {
        return { online: onlineCount(userId) > 0, delivered: 0 };
      }

      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text) {
        return reply.status(400).send({ message: '缺少转写内容' });
      }
      if (text.length > 4000) {
        return reply.status(413).send({ message: '单条转写内容过长' });
      }

      const delivered = sendToUser(userId, { text, isFinal: body.isFinal === true });
      return { delivered };
    },
  );
}
