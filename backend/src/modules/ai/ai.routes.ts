import { FastifyInstance } from 'fastify';
import { appConfig } from '../../config.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface CozeChatPayload {
  code: number;
  msg: string;
  data?: { id?: string; conversation_id?: string; status?: string };
}

interface CozeMessage {
  role?: string;
  type?: string;
  content?: string;
}

export async function registerAiRoutes(app: FastifyInstance) {
  app.post('/api/ai/analyze', async (request) => {
    const body = request.body as { title?: string; content?: string; answer?: string };
    const content = `${body.title ?? ''} ${body.content ?? ''}`.trim();

    return {
      summary: content ? content.slice(0, 60) : '',
      suggestedTags: body.title ? [body.title.slice(0, 12)] : [],
      suggestedDifficulty: 'medium',
    };
  });

  // AI 分析：把题目与用户作答发给 Coze 智能体，返回点评（Markdown）
  app.post('/api/ai/review', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: '登录已过期，请重新登录' });
    }

    if (!appConfig.cozeApiToken || !appConfig.cozeBotId) {
      return reply.status(501).send({ message: '未配置 Coze API，请在 backend/.env 中配置 COZE_API_TOKEN 与 COZE_BOT_ID' });
    }

    // 配置必须是 ASCII（Authorization 请求头不允许中文等非 Latin1 字符），避免占位文字导致底层报错
    const asciiPattern = /^[\x21-\x7E]+$/;
    if (!asciiPattern.test(appConfig.cozeApiToken)) {
      return reply.status(500).send({ message: 'COZE_API_TOKEN 配置无效：含中文或空格等字符，请在 backend/.env 中填入真实的个人访问令牌（PAT）' });
    }
    if (!asciiPattern.test(appConfig.cozeBotId)) {
      return reply.status(500).send({ message: 'COZE_BOT_ID 配置无效：请填入智能体 ID（URL 中 bot 参数后的数字）' });
    }

    const body = request.body as { title?: string; answer?: string };
    const title = (body.title ?? '').trim();
    const answer = (body.answer ?? '').trim();
    if (!title && !answer) {
      return reply.status(400).send({ message: '缺少题目或作答内容' });
    }

    const prompt = [
      '你是一位严格的资深面试官，请分析候选人对下面面试题的作答。',
      `【题目】${title || '（无标题）'}`,
      `【候选人作答】${answer || '（未作答）'}`,
      '请用 Markdown 输出，依次包含：一、作答点评（指出正确与错误之处）；二、遗漏要点与纠错；三、参考答案要点。',
    ].join('\n');

    const headers: Record<string, string> = {
      Authorization: `Bearer ${appConfig.cozeApiToken}`,
      'Content-Type': 'application/json',
    };

    // 1. 发起对话（非流式）
    const createRes = await fetch(`${appConfig.cozeApiBase}/v3/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        bot_id: appConfig.cozeBotId,
        user_id: 'ib_quiz',
        stream: false,
        auto_save_history: true,
        additional_messages: [{ role: 'user', content: prompt, content_type: 'text' }],
      }),
    });
    const createData = (await createRes.json()) as CozeChatPayload;
    if (!createRes.ok || createData.code !== 0 || !createData.data?.id || !createData.data.conversation_id) {
      return reply
        .status(502)
        .send({ message: `Coze 发起对话失败：${createData.msg || createRes.status}` });
    }
    const chatId = createData.data.id;
    const conversationId = createData.data.conversation_id;

    // 2. 轮询对话详情直到结束（官方建议每秒最多 1 次，最长 90 秒）
    let status = createData.data.status ?? '';
    for (let i = 0; i < 90 && status !== 'completed'; i += 1) {
      if (status === 'failed' || status === 'canceled') {
        return reply.status(502).send({ message: `Coze 对话未完成：${status}` });
      }
      await sleep(1000);
      const retrieveRes = await fetch(
        `${appConfig.cozeApiBase}/v3/chat/retrieve?chat_id=${encodeURIComponent(chatId)}&conversation_id=${encodeURIComponent(conversationId)}`,
        { headers },
      );
      const retrieveData = (await retrieveRes.json()) as CozeChatPayload;
      if (!retrieveRes.ok || retrieveData.code !== 0 || !retrieveData.data?.status) {
        // 401/403 多为 PAT 权限不足：chat 权限不含对话详情查询
        if (retrieveRes.status === 401 || retrieveRes.status === 403) {
          return reply.status(502).send({
            message: 'Coze 令牌权限不足：请重新生成 PAT 并勾选全部权限（至少包含对话与查询类），再更新 backend/.env 并重启后端',
          });
        }
        return reply
          .status(502)
          .send({ message: `Coze 查询对话失败：${retrieveData.msg || retrieveRes.status}` });
      }
      status = retrieveData.data.status;
    }
    if (status !== 'completed') {
      return reply.status(504).send({ message: 'Coze 对话超时，请稍后重试' });
    }

    // 3. 拉取消息详情，拼接 type=answer 的智能体回复
    const listRes = await fetch(
      `${appConfig.cozeApiBase}/v3/chat/message/list?chat_id=${encodeURIComponent(chatId)}&conversation_id=${encodeURIComponent(conversationId)}`,
      { headers },
    );
    const listData = (await listRes.json()) as { code: number; msg: string; data?: CozeMessage[] };
    if (!listRes.ok || listData.code !== 0) {
      return reply.status(502).send({ message: `Coze 获取回复失败：${listData.msg || listRes.status}` });
    }
    const analysis = (listData.data ?? [])
      .filter((msg) => msg.type === 'answer' && msg.role === 'assistant')
      .map((msg) => msg.content ?? '')
      .join('\n\n')
      .trim();
    if (!analysis) {
      return reply.status(502).send({ message: 'Coze 未返回有效分析内容' });
    }

    return { analysis };
  });
}
