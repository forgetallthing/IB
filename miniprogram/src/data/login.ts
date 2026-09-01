import { mockUsers } from './db';
import { setMockCurrentUser } from './session';

export default function login(input: { username?: string; password?: string }) {
  const user = mockUsers.find((item) => item.username === input.username && item.status === 'active');
  if (!user || user.password !== input.password) {
    throw new Error('用户名或密码错误');
  }
  setMockCurrentUser(user);
  console.log('[Mock] login 成功:', user.username);
  return {
    token: `mock-token-${user.id}`,
    user: { id: user.id, username: user.username, role: user.role },
  };
}
