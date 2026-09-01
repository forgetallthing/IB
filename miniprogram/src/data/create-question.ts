import { addMockQuestion, nextQuestionId } from './db';
import { requireMockUser } from './session';
import type { Question } from '../types';

export default function createQuestion(input: {
  title?: string;
  content?: string;
  tags?: string[];
  difficulty?: Question['difficulty'];
  visibility?: Question['visibility'];
}) {
  const user = requireMockUser();
  if (!input.title || !input.content) {
    throw new Error('missing required fields');
  }

  const now = new Date().toISOString();
  const item: Question = {
    id: nextQuestionId(),
    title: input.title,
    content: input.content,
    answer: '',
    tags: input.tags ?? [],
    difficulty: input.difficulty ?? 'medium',
    creatorId: user.id,
    creatorName: user.username,
    visibility: input.visibility ?? 'public',
    createdAt: now,
    updatedAt: now,
  };
  addMockQuestion(item);
  console.log('[Mock] create-question:', item.title);
  return { id: item.id };
}
