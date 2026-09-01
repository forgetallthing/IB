import { mockUsers } from './db';
import { setMockCurrentUser } from './session';

/** 微信登录 mock：有账号密码则绑定，否则自动使用微信用户 */
export default function wechatLogin(input: { code?: string; username?: string; password?: string }) {
  if (!input.code) {
    throw new Error('微信登录失败，请重试');
  }

  let user = mockUsers.find((item) => item.username === 'wx_user');

  if (input.username && input.password) {
    const existing = mockUsers.find((item) => item.username === input.username && item.status === 'active');
    if (!existing || existing.password !== input.password) {
      throw new Error('用户名或密码错误，绑定失败');
    }
    user = existing;
  } else if (!user) {
    const created = {
      id: 'u_wx',
      username: 'wx_user',
      password: 'wx-random-password',
      role: 'member' as const,
      status: 'active' as const,
      createdAt: new Date().toISOString(),
    };
    mockUsers.push(created);
    user = created;
  }

  setMockCurrentUser(user);
  console.log('[Mock] wechat-login 成功:', user.username);
  return {
    token: `mock-token-${user.id}`,
    user: { id: user.id, username: user.username, role: user.role },
  };
}
