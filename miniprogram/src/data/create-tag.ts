import { mockTags } from './db';
import { requireMockAdmin } from './session';
import type { Tag } from '../types';

export default function createTag(input: { name?: string; color?: string; description?: string; displayOrder?: number }) {
  requireMockAdmin();
  if (!input.name?.trim()) {
    throw new Error('标签名称不能为空');
  }
  const maxOrder = mockTags.reduce((max, item) => Math.max(max, item.displayOrder), 0);
  const tag: Tag = {
    id: `t_${Date.now().toString(36)}`,
    name: input.name.trim(),
    color: input.color ?? '#0d9488',
    description: input.description ?? '',
    active: true,
    displayOrder: input.displayOrder ?? maxOrder + 1,
  };
  mockTags.push(tag);
  return tag;
}
