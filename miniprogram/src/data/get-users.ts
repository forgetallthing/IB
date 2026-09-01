import { mockUsers } from './db';
import { requireMockAdmin } from './session';
import type { UserWithTime } from '../types';

export default function getUsers() {
  requireMockAdmin();
  const list: UserWithTime[] = [...mockUsers]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((user) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.createdAt,
    }));
  return list;
}
