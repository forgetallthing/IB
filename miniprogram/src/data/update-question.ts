import { mockQuestions, updateMockQuestion } from './db';
import { requireMockUser } from './session';
import type { Question } from '../types';

export default function updateQuestion(input: {
  id?: string;
  title?: string;
  content?: string;
  tags?: string[];
  difficulty?: string;
  visibility?: string;
}) {
  const user = requireMockUser();
  const existing = mockQuestions.find((item) => item.id === input.id);
  if (!existing) {
    throw new Error('笔记不存在');
  }
  if (user.role !== 'admin' && existing.creatorId !== user.id) {
    throw new Error('仅创建者或管理员可以维护该笔记');
  }

  updateMockQuestion(existing.id, {
    title: input.title,
    content: input.content,
    tags: input.tags,
    difficulty: input.difficulty as Question['difficulty'],
    visibility: input.visibility as Question['visibility'],
  });
  return { ok: true };
}
