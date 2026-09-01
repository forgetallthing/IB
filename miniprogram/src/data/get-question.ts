import { mockQuestions } from './db';

export default function getQuestion(input: { id?: string }) {
  const item = mockQuestions.find((question) => question.id === input.id);
  if (!item) {
    throw new Error('笔记不存在');
  }
  return item;
}
