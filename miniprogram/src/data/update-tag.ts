import { mockTags } from './db';
import { requireMockAdmin } from './session';
import type { Tag } from '../types';

export default function updateTag(input: {
  id?: string;
  name?: string;
  color?: string;
  description?: string;
  active?: boolean;
  displayOrder?: number;
}) {
  requireMockAdmin();
  const tag = mockTags.find((item) => item.id === input.id);
  if (!tag) {
    throw new Error('标签不存在');
  }
  if (input.name !== undefined) tag.name = input.name.trim();
  if (input.color !== undefined) tag.color = input.color;
  if (input.description !== undefined) tag.description = input.description;
  if (input.active !== undefined) tag.active = input.active;
  if (input.displayOrder !== undefined) tag.displayOrder = input.displayOrder;
  return tag;
}
