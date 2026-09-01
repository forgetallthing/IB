import { mockUsers } from './db';
import { requireMockAdmin } from './session';
import type { UserWithTime } from '../types';

export default function updateUser(input: { id?: string; status?: 'active' | 'disabled'; password?: string }) {
  requireMockAdmin();
  const user = mockUsers.find((item) => item.id === input.id);
  if (!user) {
    throw new Error('用户不存在');
  }
  if (input.status) user.status = input.status;
  if (input.password) user.password = input.password;

  const result: UserWithTime = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: new Date().toISOString(),
  };
  return result;
}
