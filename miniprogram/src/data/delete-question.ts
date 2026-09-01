import { mockQuestions, removeMockQuestion } from './db';
import { requireMockUser } from './session';

export default function deleteQuestion(input: { id?: string }) {
  const user = requireMockUser();
  const existing = mockQuestions.find((item) => item.id === input.id);
  if (!existing) {
    throw new Error('笔记不存在');
  }
  if (user.role !== 'admin' && existing.creatorId !== user.id) {
    throw new Error('仅创建者或管理员可以维护该笔记');
  }
  removeMockQuestion(existing.id);
  return { ok: true };
}
