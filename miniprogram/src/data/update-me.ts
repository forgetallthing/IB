import { mockUsers } from './db';
import { requireMockUser } from './session';

export default function updateMe(input: { username?: string; password?: string; currentPassword?: string }) {
  const user = requireMockUser();
  const target = mockUsers.find((item) => item.id === user.id);
  if (!target) {
    throw new Error('用户不存在');
  }

  if (input.username) {
    if (mockUsers.some((item) => item.id !== target.id && item.username === input.username.trim())) {
      throw new Error('用户名或邮箱已被占用');
    }
    target.username = input.username.trim();
  }

  if (input.password) {
    if (!input.currentPassword || target.password !== input.currentPassword) {
      throw new Error('当前密码不正确');
    }
    target.password = input.password;
  }

  return {
    id: target.id,
    username: target.username,
    email: target.email,
    role: target.role,
    status: target.status,
  };
}
