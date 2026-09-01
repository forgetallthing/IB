/** 领域类型定义（与后端 API 返回结构对齐） */

export type Role = 'admin' | 'member';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type Visibility = 'public' | 'private';

export interface User {
  id: string;
  username: string;
  email?: string | null;
  role: Role;
  status: 'active' | 'disabled';
}

export interface UserWithTime extends User {
  createdAt?: string;
  updatedAt?: string;
}

export interface Question {
  id: string;
  title: string;
  content: string;
  answer: string;
  tags: string[];
  difficulty: Difficulty;
  creatorId: string;
  creatorName: string;
  visibility: Visibility;
  source?: string;
  aiSummary?: string;
  aiSuggestedTags?: string[];
  aiSuggestedDifficulty?: Difficulty;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionPage {
  items: Question[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface QuestionQuery {
  q?: string;
  tags?: string[];
  difficulty?: Difficulty[];
  visibility?: Visibility[];
  page?: number;
  limit?: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  description?: string;
  active: boolean;
  displayOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginResult {
  token: string;
  user: {
    id: string;
    username: string;
    role: Role;
  };
}

export interface AiSuggestion {
  summary: string;
  suggestedTags: string[];
  suggestedDifficulty: Difficulty;
}

export interface QuestionDraft {
  id?: string;
  title: string;
  content: string;
  tags: string[];
  difficulty: Difficulty;
  visibility: Visibility;
  aiSummary?: string;
  aiSuggestedTags?: string[];
  aiSuggestedDifficulty?: Difficulty;
}

/** 判断当前用户是否可维护笔记（管理员或创建者） */
export function canMaintain(question: Question, user: { id: string; role: Role } | null): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return question.creatorId === user.id;
}
