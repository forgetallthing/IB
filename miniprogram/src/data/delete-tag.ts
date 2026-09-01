import { mockTags } from './db';
import { requireMockAdmin } from './session';

export default function deleteTag(input: { id?: string }) {
  requireMockAdmin();
  const index = mockTags.findIndex((item) => item.id === input.id);
  if (index === -1) {
    throw new Error('标签不存在');
  }
  mockTags.splice(index, 1);
  return { ok: true };
}
