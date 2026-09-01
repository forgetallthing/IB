import { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
import { UserModel } from '../../models/user.model.js';
import { hashPassword } from '../../services/password.service.js';
import { appConfig } from '../../config.js';

interface WechatSessionResponse {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

async function codeToSession(code: string): Promise<WechatSessionResponse> {
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', appConfig.wechatAppId);
  url.searchParams.set('secret', appConfig.wechatSecret);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');

  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`wechat session request failed: ${response.status}`);
  }
  return (await response.json()) as WechatSessionResponse;
}

async function issueLogin(user: { _id: unknown; role: string; username: string }, reply: any) {
  const token = await reply.jwtSign({ sub: String(user._id), role: user.role, username: user.username });
  await UserModel.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  return {
    token,
    user: {
      id: String(user._id),
      username: user.username,
      role: user.role,
    },
  };
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (request, reply) => {
    const body = request.body as { username?: string; password?: string };
    if (!body.username || !body.password) {
      return reply.status(400).send({ message: '请输入用户名和密码' });
    }

    const user = await UserModel.findOne({ username: body.username, status: 'active' }).exec();
    if (!user || user.passwordHash !== hashPassword(body.password)) {
      return reply.status(401).send({ message: '用户名或密码错误' });
    }

    return issueLogin(user, reply);
  });

  /**
   * 微信小程序登录：
   * 1. 已绑定 openid 的用户直接登录；
   * 2. 未绑定但传了账号密码，则校验通过后绑定 openid（已有账号绑定微信）；
   * 3. 其余情况自动创建成员账号（username 形如 wx_xxxxxxxx）。
   */
  app.post('/api/auth/wechat-login', async (request, reply) => {
    const body = request.body as { code?: string; username?: string; password?: string };
    if (!body.code) {
      return reply.status(400).send({ message: '微信登录失败，请重试' });
    }
    if (!appConfig.wechatAppId || !appConfig.wechatSecret) {
      return reply.status(501).send({ message: '微信登录未配置，请使用账号密码登录' });
    }

    let session: WechatSessionResponse;
    try {
      session = await codeToSession(body.code);
    } catch (error) {
      console.error('[Auth] code2session 请求失败:', error);
      return reply.status(502).send({ message: '微信服务暂不可用，请稍后重试' });
    }

    if (!session.openid) {
      console.error('[Auth] code2session 返回错误:', session.errcode, session.errmsg);
      return reply.status(401).send({ message: '微信登录失败，请重试' });
    }

    // 1. 已绑定用户
    const bound = await UserModel.findOne({ openId: session.openid, status: 'active' }).exec();
    if (bound) {
      return issueLogin(bound, reply);
    }

    // 2. 绑定已有账号
    if (body.username && body.password) {
      const existing = await UserModel.findOne({ username: body.username, status: 'active' }).exec();
      if (!existing || existing.passwordHash !== hashPassword(body.password)) {
        return reply.status(401).send({ message: '用户名或密码错误，绑定失败' });
      }
      existing.openId = session.openid;
      await existing.save();
      return issueLogin(existing, reply);
    }

    // 3. 自动创建成员账号
    let username = '';
    for (let i = 0; i < 5; i += 1) {
      const candidate = `wx_${randomBytes(4).toString('hex')}`;
      const conflict = await UserModel.findOne({ username: candidate }).exec();
      if (!conflict) {
        username = candidate;
        break;
      }
    }
    if (!username) {
      return reply.status(500).send({ message: '创建账号失败，请稍后重试' });
    }

    const created = await UserModel.create({
      username,
      passwordHash: hashPassword(randomBytes(16).toString('hex')),
      role: 'member',
      status: 'active',
      openId: session.openid,
    });

    console.log('[Auth] 微信登录自动创建账号:', username);
    return issueLogin(created, reply);
  });

  app.get('/api/auth/me', async (request, reply) => {
    try {
      await request.jwtVerify();
      return { user: request.user };
    } catch {
      return reply.status(401).send({ message: '登录已过期，请重新登录' });
    }
  });
}
