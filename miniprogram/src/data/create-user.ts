import { mockUsers } from './db';
import { requireMockAdmin } from './session';
import type { UserWithTime } from '../types';

export default function createUser(input: { username?: string; password?: string; role?: 'admin' | 'member' }) {
  requireMockAdmin();
  if (!input.username || !input.password) {
    throw new Error('username and password are required');
  }
  if (mockUsers.some((item) => item.username === input.username)) {
    throw new Error('用户名或邮箱已被占用');
  }
  const user = {
    id: `u_${Date.now().toString(36)}`,
    username: input.username,
    password: input.password,
    role: input.role ?? 'member',
    status: 'active' as const,
    createdAt: new Date().toISOString(),
  };
  mockUsers.push(user);

  const result: UserWithTime = {
    id: user.id,
    username: user.username,
    email: null,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.createdAt,
  };
  return result;
}
