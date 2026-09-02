import { FastifyInstance } from 'fastify';
import { UserModel } from '../../models/user.model.js';
import { hashPassword, isLegacyHash, verifyPassword } from '../../services/password.service.js';
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
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      return reply.status(401).send({ message: '用户名或密码错误' });
    }

    // 旧的无盐 SHA-256 哈希在登录成功后透明升级为 scrypt
    if (isLegacyHash(user.passwordHash)) {
      user.passwordHash = hashPassword(body.password);
      await user.save();
    }

    return issueLogin(user, reply);
  });

  /**
   * 微信小程序登录：仅已绑定微信的账号可登录。
   * 未绑定的微信不自动注册，需先用账号密码登录，再到设置页绑定微信。
   */
  app.post('/api/auth/wechat-login', async (request, reply) => {
    const body = request.body as { code?: string };
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

    const bound = await UserModel.findOne({ openId: session.openid, status: 'active' }).exec();
    if (!bound) {
      return reply.status(403).send({ message: '该微信未绑定账号，请使用账号密码登录，并在设置页绑定微信' });
    }

    return issueLogin(bound, reply);
  });

  /**
   * 绑定微信：把当前登录账号与微信 openid 关联，之后可在小程序直接微信登录。
   * 幂等：重复绑定同一微信返回成功；openid 已被其他账号占用则拒绝。
   */
  app.post('/api/auth/bind-wechat', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: '登录已过期，请重新登录' });
    }

    const body = request.body as { code?: string };
    if (!body.code) {
      return reply.status(400).send({ message: '微信登录失败，请重试' });
    }
    if (!appConfig.wechatAppId || !appConfig.wechatSecret) {
      return reply.status(501).send({ message: '微信登录未配置' });
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

    const user = await UserModel.findById(String((request.user as { sub?: string }).sub ?? '')).exec();
    if (!user || user.status !== 'active') {
      return reply.status(401).send({ message: '登录已过期，请重新登录' });
    }

    // openid 已被其他账号占用
    const occupied = await UserModel.findOne({ openId: session.openid }).exec();
    if (occupied && String(occupied._id) !== String(user._id)) {
      return reply.status(409).send({ message: '该微信已绑定其他账号' });
    }

    if (user.openId === session.openid) {
      return { ok: true, bound: true };
    }

    user.openId = session.openid;
    await user.save();
    console.log('[Auth] 微信绑定成功:', user.username);
    return { ok: true, bound: true };
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
