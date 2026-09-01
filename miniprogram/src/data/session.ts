/** H5 mock 会话状态（记录当前登录用户） */
import type { MockUser } from './db';

let currentUser: MockUser | null = null;

export function setMockCurrentUser(user: MockUser | null) {
  currentUser = user;
}

export function getMockCurrentUser(): MockUser | null {
  return currentUser;
}

export function requireMockUser(): MockUser {
  if (!currentUser) {
    throw new Error('请先登录');
  }
  return currentUser;
}

export function requireMockAdmin(): MockUser {
  const user = requireMockUser();
  if (user.role !== 'admin') {
    throw new Error('仅管理员可操作');
  }
  return user;
}
