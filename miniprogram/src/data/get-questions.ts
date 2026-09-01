import { mockQuestions } from './db';
import type { Question } from '../types';

export default function getQuestions(input: {
  q?: string;
  tags?: string[];
  difficulty?: string[];
  visibility?: string[];
  page?: number;
  limit?: number;
}) {
  let list = [...mockQuestions];

  if (input.q) {
    const keyword = input.q.toLowerCase();
    list = list.filter(
      (item) => item.title.toLowerCase().includes(keyword) || item.content.toLowerCase().includes(keyword),
    );
  }
  if (input.difficulty?.length) {
    list = list.filter((item) => input.difficulty!.includes(item.difficulty));
  }
  if (input.visibility?.length) {
    list = list.filter((item) => input.visibility!.includes(item.visibility));
  }
  if (input.tags?.length) {
    list = list.filter((item) => input.tags!.some((tag) => item.tags.includes(tag)));
  }

  list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const page = Math.max(1, Number(input.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(input.limit) || 20));
  const total = list.length;
  const items: Question[] = list.slice((page - 1) * limit, page * limit);

  return { items, total, page, limit, hasMore: page * limit < total };
}
