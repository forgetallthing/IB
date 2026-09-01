import type { Difficulty, Visibility } from '../types';

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  public: '公开',
  private: '私有',
};

export const DIFFICULTY_LIST: Difficulty[] = ['easy', 'medium', 'hard'];
export const VISIBILITY_LIST: Visibility[] = ['public', 'private'];

/** 格式化日期为 YYYY-MM-DD */
export function formatDate(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 生成随机 ID（mock 数据用） */
export function genId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
